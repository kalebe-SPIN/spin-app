import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from '@/lib/whatsapp/config'
import { FORMAS_PAGAMENTO, TIPOS_IMPOSTO, SUBTIPOS_PESSOAL, hojeBR } from '@/lib/financeiro/fluxo'
import { carregarProjetosEServicos } from '@/lib/financeiro/opcoes-lancamento'

/**
 * Registrar saída por VOZ ou FOTO/PDF (Kalebe 2026-10-02). Recebe o texto
 * ditado e/ou o comprovante/nota, a IA extrai os campos do lançamento e o
 * formulário já abre preenchido pra conferir — nada é gravado no fluxo aqui.
 * O arquivo vai pro bucket privado 'comprovantes' (mig 135) e o caminho volta
 * pra ficar ligado ao lançamento.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

const GRUPOS_SAIDA = ['fornecedores', 'impostos', 'pessoal', 'despesas_operacionais', 'custos_projeto', 'comissoes', 'outras_despesas'] as const
const MIME_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const TEXTO_OU_NULO = { anyOf: [{ type: 'string' }, { type: 'null' }] }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'grupo', 'descricao', 'valor', 'data', 'ja_pago', 'forma_pagamento', 'fornecedor_id', 'fornecedor_nome',
    'fornecedor_cnpj', 'nf', 'tipo_imposto', 'competencia', 'subtipo_pessoal', 'favorecido', 'categoria_id',
    'projeto_id', 'servico_id', 'observacoes', 'avisos',
  ],
  properties: {
    grupo: { type: 'string', enum: [...GRUPOS_SAIDA] },
    descricao: { type: 'string', description: 'Descrição curta do lançamento, em português' },
    valor: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Valor total em reais (ponto decimal)' },
    data: { ...TEXTO_OU_NULO, description: 'Data do pagamento ou do vencimento, AAAA-MM-DD' },
    ja_pago: { type: 'boolean', description: 'true se já foi pago (comprovante de pagamento, "paguei"); false se é conta a pagar' },
    forma_pagamento: { anyOf: [{ type: 'string', enum: [...FORMAS_PAGAMENTO] }, { type: 'null' }] },
    fornecedor_id: { ...TEXTO_OU_NULO, description: 'id da lista FORNECEDORES quando bater nome ou CNPJ; senão null' },
    fornecedor_nome: TEXTO_OU_NULO,
    fornecedor_cnpj: { ...TEXTO_OU_NULO, description: 'só dígitos' },
    nf: { ...TEXTO_OU_NULO, description: 'número da nota fiscal' },
    tipo_imposto: { anyOf: [{ type: 'string', enum: [...TIPOS_IMPOSTO] }, { type: 'null' }] },
    competencia: { ...TEXTO_OU_NULO, description: 'mês de competência do imposto, AAAA-MM' },
    subtipo_pessoal: { anyOf: [{ type: 'string', enum: [...SUBTIPOS_PESSOAL] }, { type: 'null' }] },
    favorecido: { ...TEXTO_OU_NULO, description: 'pessoa que recebe (pessoal/comissão), da lista EQUIPE se possível' },
    categoria_id: { ...TEXTO_OU_NULO, description: 'id da lista CATEGORIAS (despesas operacionais/outras)' },
    projeto_id: { ...TEXTO_OU_NULO, description: 'id da lista PROJETOS quando o custo é de um projeto' },
    servico_id: { ...TEXTO_OU_NULO, description: 'id da lista SERVIÇOS (do mesmo projeto)' },
    observacoes: TEXTO_OU_NULO,
    avisos: { type: 'array', items: { type: 'string' }, description: 'o que ficou incerto ou faltando, em português' },
  },
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return NextResponse.json({ erro: 'Só o admin mexe no fluxo de caixa' }, { status: 403 })

  let corpo: { texto?: string; arquivo?: { base64: string; mime: string } }
  try { corpo = await req.json() } catch { return NextResponse.json({ erro: 'Requisição inválida' }, { status: 400 }) }
  const texto = String(corpo.texto || '').trim().slice(0, 4000)
  const arquivo = corpo.arquivo?.base64 ? corpo.arquivo : null
  if (!texto && !arquivo) return NextResponse.json({ erro: 'Fale ou envie a foto/PDF do comprovante' }, { status: 400 })
  const ehPdf = arquivo?.mime === 'application/pdf'
  if (arquivo && !ehPdf && !(MIME_IMAGEM as readonly string[]).includes(arquivo.mime)) {
    return NextResponse.json({ erro: 'Use foto (JPG/PNG/WebP) ou PDF' }, { status: 400 })
  }

  const { anthropic_api_key } = await getWaConfig()
  if (!anthropic_api_key) return NextResponse.json({ erro: 'Chave da IA não configurada (/admin/whatsapp/config)' }, { status: 500 })

  // Guarda o comprovante (bucket privado). Sem a migration 135, segue sem guardar.
  const avisosSistema: string[] = []
  let comprovante: string | null = null
  if (arquivo) {
    const ext = ehPdf ? 'pdf' : arquivo.mime === 'image/png' ? 'png' : arquivo.mime === 'image/webp' ? 'webp' : 'jpg'
    const caminho = `${hojeBR().slice(0, 7)}/${randomUUID()}.${ext}`
    const { error } = await createAdminClient().storage.from('comprovantes')
      .upload(caminho, Buffer.from(arquivo.base64, 'base64'), { contentType: arquivo.mime, upsert: false })
    if (error) avisosSistema.push('O comprovante não foi guardado (falta rodar a migration 135) — os dados foram lidos mesmo assim.')
    else comprovante = caminho
  }

  // Listas pra IA ligar o lançamento ao que já existe
  const [{ data: fornecedores }, { data: categorias }, { projetos, servicos }, { data: perfis }] = await Promise.all([
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia, cnpj').eq('ativo', true).order('razao_social').limit(1000),
    supabase.from('categorias_financeiras').select('id, nome').eq('ativo', true).eq('tipo', 'despesa').order('nome'),
    carregarProjetosEServicos(supabase),
    supabase.from('profiles').select('nome_completo').eq('ativo', true).neq('role', 'candidato'),
  ])
  const sistema = [
    'Você lê comprovantes, notas fiscais, boletos e relatos falados da Spin Solar (empresa de energia solar em Santa Catarina) e preenche UM lançamento de SAÍDA de caixa (custo ou despesa).',
    'Regras:',
    '- Só use o que está no documento/fala. Não invente valor, data, CNPJ nem nota; o que faltar fica null e vai em "avisos".',
    '- valor = total efetivamente pago ou a pagar (não some juros que não aparecem).',
    '- grupo: compra/nota de fornecedor → fornecedores; DAS, guia, tributo → impostos; salário, pró-labore, benefício, férias → pessoal; aluguel, energia, água, internet, telefone, combustível, software, contador, material de escritório → despesas_operacionais; material ou serviço pra obra/projeto/cliente específico → custos_projeto; comissão de vendedor → comissoes; o resto → outras_despesas.',
    '- ja_pago: true para comprovante de PIX/transferência/cartão, cupom fiscal pago, recibo, ou fala no passado ("paguei", "gastei"); false para boleto/fatura a vencer ou "vence dia".',
    '- Datas: AAAA-MM-DD. Se só vier dia/mês, use o ano de HOJE. "hoje"/"ontem" contam a partir de HOJE.',
    '- IDs (fornecedor_id, categoria_id, projeto_id, servico_id) SÓ das listas abaixo — se não tiver certeza, null. Fornecedor novo: preencha fornecedor_nome e fornecedor_cnpj e deixe fornecedor_id null.',
    '- servico_id só se pertencer ao projeto escolhido.',
    '- descricao curta e útil (ex.: "Combustível — visita técnica Tijucas", "NF 1234 — cabos solares").',
    '',
    'FORNECEDORES (id | razão social | nome fantasia | CNPJ):',
    ...((fornecedores || []) as any[]).map((f) => `${f.id} | ${f.razao_social} | ${f.nome_fantasia || ''} | ${String(f.cnpj || '').replace(/\D/g, '')}`),
    '',
    'CATEGORIAS DE DESPESA (id | nome):',
    ...((categorias || []) as any[]).map((c) => `${c.id} | ${c.nome}`),
    '',
    'PROJETOS (id | código · cliente):',
    ...projetos.map((p) => `${p.id} | ${p.nome}`),
    '',
    'SERVIÇOS DOS PROJETOS (id | projeto_id | serviço):',
    ...servicos.map((s) => `${s.id} | ${s.projeto_id} | ${s.nome}`),
    '',
    'EQUIPE:',
    ...((perfis || []) as any[]).map((p) => p.nome_completo).filter(Boolean),
  ].join('\n')

  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = []
  if (arquivo) {
    conteudo.push(ehPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: arquivo.mime as (typeof MIME_IMAGEM)[number], data: arquivo.base64 } })
  }
  conteudo.push({
    type: 'text',
    text: `HOJE: ${hojeBR()}\n${texto ? `RELATO DO USUÁRIO: ${texto}\n` : ''}${arquivo ? 'Leia o comprovante/nota acima.' : ''}\nPreencha o lançamento.`,
  })

  try {
    const anthropic = new Anthropic({ apiKey: anthropic_api_key })
    // Fallback no servidor: se o modelo recusar, a própria API tenta outro
    const resp = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: conteudo }],
    } as any) as Anthropic.Beta.BetaMessage

    if (resp.stop_reason === 'refusal') {
      return NextResponse.json({ erro: 'A IA não conseguiu ler esse conteúdo — preencha à mão.', comprovante }, { status: 422 })
    }
    const bruto = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const dados = JSON.parse(bruto)

    // Só aceita IDs que existem de verdade
    const idsForn = new Set(((fornecedores || []) as any[]).map((f) => f.id))
    const idsCat = new Set(((categorias || []) as any[]).map((c) => c.id))
    const idsProj = new Set(projetos.map((p) => p.id))
    if (dados.fornecedor_id && !idsForn.has(dados.fornecedor_id)) dados.fornecedor_id = null
    if (dados.categoria_id && !idsCat.has(dados.categoria_id)) dados.categoria_id = null
    if (dados.projeto_id && !idsProj.has(dados.projeto_id)) dados.projeto_id = null
    const serv = servicos.find((s) => s.id === dados.servico_id)
    if (!serv || serv.projeto_id !== dados.projeto_id) dados.servico_id = null
    if (dados.data && !/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) dados.data = null
    if (dados.competencia && !/^\d{4}-\d{2}$/.test(dados.competencia)) dados.competencia = null
    if (!(Number(dados.valor) > 0)) dados.valor = null

    return NextResponse.json({
      dados,
      comprovante,
      avisos: [...avisosSistema, ...(Array.isArray(dados.avisos) ? dados.avisos : [])],
    })
  } catch (e: any) {
    console.error('[financeiro/interpretar]', e)
    return NextResponse.json({ erro: 'Não consegui interpretar agora — tente de novo ou preencha à mão.', comprovante }, { status: 502 })
  }
}
