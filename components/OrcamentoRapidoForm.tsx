'use client'

import { useState, useTransition, useMemo } from 'react'
import { TIPOS_ITEM, type TipoItem } from '@/lib/tipos-projeto'
import type { ModoEntrada, ResultadoOrcamento, TipoRede } from '@/lib/orcamento-rapido/tipos'
import { fmtBRL, TIPOS_REDE_INFO } from '@/lib/orcamento-rapido/tipos'
import { adaptadorSolar } from '@/lib/orcamento-rapido/solar'
import { adaptadorServicoPlacas } from '@/lib/orcamento-rapido/servico-placas'
import {
  calcularOrcamentoAction,
  salvarOrcamentoRapidoAction,
  marcarComoEnviadoAction,
  converterEmProjetoAction,
} from '@/app/orcamento-rapido/actions'

const TIPOS_MVP: TipoItem[] = ['fv_ongrid', 'fv_hibrido', 'fv_zero_grid', 'fv_offgrid', 'srv_limpeza']

function pegarAdaptadorFront(tipo: TipoItem) {
  if (['fv_ongrid', 'fv_hibrido', 'fv_zero_grid', 'fv_offgrid'].includes(tipo)) return adaptadorSolar
  if (tipo === 'srv_limpeza') return adaptadorServicoPlacas
  return null
}

