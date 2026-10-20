'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  dadosPropostaRapidaAction, calcularPropostaRapidaAction, prepararPdfOficialPropostaRapidaAction, registrarPdfPropostaRapidaAction,
  enviarPdfPropostaRapidaAction, opcoesKitPropostaAction, lerFaturaPropostaAction, arquivosFaturaConversaAction, lerFaturaBeneficiariaAction,
  type EntradaPropostaRapida, type DadosPdfOficial, type BeneficiariaProposta,
} from '@/app/inbox/proposta-actions'
import { PropostaPDFTemplate } from '@/components/PropostaPDFTemplate'
import { esperarImagens, pdfDoTemplate, subirPdfProposta } from '@/lib/propostas/pdf-oficial-cliente'
import type { PropostaCalculada } from '@/lib/precificacao/calcular'
import { TIPOS_SISTEMA_FV, type OrcamentoLead, type TipoSistemaFv } from '@/lib/spinzap/orcamento-lead'
import type { Auditoria } from '@/lib/spinzap/auditor-orcamento'
import { TIPOS_REDE, TIPOS_TELHADO } from '@/lib/spinzap/perfil'
import { fmtKwp, fmtNum, formatarMoedaBRL } from '@/lib/formatters'
import { rotuloSecao, type FaixaSecao, type SecaoProposta } from '@/lib/propostas/secoes'
import { SecoesProposta } from '@/components/propostas/SecoesProposta'
import { PainelPrecificacao } from '@/components/precificacao/PainelPrecificacao'
import { CadastroDatasheetModal } from '@/components/CadastroDatasheetModal'
import type { CategoriaProduto } from '@/app/admin/catalogo/actions'
import {
  AUMENTO_GERACAO_MAX_PCT, FCI_MAX, FCI_MIN, inversorRecomendado, kwhPorKwpMes, kwpParaConsumo, opcoesDeInversor,
} from '@/lib/spinzap/dimensionar-fv'

const TELHADOS_AZ = [...TIPOS_TELHADO].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
/** Atalhos do aumento extra de geração (% sobre o consumo) — escolha do consultor, não parâmetro comercial */
const ATALHOS_AUMENTO = [0, 10, 20, 30, 50]

/**
 * "Montar proposta" direto da conversa (Kalebe 2026-10-13): escolhe a base
 * (consumo, valor da conta ou placas), calcula com o motor de preço da Spin,
 * mostra a auditoria e gera o PDF pra ver ou enviar no WhatsApp — sem sair
 * da conversa. A proposta completa (lista CA, visita) segue no projeto.
 */

type Modo = EntradaPropostaRapida['modo']
const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none'
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0

