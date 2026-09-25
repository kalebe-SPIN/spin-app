// Robô de diagramas — roda no GitHub Actions (.github/workflows/gerar-diagrama.yml).
// Kalebe 2026-09-25: substitui o copiar/colar do relatório no chat.
//
//   node worker.mjs preparar   → lê o pedido no Supabase e monta job/prompt.md
//   node worker.mjs finalizar  → sobe job/out/* pro Storage e marca 'pronto'
//   node worker.mjs erro       → marca 'erro' com link da execução
//
// Sem dependências: Node 20 (fetch nativo) + REST do Supabase com service role.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DIAGRAMA_ID, RUN_URL, JOB_DIR

import fs from 'node:fs'
import path from 'node:path'

const URL_SB = process.env.SUPABASE_URL
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ID = process.env.DIAGRAMA_ID
const RUN_URL = process.env.RUN_URL || ''
const JOB = process.env.JOB_DIR || 'job'
const BUCKET = 'projetos-diagramas'

if (!URL_SB || !CHAVE || !ID) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou DIAGRAMA_ID')
  process.exit(1)
}

const H = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` }

async function rest(caminho, { method = 'GET', body } = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${caminho}`, {
    method,
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`REST ${method} ${caminho}: ${r.status} ${txt.slice(0, 300)}`)
  return txt ? JSON.parse(txt) : null
}

async function umaLinha(caminho) {
  const linhas = await rest(caminho)
  return Array.isArray(linhas) ? linhas[0] || null : null
}

async function atualizarDiagrama(patch) {
  await rest(`projetos_diagramas?id=eq.${ID}`, { method: 'PATCH', body: patch })
}

async function baixar(url, destino) {
  const r = await fetch(url)
  if (!r.ok) return false
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()))
  return true
}

