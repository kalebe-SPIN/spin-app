'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function usuarioPodeGerarDiagramas() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, pode_gerar_diagramas')
    .eq('id', user.id)
    .maybeSingle()

  return perfil?.role === 'admin' || perfil?.pode_gerar_diagramas === true
}

// Status pos-venda: podem gerar diagrama (contrato fechado)
const STATUS_PODE_GERAR = [
  'proposta_enviada', 'negociando', 'em_fechamento',  // permite prévia técnica
  'aceito', 'vendido',                                // vendido = pode oficial
  'em_homologacao', 'em_execucao', 'instalado',       // pós-venda
  'ativo_pos_venda',
]

export async function gerarDiagramaAction(
  projetoId: string,
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao',
  opcoes: { modoPrevia?: boolean } = {},
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const pode = await usuarioPodeGerarDiagramas()
  if (!pode) return { sucesso: false, erro: 'Sem permissão para gerar diagramas' }

  // Carrega projeto — usa admin pra bypass RLS caso status impeça leitura
  const supabaseAdmin = createAdminClient()
  const { data: projeto, error: projErr } = await supabaseAdmin
    .from('projetos')
    .select('*')
    .eq('id', projetoId)
    .maybeSingle()

  if (projErr || !projeto) return { sucesso: false, erro: 'Projeto não encontrado' }

  // Status: permite qualquer status "avançado" (proposta em diante)
  // Rascunho / fatura_analisada / telhado / dimensionado / kit não bloqueia SE for admin,
  // mas por padrão pedimos que esteja em pipeline comercial ou depois
  if (!STATUS_PODE_GERAR.includes(projeto.status)) {
    return {
      sucesso: false,
      erro: `Projeto ainda não está pronto pra gerar diagrama (status atual: ${projeto.status}). Envie a proposta ao cliente antes.`,
    }
  }

  // Carrega config empresa (snapshot pra rastreabilidade)
  const { data: config } = await supabaseAdmin
    .from('configuracoes_empresa')
    .select('*')
    .eq('singleton', true)
    .maybeSingle()

  if (!config || !config.rt_nome || !config.rt_crea) {
    return {
      sucesso: false,
      erro: 'Configuração da empresa incompleta. Preencha nome e CREA do responsável técnico em /admin/empresa antes de gerar diagramas.',
    }
  }

  // Calcula próxima versão
  const { data: ultimas } = await supabaseAdmin
    .from('projetos_diagramas')
    .select('versao')
    .eq('projeto_id', projetoId)
    .eq('tipo_desenho', tipoDesenho)
    .order('versao', { ascending: false })
    .limit(1)

  const proximaVersao = (ultimas?.[0]?.versao || 0) + 1

  // Cria registro em status 'gerando'
  const { data: novoDiagrama, error: insErr } = await supabaseAdmin
    .from('projetos_diagramas')
    .insert({
      projeto_id: projetoId,
      versao: proximaVersao,
      tipo_desenho: tipoDesenho,
      status: 'gerando',
      gerado_por: user.id,
      snapshot_empresa: config,
      eh_previa: opcoes.modoPrevia || false,
    })
    .select()
    .single()

  if (insErr || !novoDiagrama) {
    console.error('[gerarDiagrama] insert erro:', insErr)
    return { sucesso: false, erro: insErr?.message || 'Erro ao criar registro do diagrama' }
  }

  // Aciona API interna — detecta URL do ambiente (Vercel usa VERCEL_URL, dev usa localhost)
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  try {
    // Fire-and-forget mas com await pra garantir que fetch inicie antes da action retornar
    // (Vercel pode matar processos após return — melhor await pelo menos o inicio da requisicao)
    const promessa = fetch(`${baseUrl}/api/gerar-diagrama`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diagrama_id: novoDiagrama.id,
        projeto_id: projetoId,
        tipo_desenho: tipoDesenho,
      }),
    })
    // Espera 100ms pra garantir que a request foi iniciada
    await Promise.race([promessa, new Promise(r => setTimeout(r, 100))])
  } catch (e) {
    console.error('[gerarDiagrama] fetch API interna erro:', e)
    // Marca como erro no banco
    await supabaseAdmin
      .from('projetos_diagramas')
      .update({ status: 'erro', erro_mensagem: `Falha ao acionar geracao: ${(e as any)?.message || 'desconhecido'}` })
      .eq('id', novoDiagrama.id)
    return { sucesso: false, erro: 'Falha ao iniciar geração. Ver logs.' }
  }

  revalidatePath(`/projetos/${projetoId}/diagrama`)
  return { sucesso: true, diagrama_id: novoDiagrama.id }
}

/**
 * NOVO FLUXO (2026-08-23) — upload manual dos 3 formatos.
 *
 * A skill projetista-spin agora roda LOCAL no Claude Code do Kalebe, com motor
 * Python (draw_svg.py + draw_dxf.py). O Kalebe gera as 3 folhas (unifilar,
 * trifilar, localização) em PDF+DXF+SVG na máquina dele e sobe aqui.
 *
 * Esta action:
 *   1. Calcula próxima versão do tipo_desenho pra este projeto
 *   2. Sobe PDF (obrigatório), DXF (opcional), SVG (opcional) pro bucket
 *      projetos-diagramas em ${projeto_id}/${diagrama_id}/${tipo}-v${versao}.{ext}
 *   3. Cria registro projetos_diagramas com status='pronto' já (nada de 'gerando')
 *   4. Bidirecional: se tem homologação, marca etapa diagrama_unifilar como
 *      em_andamento com link do PDF (mesmo comportamento do pipeline antigo)
 */
