// Levantamentos no servidor: pré-preenchimento a partir do projeto/OS e o
// bloco que entra no relatório técnico do gerador de diagramas.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { createAdminClient } from '@/lib/supabase/admin'
import { formatarCpfCnpj, formatarTelefone } from '@/lib/formatters'
import { hojeBRT } from '@/lib/campo/comum'
import { BUCKET_LEVANTAMENTOS, camposDoModelo, faltaMigration, valorExibido } from './comum'
import { calcularProgresso, preenchido } from './progresso'
import {
  numeroLevantamento, ROTULO_STATUS,
  type CampoModelo, type Finalidade, type ModeloChecklist, type Pendencia, type Respostas,
} from './types'

type Admin = ReturnType<typeof createAdminClient>

export type ModeloParaEscolha = { codigo: Finalidade; nome: string; descricao: string }

/** Modelos ativos pra tela "Qual a finalidade?" (null = migrations não aplicadas). */
export async function modelosParaEscolha(supabase: SupabaseClient): Promise<ModeloParaEscolha[] | null> {
  const { data, error } = await supabase.from('checklist_modelos')
    .select('codigo, nome, descricao:definicao->>descricao').eq('ativo', true)
  if (faltaMigration(error)) return null
  const ordem: Finalidade[] = ['fv', 'padrao_novo', 'aumento_carga']
  return ((data || []) as ModeloParaEscolha[]).sort((a, b) => ordem.indexOf(a.codigo) - ordem.indexOf(b.codigo))
}

const ORIENTACAO: Record<string, string> = {
  N: 'Norte', NE: 'Nordeste', NO: 'Noroeste', L: 'Leste', O: 'Oeste',
  SE: 'Sudeste', SO: 'Sudoeste', S: 'Sul', HORIZONTAL: 'Horizontal',
}

const cepFmt = (cep: unknown) => {
  const s = String(cep || '').replace(/\D/g, '')
  return s.length === 8 ? `${s.slice(0, 5)}-${s.slice(5)}` : String(cep || '').trim()
}

function coordenadas(v: any): string {
  if (!v) return ''
  if (typeof v === 'string') return v.trim()
  const lat = v.lat ?? v.latitude, lng = v.lng ?? v.lon ?? v.longitude
  return lat != null && lng != null ? `${lat}, ${lng}` : ''
}

/** Opção do modelo que corresponde ao texto (sem acento/caixa); nada se não houver. */
function opcaoDe(m: ModeloChecklist, campoId: string, teste: (opcaoNormalizada: string) => boolean): string | null {
  const c = camposDoModelo(m).find((x) => x.id === campoId)
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return c?.opcoes?.find((o) => teste(norm(o))) || null
}

/** Valor de outro levantamento serve neste campo? (opção tem que existir no modelo) */
function valorCompativel(c: CampoModelo, v: unknown): Respostas[string] | undefined {
  if (!preenchido(v)) return undefined
  if (c.tipo === 'number') return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  if (c.tipo === 'checks') {
    const ok = (Array.isArray(v) ? v : []).filter((x) => c.opcoes?.includes(String(x))).map(String)
    return ok.length ? ok : undefined
  }
  if (c.tipo === 'select' || c.tipo === 'radio') return c.opcoes?.includes(String(v)) ? String(v) : undefined
  return typeof v === 'string' ? v : undefined
}

/** Campos da visita (não vêm de etapa anterior). */
const SO_DESTA_VISITA = new Set(['consultor', 'data'])

/**
 * Kalebe 2026-10-27: "os dados que já foram preenchidos em alguma etapa
 * anterior sejam carregados no formulário". Junta o que já existe e só entra
 * em campo vazio — nunca troca o que o consultor digitou.
 */
export function completarRespostas(atuais: Respostas, sugestoes: Respostas): { respostas: Respostas; preenchidos: string[] } {
  const respostas: Respostas = { ...atuais }
  const preenchidos: string[] = []
  for (const [id, v] of Object.entries(sugestoes)) {
    if (preenchido(respostas[id]) || !preenchido(v)) continue
    respostas[id] = v
    preenchidos.push(id)
  }
  return { respostas, preenchidos }
}