async function subir(caminho, arquivo, contentType) {
  const r = await fetch(`${URL_SB}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: fs.readFileSync(arquivo),
  })
  if (!r.ok) throw new Error(`Upload ${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return `${URL_SB}/storage/v1/object/public/${BUCKET}/${caminho}`
}

const NOME_FOLHA = {
  unifilar_ongrid: 'DIAGRAMA UNIFILAR (on-grid)',
  unifilar_hibrido: 'DIAGRAMA UNIFILAR (híbrido BESS/EPS)',
  padrao_entrada: 'PADRÃO DE ENTRADA CELESC',
  layout_instalacao: 'LAYOUT DE INSTALAÇÃO',
}

// ─── preparar ────────────────────────────────────────────────────────────
async function preparar() {
  const d = await umaLinha(`projetos_diagramas?id=eq.${ID}&select=*`)
  if (!d) throw new Error(`Diagrama ${ID} não encontrado`)
  const meta = d.memoria_calculo?._meta || {}
  if (!meta.relatorio) throw new Error('Pedido sem relatório técnico')

  fs.mkdirSync(path.join(JOB, 'out'), { recursive: true })

  // Refinamento: traz a versão anterior (script + desenho) pro Claude ajustar
  let blocoAjuste = ''
  if (d.instrucao_ajuste) {
    let temAnterior = false
    if (d.baseado_em_id) {
      const ant = await umaLinha(`projetos_diagramas?id=eq.${d.baseado_em_id}&select=*`)
      const metaAnt = ant?.memoria_calculo?._meta || {}
      const dir = path.join(JOB, 'anterior')
      if (metaAnt.url_script) temAnterior = (await baixar(metaAnt.url_script, path.join(dir, 'gerar.py'))) || temAnterior
      if (ant?.url_svg) temAnterior = (await baixar(ant.url_svg, path.join(dir, 'prancha.svg'))) || temAnterior
      if (ant?.url_pdf) temAnterior = (await baixar(ant.url_pdf, path.join(dir, 'prancha.pdf'))) || temAnterior
    }
    blocoAjuste = `
## AJUSTE PEDIDO (refinamento da versão anterior)
${temAnterior
    ? 'A versão anterior está em job/anterior/ (gerar.py quando existir, prancha.svg, prancha.pdf). Parta dela e mude SÓ o que foi pedido — o resto fica igual.'
    : 'A versão anterior não está disponível; gere do zero já aplicando o ajuste.'}

Pedido do usuário:
> ${d.instrucao_ajuste.replace(/\n/g, '\n> ')}
`
  }

  const prompt = `Você está rodando SEM SUPERVISÃO num servidor, acionado pelo portal da Spin Solar
(app.spinsolar.com.br). Ninguém vai responder perguntas durante a execução.

Tarefa: gerar a prancha **${NOME_FOLHA[d.tipo_desenho] || d.tipo_desenho}** deste projeto usando a
skill **projetista-spin** (já instalada em .claude/skills). Siga o fluxo completo da skill,
inclusive a validação visual: renderize PNG, abra a imagem com a ferramenta Read, confira o
checklist de qualidade e corrija até passar.

Regras deste modo automático:
- Não pergunte nada. Se faltar dado, adote a premissa mais segura da skill e registre.
- Esqueça "present_files": entregue os arquivos gravando em job/out/ exatamente com estes nomes:
  - job/out/prancha.pdf  (obrigatório)
  - job/out/prancha.dxf
  - job/out/prancha.svg
  - job/out/gerar.py     (o script final que gera os três — usado nos próximos ajustes)
  - job/out/resumo.md    (em português, curto, com as seções "## O que foi gerado",
                          "## Premissas" e "## Pendências a confirmar", itens começando com "- ")
- Folha única: gere só a prancha pedida acima.
${blocoAjuste}
## RELATÓRIO TÉCNICO DO PROJETO (gerado pelo portal)

${meta.relatorio}
`
  fs.writeFileSync(path.join(JOB, 'prompt.md'), prompt)

  await atualizarDiagrama({
    erro_mensagem: null,
    memoria_calculo: {
      ...(d.memoria_calculo || {}),
      _meta: { ...meta, run_url: RUN_URL, iniciado_em: new Date().toISOString() },
    },
  })
  console.log(`Prompt montado (${prompt.length} caracteres) — ${d.tipo_desenho} v${d.versao}`)
}

// ─── finalizar ───────────────────────────────────────────────────────────
function lerSecao(md, titulo) {
  const linhas = md.split(/\r?\n/)
  const i = linhas.findIndex((l) => /^#+\s/.test(l) && l.toLowerCase().includes(titulo))
  if (i < 0) return []
  const itens = []
  for (const l of linhas.slice(i + 1)) {
    if (/^#+\s/.test(l)) break
    const m = l.match(/^\s*[-•*]\s+(.*)$/)
    if (m) itens.push(m[1].trim())
  }
  return itens
}

async function finalizar() {
  const d = await umaLinha(`projetos_diagramas?id=eq.${ID}&select=*`)
  if (!d) throw new Error(`Diagrama ${ID} não encontrado`)
  const out = path.join(JOB, 'out')
  const arq = (n) => (fs.existsSync(path.join(out, n)) ? path.join(out, n) : null)
  const pdf = arq('prancha.pdf')
  if (!pdf) throw new Error('O robô terminou sem gerar job/out/prancha.pdf')

  const base = `${d.projeto_id}/${d.id}/${d.tipo_desenho}-v${d.versao}`
  const url_pdf = await subir(`${base}.pdf`, pdf, 'application/pdf')
  const url_dxf = arq('prancha.dxf') ? await subir(`${base}.dxf`, arq('prancha.dxf'), 'application/dxf') : null
  const url_svg = arq('prancha.svg') ? await subir(`${base}.svg`, arq('prancha.svg'), 'image/svg+xml') : null
  const url_script = arq('gerar.py') ? await subir(`${base}.py`, arq('gerar.py'), 'text/plain') : null

  const resumo = arq('resumo.md') ? fs.readFileSync(arq('resumo.md'), 'utf8') : ''
  const pendencias = lerSecao(resumo, 'pend')

  // Custo e duração que o Claude Code reporta no --output-format json
  let execucao = {}
  try {
    const j = JSON.parse(fs.readFileSync(path.join(JOB, 'claude.json'), 'utf8'))
    execucao = { custo_usd: j.total_cost_usd ?? null, turnos: j.num_turns ?? null, duracao_ms: j.duration_ms ?? null }
  } catch {}

  const meta = d.memoria_calculo?._meta || {}
  await atualizarDiagrama({
    status: 'pronto',
    url_pdf, url_dxf, url_svg,
    avisos: pendencias,
    erro_mensagem: null,
    memoria_calculo: {
      ...(d.memoria_calculo || {}),
      _meta: { ...meta, resumo, url_script, concluido_em: new Date().toISOString(), modelo: process.env.MODELO || null, ...execucao },
    },
  })

  // Unifilar pronto → etapa da homologação aponta pro arquivo (mesmo do upload manual)
  if (d.tipo_desenho === 'unifilar_ongrid' || d.tipo_desenho === 'unifilar_hibrido') {
    try {
      const hom = await umaLinha(`homologacoes?projeto_id=eq.${d.projeto_id}&select=id`)
      if (hom) {
        await rest(`homologacao_etapas?homologacao_id=eq.${hom.id}&chave=eq.diagrama_unifilar`, {
          method: 'PATCH',
          body: {
            status: 'em_andamento',
            iniciado_em: new Date().toISOString(),
            url_arquivo_svg: url_svg || url_pdf,
            observacoes: `✓ Unifilar gerado pelo robô (v${d.versao}, ${d.tipo_desenho}) com a skill projetista-spin.`,
          },
        })
      }
    } catch (e) {
      console.warn('Homologação não vinculada:', e.message)
    }
  }
  console.log(`Pronto: ${url_pdf}`)
}

// ─── erro ────────────────────────────────────────────────────────────────
async function erro() {
  let detalhe = ''
  try {
    const j = JSON.parse(fs.readFileSync(path.join(JOB, 'claude.json'), 'utf8'))
    if (j.is_error || j.subtype !== 'success') detalhe = String(j.result || j.subtype || '').slice(0, 300)
  } catch {}
  if (!detalhe && fs.existsSync(path.join(JOB, 'erro.txt'))) {
    detalhe = fs.readFileSync(path.join(JOB, 'erro.txt'), 'utf8').slice(0, 300)
  }
  await atualizarDiagrama({
    status: 'erro',
    erro_mensagem: `O robô não concluiu${detalhe ? `: ${detalhe}` : ''}. Execução: ${RUN_URL}`,
  })
}

const cmd = process.argv[2]
const fn = { preparar, finalizar, erro }[cmd]
if (!fn) { console.error('Uso: node worker.mjs preparar|finalizar|erro'); process.exit(1) }
fn().catch((e) => {
  console.error(e)
  try { fs.mkdirSync(JOB, { recursive: true }); fs.writeFileSync(path.join(JOB, 'erro.txt'), String(e.message || e)) } catch {}
  process.exit(1)
})