export async function enviarDiagramaAction(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const pode = await usuarioPodeGerarDiagramas()
  if (!pode) return { sucesso: false, erro: 'Sem permissão pra enviar diagramas' }

  const projetoId = formData.get('projeto_id') as string
  const tipoDesenho = formData.get('tipo_desenho') as
    | 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao'
  const arquivoPdf = formData.get('arquivo_pdf') as File | null
  const arquivoDxf = formData.get('arquivo_dxf') as File | null
  const arquivoSvg = formData.get('arquivo_svg') as File | null

  if (!projetoId || !tipoDesenho) {
    return { sucesso: false, erro: 'projeto_id e tipo_desenho obrigatórios' }
  }
  if (!arquivoPdf || arquivoPdf.size === 0) {
    return { sucesso: false, erro: 'PDF obrigatório — DXF e SVG são opcionais' }
  }

  const supabaseAdmin = createAdminClient()

  // Carrega projeto (bypass RLS)
  const { data: projeto, error: projErr } = await supabaseAdmin
    .from('projetos')
    .select('id, status, codigo')
    .eq('id', projetoId)
    .maybeSingle()

  if (projErr || !projeto) return { sucesso: false, erro: 'Projeto não encontrado' }

  if (!STATUS_PODE_GERAR.includes(projeto.status)) {
    return {
      sucesso: false,
      erro: `Projeto ainda não está pronto pra receber diagrama (status: ${projeto.status}).`,
    }
  }

  // Snapshot da config empresa pra rastreabilidade
  const { data: config } = await supabaseAdmin
    .from('configuracoes_empresa')
    .select('*')
    .eq('singleton', true)
    .maybeSingle()

  // Próxima versão do mesmo tipo
  const { data: ultimas } = await supabaseAdmin
    .from('projetos_diagramas')
    .select('versao')
    .eq('projeto_id', projetoId)
    .eq('tipo_desenho', tipoDesenho)
    .order('versao', { ascending: false })
    .limit(1)

  const proximaVersao = (ultimas?.[0]?.versao || 0) + 1

  // Cria registro (ainda sem URLs — preenche depois do upload)
  const { data: novoDiagrama, error: insErr } = await supabaseAdmin
    .from('projetos_diagramas')
    .insert({
      projeto_id: projetoId,
      versao: proximaVersao,
      tipo_desenho: tipoDesenho,
      status: 'pronto',
      gerado_por: user.id,
      snapshot_empresa: config,
      memoria_calculo: { _meta: { origem: 'upload_manual', enviado_em: new Date().toISOString() } },
    })
    .select()
    .single()

  if (insErr || !novoDiagrama) {
    return { sucesso: false, erro: insErr?.message || 'Erro ao criar registro do diagrama' }
  }

  const BUCKET = 'projetos-diagramas'
  const nomeBase = `${tipoDesenho}-v${proximaVersao}`
  const pastaBase = `${projetoId}/${novoDiagrama.id}`

  async function upar(file: File, ext: string, contentType: string): Promise<string | null> {
    const path = `${pastaBase}/${nomeBase}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true })
    if (upErr) throw new Error(`Upload ${ext.toUpperCase()} falhou: ${upErr.message}`)
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  let url_pdf: string | null = null
  let url_dxf: string | null = null
  let url_svg: string | null = null

  try {
    url_pdf = await upar(arquivoPdf, 'pdf', 'application/pdf')
    if (arquivoDxf && arquivoDxf.size > 0) {
      url_dxf = await upar(arquivoDxf, 'dxf', 'application/dxf')
    }
    if (arquivoSvg && arquivoSvg.size > 0) {
      url_svg = await upar(arquivoSvg, 'svg', 'image/svg+xml')
    }
  } catch (e: any) {
    // Rollback: apaga o registro se algum upload falhou
    await supabaseAdmin.from('projetos_diagramas').delete().eq('id', novoDiagrama.id)
    return { sucesso: false, erro: e?.message || 'Erro no upload dos arquivos' }
  }

  // Atualiza registro com URLs
  const { error: updErr } = await supabaseAdmin
    .from('projetos_diagramas')
    .update({ url_pdf, url_dxf, url_svg })
    .eq('id', novoDiagrama.id)

  if (updErr) {
    // Não faz rollback aqui — os arquivos já estão no storage; se preferir excluir manual
    return { sucesso: false, erro: `Registro criado mas falhou atualizar URLs: ${updErr.message}` }
  }

  // Bidirecional: linkar homologação (mesma lógica do pipeline antigo)
  if (tipoDesenho === 'unifilar_ongrid' || tipoDesenho === 'unifilar_hibrido') {
    try {
      const { data: hom } = await supabaseAdmin
        .from('homologacoes').select('id').eq('projeto_id', projetoId).maybeSingle()
      if (hom) {
        await supabaseAdmin
          .from('homologacao_etapas')
          .update({
            status: 'em_andamento',
            iniciado_em: new Date().toISOString(),
            url_arquivo_svg: url_svg || url_pdf,
            observacoes: `✓ Unifilar enviado manualmente (v${proximaVersao}, tipo ${tipoDesenho}). Kalebe gerou local via skill projetista-spin.`,
          })
          .eq('homologacao_id', hom.id)
          .eq('chave', 'diagrama_unifilar')
      }
    } catch (e) {
      // linkar homologação é opcional — não bloqueia
    }
  }

  revalidatePath(`/projetos/${projetoId}/diagrama`)
  return { sucesso: true, diagrama_id: novoDiagrama.id, versao: proximaVersao }
}

/**
 * Regenera diagrama baseado em versao existente.
 * Se instrucaoAjuste for passada, envia como feedback pro Claude refinar.
 * Se nao, apenas tenta gerar de novo (util pra erros transientes).
 */
export async function regenerarDiagramaAction(
  diagramaAnteriorId: string,
  instrucaoAjuste?: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Nao autenticado' }

  const pode = await usuarioPodeGerarDiagramas()
  if (!pode) return { sucesso: false, erro: 'Sem permissao pra gerar diagramas' }

  const supabaseAdmin = createAdminClient()

  // Busca diagrama anterior pra pegar projeto_id + tipo_desenho
  const { data: anterior } = await supabaseAdmin
    .from('projetos_diagramas')
    .select('projeto_id, tipo_desenho')
    .eq('id', diagramaAnteriorId)
    .maybeSingle()

  if (!anterior) return { sucesso: false, erro: 'Diagrama anterior nao encontrado' }

  // Reusa gerarDiagramaAction pra criar novo registro
  const result = await gerarDiagramaAction(
    anterior.projeto_id,
    anterior.tipo_desenho as any,
    { modoPrevia: false },
  )

  if (!result.sucesso) return result

  // Se tem instrucao de ajuste, salva no novo registro pra API considerar
  if (instrucaoAjuste && result.diagrama_id) {
    await supabaseAdmin
      .from('projetos_diagramas')
      .update({
        instrucao_ajuste: instrucaoAjuste,
        baseado_em_id: diagramaAnteriorId,
      })
      .eq('id', result.diagrama_id)
  }

  return result
}

/**
 * Exclui um diagrama do banco + storage.
 * Soft delete? Nao — a tabela projetos_diagramas guarda historico, entao
 * remover fisicamente uma versao ruim/errada eh o comportamento esperado.
 */
export async function excluirDiagramaAction(diagramaId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Nao autenticado' }

  const pode = await usuarioPodeGerarDiagramas()
  if (!pode) return { sucesso: false, erro: 'Sem permissao' }

  const supabaseAdmin = createAdminClient()

  // Busca dados pra saber que arquivos deletar no storage
  const { data: diag } = await supabaseAdmin
    .from('projetos_diagramas')
    .select('projeto_id, url_svg, url_pdf, url_dxf')
    .eq('id', diagramaId)
    .maybeSingle()

  if (!diag) return { sucesso: false, erro: 'Diagrama nao encontrado' }

  // Tenta remover arquivos do storage (nao bloqueia se falhar)
  const arquivos: string[] = []
  for (const url of [diag.url_svg, diag.url_pdf, diag.url_dxf]) {
    if (url && typeof url === 'string') {
      // extrai path relativo depois de /projetos-diagramas/
      const match = url.match(/projetos-diagramas\/(.+)$/)
      if (match) arquivos.push(match[1])
    }
  }
  if (arquivos.length > 0) {
    await supabaseAdmin.storage.from('projetos-diagramas').remove(arquivos).catch(() => null)
  }

  // Remove registro do banco
  const { error: delErr } = await supabaseAdmin
    .from('projetos_diagramas')
    .delete()
    .eq('id', diagramaId)

  if (delErr) return { sucesso: false, erro: delErr.message }

  revalidatePath(`/projetos/${diag.projeto_id}/diagrama`)
  return { sucesso: true }
}

/**
 * Monta um RELATÓRIO TÉCNICO estruturado com todos os dados do projeto que
 * a skill projetista-spin (rodando local no Claude Code do Kalebe) precisa
 * consumir pra gerar o diagrama.
 *
 * NÃO inclui instruções gráficas, regras SPIN, padrão de layout — isso a
 * skill já sabe. Aqui só o CONTEÚDO TÉCNICO do projeto: cliente, sistema,
 * módulos, inversor, arranjo, condutores, proteções, padrão, endereço,
 * carimbo. Cálculos derivados (Vmp×N, corrente CA total, FCI) vêm calculados
 * pra economizar chamada.
 *
 * Kalebe pediu 2026-08-23: "não crie prompt pra outro prompt já
 * funcional — crie o relatório de informações técnicas que precisam
 * conter no diagrama pro outro prompt executar".
 */
export async function montarPromptDiagramaAction(
  projetoId: string,
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao',
): Promise<{ prompt: string } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const supabaseAdmin = createAdminClient()

  const { data: projeto } = await supabaseAdmin
    .from('projetos').select('*').eq('id', projetoId).maybeSingle()
  if (!projeto) return { erro: 'Projeto não encontrado' }

  const { data: telhadoSecoes } = await supabaseAdmin
    .from('projetos_telhado_secoes').select('*').eq('projeto_id', projetoId)
    .order('ordem', { ascending: true })

  const { data: configEmpresa } = await supabaseAdmin
    .from('configuracoes_empresa').select('*').eq('singleton', true).maybeSingle()

  // Homologação — traz protocolo CELESC + datas + eletrotécnico pro carimbo.
  // Se ainda não tem homologação, os campos vão como "a preencher".
  const { data: homologacao } = await supabaseAdmin
    .from('homologacoes')
    .select('id, protocolo_celesc, data_solicitacao, data_aprovacao, data_prevista_troca_medidor, eletrotecnico_id')
    .eq('projeto_id', projetoId)
    .maybeSingle()

  let eletrotecnicoNome: string | null = null
  if (homologacao?.eletrotecnico_id) {
    const { data: p } = await supabaseAdmin
      .from('profiles').select('nome_completo').eq('id', homologacao.eletrotecnico_id).maybeSingle()
    eletrotecnicoNome = p?.nome_completo || null
  }

  let hibridoDim: any = null
  let hibridoAn: any = null
  if (tipoDesenho === 'unifilar_hibrido') {
    const { data: dim } = await supabaseAdmin
      .from('projeto_hibrido_dimensionamento').select('*').eq('projeto_id', projetoId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    hibridoDim = dim
    const { data: an } = await supabaseAdmin
      .from('projeto_hibrido_analise').select('*').eq('projeto_id', projetoId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    hibridoAn = an
  }

  const relatorio = montarRelatorioTecnico({
    projeto,
    telhadoSecoes: telhadoSecoes || [],
    configEmpresa,
    tipoDesenho,
    hibridoDim,
    hibridoAn,
    homologacao,
    eletrotecnicoNome,
  })

  return { prompt: relatorio }
}

// ══════════════════════════════════════════════════════════════════════
// MONTAGEM DO RELATÓRIO TÉCNICO
// ══════════════════════════════════════════════════════════════════════

function montarRelatorioTecnico(args: {
  projeto: any
  telhadoSecoes: any[]
  configEmpresa: any
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao'
  hibridoDim: any
  hibridoAn: any
  homologacao: any
  eletrotecnicoNome: string | null
}): string {
  const { projeto, telhadoSecoes, configEmpresa, tipoDesenho, hibridoDim, hibridoAn, homologacao, eletrotecnicoNome } = args

  const kit = projeto.kit_selecionado || {}
  const padrao = projeto.padrao_entrada || {}
  const fatura = projeto.analise_fatura || {}

  // ═══ Endereço da OBRA (onde o sistema fotovoltaico vai ser instalado) ═══
  // Prioridade: endereco_instalacao (se preenchido pelo consultor no cadastro
  // "obra diferente do titular") > cliente_endereco (titular) > fatura CELESC.
  // Aceita ambos shapes de key: {logradouro|rua, numero, complemento, bairro,
  // cidade|municipio, uf|estado, cep, coordenadas_gps}.
  const enderecoObra = extrairEnderecoObra(projeto)
  const linhaEnderecoObra = formatarLinhaEndereco(enderecoObra)

  // ═══ Cálculos derivados ═══
  const placa = kit.placa || {}
  const inversor = kit.inversor || {}
  const potWpMod = num(placa.potencia_wp)
  const qtdMod = num(kit.qtd_placas)
  const potCcKwp = qtdMod && potWpMod ? (qtdMod * potWpMod) / 1000 : num(kit.potencia_cc_kwp)
  const potInvKw = num(inversor.potencia_kw)
  const qtdInv = num(kit.qtd_inversores) || 1
  const potCaKw = potInvKw * qtdInv
  const fciPct = potCcKwp && potCaKw ? (potCcKwp / potCaKw) * 100 : num(kit.fci_pct)

  const ligacao = normLigacao(padrao.tipo_ligacao)
  const tensaoFornec = ligacao === 'trifasico' ? '380/220V' : '220V'
  const isTri = ligacao === 'trifasico'
  const correnteCaA = potCaKw > 0
    ? (potCaKw * 1000) / (isTri ? 380 * Math.SQRT2 * Math.sqrt(1.5) : 220)
    : 0

  const partes: string[] = [
    `RELATÓRIO TÉCNICO — ${nomeFolhaDiagrama(tipoDesenho)}`,
    `Projeto ${projeto.codigo || projeto.id} · gerado em ${new Date().toISOString().slice(0, 10)}`,
    `═══════════════════════════════════════════════════════════════════`,
    ``,
    `## 1. IDENTIFICAÇÃO`,
    ``,
    `- Cliente (proprietário):  ${projeto.cliente_razao_social || '⚠ a preencher'}`,
    `- CPF/CNPJ:                ${formatarCpfCnpj(projeto.cliente_cpf_cnpj) || '⚠ a preencher'}`,
    `- UC geradora:             ${projeto.uc_geradora || '⚠ a preencher'}`,
    `- Conta contrato:          ${projeto.conta_contrato || '⚠ a preencher'}`,
    `- Concessionária:          CELESC (Santa Catarina)`,
    `- Código do pedido SPIN:   ${projeto.codigo || projeto.id}`,
    `- ID do pedido externo:    ${projeto.id_pedido_externo || projeto.codigo || '—'}`,
    ``,
    `### Endereço da OBRA (onde o sistema fotovoltaico vai ser instalado)`,
    ``,
    `- Logradouro:  ${enderecoObra.logradouro || '⚠ a preencher'}`,
    `- Número:      ${enderecoObra.numero || '⚠ a preencher'}`,
    ...(enderecoObra.complemento ? [`- Complemento: ${enderecoObra.complemento}`] : []),
    `- Bairro:      ${enderecoObra.bairro || '⚠ a preencher'}`,
    `- Cidade/UF:   ${enderecoObra.cidade || '⚠ a preencher'} / ${enderecoObra.uf || 'SC'}`,
    `- CEP:         ${formatarCEP(enderecoObra.cep) || '⚠ a preencher'}`,
    ...(enderecoObra.coordenadas_gps ? [`- Coordenadas: ${JSON.stringify(enderecoObra.coordenadas_gps)}`] : []),
    `- Linha única (pra carimbo): ${linhaEnderecoObra}`,
    ``,
    `## 2. SISTEMA FOTOVOLTAICO`,
    ``,
    `- Potência CC total:      ${fmt(potCcKwp, 2)} kWp`,
    `- Potência CA instalada:  ${fmt(potCaKw, 2)} kW`,
    `- Fator FCI (CC/CA):      ${fmt(fciPct, 1)}%`,
    `- Tipo de ligação:        ${ligacao}`,
    `- Tensão de fornecimento: ${tensaoFornec}`,
    `- Corrente CA total:      ${fmt(correnteCaA, 1)} A`,
    ``,
    `## 3. MÓDULOS FOTOVOLTAICOS`,
    ``,
    `- Marca:              ${placa.fabricante || 'WEG'}`,
    `- Modelo:             ${placa.modelo || 'a preencher'}`,
    `- Código WEG:         ${placa.codigo_weg || '—'}`,
    `- Potência unitária:  ${fmt(potWpMod, 0)} Wp`,
    `- Vmp (nominal):      ${placa.vmp_v ? `${placa.vmp_v} V` : 'ver datasheet'}`,
    `- Imp:                ${placa.imp_a ? `${placa.imp_a} A` : 'ver datasheet'}`,
    `- Voc:                ${placa.voc_v ? `${placa.voc_v} V` : 'ver datasheet'}`,
    `- Eficiência:         ${placa.eficiencia_pct ? `${placa.eficiencia_pct}%` : 'ver datasheet'}`,
    `- Quantidade total:   ${qtdMod} unidades`,
    ``,
    `## 4. INVERSOR`,
    ``,
    `- Marca:              WEG`,
    `- Modelo:             ${inversor.modelo || 'a preencher'}`,
    `- Código WEG:         ${inversor.codigo_weg || '—'}`,
    `- Potência CA:        ${fmt(potInvKw, 2)} kW`,
    `- Nº MPPTs:           ${inversor.entradas_mppt || 'ver datasheet'}`,
    `- Tensão entrada:     ${inversor.tensao_cc_desc || '200V - 1000V'}`,
    `- Corrente entrada:   ${inversor.corrente_cc_desc || 'ver datasheet'}`,
    `- Tensão saída:       ${tensaoFornec}`,
    `- Corrente saída:     ${fmt(correnteCaA / qtdInv, 1)} A por inversor`,
    `- Proteções ANSI:     27 (0,8pu/0,4s), 59 (1,1pu/0,2s), 81U (57,5Hz/0,2s), 81O (62,0Hz/0,2s), 25, 78`,
    `- Anti-ilhamento:     ativo, NBR IEC 62116`,
    `- Quantidade:         ${qtdInv} unidade(s)`,
    ``,
  ]

  // Arranjo de strings — se telhado_secoes tiver a estrutura
  const arranjo = extrairArranjo(telhadoSecoes, kit)
  if (arranjo.length > 0) {
    partes.push(
      `## 5. ARRANJO DE STRINGS (por MPPT)`,
      ``,
    )
    for (const mppt of arranjo) {
      partes.push(`### MPPT ${mppt.numero}`)
      for (const s of mppt.strings) {
        const vmp = potWpMod && placa.vmp_v ? `${placa.vmp_v} × ${s.qtd_modulos} = ${(placa.vmp_v * s.qtd_modulos).toFixed(2)}V` : `${s.qtd_modulos} módulos em série`
        partes.push(
          `- String ${s.numero}: ${s.qtd_modulos} módulos · Vmp: ${vmp} · Imp: ${placa.imp_a || '—'} A · Potência: ${(s.qtd_modulos * potWpMod).toLocaleString('pt-BR')} Wp`,
        )
      }
      partes.push(``)
    }
  } else {
    partes.push(
      `## 5. ARRANJO DE STRINGS`,
      ``,
      `- Total de módulos: ${qtdMod}`,
      `- MPPTs disponíveis no inversor: ${inversor.entradas_mppt || '—'}`,
      `- Distribuir os ${qtdMod} módulos entre os MPPTs equilibrando strings (ex: ${qtdMod} ÷ ${inversor.entradas_mppt || 'N'} MPPTs, ajustar pra Voc dentro dos limites)`,
      `- Vmp por módulo: ${placa.vmp_v || 'ver datasheet'} V`,
      `- Imp por módulo:  ${placa.imp_a || 'ver datasheet'} A`,
      ``,
    )
  }

  // ═══ Composição do kit — vem preenchida pelo gerador de kits (Passo 5) ═══
  const comp = kit.composicao || {}
  const listaCa: any[] = Array.isArray(projeto.lista_ca_confirmada) ? projeto.lista_ca_confirmada : []

  partes.push(
    `## 6. CONDUTORES`,
    ``,
    `### CC (módulos → inversor)`,
    comp.cabo_cc
      ? `- Extraído do kit selecionado: **${comp.cabo_cc}**`
      : `- Padrão SPIN: 4 mm² positivo + 4 mm² negativo + 4 mm² proteção`,
    `- Distância aprox.: ${padrao.distancia_string_qgbt_m ? `${padrao.distancia_string_qgbt_m} m` : 'a confirmar em campo'}`,
    `- Isolação: 1,8kV XLPE termofixo com proteção UV (nota 2 padrão)`,
    ``,
    `### CA`,
    `- Ramal de ligação:     ${padrao.ramal_ligacao_bitola || 'a preencher no Passo 4'}`,
    `- Padrão medição → QD:  ${padrao.bitola_medicao_qd || 'ver dimensionamento pelo QPCA no kit'}`,
    `- QPCA → inversor:      ${comp.bitola_ca_saida_qpca || (comp.disjuntor ? 'ver kit selecionado' : 'a preencher')}`,
    `- Isolação: 1kV PVC (nota 3 padrão)`,
    ``,
    `## 7. PROTEÇÕES (extraídas do kit gerado no Passo 5)`,
    ``,
    `- Disjuntor geral (entrada CELESC): ${padrao.amperagem_disjuntor_geral_a ? `**${padrao.amperagem_disjuntor_geral_a} A** tripolar (cadastrado no Passo 4)` : '⚠ NÃO CADASTRADO no padrão de entrada'}`,
    `- Disjuntor / DPS do sistema FV (QPCA):`,
    ...(comp.disjuntor ? [`    · ${comp.disjuntor}`] : []),
    ...(comp.dps ? [`    · ${comp.dps}`] : []),
    ...(comp.quadro ? [`    · ${comp.quadro}`] : []),
    ...((!comp.disjuntor && !comp.dps) ? [`    ⚠ Kit ainda não foi montado — clique em "Selecionar kit" no projeto pra gerar composição`] : []),
    `- Aterramento: ${comp.aterramento || `Haste 5/8" × 2,4m + cabo cobre nu 16mm² (padrão SPIN)`}`,
    `- Estrutura de fixação: ${comp.estrutura || 'a preencher'}`,
    ``,
  )

  // Se lista_ca_confirmada tem produtos com códigos WEG exatos, exibe também
  if (listaCa.length > 0) {
    partes.push(
      `### Lista CA CONFIRMADA (materiais complementares com códigos WEG)`,
      ``,
    )
    for (const item of listaCa) {
      const codigoWeg = item.codigo_weg || item.codigo || ''
      const modelo = item.modelo || item.descricao || item.nome || ''
      const qtd = item.qtd || item.quantidade || 1
      partes.push(
        `- ${qtd}× ${modelo}${codigoWeg ? ` [WEG ${codigoWeg}]` : ''}`,
      )
    }
    partes.push(``)
  }

  partes.push(
    `## 8. PADRÃO DE ENTRADA (cadastro do cliente — Passo 4)`,
    ``,
    `- Disjuntor geral:       ${padrao.amperagem_disjuntor_geral_a ? `${padrao.amperagem_disjuntor_geral_a} A` : 'a preencher'}`,
    `- Grupo tarifário:       ${padrao.grupo_tarifa || fatura.grupo_tarifario || 'B (BT)'}`,
    `- Modalidade:            ${fatura.modalidade || padrao.modalidade || 'convencional'}`,
    `- Tensão nominal:        ${padrao.tensao_nominal_v || tensaoFornec}`,
    `- Tipo de ligação:       ${ligacao}`,
    `- Ramal de ligação:      ${padrao.ramal_ligacao_bitola || 'a preencher'}`,
    `- Localização:           ${padrao.localizacao_descricao || 'a preencher'}`,
    `- Distância medidor→QGBT: ${padrao.distancia_string_qgbt_m ? `${padrao.distancia_string_qgbt_m} m` : 'a preencher'}`,
    `- Poste próprio?         ${padrao.poste_proprio ? 'SIM' : padrao.poste_proprio === false ? 'NÃO (poste da concessionária)' : 'não informado'}`,
    ``,
  )

  if (tipoDesenho === 'unifilar_hibrido' && hibridoDim) {
    partes.push(
      `## 9. ARMAZENAMENTO (BESS)`,
      ``,
      `- Capacidade útil:       ${hibridoDim.capacidade_util_kwh || '—'} kWh`,
      `- Potência CA de saída:  ${hibridoDim.potencia_ca_backup_kw || '—'} kW`,
      `- Autonomia (backup):    ${hibridoDim.autonomia_h || '—'} h`,
      `- Modelo do BESS:        ${hibridoDim.bess_modelo || '—'}`,
      `- Cargas críticas:       ${hibridoDim.cargas_criticas_desc || '—'}`,
      `- EPS (transfer switch): ${hibridoDim.tem_eps ? 'SIM' : 'NÃO'}`,
      ``,
    )
    if (hibridoAn) {
      partes.push(
        `### Análise de demanda`,
        `- Demanda média:  ${hibridoAn.demanda_media_kw || '—'} kW`,
        `- Demanda pico:   ${hibridoAn.demanda_pico_kw || '—'} kW`,
        `- Consumo médio:  ${hibridoAn.consumo_medio_kwh || '—'} kWh/mês`,
        ``,
      )
    }
  }

  // Descrição do sistema pra estampar no carimbo (ex: "Sistema fotovoltaico 6,99 kWp")
  const potCcTxt = fmt(potCcKwp, 2)
  const descrProjeto = tipoDesenho === 'unifilar_hibrido'
    ? `Sistema híbrido fotovoltaico ${potCcTxt} kWp + BESS`
    : `Sistema fotovoltaico ${potCcTxt} kWp`
  const dataEmissao = new Date().toLocaleDateString('pt-BR')
  const cnpjCpfFmt = formatarCpfCnpj(projeto.cliente_cpf_cnpj) || '—'
  const cepFmt = formatarCEP(enderecoObra.cep) || '—'
  const enderecoLinha1 = [enderecoObra.logradouro, enderecoObra.numero ? `Nº ${enderecoObra.numero}` : null, enderecoObra.bairro].filter(Boolean).join(', ') || '—'

  // ═══ Dados do carimbo — vem da homologação (não do projeto) ═══
  const protocoloCelesc = homologacao?.protocolo_celesc || '⚠ preencher em /homologacoes'
  const dataSolicit = homologacao?.data_solicitacao ? fmtDataBr(homologacao.data_solicitacao) : null
  const dataAprov = homologacao?.data_aprovacao ? fmtDataBr(homologacao.data_aprovacao) : null
  const artNum = projeto.art_numero || configEmpresa?.rt_art_padrao || '⚠ preencher'
  const rtNome = eletrotecnicoNome || 'Kalebe Grün'

  partes.push(
    `## ${tipoDesenho === 'unifilar_hibrido' && hibridoDim ? '10' : '9'}. ETIQUETA / CARIMBO DA PRANCHA`,
    ``,
    `Formato exato pra estampar no bloco carimbo do folha01 (padrão "Projeto Ideal"). Copie os valores linha a linha:`,
    ``,
    '```',
    `┌─ CARIMBO ─────────────────────────────────────────────────────────┐`,
    ``,
    `PROJETO:            ${descrProjeto}`,
    `PROPRIETÁRIO:       ${projeto.cliente_razao_social || '⚠ preencher'}`,
    `CNPJ/CPF:           ${cnpjCpfFmt}`,
    `PROTOCOLO CELESC:   ${protocoloCelesc}`,
    ``,
    `TÍTULO:             ${tituloCarimbo(tipoDesenho)}`,
    ``,
    `ENDEREÇO DA OBRA:   ${enderecoLinha1}`,
    `                    ${enderecoObra.cidade || '⚠ preencher'} / ${enderecoObra.uf || 'SC'}`,
    `CEP:                ${cepFmt}`,
    ``,
    `PROJETISTA:         Kalebe Grün`,
    `DATA:               ${dataEmissao}`,
    `REVISADO POR:       Kalebe Grün`,
    `REVISÃO:            ${projeto.revisao_diagrama || '01'}`,
    `CONTA CONTRATO:     ${projeto.conta_contrato || '⚠ preencher'}`,
    `INTEGRADOR:         SPIN Solar`,
    `FOLHA:              ${numeroFolha(tipoDesenho)}`,
    ``,
    `RT ASSINATURA:      ${rtNome} · Eletrotécnico`,
    `CPF (assinatura):   943.121.760-00`,
    `Registro CFT:       ${configEmpresa?.rt_crea || '94312176000'}`,
    `ART:                ${artNum}`,
    ...(dataSolicit ? [`DATA SOLICITAÇÃO:   ${dataSolicit}`] : []),
    ...(dataAprov ? [`DATA APROVAÇÃO:     ${dataAprov}`] : []),
    ``,
    `└────────────────────────────────────────────────────────────────────┘`,
    '```',
    ``,
    ...(!homologacao?.protocolo_celesc || !projeto.cliente_endereco?.logradouro && !projeto.endereco_instalacao?.rua ? [
      `⚠️ ATENÇÃO — DADOS FALTANDO NO CARIMBO`,
      ``,
      ...(!homologacao?.protocolo_celesc ? [`- Protocolo CELESC não cadastrado → vá em /homologacoes/${homologacao?.id || '{id}'} e clique em "Cadastrar" ao lado de "PROTOCOLO CELESC"`] : []),
      ...((!projeto.endereco_instalacao?.rua && !projeto.cliente_endereco?.logradouro) ? [`- Endereço da obra não cadastrado → vá no cadastro do telhado do projeto e preencha o endereço completo da instalação`] : []),
      ``,
    ] : []),
    `═══════════════════════════════════════════════════════════════════`,
    `Entregável esperado: PDF finalizado da folha ${nomeFolhaDiagrama(tipoDesenho)}, no padrão gráfico "Projeto Ideal" SPIN.`,
    `Formatos adicionais (opcional): DXF, SVG.`,
  )

  return partes.join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function num(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isFinite(n) ? n : 0
}

function fmt(v: number, casas: number): string {
  if (!isFinite(v) || v === 0) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function normLigacao(v: any): 'monofasico' | 'bifasico' | 'trifasico' {
  const s = String(v || '').toLowerCase()
  if (/tri/.test(s)) return 'trifasico'
  if (/bi/.test(s)) return 'bifasico'
  return 'monofasico'
}

function extrairArranjo(telhadoSecoes: any[], kit: any): Array<{ numero: number; strings: Array<{ numero: number; qtd_modulos: number }> }> {
  // Estrutura esperada em telhado_secoes[i].strings[j].qtd_modulos + mppt
  const porMppt = new Map<number, Array<{ numero: number; qtd_modulos: number }>>()
  for (const secao of telhadoSecoes || []) {
    const strings = Array.isArray(secao.strings) ? secao.strings : []
    for (const s of strings) {
      const mppt = num(s.mppt) || 1
      const num_str = num(s.numero_string) || (porMppt.get(mppt)?.length || 0) + 1
      const qtd = num(s.qtd_modulos) || num(s.modulos_em_serie) || 0
      if (qtd <= 0) continue
      const lista = porMppt.get(mppt) || []
      lista.push({ numero: num_str, qtd_modulos: qtd })
      porMppt.set(mppt, lista)
    }
  }
  if (porMppt.size === 0) return []
  const out: Array<{ numero: number; strings: Array<{ numero: number; qtd_modulos: number }> }> = []
  const mpptsOrdenados = Array.from(porMppt.keys()).sort((a, b) => a - b)
  for (const m of mpptsOrdenados) {
    const strings = (porMppt.get(m) || []).sort((a, b) => a.numero - b.numero)
    out.push({ numero: m, strings })
  }
  return out
}

function nomeFolhaDiagrama(tipo: string): string {
  switch (tipo) {
    case 'unifilar_ongrid': return '01 — DIAGRAMA UNIFILAR (on-grid)'
    case 'unifilar_hibrido': return '01 — DIAGRAMA UNIFILAR (híbrido BESS)'
    case 'padrao_entrada': return 'PADRÃO DE ENTRADA CELESC'
    case 'layout_instalacao': return 'LAYOUT DE INSTALAÇÃO'
    default: return tipo
  }
}

// ══════════════════════════════════════════════════════════════════════
// EXTRAÇÃO / FORMATAÇÃO DE ENDEREÇO
// ══════════════════════════════════════════════════════════════════════

type EnderecoNormalizado = {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  cep: string
  coordenadas_gps?: any
}

/**
 * Endereço da OBRA (onde o sistema fotovoltaico será instalado). Prioridade:
 *   1. projeto.endereco_instalacao (preenchido quando obra ≠ titular)
 *   2. projeto.cliente_endereco (endereço cadastrado)
 *
 * Kalebe pediu 2026-08-23: "endereço da instalação é o que deve ser
 * considerado" — mesmo quando o titular tem outro endereço.
 *
 * Aceita 2 shapes de key: `logradouro|rua`, `cidade|municipio`, `uf|estado`.
 */
function extrairEnderecoObra(projeto: any): EnderecoNormalizado {
  const raw = projeto?.endereco_instalacao || projeto?.cliente_endereco || {}
  return normalizarEndereco(raw)
}

function normalizarEndereco(raw: any): EnderecoNormalizado {
  const r = raw || {}
  return {
    logradouro: String(r.logradouro || r.rua || r.endereco || '').trim(),
    numero: String(r.numero || r.num || '').trim(),
    complemento: String(r.complemento || r.compl || '').trim(),
    bairro: String(r.bairro || '').trim(),
    cidade: String(r.cidade || r.municipio || '').trim(),
    uf: String(r.uf || r.estado || '').trim().toUpperCase(),
    cep: String(r.cep || '').trim(),
    coordenadas_gps: r.coordenadas_gps || null,
  }
}

function formatarLinhaEndereco(e: EnderecoNormalizado): string {
  const linha1 = [e.logradouro, e.numero ? `Nº ${e.numero}` : null, e.complemento || null, e.bairro].filter(Boolean).join(', ')
  const linha2 = [e.cidade, e.uf].filter(Boolean).join('/')
  const cep = formatarCEP(e.cep)
  const partes = [linha1, linha2, cep ? `CEP: ${cep}` : null].filter(Boolean)
  return partes.length > 0 ? partes.join(' — ') : '⚠ endereço não cadastrado'
}

function formatarCEP(cep: any): string {
  const s = String(cep || '').replace(/\D/g, '')
  if (s.length !== 8) return String(cep || '').trim()
  return `${s.slice(0, 5)}-${s.slice(5)}`
}

function fmtDataBr(d: any): string {
  if (!d) return ''
  const s = String(d)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  try {
    return new Date(s).toLocaleDateString('pt-BR')
  } catch { return s }
}

function formatarCpfCnpj(v: any): string {
  const s = String(v || '').replace(/\D/g, '')
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`
  if (s.length === 14) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`
  return String(v || '').trim()
}

function tituloCarimbo(tipo: string): string {
  switch (tipo) {
    case 'unifilar_ongrid': return 'DIAGRAMA UNIFILAR'
    case 'unifilar_hibrido': return 'DIAGRAMA UNIFILAR HÍBRIDO'
    case 'padrao_entrada': return 'PADRÃO DE ENTRADA'
    case 'layout_instalacao': return 'LAYOUT DE INSTALAÇÃO'
    default: return String(tipo).toUpperCase()
  }
}

function numeroFolha(tipo: string): string {
  switch (tipo) {
    case 'unifilar_ongrid':
    case 'unifilar_hibrido': return '01'
    case 'padrao_entrada': return '02'
    case 'layout_instalacao': return '03'
    default: return '—'
  }
}