export function ModalPropostaRapida({ conversaId, nomeCliente, ehAdmin, onFechar, onEnviada }: {
  conversaId: string
  nomeCliente: string
  ehAdmin?: boolean
  onFechar: () => void
  onEnviada: () => void
}) {
  // Kalebe 2026-10-14: admin edita a precificação sem sair da proposta
  const [painel, setPainel] = useState(false)
  const [versao, setVersao] = useState(0)
  // Kalebe 2026-10-14: cadastro de equipamento novo (datasheet + valores) sem sair da proposta
  const [cadastroDatasheet, setCadastroDatasheet] = useState<CategoriaProduto | null>(null)
  // Telhado → estrutura do kit (+ cabo solar, MC4, disjuntor e DPS, como na proposta formal)
  const [telhado, setTelhado] = useState('')
  // Kalebe 2026-10-15: aumento extra de geração (% sobre o consumo)
  const [aumento, setAumento] = useState('0')
  // Kalebe 2026-10-16: reabrindo a última proposta (data em que foi montada)
  const [editandoDe, setEditandoDe] = useState<string | null>(null)
  // Kalebe 2026-10-17: unidades beneficiárias (consumo + fatura)
  const [beneficiarias, setBeneficiarias] = useState<BeneficiariaProposta[]>([])
  const [painelBenef, setPainelBenef] = useState(false)
  const [arquivosConv, setArquivosConv] = useState<Array<{ mensagem_id: string; nome: string; mime: string | null; criada_em: string; direcao: string; lida_uc: string | null; lida_consumo: number | null; principal: boolean }> | null>(null)
  const [lendoBenef, setLendoBenef] = useState<string | null>(null)
  const [benefManual, setBenefManual] = useState({ uc: '', titular: '', consumo: '' })
  const pularResetSistema = useRef(false)
  // Kalebe 2026-10-19 (multiempresa): CNPJ da proposta — define fornecedor, catálogo e marca do PDF
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string; cnpj: string | null; fornecedor: string | null }>>([])
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modo, setModo] = useState<Modo>('consumo_kwh')
  const [valor, setValor] = useState('')
  const [inversorKw, setInversorKw] = useState('')
  const [rede, setRede] = useState<EntradaPropostaRapida['tipo_rede']>('monofasico')
  const [cidade, setCidade] = useState('')
  const [fatura, setFatura] = useState<{ consumo_kwh: number | null; tarifa_kwh: number | null; subsidio: string | null } | null>(null)
  const [tarifaBase, setTarifaBase] = useState<{ tarifa_kwh: number; amostras: number } | null>(null)
  const [projetoId, setProjetoId] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ orcamento: OrcamentoLead; auditoria: Auditoria; mostra_interno: boolean } | null>(null)
  const [pdf, setPdf] = useState<{ url_pdf: string; projeto_id: string; nome_arquivo: string } | null>(null)
  // Kalebe 2026-10-15: o PDF é a proposta OFICIAL (mesmo template de /projetos/[id]/orcamento)
  const [oficial, setOficial] = useState<DadosPdfOficial | null>(null)
  const templateRef = useRef<HTMLDivElement>(null)
  const [legenda, setLegenda] = useState(`Oi${nomeCliente ? `, ${nomeCliente.split(' ')[0]}` : ''}! Segue o seu orçamento de energia solar ☀️ Qualquer dúvida, é só me chamar por aqui.`)
  const [ocupado, setOcupado] = useState<null | 'calculando' | 'gerando' | 'enviando'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)
  // Kalebe 2026-10-13: sistema, modelos e itens extras
  type Opcoes = Exclude<Awaited<ReturnType<typeof opcoesKitPropostaAction>>, { erro: string }>
  const [catalogo, setCatalogo] = useState<Opcoes | null>(null)
  const [sistema, setSistema] = useState<TipoSistemaFv>('string')
  const [placaId, setPlacaId] = useState('')
  const [inversorId, setInversorId] = useState('')
  const [inversorQtd, setInversorQtd] = useState('')
  const [extras, setExtras] = useState<Array<{ produto_id: string; rotulo: string; qtd: number }>>([])
  const [catExtra, setCatExtra] = useState('')
  const [itemExtra, setItemExtra] = useState('')
  const [qtdExtra, setQtdExtra] = useState('1')
  // Seções incorporadas (aluguel, alvenaria, elétrica predial…) — Kalebe 2026-10-13
  const [faixas, setFaixas] = useState<FaixaSecao[]>([])
  const [secoes, setSecoes] = useState<SecaoProposta[]>([])
  // Kalebe 2026-10-14: fatura que o cliente mandou → lê e preenche os campos
  type Pendente = { mensagem_id: string; nome: string; mime: string | null; criada_em: string; status: string | null }
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [titular, setTitular] = useState<string | null>(null)
  const [lendo, setLendo] = useState<string | null>(null)
  const [faturaLida, setFaturaLida] = useState<string | null>(null)

  async function lerFatura(id: string) {
    setErro(null); setLendo(id)
    try {
      const r = await lerFaturaPropostaAction(conversaId, id)
      if ('erro' in r) { setErro(r.erro); return }
      setModo('consumo_kwh'); setValor(String(r.consumo_kwh))
      if (r.tipo_rede && ['monofasico', 'bifasico', 'trifasico'].includes(r.tipo_rede)) setRede(r.tipo_rede as any)
      if (r.cidade) setCidade(r.cidade)
      setFatura({ consumo_kwh: r.consumo_kwh, tarifa_kwh: r.tarifa_kwh, subsidio: r.subsidio })
      setTitular(r.titular)
      setPendentes((ps) => ps.filter((p) => p.mensagem_id !== id))
      setFaturaLida(`✓ Fatura lida e campos preenchidos: ${r.consumo_kwh.toLocaleString('pt-BR')} kWh/mês (média de ${r.meses} ${r.meses === 1 ? 'mês' : 'meses'})${r.cidade ? ` · ${r.cidade}` : ''}. O cadastro do cliente também foi atualizado.`)
    } finally { setLendo(null) }
  }

  useEffect(() => {
    dadosPropostaRapidaAction(conversaId).then((r) => {
      setCarregando(false)
      if ('erro' in r) { setErro(r.erro); return }
      setFaixas(r.faixas || []); setSecoes(r.secoes || [])
      setBeneficiarias(r.beneficiarias || [])
      setEmpresas(r.empresas || []); setEmpresaId(r.empresa_id || null)
      // Catálogo do fornecedor da empresa da proposta
      opcoesKitPropostaAction(r.empresa_id || null).then((c) => { if (!('erro' in c)) setCatalogo(c) })
      setPendentes(r.faturas_pendentes || []); setTitular(r.titular || null)
      if (r.tipo_rede && ['monofasico', 'bifasico', 'trifasico'].includes(r.tipo_rede)) setRede(r.tipo_rede as any)
      setTelhado(r.tipo_telhado || '')
      setCidade(r.cidade || '')
      setFatura(r.fatura); setTarifaBase(r.tarifa_base); setProjetoId(r.projeto_id)
      if (r.fatura?.consumo_kwh) { setModo('consumo_kwh'); setValor(String(Math.round(r.fatura.consumo_kwh))) }
      // Kalebe 2026-10-16: reabre a última proposta como foi montada (editar e reenviar)
      if (r.salva?.entrada) {
        const s = r.salva.entrada
        const op = s.opcoes || {}
        setModo(s.modo); setValor(String(s.valor || '')); setInversorKw(s.inversor_kw ? String(s.inversor_kw) : '')
        if (['monofasico', 'bifasico', 'trifasico'].includes(s.tipo_rede)) setRede(s.tipo_rede)
        setCidade(s.cidade || r.cidade || '')
        if (op.tipo_sistema && op.tipo_sistema !== 'string') pularResetSistema.current = true
        setSistema(op.tipo_sistema || 'string')
        setPlacaId(op.placa_id || ''); setInversorId(op.inversor_id || ''); setInversorQtd(op.inversor_qtd ? String(op.inversor_qtd) : '')
        setExtras(r.salva.extras || [])
        setTelhado(op.complementos_cc?.tipo_telhado ?? r.tipo_telhado ?? '')
        setAumento(String(op.aumento_geracao_pct || 0))
        setEditandoDe(r.salva.salvo_em)
      }
    })
  }, [conversaId])

  // Trocou a empresa: outro fornecedor → outro catálogo; placa, inversor e extras escolhidos não valem mais
  function trocarEmpresa(id: string) {
    if (id === empresaId) return
    setEmpresaId(id || null)
    setPlacaId(''); setInversorId(''); setInversorQtd(''); setExtras([]); setCatalogo(null)
    opcoesKitPropostaAction(id || null).then((c) => { if (!('erro' in c)) setCatalogo(c); else setErro(c.erro) })
  }

  // Qualquer mudança na entrada invalida o cálculo e o PDF
  useEffect(() => { setResultado(null); setPdf(null) }, [modo, valor, inversorKw, rede, telhado, cidade, sistema, placaId, inversorId, inversorQtd, extras, secoes, aumento, beneficiarias, empresaId])
  // Trocou o sistema: o modelo escolhido não vale mais (menos ao restaurar a proposta salva)
  useEffect(() => {
    if (pularResetSistema.current) { pularResetSistema.current = false; return }
    setInversorId(''); setInversorQtd('')
  }, [sistema])

  // Inversores do sistema escolhido que servem na rede (bifásica usa monofásico; micro é sempre mono)
  const fasesRede = rede === 'trifasico' ? 'tri' : 'mono'
  const inversoresDoSistema = (catalogo?.inversores[sistema] || []).filter((i) => sistema === 'micro' || !i.fases || i.fases === fasesRede)

  const consumoBenef = beneficiarias.reduce((s, b) => s + (Number(b.consumo_kwh) || 0), 0)
  // Kalebe 2026-10-15: potência do kit ao vivo (mesma conta do servidor) e só
  // os inversores dentro da faixa técnica de CC/CA pra esse kit
  const kit = useMemo(() => {
    if (!catalogo) return null
    const placas = catalogo.placas
    const placa = placas.find((p) => p.id === placaId) || placas[placas.length - 1]
    if (!placa?.potencia_wp) return null
    const v = num(valor)
    const aumentoPct = modo === 'qtd_placas' ? 0 : Math.min(Math.max(num(aumento), 0), AUMENTO_GERACAO_MAX_PCT)
    let consumo: number | null = null
    let qtdPlacas = 0
    if (modo === 'qtd_placas') qtdPlacas = Math.max(0, Math.round(v))
    else {
      const tarifa = fatura?.tarifa_kwh || tarifaBase?.tarifa_kwh || 0
      consumo = modo === 'consumo_kwh' ? v : tarifa > 0 ? v / tarifa : 0
      if (consumo > 0) consumo += consumoBenef
      if (consumo > 0) qtdPlacas = Math.ceil((kwpParaConsumo(consumo, cidade, aumentoPct) * 1000) / placa.potencia_wp)
    }
    if (!(qtdPlacas > 0)) return null
    const kwp = (qtdPlacas * placa.potencia_wp) / 1000
    const nFases = rede === 'trifasico' ? 3 : rede === 'bifasico' ? 2 : 1
    const ops = opcoesDeInversor(inversoresDoSistema.map((i) => ({ ...i, preco_venda: i.peso })), { kwp, qtdPlacas, sistema, nFases })
    // "Placas" com inversor desejado: o mais perto do kW pedido (como no servidor)
    const alvoKw = modo === 'qtd_placas' ? num(inversorKw) : 0
    const recomendado = alvoKw > 0 && sistema !== 'micro'
      ? [...ops].sort((a, b) => Math.abs(a.inv.potencia_kw - alvoKw) - Math.abs(b.inv.potencia_kw - alvoKw))[0]
      : inversorRecomendado(ops, sistema)
    const escolhido = ops.find((o) => o.inv.id === inversorId) || recomendado
    const qtdInv = escolhido ? (sistema !== 'micro' && num(inversorQtd) > 0 ? Math.round(num(inversorQtd)) : escolhido.qtd) : 0
    const potCa = escolhido ? escolhido.inv.potencia_kw * qtdInv : 0
    const geracao = Math.round(kwp * kwhPorKwpMes(cidade))
    return { placa, qtdPlacas, kwp, consumo, aumentoPct, ops, recomendado, escolhido, qtdInv, potCa, fci: potCa > 0 ? kwp / potCa : 0, geracao }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo, placaId, valor, modo, aumento, fatura, tarifaBase, cidade, rede, sistema, inversorId, inversorQtd, inversorKw, consumoBenef])
  const opcoesCompativeis = kit ? kit.ops.filter((o) => o.compativel) : []
  // O kit mudou e o inversor escolhido saiu da faixa técnica: volta pro recomendado
  useEffect(() => {
    if (!kit || !inversorId) return
    const atual = kit.ops.find((o) => o.inv.id === inversorId)
    if (!atual || !atual.compativel) { setInversorId(''); setInversorQtd('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit?.kwp, kit?.qtdPlacas])
  function escolherInversor(id: string) {
    setInversorId(id)
    // A quantidade que o kit pede pra esse modelo
    const op = kit?.ops.find((o) => o.inv.id === id)
    setInversorQtd(op && sistema !== 'micro' ? String(op.qtd) : '')
  }
  const itensDaCategoria = catalogo?.extras.find((g) => g.categoria === catExtra)?.itens || []
  function adicionarExtra() {
    const it = itensDaCategoria.find((i) => i.id === itemExtra)
    const q = Math.round(num(qtdExtra))
    if (!it || !(q > 0)) return
    setExtras((xs) => {
      const ja = xs.find((x) => x.produto_id === it.id)
      return ja ? xs.map((x) => (x.produto_id === it.id ? { ...x, qtd: x.qtd + q } : x)) : [...xs, { produto_id: it.id, rotulo: it.rotulo, qtd: q }]
    })
    setItemExtra(''); setQtdExtra('1')
  }

  const entrada = (): EntradaPropostaRapida => ({
    modo, valor: num(valor), inversor_kw: num(inversorKw) || null, tipo_rede: rede, cidade,
    opcoes: {
      tipo_sistema: sistema,
      placa_id: placaId || null,
      inversor_id: inversorId || null,
      inversor_qtd: sistema !== 'micro' && num(inversorQtd) > 0 ? Math.round(num(inversorQtd)) : null,
      extras: extras.map((x) => ({ produto_id: x.produto_id, qtd: x.qtd })),
      complementos_cc: { tipo_telhado: telhado || null },
      aumento_geracao_pct: modo !== 'qtd_placas' ? Math.min(Math.max(Math.round(num(aumento)), 0), AUMENTO_GERACAO_MAX_PCT) : 0,
    },
    secoes,
    beneficiarias,
    empresa_id: empresaId,
  })

  // ── Unidades beneficiárias ──
  async function abrirPainelBenef() {
    setPainelBenef(true)
    if (!arquivosConv) {
      const r = await arquivosFaturaConversaAction(conversaId)
      setArquivosConv('erro' in r ? [] : r.arquivos)
    }
  }
  async function lerBenef(mensagemId: string) {
    setErro(null); setLendoBenef(mensagemId)
    try {
      const r = await lerFaturaBeneficiariaAction(conversaId, mensagemId)
      if ('erro' in r) { setErro(r.erro); return }
      setBeneficiarias((bs) => [...bs.filter((b) => b.mensagem_id !== r.mensagem_id), {
        uc: r.uc, titular: r.titular, consumo_kwh: r.consumo_kwh, arquivo_url: r.arquivo_url, arquivo_nome: r.arquivo_nome, arquivo_tipo: r.arquivo_tipo, mensagem_id: r.mensagem_id,
        meses: r.meses,
      }])
    } finally { setLendoBenef(null) }
  }
  function adicionarBenefManual() {
    const c = num(benefManual.consumo)
    if (!(c > 0)) return
    setBeneficiarias((bs) => [...bs, { uc: benefManual.uc.trim(), titular: benefManual.titular.trim(), consumo_kwh: Math.round(c) }])
    setBenefManual({ uc: '', titular: '', consumo: '' })
  }
  const mudarBenef = (i: number, patch: Partial<BeneficiariaProposta>) => setBeneficiarias((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))

  async function calcular() {
    setErro(null); setOcupado('calculando')
    try {
      const r = await calcularPropostaRapidaAction(conversaId, entrada())
      if ('erro' in r) setErro(r.erro)
      else setResultado(r)
    } finally { setOcupado(null) }
  }
  async function gerarPdf(): Promise<{ url_pdf: string; projeto_id: string; nome_arquivo: string } | null> {
    if (pdf) return pdf
    setErro(null); setOcupado('gerando')
    try {
      const e = entrada()
      const d = await prepararPdfOficialPropostaRapidaAction(conversaId, e)
      if ('erro' in d) { setErro(d.erro); return null }
      setProjetoId(d.projeto_id)
      // Desenha o template oficial fora da tela, vira PDF e sobe (como no projeto)
      flushSync(() => setOficial(d.dados))
      const el = templateRef.current
      if (!el) { setErro('Não consegui montar o PDF'); return null }
      await esperarImagens(el)
      const blob = await pdfDoTemplate(el)
      const url = await subirPdfProposta(d.projeto_id, blob, 'proposta-spinzap')
      if (typeof url !== 'string') { setErro(url.erro); return null }
      const reg = await registrarPdfPropostaRapidaAction(conversaId, d.projeto_id, url, e)
      if ('erro' in reg) { setErro(reg.erro); return null }
      const r = { url_pdf: url, projeto_id: d.projeto_id, nome_arquivo: d.nome_arquivo }
      setPdf(r)
      return r
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Falha ao gerar o PDF')
      return null
    } finally { setOcupado(null); setOficial(null) }
  }
  async function verPdf() {
    // Abre a aba já no clique (depois do await o navegador bloquearia o pop-up)
    const aba = window.open('', '_blank')
    const r = await gerarPdf()
    if (r && aba) aba.location.href = r.url_pdf
    else aba?.close()
  }
  async function enviar() {
    const barrado = resultado && !resultado.auditoria.aprovado
    if (barrado && !confirm('O auditor apontou problema grave neste orçamento. Enviar mesmo assim?')) return
    const r = pdf || (await gerarPdf())
    if (!r) return
    setOcupado('enviando'); setErro(null)
    try {
      const e = await enviarPdfPropostaRapidaAction(conversaId, r.projeto_id, r.url_pdf, legenda, r.nome_arquivo)
      if ('erro' in e) setErro(e.erro)
      else { setEnviada(true); onEnviada() }
    } finally { setOcupado(null) }
  }

  const o = resultado?.orcamento
  const rotuloModo: Record<Modo, string> = { consumo_kwh: 'Consumo', valor_mensal: 'Valor da conta', qtd_placas: 'Placas' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div className="relative w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-noite/85 backdrop-blur-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">💰 Montar proposta</h2>
            <p className="text-[11px] text-white/50">{nomeCliente} · mesmo motor de preço da proposta da Spin</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ehAdmin && (
              <button type="button" onClick={() => setPainel(true)} className="px-3 py-1.5 rounded-full bg-sol text-white text-[11px] font-bold">⚙️ Precificação</button>
            )}
            <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white/[0.06] text-white/70 hover:text-white flex items-center justify-center">✕</button>
          </div>
        </div>

        {carregando ? <p className="text-sm text-white/50">Carregando o que já sabemos do cliente…</p> : enviada ? (
          <div className="rounded-2xl border border-verde/45 p-4 space-y-2">
            <p className="text-sm font-bold text-white">✅ Proposta enviada no WhatsApp</p>
            <p className="text-xs text-white/60">O projeto foi pra negociação no CRM e ficou um follow-up de 1 dia. O PDF está nos arquivos do perfil.</p>
            <div className="flex justify-end"><button onClick={onFechar} className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-white/80 text-sm">Fechar</button></div>
          </div>
        ) : (
          <>
            {editandoDe && (
              <p className="text-[11px] text-white/80 rounded-xl border border-weg-azul/50 px-3 py-2">
                ✏ Reaberta a proposta montada em {new Date(editandoDe).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — ajuste o que precisar e gere o PDF de novo (vira a versão atual).
              </p>
            )}
            {pendentes.length > 0 && (
              <div className="rounded-xl border border-sol/45 px-3 py-2 space-y-1.5">
                <p className="text-[11px] font-bold text-white/80">📄 Arquivo do cliente que pode ser a fatura — ler e preencher os campos:</p>
                {pendentes.map((p) => (
                  <div key={p.mensagem_id} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-white/65 truncate">
                      {p.nome} · {new Date(p.criada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {p.status === 'lendo' ? ' · lendo agora…' : p.status === 'erro' ? ' · a leitura falhou' : ''}
                    </span>
                    <button type="button" onClick={() => lerFatura(p.mensagem_id)} disabled={!!lendo}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold disabled:opacity-40">
                      {lendo === p.mensagem_id ? 'Lendo a fatura…' : 'Ler fatura'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {faturaLida && <p className="text-[11px] text-white/80 rounded-xl border border-verde/45 px-3 py-2">{faturaLida}</p>}

            {(fatura || tarifaBase) && (
              <div className="text-[11px] text-white/65 rounded-xl border border-white/10 px-3 py-2 space-y-0.5">
                {fatura?.consumo_kwh && <p>📄 Fatura lida: {Math.round(fatura.consumo_kwh).toLocaleString('pt-BR')} kWh/mês{fatura.tarifa_kwh ? ` · tarifa R$ ${fatura.tarifa_kwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}/kWh` : ''}{fatura.subsidio && fatura.subsidio !== 'nenhum' ? ` · ${fatura.subsidio.replace('_', ' ')}` : ''}{titular ? ` · titular ${titular}` : ''}</p>}
                {!fatura?.tarifa_kwh && tarifaBase && <p>📊 Tarifa de referência: R$ {tarifaBase.tarifa_kwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}/kWh ({tarifaBase.amostras} faturas reais)</p>}
              </div>
            )}

            {/* Base do dimensionamento */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
              {(['consumo_kwh', 'valor_mensal', 'qtd_placas'] as Modo[]).map((m) => (
                <button key={m} onClick={() => setModo(m)}
                  className={`py-2 rounded-lg text-xs font-bold ${modo === m ? 'bg-sol text-white' : 'text-white/60 hover:text-white'}`}>
                  {rotuloModo[m]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">
                  {modo === 'consumo_kwh' ? 'Consumo médio (kWh/mês)' : modo === 'valor_mensal' ? 'Conta média (R$/mês)' : 'Quantidade de placas'}
                </span>
                <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={inputCls} autoFocus
                  placeholder={modo === 'consumo_kwh' ? 'Ex.: 480' : modo === 'valor_mensal' ? 'Ex.: 650' : 'Ex.: 10'} />
              </label>
              {modo === 'qtd_placas' ? (
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Inversor desejado (kW, opcional)</span>
                  <input value={inversorKw} onChange={(e) => setInversorKw(e.target.value)} inputMode="decimal" className={inputCls} placeholder="Ex.: 8" />
                </label>
              ) : (
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Cidade (irradiação)</span>
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={inputCls} />
                </label>
              )}
              {/* Mono → bi → tri: a ordem carrega sentido */}
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">Tipo de rede</span>
                <select value={rede} onChange={(e) => setRede(e.target.value as any)} className={inputCls}>
                  {TIPOS_REDE.map((t) => <option key={t.valor} value={t.valor} className="bg-noite">{t.rotulo}</option>)}
                </select>
              </label>
              {modo === 'qtd_placas' && (
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Cidade (irradiação)</span>
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={inputCls} />
                </label>
              )}
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">Telhado (estrutura)</span>
                <select value={telhado} onChange={(e) => setTelhado(e.target.value)} className={`${inputCls} ${telhado ? '' : 'border-sol/50'}`}>
                  <option value="" className="bg-noite">Não informado (estrutura genérica)</option>
                  {TELHADOS_AZ.map((t) => <option key={t.valor} value={t.valor} className="bg-noite">{t.rotulo}</option>)}
                </select>
              </label>
            </div>
            {(telhado === 'solo' || telhado === 'carport') && (
              <p className="text-[11px] text-white/55">Estrutura de {telhado === 'solo' ? 'solo' : 'carport'} não sai por quantidade de placas: inclua o item em “Itens extras” (categoria Estrutura). Cabos, conectores e proteções entram automáticos.</p>
            )}

            {/* Kalebe 2026-10-15: aumento extra de geração (cliente vai consumir mais) */}
            {modo !== 'qtd_placas' && (
              <div>
                <span className="block text-[11px] font-bold text-white/60 mb-1">Aumento extra de geração (sobre o consumo)</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ATALHOS_AUMENTO.map((p) => (
                    <button key={p} type="button" onClick={() => setAumento(String(p))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${num(aumento) === p ? 'bg-weg-azul border-weg-azul text-white' : 'border-white/15 text-white/70 hover:text-white'}`}>
                      {p === 0 ? 'Sem aumento' : `+${p}%`}
                    </button>
                  ))}
                  <label className="flex items-center gap-1 text-xs text-white/60">
                    outro:
                    <input value={aumento} onChange={(e) => setAumento(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} inputMode="numeric"
                      aria-label="Aumento de geração em %" className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs text-end focus:outline-none" />
                    %
                  </label>
                </div>
              </div>
            )}

            {/* Kalebe 2026-10-17: unidades beneficiárias — consumo soma no dimensionamento */}
            {modo !== 'qtd_placas' && (
              <div className="space-y-2 rounded-2xl border border-white/10 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold text-white/60">Unidades beneficiárias</span>
                  {beneficiarias.length > 0 && (
                    <span className="text-[11px] text-white/70 tabular-nums">+{fmtNum(consumoBenef, 0)} kWh/mês</span>
                  )}
                </div>
                {beneficiarias.map((b, i) => (
                  <div key={i} className={`grid grid-cols-[1fr_92px_auto] gap-2 items-center rounded-lg border px-2 py-1.5 ${b.meses != null && b.meses < 12 ? 'border-sol/50' : 'border-white/10'}`}>
                    <span className="text-[12px] text-white/85 min-w-0">
                      <span className="block truncate">
                        {b.uc ? `UC ${b.uc}` : `Beneficiária ${i + 1}`}{b.titular ? ` · ${b.titular}` : ''}
                        {b.arquivo_url && <a href={b.arquivo_url} target="_blank" rel="noreferrer" className="ml-1.5 text-white/60 hover:text-white">📄</a>}
                      </span>
                      {/* Kalebe 2026-10-19: foto sem o histórico → consumo de um mês só, não a média */}
                      {b.meses != null && b.meses < 12 && (
                        <span className="block text-[10px] text-white/55">
                          Lido de {b.meses} {b.meses === 1 ? 'mês só' : 'meses'} — confira a média de 12 meses na fatura e corrija aqui
                        </span>
                      )}
                    </span>
                    <input value={String(b.consumo_kwh || '')} onChange={(e) => mudarBenef(i, { consumo_kwh: Math.round(num(e.target.value)) })} inputMode="numeric"
                      aria-label="Consumo kWh/mês" className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-end" />
                    <button type="button" onClick={() => setBeneficiarias((bs) => bs.filter((_, j) => j !== i))} aria-label="Tirar"
                      className="w-6 h-6 rounded-full bg-white/[0.06] text-white/60 hover:text-white text-[11px]">✕</button>
                  </div>
                ))}
                {beneficiarias.length > 0 && num(valor) > 0 && (
                  <p className="text-[11px] text-white/55">
                    Consumo total: {fmtNum(modo === 'consumo_kwh' ? num(valor) : kit?.consumo ? kit.consumo - consumoBenef : 0, 0)} (principal) + {fmtNum(consumoBenef, 0)} (beneficiárias) = {fmtNum((modo === 'consumo_kwh' ? num(valor) : kit?.consumo ? kit.consumo - consumoBenef : 0) + consumoBenef, 0)} kWh/mês
                  </p>
                )}
                {!painelBenef ? (
                  <button type="button" onClick={abrirPainelBenef} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold text-start">＋ Adicionar UC beneficiária</button>
                ) : (
                  <div className="rounded-xl border border-sol/40 p-2 space-y-2">
                    <p className="text-[11px] font-bold text-white/70">Fatura da conversa — ler e adicionar:</p>
                    {arquivosConv === null ? <p className="text-[11px] text-white/45">Carregando os arquivos…</p>
                      : arquivosConv.length === 0 ? <p className="text-[11px] text-white/45">Nenhum PDF ou foto nesta conversa — adicione à mão abaixo.</p>
                      : (
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {arquivosConv.map((f) => (
                            <div key={f.mensagem_id} className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-white/70 truncate">
                                {/pdf/i.test(f.mime || '') ? '📄' : '🖼️'} {f.nome} · {new Date(f.criada_em).toLocaleDateString('pt-BR')}
                                {f.lida_uc ? ` · UC ${f.lida_uc}` : ''}{f.lida_consumo ? ` · ${fmtNum(f.lida_consumo, 0)} kWh` : ''}
                              </span>
                              <button type="button" onClick={() => lerBenef(f.mensagem_id)} disabled={!!lendoBenef || f.principal || beneficiarias.some((b) => b.mensagem_id === f.mensagem_id)}
                                title={f.principal ? 'Fatura da UC principal — o consumo dela já está no campo de consumo' : undefined}
                                className="shrink-0 px-2.5 py-1 rounded-lg bg-weg-azul text-white text-[11px] font-bold disabled:opacity-40">
                                {lendoBenef === f.mensagem_id ? 'Lendo… (até 1 min)' : f.principal ? 'UC principal' : beneficiarias.some((b) => b.mensagem_id === f.mensagem_id) ? 'Adicionada' : 'Ler e adicionar'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    <p className="text-[11px] font-bold text-white/70 pt-1">Ou à mão:</p>
                    <div className="grid grid-cols-[1fr_1fr_88px_auto] gap-1.5">
                      <input value={benefManual.uc} onChange={(e) => setBenefManual({ ...benefManual, uc: e.target.value })} placeholder="UC" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs" />
                      <input value={benefManual.titular} onChange={(e) => setBenefManual({ ...benefManual, titular: e.target.value })} placeholder="Titular" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs" />
                      <input value={benefManual.consumo} onChange={(e) => setBenefManual({ ...benefManual, consumo: e.target.value })} inputMode="numeric" placeholder="kWh/mês" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs text-end" />
                      <button type="button" onClick={adicionarBenefManual} disabled={!(num(benefManual.consumo) > 0)} className="px-2.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold disabled:opacity-40">Adicionar</button>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => setPainelBenef(false)} className="text-[11px] text-white/60 hover:text-white">Fechar</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Kalebe 2026-10-13: sistema, modelos e itens extras */}
            <div className="space-y-3 rounded-2xl border border-white/10 p-3">
              {/* Kalebe 2026-10-19: de qual CNPJ é a proposta (só aparece com mais de uma empresa) */}
              {empresas.length > 1 && (
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Empresa da proposta (CNPJ)</span>
                  <select value={empresaId || ''} onChange={(e) => trocarEmpresa(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm">
                    {empresas.map((x) => (
                      <option key={x.id} value={x.id} className="bg-noite">{x.nome}{x.cnpj ? ` · CNPJ ${x.cnpj}` : ''}{x.fornecedor ? ` · ${x.fornecedor}` : ''}</option>
                    ))}
                  </select>
                  <span className="block text-[10px] text-white/45 mt-1">Define o fornecedor (placas, inversores e itens) e a marca do PDF.</span>
                </label>
              )}
              <div>
                <span className="block text-[11px] font-bold text-white/60 mb-1">Sistema</span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                  {TIPOS_SISTEMA_FV.map((t) => (
                    <button key={t.valor} onClick={() => setSistema(t.valor)}
                      className={`py-2 rounded-lg text-xs font-bold ${sistema === t.valor ? 'bg-weg-azul text-white' : 'text-white/60 hover:text-white'}`}>
                      {t.rotulo}
                    </button>
                  ))}
                </div>
              </div>
              {/* Potência do kit ao vivo — como na escolha de kit do projeto */}
              {kit ? (
                <div className={`rounded-xl border px-3 py-2 space-y-0.5 ${kit.escolhido && kit.fci >= FCI_MIN && kit.fci <= FCI_MAX[sistema] ? 'border-verde/45' : 'border-coral/50'}`}>
                  <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Potência do kit</p>
                  <p className="text-lg font-black text-white tabular-nums">{fmtKwp(kit.kwp)}
                    <span className="text-xs font-bold text-white/60"> · {kit.qtdPlacas} placas de {fmtNum(kit.placa.potencia_wp, 0)} Wp</span>
                  </p>
                  {kit.escolhido ? (
                    <p className="text-[12px] text-white/80">
                      {sistema === 'micro' ? 'Microinversores' : 'Inversor'}: {kit.qtdInv > 1 ? `${kit.qtdInv} × ` : ''}{kit.escolhido.inv.rotulo.split(' · ')[0]}
                      {' '}({fmtNum(kit.potCa, 2)} kW) · CC/CA {fmtNum(kit.fci * 100, 0)}%
                      {kit.fci < FCI_MIN || kit.fci > FCI_MAX[sistema] ? ` — fora da faixa (${fmtNum(FCI_MIN * 100, 0)}–${fmtNum(FCI_MAX[sistema] * 100, 0)}%)` : ''}
                    </p>
                  ) : <p className="text-[12px] text-coral">Nenhum {sistema === 'micro' ? 'microinversor' : 'inversor'} disponível pra essa rede</p>}
                  <p className="text-[11px] text-white/55">
                    Geração estimada ≈ {fmtNum(kit.geracao, 0)} kWh/mês
                    {kit.consumo ? ` · ${fmtNum((kit.geracao / kit.consumo) * 100, 0)}% do consumo de ${fmtNum(kit.consumo, 0)} kWh/mês` : ''}
                    {kit.aumentoPct > 0 ? ` (com +${fmtNum(kit.aumentoPct, 0)}% de aumento)` : ''}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-white/45 rounded-xl border border-white/10 px-3 py-2">
                  {catalogo ? `Informe ${modo === 'consumo_kwh' ? 'o consumo' : modo === 'valor_mensal' ? 'o valor da conta' : 'a quantidade de placas'} pra ver a potência do kit.` : 'Carregando o catálogo…'}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Potência em ordem crescente (a ordem carrega sentido) */}
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Placa</span>
                  <select value={placaId} onChange={(e) => setPlacaId(e.target.value)} className={inputCls} disabled={!catalogo}>
                    <option value="" className="bg-noite">Automático (maior potência)</option>
                    {(catalogo?.placas || []).map((p) => <option key={p.id} value={p.id} className="bg-noite">{p.rotulo}</option>)}
                  </select>
                </label>
                {/* Só os modelos dentro da faixa técnica de CC/CA pra este kit (com a quantidade que ele pede) */}
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">
                    {sistema === 'micro' ? 'Microinversor' : 'Inversor'}{kit ? ` · ${opcoesCompativeis.length} compatíve${opcoesCompativeis.length === 1 ? 'l' : 'is'}` : ''}
                  </span>
                  <select value={inversorId} onChange={(e) => escolherInversor(e.target.value)} className={inputCls} disabled={!catalogo || !kit}>
                    <option value="" className="bg-noite">
                      {kit?.recomendado ? `Automático: ${kit.recomendado.qtd > 1 ? `${kit.recomendado.qtd} × ` : ''}${kit.recomendado.inv.rotulo.split(' · ')[0]}` : 'Automático (recomendado)'}
                    </option>
                    {opcoesCompativeis.map((o) => (
                      <option key={o.inv.id} value={o.inv.id} className="bg-noite">
                        {o.qtd > 1 ? `${o.qtd} × ` : ''}{o.inv.rotulo} · CC/CA {fmtNum(o.fci * 100, 0)}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {kit && !opcoesCompativeis.length && (
                <p className="text-[11px] text-coral">Nenhum modelo fica na faixa de CC/CA ({fmtNum(FCI_MIN * 100, 0)}–{fmtNum(FCI_MAX[sistema] * 100, 0)}%) pra {fmtKwp(kit.kwp)} — ajuste a quantidade de placas ou o sistema.</p>
              )}
              {sistema !== 'micro' && inversorId && (
                <label className="block max-w-[200px]">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Quantidade de inversores</span>
                  <input value={inversorQtd} onChange={(e) => setInversorQtd(e.target.value)} inputMode="numeric" placeholder="1" className={inputCls} />
                </label>
              )}
              {sistema === 'micro' && (
                <p className="text-[11px] text-white/45">A quantidade de microinversores sai das placas (placas por micro) e fica múltipla das fases da rede, balanceada.</p>
              )}
              {catalogo && inversoresDoSistema.length === 0 && (
                <p className="text-[11px] text-coral">Nenhum {sistema === 'micro' ? 'microinversor' : sistema === 'hibrido' ? 'inversor híbrido' : 'inversor string'} disponível pra essa rede no catálogo.</p>
              )}
              {ehAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setCadastroDatasheet('placa')} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold text-start">📄 Cadastrar placa (datasheet)</button>
                  <button type="button" onClick={() => setCadastroDatasheet('inversor')} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold text-start">📄 Cadastrar inversor (datasheet)</button>
                  <button type="button" onClick={() => setCadastroDatasheet('outro')} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold text-start">📄 Outro equipamento</button>
                </div>
              )}

              <div>
                <span className="block text-[11px] font-bold text-white/60 mb-1">Itens extras</span>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_64px_auto] gap-2">
                  <select value={catExtra} onChange={(e) => { setCatExtra(e.target.value); setItemExtra('') }} className={inputCls} disabled={!catalogo}>
                    <option value="" className="bg-noite">Categoria…</option>
                    {(catalogo?.extras || []).map((g) => <option key={g.categoria} value={g.categoria} className="bg-noite">{g.rotulo}</option>)}
                  </select>
                  <select value={itemExtra} onChange={(e) => setItemExtra(e.target.value)} className={inputCls} disabled={!catExtra}>
                    <option value="" className="bg-noite">{catExtra ? 'Item…' : 'Escolha a categoria'}</option>
                    {itensDaCategoria.map((i) => <option key={i.id} value={i.id} className="bg-noite">{i.rotulo}</option>)}
                  </select>
                  <input value={qtdExtra} onChange={(e) => setQtdExtra(e.target.value)} inputMode="numeric" aria-label="Quantidade" className={inputCls} />
                  <button onClick={adicionarExtra} disabled={!itemExtra} className="px-4 py-2.5 rounded-xl bg-weg-azul text-white text-sm font-bold disabled:opacity-40">Adicionar</button>
                </div>
                {extras.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {extras.map((x) => (
                      <li key={x.produto_id} className="flex items-center justify-between gap-2 text-[12px] text-white/80 border border-white/10 rounded-lg px-2.5 py-1.5">
                        <span className="truncate">{x.rotulo}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-white/60">{x.qtd} un.</span>
                          <button onClick={() => setExtras((xs) => xs.filter((y) => y.produto_id !== x.produto_id))} aria-label="Tirar"
                            className="w-6 h-6 rounded-full bg-white/[0.06] text-white/60 hover:text-white">✕</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/10 p-3">
              <span className="block text-[11px] font-bold text-white/60">Serviços adicionais</span>
              <SecoesProposta faixas={faixas} secoes={secoes} onChange={setSecoes} versao={versao} />
            </div>

            {!o && (
              <button onClick={calcular} disabled={!!ocupado || !(num(valor) > 0)}
                className="w-full py-3 rounded-xl bg-verde text-white font-bold text-sm disabled:opacity-40">
                {ocupado === 'calculando' ? 'Calculando…' : 'Calcular'}
              </button>
            )}

            {o && resultado && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 p-4 space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-white/50">Investimento</p>
                      <p className="text-2xl font-black text-white">{formatarMoedaBRL(o.pv_total)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-white/50">Sistema</p>
                      <p className="text-sm font-bold text-white">{fmtKwp(o.kwp)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                    <span className="text-white/50">Placas</span><span className="text-white/85 text-right">{o.qtd_placas} × {o.placa.modelo} ({o.placa.potencia_wp} Wp)</span>
                    <span className="text-white/50">{o.tipo_sistema === 'micro' ? 'Microinversores' : 'Inversor'}</span><span className="text-white/85 text-right">{o.inversor.qtd > 1 ? `${o.inversor.qtd} × ` : ''}{o.inversor.modelo} ({String(o.inversor.potencia_kw).replace('.', ',')} kW)</span>
                    {o.extras.map((x) => (
                      <Fragment key={x.produto_id}><span className="text-white/50 truncate">{x.descricao}</span><span className="text-white/85 text-right">{x.qtd} un.</span></Fragment>
                    ))}
                    {o.complementos && o.complementos.itens.length > 0 && (
                      <>
                        <span className="text-white/50">Estrutura e materiais CC/CA</span>
                        <span className="text-white/85 text-right">{resultado.mostra_interno ? formatarMoedaBRL(o.complementos.total) : `${o.complementos.itens.length} itens`}</span>
                      </>
                    )}
                    {(o.secoes || []).length > 0 && (
                      <>
                        <span className="text-white/50">Sistema fotovoltaico</span><span className="text-white/85 text-right">{formatarMoedaBRL(o.pv_sistema || 0)}</span>
                        {(o.secoes || []).map((s, i) => (
                          <Fragment key={`sec-${i}`}><span className="text-white/50 truncate">{rotuloSecao(s).titulo}</span><span className="text-white/85 text-right">{formatarMoedaBRL(s.valor)}</span></Fragment>
                        ))}
                      </>
                    )}
                    <span className="text-white/50">Geração estimada</span><span className="text-white/85 text-right">{o.geracao_kwh_mes.toLocaleString('pt-BR')} kWh/mês</span>
                    {o.consumo_kwh_mes ? <><span className="text-white/50">Consumo considerado</span><span className="text-white/85 text-right">{Math.round(o.consumo_kwh_mes).toLocaleString('pt-BR')} kWh/mês</span></> : null}
                    <span className="text-white/50">PIX ({o.formas_pagamento.a_vista_pix.desconto_pct}% desc.)</span><span className="text-white/85 text-right">{formatarMoedaBRL(o.formas_pagamento.a_vista_pix.valor)}</span>
                    <span className="text-white/50">Cartão</span><span className="text-white/85 text-right">{o.formas_pagamento.parcelado_cartao.parcelas}× de {formatarMoedaBRL(o.formas_pagamento.parcelado_cartao.valor_parcela)}</span>
                  </div>
                  {o.complementos && o.complementos.itens.length > 0 && (
                    <details className="rounded-xl border border-white/10 px-3 py-2">
                      <summary className="text-[11px] font-bold text-white/70 cursor-pointer">
                        Estrutura{o.complementos.tipo_telhado ? ` (${TIPOS_TELHADO.find((t) => t.valor === o.complementos!.tipo_telhado)?.rotulo || o.complementos.tipo_telhado})` : ''}, cabos, conectores e proteções
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {o.complementos.itens.map((i, n) => (
                          <li key={n} className="text-[11px] text-white/70 flex justify-between gap-2">
                            <span className={i.subtotal > 0 || !resultado.mostra_interno ? '' : 'text-coral'}>{i.modelo}</span>
                            <span className="tabular-nums shrink-0">{fmtNum(i.qtd, 0)} {i.unidade}{resultado.mostra_interno ? ` · ${formatarMoedaBRL(i.subtotal)}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                      {o.complementos.avisos.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {o.complementos.avisos.map((a, n) => <li key={n} className="text-[11px] text-coral">⚠ {a}</li>)}
                        </ul>
                      )}
                    </details>
                  )}
                  {resultado.mostra_interno && (
                    <p className="text-[10px] text-white/40">Interno: margem {o.interno.margem_pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% · desconto máx. {formatarMoedaBRL(o.interno.desconto_max_negociacao)}</p>
                  )}
                </div>

                <details className="rounded-2xl border border-white/10 px-4 py-3" open={!resultado.auditoria.aprovado}>
                  <summary className="text-xs font-bold text-white/80 cursor-pointer">
                    {resultado.auditoria.aprovado ? '✅ Auditor: tudo certo' : '⚠️ Auditor encontrou problema grave'} · {resultado.auditoria.itens.filter((i) => !i.ok).length} ponto(s) de atenção
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {resultado.auditoria.itens.map((i, n) => (
                      <li key={n} className="text-[12px] text-white/75 flex gap-2">
                        <span className="shrink-0">{i.ok ? '✓' : i.grave ? '✕' : '!'}</span>
                        <span className={!i.ok && i.grave ? 'text-coral' : ''}>{i.texto}</span>
                      </li>
                    ))}
                  </ul>
                </details>

                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Mensagem junto do PDF</span>
                  <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={verPdf} disabled={!!ocupado} className="py-3 rounded-xl bg-white/[0.06] border border-white/15 text-white font-bold text-sm disabled:opacity-40">
                    {ocupado === 'gerando' ? 'Gerando PDF…' : '📄 Ver PDF'}
                  </button>
                  <button onClick={enviar} disabled={!!ocupado} className="py-3 rounded-xl bg-verde text-white font-bold text-sm disabled:opacity-40">
                    {ocupado === 'enviando' ? 'Enviando…' : '📲 Enviar no WhatsApp'}
                  </button>
                </div>
              </div>
            )}

            {erro && <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p>}

            {projetoId && (
              <a href={`/projetos/${projetoId}/orcamento`} target="_blank" rel="noreferrer" className="block text-center text-[11px] text-white/50 hover:text-white">
                Precisa de lista CA, visita ou ajuste fino? Abrir a proposta completa do projeto →
              </a>
            )}
          </>
        )}
      </div>
      {/* Template da proposta oficial, fora da tela, só enquanto gera o PDF */}
      {oficial && (
        <div className="tema-fixo" style={{ position: 'absolute', left: '-99999px', top: 0, zIndex: -1 }} aria-hidden>
          <PropostaPDFTemplate ref={templateRef} projeto={oficial.projeto} proposta={{ pv_total: oficial.pv_total } as PropostaCalculada}
            configEmpresa={oficial.config_empresa} listaCa={[]} campanhaAplicada={oficial.campanha} />
        </div>
      )}
      {/* Fora do cartão (o desfoque do cartão prenderia o painel dentro dele) */}
      {painel && (
        <PainelPrecificacao contexto="fotovoltaico" onFechar={() => setPainel(false)}
          onAlterado={() => { setVersao((v) => v + 1); setResultado(null); setPdf(null) }} />
      )}
      {cadastroDatasheet && (
        <CadastroDatasheetModal categoriaInicial={cadastroDatasheet}
          subcategoriaInversor={TIPOS_SISTEMA_FV.find((t) => t.valor === sistema)?.subcategoria}
          onClose={() => setCadastroDatasheet(null)}
          onCreated={() => { opcoesKitPropostaAction(empresaId).then((r) => { if (!('erro' in r)) setCatalogo(r) }) }} />
      )}
    </div>
  )
}
