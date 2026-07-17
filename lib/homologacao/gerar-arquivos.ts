/**
 * Orquestra a geração automática dos arquivos das 6 etapas de uma homologação
 * assim que ela é criada (após venda fechada).
 *
 * Rodado em background pelo disparoAutomacoes — não bloqueia a resposta HTTP.
 * Cada geração é isolada em try/catch pra que uma falha não pare as outras.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  gerarMemorialDescritivo,
  gerarListaKitCsv,
  gerarListaCaCsv,
  gerarLayoutSvg,
  gerarPadraoEntradaSvg,
} from './geradores'

const BUCKET = 'homologacao-arquivos'

type ResultadoEtapa = {
  chave: string
  sucesso: boolean
  url?: string
  motivo?: string
}

export async function gerarArquivosAutomaticos(
  supabaseAdmin: SupabaseClient,
  projetoId: string,
  homologacaoId: string,
): Promise<ResultadoEtapa[]> {
  // Busca projeto completo
  const { data: projeto, error: eProj } = await supabaseAdmin
    .from('projetos')
    .select('*')
    .eq('id', projetoId)
    .single()

  if (eProj || !projeto) return [{ chave: 'geral', sucesso: false, motivo: 'Projeto não encontrado' }]

  // Busca etapas da homologação (pra pegar os IDs por chave)
  const { data: etapas } = await supabaseAdmin
    .from('homologacao_etapas')
    .select('id, chave')
    .eq('homologacao_id', homologacaoId)

  const etapaPorChave: Record<string, string> = {}
  for (const e of etapas || []) etapaPorChave[e.chave] = e.id

  const resultados: ResultadoEtapa[] = []
  const codigo = projeto.codigo || projetoId.slice(0, 8)

  // ═══ Memorial descritivo (Markdown) ═══
  resultados.push(await gerar(supabaseAdmin, {
    chave: 'memorial_descritivo',
    projetoId, homologacaoId,
    etapaId: etapaPorChave['memorial_descritivo'],
    nomeArquivo: `${codigo}-memorial.md`,
    gerador: () => gerarMemorialDescritivo(projeto),
  }))

  // ═══ Lista Kit FV (CSV) ═══
  resultados.push(await gerar(supabaseAdmin, {
    chave: 'lista_kit',
    projetoId, homologacaoId,
    etapaId: etapaPorChave['lista_kit'],
    nomeArquivo: `${codigo}-lista-kit-fv.csv`,
    gerador: () => gerarListaKitCsv(projeto),
  }))

  // ═══ Lista CA (CSV) ═══
  resultados.push(await gerar(supabaseAdmin, {
    chave: 'lista_ca',
    projetoId, homologacaoId,
    etapaId: etapaPorChave['lista_ca'],
    nomeArquivo: `${codigo}-lista-ca.csv`,
    gerador: () => gerarListaCaCsv(projeto),
  }))

  // ═══ Layout de instalação (SVG) ═══
  resultados.push(await gerar(supabaseAdmin, {
    chave: 'layout_instalacao',
    projetoId, homologacaoId,
    etapaId: etapaPorChave['layout_instalacao'],
    nomeArquivo: `${codigo}-layout.svg`,
    gerador: () => gerarLayoutSvg(projeto),
  }))

  // ═══ Padrão de entrada novo (só se marcado) ═══
  if (etapaPorChave['padrao_entrada_novo']) {
    // Busca a homologação de novo pra pegar dados atualizados de padrão
    const { data: hom } = await supabaseAdmin
      .from('homologacoes')
      .select('precisa_padrao_novo, padrao_novo_amperagem, padrao_novo_observacao')
      .eq('id', homologacaoId)
      .single()
    if (hom?.precisa_padrao_novo) {
      resultados.push(await gerar(supabaseAdmin, {
        chave: 'padrao_entrada_novo',
        projetoId, homologacaoId,
        etapaId: etapaPorChave['padrao_entrada_novo'],
        nomeArquivo: `${codigo}-padrao-entrada.svg`,
        gerador: () => gerarPadraoEntradaSvg(projeto, hom),
      }))
    }
  }

  // ═══ Diagrama unifilar — depende de IA (Claude) ═══
  // Se ANTHROPIC_API_KEY tá presente, tenta chamar a rota interna.
  // Se falhar, marca a etapa com observação amigável e segue em frente.
  if (etapaPorChave['diagrama_unifilar']) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const resp = await fetch(`${baseUrl}/api/gerar-diagrama-interno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projeto_id: projetoId,
          homologacao_etapa_id: etapaPorChave['diagrama_unifilar'],
          tipo_desenho: projeto.tipo_projeto === 'hibrido_bess' ? 'unifilar_hibrido' : 'unifilar_ongrid',
        }),
      }).catch(() => null)

      if (resp && resp.ok) {
        resultados.push({ chave: 'diagrama_unifilar', sucesso: true, motivo: 'Geração IA iniciada' })
      } else {
        await marcarPendente(supabaseAdmin, etapaPorChave['diagrama_unifilar'],
          '⏳ Aguardando geração via IA (Claude Sonnet). Reprocessa quando a chave Anthropic tiver crédito.')
        resultados.push({ chave: 'diagrama_unifilar', sucesso: false, motivo: 'IA indisponível' })
      }
    } catch (e: any) {
      await marcarPendente(supabaseAdmin, etapaPorChave['diagrama_unifilar'],
        '⏳ Aguardando geração via IA. Erro: ' + (e?.message || 'desconhecido'))
      resultados.push({ chave: 'diagrama_unifilar', sucesso: false, motivo: e?.message })
    }
  }

  return resultados
}

async function gerar(supabaseAdmin: SupabaseClient, input: {
  chave: string
  projetoId: string
  homologacaoId: string
  etapaId?: string
  nomeArquivo: string
  gerador: () => { conteudo: string; mimeType: string; extensao: string }
}): Promise<ResultadoEtapa> {
  if (!input.etapaId) {
    return { chave: input.chave, sucesso: false, motivo: 'Etapa não encontrada' }
  }

  try {
    const { conteudo, mimeType } = input.gerador()
    const caminho = `${input.projetoId}/${input.homologacaoId}/${input.nomeArquivo}`

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(caminho, conteudo, { contentType: mimeType, upsert: true })

    if (upErr) return { chave: input.chave, sucesso: false, motivo: upErr.message }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(caminho)
    const url = urlData.publicUrl

    await supabaseAdmin
      .from('homologacao_etapas')
      .update({
        status: 'em_andamento',
        iniciado_em: new Date().toISOString(),
        url_arquivo_pdf: url,
        observacoes: '✓ Arquivo gerado automaticamente. Revise e marque como concluído.',
      })
      .eq('id', input.etapaId)

    return { chave: input.chave, sucesso: true, url }
  } catch (e: any) {
    return { chave: input.chave, sucesso: false, motivo: e?.message || 'Erro desconhecido' }
  }
}

async function marcarPendente(
  supabaseAdmin: SupabaseClient,
  etapaId: string,
  observacao: string,
): Promise<void> {
  await supabaseAdmin
    .from('homologacao_etapas')
    .update({ observacoes: observacao })
    .eq('id', etapaId)
}