export function OrcamentoRapidoForm({
  empresa,
  leadId,
  telefoneLead,
}: {
  empresa: { nome: string; consultor: string }
  leadId?: string
  telefoneLead?: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [tipo, setTipo] = useState<TipoItem>('fv_ongrid')
  const [modo, setModo] = useState<ModoEntrada>('consumo_kwh')
  const [valorInput, setValorInput] = useState<string>('')
  const [tipoRede, setTipoRede] = useState<TipoRede>('mono_220')
  const [cidade, setCidade] = useState<string>('')
  const [resultado, setResultado] = useState<ResultadoOrcamento | null>(null)
  const [ajuste, setAjuste] = useState<number>(0)
  const [justificativa, setJustificativa] = useState<string>('')
  const [telefone, setTelefone] = useState<string>(telefoneLead || '')
  const [orcamentoSalvoId, setOrcamentoSalvoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const ehSolar = ['fv_ongrid', 'fv_hibrido', 'fv_zero_grid', 'fv_offgrid'].includes(tipo)
  const cidadeObrigatoria = ehSolar && modo !== 'fatura'

  const adaptador = pegarAdaptadorFront(tipo)

  // Muda modo automaticamente pra um suportado quando troca de tipo
  const modosDisp = adaptador?.modosSuportados || []
  if (adaptador && !modosDisp.includes(modo) && modosDisp[0]) {
    setModo(modosDisp[0])
    setResultado(null)
  }

  const infoTipo = TIPOS_ITEM.find(t => t.chave === tipo)

  // Valor final = valor estimado + ajuste%
  const valorFinal = useMemo(() => {
    if (!resultado) return 0
    return Math.round(resultado.valor_estimado * (1 + ajuste / 100))
  }, [resultado, ajuste])

  function montarEntrada(): Record<string, unknown> | null {
    const num = parseFloat(valorInput.replace(',', '.'))
    if (isNaN(num) || num <= 0) return null
    // Solar SEMPRE carrega tipo_rede + cidade (regra Kalebe 2026-07-31)
    const extraSolar = ehSolar ? { tipo_rede: tipoRede, cidade: cidade.trim() || undefined } : {}
    switch (modo) {
      case 'consumo_kwh':  return { modo, consumo_kwh: num, ...extraSolar }
      case 'qtd_placas':   return { modo, qtd_placas: Math.round(num), ...extraSolar }
      case 'valor_mensal': return { modo, valor_mensal: num, ...extraSolar }
      default:             return null
    }
  }

  async function handleCalcular() {
    setErro(null)
    const entrada = montarEntrada()
    if (!entrada) {
      setErro('Preencha o valor primeiro')
      return
    }
    if (cidadeObrigatoria && !cidade.trim()) {
      setErro('Cidade é obrigatória quando não é pela fatura — pra estimar a irradiação solar certa.')
      return
    }
    startTransition(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await calcularOrcamentoAction(tipo, entrada as any)
      if ('erro' in res) {
        setErro(res.erro)
        return
      }
      setResultado(res.resultado)
      setAjuste(0)
      setOrcamentoSalvoId(null)
    })
  }

  async function handleSalvar() {
    setErro(null)
    if (!resultado) return
    const entrada = montarEntrada()
    if (!entrada) return
    startTransition(async () => {
      const res = await salvarOrcamentoRapidoAction({
        tipo,
        modo_entrada: modo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        entrada: entrada as any,
        resultado,
        ajuste_percentual: ajuste,
        ajuste_justificativa: justificativa || undefined,
        valor_final: valorFinal,
        lead_id: leadId,
        telefone_destino: telefone || undefined,
      })
      if ('erro' in res) {
        setErro(res.erro)
        return
      }
      setOrcamentoSalvoId(res.id)
    })
  }

  function gerarMensagemWhatsApp(): string {
    if (!resultado || !adaptador) return ''
    const entrada = montarEntrada()
    if (!entrada) return ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (adaptador as any).formatarWhatsApp(entrada, resultado, empresa, valorFinal)
  }

  async function handleEnviarWhatsApp() {
    setErro(null)
    if (!orcamentoSalvoId) {
      setErro('Salve o orçamento antes de enviar')
      return
    }
    const mensagem = gerarMensagemWhatsApp()
    if (!telefone) {
      setErro('Informe o telefone do lead')
      return
    }
    const telefoneLimpo = telefone.replace(/\D/g, '')
    const url = `https://wa.me/55${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`
    window.open(url, '_blank')
    startTransition(async () => {
      await marcarComoEnviadoAction(orcamentoSalvoId, 'whatsapp', mensagem)
    })
  }

  async function handleConverterEmProjeto() {
    setErro(null)
    if (!orcamentoSalvoId) {
      setErro('Salve o orçamento antes de converter')
      return
    }
    startTransition(async () => {
      const res = await converterEmProjetoAction(orcamentoSalvoId)
      if (res && 'erro' in res) setErro(res.erro)
    })
  }

  return (
    <div className="space-y-6">
      {/* ETAPA 1 — Tipo */}
      <section className="p-5 rounded-xl bg-white/[0.04] border border-white/10">
        <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-3">
          1. O que o cliente quer?
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {TIPOS_MVP.map(chave => {
            const info = TIPOS_ITEM.find(t => t.chave === chave)
            if (!info) return null
            const ativo = tipo === chave
            return (
              <button
                key={chave}
                type="button"
                onClick={() => { setTipo(chave); setResultado(null); setOrcamentoSalvoId(null) }}
                className={`p-3 rounded-lg border transition-all text-left ${
                  ativo
                    ? 'bg-sol/15 border-sol text-white'
                    : 'bg-white/[0.02] border-white/10 text-white/70 hover:border-white/30'
                }`}
              >
                <div className="text-xl mb-1">{info.emoji}</div>
                <div className="text-xs font-bold leading-tight">{info.label}</div>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-white/40 mt-2">
          MVP: FV + limpeza. BESS · VE · manutenção · alvenaria vêm na Fase 2.
        </p>
      </section>

      {/* ETAPA 1.5 — Tipo de rede + cidade (só solar) */}
      {ehSolar && (
        <section className="p-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-3">
              1.a Tipo de rede elétrica <span className="text-coral">*</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(Object.entries(TIPOS_REDE_INFO) as [TipoRede, typeof TIPOS_REDE_INFO[TipoRede]][]).map(([chave, info]) => {
                const ativo = tipoRede === chave
                return (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => { setTipoRede(chave); setResultado(null); setOrcamentoSalvoId(null) }}
                    className={`p-2 rounded-lg border transition-all text-left ${
                      ativo
                        ? 'bg-weg-azul/15 border-weg-azul text-white'
                        : 'bg-white/[0.02] border-white/10 text-white/70 hover:border-white/30'
                    }`}
                  >
                    <div className="text-xs font-bold leading-tight">{info.label}</div>
                    <div className="text-[9px] text-white/50 mt-0.5">{info.hint}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-2">
              1.b Cidade {cidadeObrigatoria && <span className="text-coral">*</span>}
              {!cidadeObrigatoria && <span className="text-white/30 font-normal normal-case ml-1">(opcional — fatura já traz)</span>}
            </label>
            <input
              type="text"
              value={cidade}
              onChange={(e) => { setCidade(e.target.value); setResultado(null) }}
              placeholder="Ex: Florianópolis, Chapecó, Joinville..."
              className="w-full px-3 py-2 bg-noite border border-white/20 rounded-lg text-white placeholder-white/30 focus:border-sol focus:outline-none"
            />
            <p className="text-[10px] text-white/40 mt-1">
              Ajusta a irradiação solar da região (SC varia de 4,0 no litoral sul a 4,35 no oeste).
            </p>
          </div>
        </section>
      )}

      {/* ETAPA 2 — Modo de entrada + valor */}
      <section className="p-5 rounded-xl bg-white/[0.04] border border-white/10">
        <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-3">
          2. A partir de qual dado?
        </label>
        <div className="flex flex-wrap gap-2 mb-4">
          {modosDisp.map(m => {
            if (m === 'fatura') return null // Fatura vem na fase 2 (precisa OCR)
            const ativo = modo === m
            const nomes: Record<ModoEntrada, string> = {
              consumo_kwh: '⚡ kWh/mês',
              qtd_placas: '☀️ Qtd placas',
              valor_mensal: '💰 R$/mês',
              fatura: '📄 Fatura',
              backup_kwh: '🔋 Backup',
              modelo_carro: '🚗 Carro',
              qtd_diarias: '📅 Diárias',
              descricao_livre: '✍️ Livre',
            }
            return (
              <button
                key={m}
                type="button"
                onClick={() => { setModo(m); setResultado(null); setValorInput('') }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  ativo
                    ? 'bg-verde/20 border-verde text-verde'
                    : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-white/30'
                }`}
              >
                {nomes[m]}
              </button>
            )
          })}
        </div>
        {adaptador && (
          <div>
            <p className="text-sm text-white/70 mb-2">{adaptador.descricaoModo(modo)}</p>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={valorInput}
                onChange={(e) => { setValorInput(e.target.value); setResultado(null) }}
                placeholder={adaptador.placeholderModo(modo)}
                className="flex-1 px-4 py-3 bg-noite border border-white/20 rounded-lg text-white text-lg font-bold focus:border-sol focus:outline-none"
              />
              <div className="flex items-center px-3 text-white/50 text-sm border border-white/10 rounded-lg bg-white/[0.02]">
                {adaptador.unidadeModo(modo)}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCalcular}
              disabled={pending}
              className="mt-3 w-full py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-50 transition"
            >
              {pending ? 'Calculando...' : '🧮 Calcular estimativa'}
            </button>
          </div>
        )}
      </section>

      {/* ETAPA 3 — Resultado (só aparece após calcular) */}
      {resultado && (
        <section className="p-5 rounded-xl bg-gradient-to-br from-sol/10 to-verde/5 border border-sol/40">
          <label className="block text-xs uppercase tracking-wider text-sol font-bold mb-3">
            3. Estimativa
          </label>
          <div className="text-2xl font-black text-white mb-1">
            R$ {fmtBRL(valorFinal)}
          </div>
          <p className="text-sm text-white/70 mb-4">{resultado.resumo}</p>

          <div className="space-y-1 mb-4">
            {resultado.detalhes.map((d, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-white/50">{d.label}:</span>
                <span className="text-white/80 font-semibold">{d.valor}</span>
              </div>
            ))}
          </div>

          {/* Ajuste manual */}
          <div className="pt-4 border-t border-white/10">
            <label className="text-xs text-white/60 font-semibold block mb-2">
              Ajuste manual (opcional)
            </label>
            <div className="flex items-center gap-3 mb-2">
              <input
                type="range"
                min={-30}
                max={30}
                step={5}
                value={ajuste}
                onChange={(e) => setAjuste(Number(e.target.value))}
                className="flex-1 accent-sol"
              />
              <span className={`text-sm font-bold w-14 text-right ${
                ajuste === 0 ? 'text-white/60' : ajuste > 0 ? 'text-verde' : 'text-coral'
              }`}>
                {ajuste > 0 ? '+' : ''}{ajuste}%
              </span>
            </div>
            {Math.abs(ajuste) > 10 && (
              <input
                type="text"
                placeholder="Justificativa (obrigatória > 10%)"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                className="w-full mt-2 px-3 py-2 bg-noite border border-coral/40 rounded text-sm text-white placeholder-white/40 focus:border-coral focus:outline-none"
              />
            )}
          </div>

          <p className="text-[10px] text-white/40 italic mt-4">
            {resultado.observacao_padrao}
          </p>
        </section>
      )}

      {/* ETAPA 4 — Salvar/enviar (só aparece após calcular) */}
      {resultado && (
        <section className="p-5 rounded-xl bg-white/[0.04] border border-white/10">
          <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-3">
            4. Enviar pro cliente
          </label>

          <label className="text-xs text-white/60 font-semibold block mb-1">
            Telefone/WhatsApp
          </label>
          <input
            type="tel"
            placeholder="(48) 99999-9999"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className="w-full mb-3 px-3 py-2 bg-noite border border-white/20 rounded text-white placeholder-white/30 focus:border-sol focus:outline-none"
          />

          {!orcamentoSalvoId && (
            <button
              type="button"
              onClick={handleSalvar}
              disabled={pending}
              className="w-full py-3 bg-verde text-noite font-bold rounded-lg hover:bg-verde/90 disabled:opacity-50 transition"
            >
              {pending ? 'Salvando...' : '💾 Salvar orçamento'}
            </button>
          )}

          {orcamentoSalvoId && (
            <div className="space-y-2">
              <div className="text-xs text-verde bg-verde/10 border border-verde/30 px-3 py-2 rounded">
                ✓ Orçamento salvo (ID: {orcamentoSalvoId.slice(0, 8)})
              </div>
              <button
                type="button"
                onClick={handleEnviarWhatsApp}
                disabled={pending || !telefone}
                className="w-full py-3 bg-[#25D366] text-white font-bold rounded-lg hover:bg-[#25D366]/90 disabled:opacity-40 transition"
              >
                📱 Enviar via WhatsApp
              </button>
              <button
                type="button"
                onClick={handleConverterEmProjeto}
                disabled={pending}
                className="w-full py-3 bg-weg-azul text-white font-bold rounded-lg hover:bg-weg-azul/90 disabled:opacity-50 transition"
              >
                🚀 Converter em projeto formal
              </button>
              <p className="text-[10px] text-white/40 text-center">
                Ao converter, cria projeto vinculado a este orçamento e abre a tela de dados.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Preview da mensagem (só aparece após salvar) */}
      {orcamentoSalvoId && resultado && (
        <section className="p-4 rounded-xl bg-noite border border-white/10">
          <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-2">
            Preview da mensagem
          </label>
          <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans leading-relaxed">
            {gerarMensagemWhatsApp()}
          </pre>
        </section>
      )}

      {erro && (
        <div className="p-3 rounded-lg bg-coral/10 border border-coral/30 text-coral text-sm">
          ⚠️ {erro}
        </div>
      )}

      {infoTipo && (
        <p className="text-[10px] text-white/30 text-center">
          Tipo selecionado: {infoTipo.emoji} {infoTipo.label}
        </p>
      )}
    </div>
  )
}
