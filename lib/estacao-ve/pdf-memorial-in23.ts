import { jsPDF } from 'jspdf'
import { rotuloFases, TIPOS_TRECHO, type PropostaRecarga, type RespostasRecarga } from './proposta-recarga'
import { AMBIENTES, IN23_VIGENCIA, TIPOS_LOCAL } from './in23'

/**
 * Memorial técnico da estação de recarga — IN 23 do CBMSC (Kalebe
 * 2026-10-17). Documento técnico interno, pro RT: sistema de recarga,
 * dimensionamento, enquadramento na IN 23, requisitos gerais a conferir e os
 * campos do relatório do e-SCI (Anexo A ou B) já preenchidos com o que o
 * sistema sabe. Sem valores comerciais (regra: documento técnico sem preço).
 */

export type DadosMemorialIN23 = {
  codigo_projeto?: string | null
  cliente_nome: string
  endereco: { logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null } | null
  rt: { nome?: string | null; titulo?: string | null; registro?: string | null; telefone?: string | null; email?: string | null }
  empresa: { razao_social?: string | null; telefone?: string | null; email?: string | null }
  proposta: PropostaRecarga
  respostas: RespostasRecarga
  emitido_em?: Date
}

const num = (n: number, c = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const kw = (n: number) => `${num(n, n % 1 ? 1 : 0)} kW`

export function gerarPdfMemorialIN23(d: DadosMemorialIN23): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 18, R = 192, W = R - L
  const emitido = d.emitido_em || new Date()
  const p = d.proposta
  const r = d.respostas
  const ri = r.in23 || null
  const e = p.in23
  const smsci = ri ? [ri.deteccao && 'detecção automática', ri.sprinklers && 'chuveiros automáticos', ri.extracao_fumaca && 'extração mecânica de fumaça',
    ri.ventilacao_natural && 'ventilação natural (art. 6º § 1º)', ri.compartimentacao && 'compartimentação'].filter(Boolean) as string[] : []
  let y = 0

  const cabecalho = () => {
    doc.setFillColor(15, 24, 37); doc.rect(0, 0, 210, 26, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text('SPIN SOLAR', L, 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text('Memorial técnico — estação de recarga · IN 23 do CBMSC', L, 19)
    doc.setFontSize(8)
    if (d.codigo_projeto) doc.text(d.codigo_projeto, R, 12, { align: 'right' })
    doc.text(`Emitido em ${emitido.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, R, 19, { align: 'right' })
    y = 36
  }
  const espaco = (h: number) => { if (y + h > 276) { doc.addPage(); cabecalho() } }
  const titulo = (t: string) => {
    espaco(14)
    doc.setTextColor(167, 122, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(t.toUpperCase(), L, y)
    doc.setDrawColor(230, 230, 230); doc.line(L, y + 2, R, y + 2)
    y += 8
  }
  const campo = (rotulo: string, valor: string) => {
    doc.setFontSize(9.5)
    const v = doc.splitTextToSize(valor || '—', W - 58) as string[]
    espaco(5.5 * v.length)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100); doc.text(rotulo, L, y)
    doc.setTextColor(20, 20, 20); doc.text(v, L + 58, y)
    y += 5.5 * v.length
  }
  const texto = (t: string, tam = 9) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(tam); doc.setTextColor(60, 60, 60)
    const partes = doc.splitTextToSize(t, W) as string[]
    espaco(4.4 * partes.length + 1)
    doc.text(partes, L, y); y += 4.4 * partes.length + 1.5
  }
  /** Item com caixa de conferência (o RT marca na obra) */
  const conferir = (t: string) => {
    doc.setFontSize(9)
    const partes = doc.splitTextToSize(t, W - 8) as string[]
    espaco(4.4 * partes.length + 2)
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3); doc.rect(L, y - 3, 3.2, 3.2)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40)
    doc.text(partes, L + 6, y); y += 4.4 * partes.length + 1.8
  }

  cabecalho()

  // 1. Identificação
  titulo('1. Identificação')
  const end = d.endereco || {}
  campo('Responsável pelo imóvel', d.cliente_nome)
  campo('Logradouro', [end.logradouro, end.numero].filter(Boolean).join(', '))
  if (end.complemento) campo('Complemento', end.complemento)
  campo('Bairro', end.bairro || '')
  campo('Município / UF', [end.cidade, end.uf || 'SC'].filter(Boolean).join(' / '))
  campo('Responsável técnico', [d.rt.nome, d.rt.titulo].filter(Boolean).join(' — '))
  campo('Registro profissional', d.rt.registro || '')
  campo('Empresa instaladora', d.empresa.razao_social || 'Spin Solar')
  y += 3

  // 2. Sistema de recarga (SAVE)
  titulo('2. Sistema de alimentação para veículos elétricos (SAVE)')
  for (const x of p.equipamentos.filter((q) => q.tipo === 'carregador')) {
    campo(`${x.qtd} × carregador`, `${x.do_cliente ? 'fornecido pelo cliente' : x.modelo} · ${kw(x.potencia_kw)} · modo 3 (estação em corrente alternada)`)
  }
  campo('Potência total', kw(p.potencia_total_kw))
  campo('Rede', `${rotuloFases(p.fases)} · corrente total ${num(p.corrente_total_a, 1)} A`)
  for (const c of p.circuitos) {
    campo(`Circuito ${kw(c.potencia_kw)}${c.qtd > 1 ? ` (× ${c.qtd})` : ''}`,
      `${num(c.corrente_a, 1)} A · cabo ${c.bitola_mm2} mm² (${c.condutores} condutores) · disjuntor ${c.disjuntor_a} A ${c.polos === 3 ? 'tripolar' : 'bipolar'}${r.in23 ? ' · DR 30 mA' : ''} · ${c.dps_un} DPS classe II`)
  }
  if (p.disjuntor_geral_a) campo('Disjuntor geral da estação', `${p.disjuntor_geral_a} A`)
  campo('Caminho até o quadro', p.trechos.length
    ? p.trechos.map((t) => `${num(t.metros)} m ${TIPOS_TRECHO.find((x) => x.tipo === t.tipo)?.rotulo.toLowerCase() || t.tipo}`).join(' + ')
    : `${num(p.distancia_total_m)} m`)
  campo('Aterramento', r.aterramento ? 'haste dedicada com caixa de inspeção, ligada ao quadro' : 'aterramento existente da edificação (conferir continuidade)')
  texto('Normas: NBR 5410, NBR 17019, NBR IEC 61851-1 e NBR IEC 62196-1 (IN 23, arts. 2º, 7º e 8º). Modo 1 não admitido; modo 2 só em área externa protegida, a critério do RT.')
  y += 3

  // 3. Enquadramento na IN 23
  titulo('3. Enquadramento na IN 23 do CBMSC')
  campo('Tipo de local', TIPOS_LOCAL.find((t) => t.tipo === ri?.tipo_local)?.rotulo || 'não informado')
  if (!e || !e.aplica) {
    texto(e?.motivo ? `${e.motivo}. A instalação segue a NBR 5410 e a NBR 17019.` : 'Proposta sem os dados da IN 23 — responda o bloco de segurança contra incêndio na proposta.')
  } else if (ri) {
    campo('Ambiente da vaga', `${AMBIENTES.find((a) => a.tipo === ri.ambiente)?.rotulo || ri.ambiente}`)
    campo('Edificação', ri.preexistente ? `preexistente (pronta ou com PPCI aprovado até ${IN23_VIGENCIA})` : `nova (após ${IN23_VIGENCIA})`)
    campo('SMSCI existentes', smsci.length ? smsci.join(', ') : 'nenhum informado')
    campo('Ocupação (art. 6º, III e IV)', ri.ocupacao_art6 ? 'A-1, A-2, C-1, C-2, D ou H-4' : 'outra ocupação')
    if (ri.area_total_m2 > 0) campo('Área do local / maior pavimento', `${num(ri.area_total_m2)} m²${ri.area_pavimento_m2 > 0 ? ` / ${num(ri.area_pavimento_m2)} m²` : ''}`)
    campo('Resultado', e.dispensa_pbd ? `dispensa do PBD — ${e.hipotese}` : 'exige Projeto Baseado em Desempenho (arts. 19 a 37)')
    campo('Relatório no e-SCI', `Anexo ${e.anexo} + croqui + ART (DRT)`)
    if (!e.dispensa_pbd) {
      const fs = ri.ambiente === 'subsolo' ? '1,3 (subsolo)' : ri.ventilacao_natural ? '1,2 (acima do solo, ventilado)' : '1,25 (acima do solo, sem ventilação adequada)'
      texto(`PBD: abordagem determinística ou híbrida (art. 23); Fs × TNES < TDES com Fs ${fs} (art. 31); velocidades 1,20 m/s, 0,85 m/s em escadas e 0,50 m/s sob fumaça (art. 32); critérios nas rotas: até 60 °C na zona respirável a 1,80 m, até 200 °C na camada quente, até 2,5 kW/m² e visibilidade acima de 8 m (art. 33); HRR de 8 MW (VE a bateria), 6 MW (híbrido) e 5 MW (combustão) (art. 37).`)
    }
    // Sem a instrução de tela ("orce em Adicionar item")
    for (const a of e.alertas) texto(`Atenção: ${a.replace(/ — orce .*$/, '')}.`)
  }
  y += 3

  // 4. Requisitos gerais — conferir na obra
  if (e?.aplica) {
    titulo('4. Requisitos gerais da IN 23 — conferir na execução')
    for (const t of e.exigencias) conferir(`${t}.`)
    conferir('Elementos estruturais próximos ao SAVE com resistência ao calor e às chamas da bateria (art. 18).')
    // Os sistemas que sustentam a dispensa precisam estar funcionando (art. 6º e art. 17)
    if (e.dispensa_pbd && ri && ri.ambiente !== 'externo_descoberto' && ri.ambiente !== 'cobertura_leve' && smsci.length) {
      conferir(`Sistemas que sustentam a dispensa do PBD em funcionamento: ${smsci.join(', ')}.`)
    }
    y += 3

    // 5. Relatório do e-SCI
    titulo(`5. Dados para o relatório do e-SCI — Anexo ${e.anexo}`)
    campo('Nome da edificação', '')
    campo('Logradouro / nº', [end.logradouro, end.numero].filter(Boolean).join(', '))
    campo('Bairro / Município', [end.bairro, end.cidade].filter(Boolean).join(' / '))
    campo('Responsável pelo imóvel', d.cliente_nome)
    campo('Responsável técnico', d.rt.nome || '')
    campo('Registro do profissional', d.rt.registro || '')
    if (e.anexo === 'B') {
      campo('Vagas com SAVE a regularizar', String(e.vagas))
      campo('Item da dispensa (art. 6º)', e.hipotese || '')
    } else {
      campo('Vagas avaliadas no PBD', '')
      campo('TNES / TDES / Fs', '')
      campo('Vagas com SAVE instaladas', String(e.vagas))
      campo('Medidas compensatórias', '')
      campo('Detecção dispensada (art. 17 § 1º)?', '')
      campo('Alteração de PPCI (protocolo)', '')
    }
    texto('Antes de protocolar: requisitos gerais previstos e implementados (instalação elétrica, afastamentos, tipo de carregador, estabilidade estrutural); croqui com a localização das estações, do ponto de desligamento e do quadro (obrigatório); ART do responsável técnico' + (e.anexo === 'A' ? '; PBD anexado (obrigatório).' : '.'))
    texto('A regularização só é feita depois da execução completa (art. 38). Cada novo ponto de recarga exige nova regularização (art. 39).')
  }

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setTextColor(130, 130, 130)
    doc.text(['Documento técnico — sem valores comerciais', d.empresa.telefone, d.empresa.email].filter(Boolean).join('  ·  '), 105, 289, { align: 'center' })
    doc.text(`${i}/${paginas}`, R, 289, { align: 'right' })
  }
  return doc.output('arraybuffer')
}
