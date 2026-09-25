import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Política de retenção de arquivos (Kalebe 2026-09-25).
 *
 * Arquivo de cliente fica no máximo 180 dias a contar da criação. Passado
 * o prazo é apagado, EXCETO se o cliente fechou negócio (algum projeto
 * vendido ou adiante) — aí fica pra sempre. Objetivo: não pagar storage
 * de lead que não virou venda.
 *
 * Quem decide o que está protegido é a função SQL
 * arquivos_retencao_candidatos (migration 121). Aqui só: lista de pastas,
 * remoção pelo Storage API e marcação no banco.
 */

export const RETENCAO_DIAS = 180

/** Pastas com arquivo de cliente — entram na regra */
export const BUCKETS_CLIENTE = [
  'wa_midia',
  'faturas',
  'propostas-pdf',
  'propostas-menu',
  'propostas-servicos',
  'projetos-diagramas',
  'homologacao-arquivos',
  'homologacao-consultor',
  'analise-demanda',
  'telhado-satelite',
  'telhados-fotos',
  'telhado-registros',
]

/** Nome amigável pra tela do admin. Pasta fora de BUCKETS_CLIENTE nunca é apagada. */
export const ROTULO_BUCKET: Record<string, string> = {
  'wa_midia': 'WhatsApp (áudios, fotos, PDFs)',
  'faturas': 'Faturas de energia',
  'propostas-pdf': 'PDFs de proposta',
  'propostas-menu': 'Propostas do menu',
  'propostas-servicos': 'Propostas de serviços',
  'projetos-diagramas': 'Diagramas',
  'homologacao-arquivos': 'Homologação',
  'homologacao-consultor': 'Homologação (consultor)',
  'analise-demanda': 'Análise de demanda',
  'telhado-satelite': 'Imagens de satélite',
  'telhados-fotos': 'Fotos de telhado',
  'telhado-registros': 'Registros de telhado',
  'empresa-assets': 'Empresa (logo, assinatura)',
  'datasheets': 'Datasheets',
  'catalogo-uploads': 'Planilhas do catálogo WEG',
  'produtos-imagens': 'Imagens de produto',
  'criativos-vendas': 'Criativos de venda',
  'documentos-candidatos': 'Documentos de candidatos',
}

export type ArquivoVencido = {
  bucket_id: string
  nome: string
  bytes: number | null
  criado_em: string
}

/** Arquivos vencidos e sem proteção na data de referência (simulação não apaga nada). */
export async function listarVencidos(opts: { referencia?: Date; limite?: number } = {}) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('arquivos_retencao_candidatos', {
    p_buckets: BUCKETS_CLIENTE,
    p_dias: RETENCAO_DIAS,
    p_referencia: (opts.referencia || new Date()).toISOString(),
    p_limite: opts.limite ?? 1000,
  })
  if (error) throw new Error(error.message)
  return (data || []) as ArquivoVencido[]
}

/**
 * Apaga os arquivos vencidos (até 1000 por execução — o resto sai no dia
 * seguinte), registra em arquivos_expurgados e marca mensagens/propostas
 * que apontavam pra eles.
 */
export async function executarRetencao() {
  const admin = createAdminClient()
  const vencidos = await listarVencidos()
  let apagados = 0
  let bytes = 0
  const erros: string[] = []

  const porBucket = new Map<string, ArquivoVencido[]>()
  for (const a of vencidos) {
    if (!BUCKETS_CLIENTE.includes(a.bucket_id)) continue // trava extra
    porBucket.set(a.bucket_id, [...(porBucket.get(a.bucket_id) || []), a])
  }

  for (const [bucket, arquivos] of Array.from(porBucket.entries())) {
    for (let i = 0; i < arquivos.length; i += 100) {
      const lote = arquivos.slice(i, i + 100)
      const { data: removidos, error } = await admin.storage.from(bucket).remove(lote.map((a) => a.nome))
      if (error) { erros.push(`${bucket}: ${error.message}`); continue }
      const nomesRemovidos = new Set((removidos || []).map((r: any) => r.name))
      const ok = lote.filter((a) => nomesRemovidos.has(a.nome))
      if (ok.length === 0) continue

      apagados += ok.length
      bytes += ok.reduce((s, a) => s + Number(a.bytes || 0), 0)
      await admin.from('arquivos_expurgados').insert(ok.map((a) => ({
        bucket_id: bucket,
        nome: a.nome,
        bytes: a.bytes,
        criado_em: a.criado_em,
      })))

      // Marca quem apontava pro arquivo, pra tela mostrar "removido" em vez de link quebrado
      const urls = ok.map((a) => admin.storage.from(bucket).getPublicUrl(a.nome).data.publicUrl)
      const agora = new Date().toISOString()
      for (let j = 0; j < urls.length; j += 50) {
        const parte = urls.slice(j, j + 50)
        if (bucket === 'wa_midia') {
          await admin.from('wa_mensagens')
            .update({ midia_url: null, midia_expirada_em: agora })
            .in('midia_url', parte)
        }
        if (bucket === 'propostas-pdf') {
          await admin.from('projeto_propostas_historico')
            .update({ arquivo_expirado_em: agora })
            .in('url_pdf', parte)
        }
      }
    }
  }

  return { vencidos: vencidos.length, apagados, mb_liberados: +(bytes / 1048576).toFixed(1), erros }
}