/**
 * Respostas que já se sabe para este levantamento: cadastro do projeto
 * (cliente, endereço, UC), fatura, padrão de entrada (Passo 4), kit, telhado
 * e, por último, outros levantamentos do mesmo projeto (mesmo id de campo).
 * Só campos que existem no modelo; select/radio só com opção do modelo.
 */
export async function respostasIniciais(admin: Admin, args: {
  modelo: ModeloChecklist
  nomeConsultor: string
  projetoId?: string | null
  os?: any | null
  /** levantamento que está sendo aberto (não copia dele mesmo) */
  levantamentoId?: string | null
}): Promise<Respostas> {
  const { modelo } = args
  const ids = new Set(camposDoModelo(modelo).map((c) => c.id))
  const r: Respostas = {}
  const pôr = (id: string, v: string | number | null | undefined) => {
    if (!ids.has(id) || v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return
    r[id] = v
  }
  pôr('consultor', args.nomeConsultor)
  pôr('data', hojeBRT())

  let projeto: any = null
  if (args.projetoId) {
    const { data } = await admin.from('projetos').select('*').eq('id', args.projetoId).maybeSingle()
    projeto = data
  }

  if (projeto) {
    if (projeto.cliente_id && (!projeto.cliente_razao_social || !projeto.cliente_cpf_cnpj || !projeto.cliente_endereco)) {
      const { data: c } = await admin.from('clientes')
        .select('razao_social, cpf_cnpj, telefone, whatsapp, endereco').eq('id', projeto.cliente_id).maybeSingle()
      if (c) {
        projeto.cliente_razao_social ||= c.razao_social
        projeto.cliente_cpf_cnpj ||= c.cpf_cnpj
        projeto.cliente_telefone ||= c.telefone || c.whatsapp
        projeto.cliente_endereco ||= c.endereco
      }
    }
    const e = projeto.endereco_instalacao || projeto.cliente_endereco || {}
    pôr('cliente', projeto.cliente_razao_social)
    pôr('doc', projeto.cliente_cpf_cnpj ? formatarCpfCnpj(String(projeto.cliente_cpf_cnpj)) : null)
    pôr('fone', projeto.cliente_telefone ? formatarTelefone(String(projeto.cliente_telefone)) : null)
    pôr('endereco', [e.logradouro || e.rua || e.endereco, e.numero || e.num, e.complemento || e.compl].filter(Boolean).join(', '))
    pôr('bairro', e.bairro)
    pôr('cidade', [e.cidade || e.municipio, (e.uf || e.estado || '').toUpperCase()].filter(Boolean).join(' / '))
    pôr('cep', cepFmt(e.cep))
    pôr('uc', projeto.uc_geradora)
    pôr('pedido', projeto.codigo)
    pôr('coord', coordenadas(e.coordenadas_gps))

    const fatura = projeto.analise_fatura || {}
    const padrao = projeto.padrao_entrada || {}
    const grupo = String(fatura.grupo_tarifario || fatura.subgrupo || '').trim().toUpperCase()[0]
    if (grupo === 'A' || grupo === 'B') pôr('grupo', opcaoDe(modelo, 'grupo', (o) => o.startsWith(grupo.toLowerCase() + ' ')))
    const classe = String(fatura.classe || fatura.classe_consumo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (classe) pôr('classe', opcaoDe(modelo, 'classe', (o) => classe.includes(o)))
    const lig = String(padrao.tipo_ligacao || fatura.tipo_ligacao || '').toLowerCase()
    const prefixo = /tri/.test(lig) ? 'tri' : /bi/.test(lig) ? 'bi' : /mono/.test(lig) ? 'mono' : ''
    if (prefixo) pôr('lig_atual', opcaoDe(modelo, 'lig_atual', (o) => o.startsWith(prefixo)))
    pôr('disj_atual', Number(padrao.amperagem_disjuntor_geral_a) || null)
    const consumo = Number(fatura.consumo_medio_12m_kwh || fatura.consumo_medio_kwh || fatura.consumo_mes_kwh) || null
    pôr('consumo', consumo ? Math.round(consumo) : null)

    const kit = projeto.kit_selecionado || {}
    const placa = kit.placa || {}
    const invs: any[] = Array.isArray(kit.inversores) && kit.inversores.length ? kit.inversores : kit.inversor ? [{ ...kit.inversor, qtd: kit.qtd_inversores || 1 }] : []
    pôr('mod_modelo', [placa.fabricante, placa.modelo].filter(Boolean).join(' '))
    pôr('mod_pot', Number(placa.potencia_wp) || null)
    pôr('mod_qtd', Number(kit.qtd_placas) || null)
    if (invs.length) {
      const micro = invs.some((i) => String(i.subcategoria || '').toLowerCase().includes('micro') || /^SIW100/i.test(String(i.modelo || '')))
      const hibrido = /hibrido/.test(String(projeto.tipo_projeto || ''))
      pôr('inv_tipo', opcaoDe(modelo, 'inv_tipo', (o) => o.startsWith(micro ? 'micro' : hibrido ? 'hibrido' : 'string')))
      pôr('inv_modelo', invs.map((i) => `${Number(i.qtd) || 1}× ${[i.fabricante, i.modelo].filter(Boolean).join(' ')}`).join(' + '))
      pôr('inv_qtd', invs.reduce((s, i) => s + (Number(i.qtd) || 1), 0))
      const potCa = Number(kit.potencia_ca_kw) || invs.reduce((s, i) => s + (Number(i.potencia_kw) || 0) * (Number(i.qtd) || 1), 0)
      pôr('inv_pot', potCa ? Math.round(potCa * 100) / 100 : null)
    }

    const { data: secoes } = await admin.from('projetos_telhado_secoes')
      .select('tipo_cobertura, orientacao, inclinacao_graus').eq('projeto_id', projeto.id).order('ordem', { ascending: true })
    const s0 = secoes?.[0]
    if (s0) {
      const cob = String(s0.tipo_cobertura || '').toLowerCase()
      const alvo = /cer[aâ]m/.test(cob) ? 'ceram' : /fibro/.test(cob) ? 'fibro' : /met[aá]l/.test(cob) ? 'metal' : /laje/.test(cob) ? 'laje' : /solo/.test(cob) ? 'solo' : ''
      if (alvo) pôr('telhado', opcaoDe(modelo, 'telhado', (o) => o.startsWith(alvo)))
      const orient = [...new Set((secoes || []).map((x: any) => ORIENTACAO[String(x.orientacao || '').toUpperCase()]).filter(Boolean))]
      pôr('orient', orient.join('; '))
      pôr('incl', s0.inclinacao_graus != null ? Number(s0.inclinacao_graus) : null)
    }
  } else if (args.os) {
    const os = args.os
    const e = os.endereco || {}
    pôr('cliente', os.cliente_nome)
    pôr('fone', os.contato_telefone ? formatarTelefone(String(os.contato_telefone)) : null)
    pôr('endereco', [e.logradouro || e.rua || os.endereco_execucao, e.numero, e.complemento].filter(Boolean).join(', '))
    pôr('bairro', e.bairro)
    pôr('cidade', [e.cidade, (e.uf || '').toUpperCase()].filter(Boolean).join(' / '))
    pôr('cep', cepFmt(e.cep))
  }

  // outros levantamentos do mesmo projeto (o mais recente primeiro): poste,
  // ramal, cargas, distâncias… que alguém já mediu numa visita anterior
  if (args.projetoId) {
    let q = admin.from('levantamentos').select('id, respostas')
      .eq('projeto_id', args.projetoId).is('deleted_at', null).neq('status', 'cancelado')
      .order('updated_at', { ascending: false }).limit(10)
    if (args.levantamentoId) q = q.neq('id', args.levantamentoId)
    const { data: anteriores } = await q
    for (const c of camposDoModelo(modelo)) {
      if (SO_DESTA_VISITA.has(c.id) || preenchido(r[c.id])) continue
      for (const l of anteriores || []) {
        const v = valorCompativel(c, (l.respostas as Respostas | null)?.[c.id])
        if (v !== undefined) { r[c.id] = v; break }
      }
    }
  }
  return r
}

/**
 * Bloco "levantamento de campo" do relatório técnico do diagrama (Kalebe
 * 2026-10-26: o checklist alimenta o gerador). Pega o levantamento mais novo
 * de cada finalidade ligado ao projeto, com as fotos em link temporário.
 */
export async function linhasLevantamentosDoProjeto(
  admin: Admin,
  projetoId: string,
  tipoDesenho: string,
): Promise<string[]> {
  const { data: levs, error } = await admin.from('levantamentos')
    .select('id, numero, finalidade, modelo_id, status, respostas, pendencias, observacao_projetista, enviado_em, updated_at')
    .eq('projeto_id', projetoId).is('deleted_at', null).neq('status', 'cancelado')
    .order('updated_at', { ascending: false })
  if (error || !levs?.length) return []

  // um por finalidade; a do tipo de folha vem primeiro
  const ordem = tipoDesenho === 'padrao_entrada' ? ['padrao_novo', 'aumento_carga', 'fv'] : ['fv', 'aumento_carga', 'padrao_novo']
  const escolhidos = ordem.map((f) => levs.find((l: any) => l.finalidade === f)).filter(Boolean) as any[]
  const { data: modelos } = await admin.from('checklist_modelos').select('id, definicao').in('id', escolhidos.map((l) => l.modelo_id))
  const { data: arquivos } = await admin.from('levantamento_arquivos')
    .select('levantamento_id, tipo, slot, storage_path').in('levantamento_id', escolhidos.map((l) => l.id))
    .in('tipo', ['foto', 'documento']).is('deleted_at', null).order('created_at', { ascending: true })
  const caminhos = (arquivos || []).map((a: any) => a.storage_path)
  const links: Record<string, string> = {}
  if (caminhos.length) {
    const { data } = await admin.storage.from(BUCKET_LEVANTAMENTOS).createSignedUrls(caminhos, 7 * 24 * 3600)
    for (const x of data || []) if (x.path && x.signedUrl) links[x.path] = x.signedUrl
  }

  const out: string[] = []
  for (const lev of escolhidos) {
    const modelo = (modelos || []).find((m: any) => m.id === lev.modelo_id)?.definicao as ModeloChecklist | undefined
    if (!modelo) continue
    const arqs = (arquivos || []).filter((a: any) => a.levantamento_id === lev.id)
    const prog = calcularProgresso(modelo, lev.respostas || {}, arqs)
    out.push(
      `## LEVANTAMENTO DE CAMPO — ${numeroLevantamento(lev.numero)} · ${modelo.nome}`,
      ``,
      `Situação: ${ROTULO_STATUS[lev.status as keyof typeof ROTULO_STATUS] || lev.status} · ${prog.ok}/${prog.total} itens obrigatórios (${prog.pct}%).`,
      `Dados medidos em campo pelo consultor/técnico. Onde divergirem das seções acima, use o levantamento e registre a divergência nas Pendências; item vazio sai como "A PREENCHER".`,
      ``,
    )
    for (const secao of modelo.secoes) {
      out.push(`### ${secao.titulo}`, ``)
      for (const c of secao.campos) {
        const v = valorExibido(c, lev.respostas?.[c.id])
        if (!v && !c.obrigatorio) continue
        out.push(`- ${c.rotulo}: ${v || 'A PREENCHER'}`)
      }
      out.push(``)
    }
    out.push(`### Fotos e documentos (links válidos por 7 dias)`, ``)
    for (const f of modelo.fotos) {
      const doSlot = arqs.filter((a: any) => a.slot === f.id)
      if (!doSlot.length) {
        if (f.obrigatorio) out.push(`- ${f.titulo}: sem foto (A PREENCHER)`)
        continue
      }
      out.push(`- ${f.titulo}: ${doSlot.map((a: any) => links[a.storage_path]).filter(Boolean).join(' · ') || `${doSlot.length} arquivo(s)`}`)
    }
    const pend = (Array.isArray(lev.pendencias) ? lev.pendencias : []) as Pendencia[]
    if (pend.length) {
      out.push(``, `### Pendências registradas`, ``, ...pend.map((p) => `- ${p.mensagem}${p.origem === 'projetista' ? ' (projetista)' : ''}`))
    }
    if (lev.observacao_projetista) out.push(``, `Observação do projetista: ${lev.observacao_projetista}`)
    out.push(``)
  }
  return out
}
