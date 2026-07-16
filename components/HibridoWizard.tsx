'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  dimensionarSistemaHibrido,
  type SaidaDimensionamentoHibrido,
} from '@/lib/hibrido/dimensionamento'
import {
  MULTIMEDIDOR_WEG,
  CAIXA_JUNCAO_WEG,
  CONTROLADOR_PARALELISMO_WEG,
} from '@/lib/hibrido/catalogo-weg'
import { salvarDimensionamentoHibridoAction } from '@/app/projetos/[id]/hibrido/actions'
import { GraficoImpactoHibrido } from '@/components/GraficoImpactoHibrido'
import type { PerfilCliente } from '@/lib/hibrido/perfil-consumo'
import { LevantamentoListagem, type MestreConsideracoes } from '@/components/LevantamentoListagem'
import { gerarItensListaCaHibrida, resumoListaCaHibrida } from '@/lib/hibrido/lista-ca-hibrida'

type Metodo = 'memoria_massa' | 'analise_rede_medido' | 'levantamento_listagem'

type AnaliseIA = {
  demanda_media_kw?: number
  demanda_pico_kw?: number
  demanda_carga_critica_kw_sugerida?: number
  autonomia_horas_sugerida?: number
  perfil_uso?: string
  picos_horarios?: string
  resumo?: string
  pontos_criticos?: { titulo: string; detalhe: string; severidade: string }[]
  recomendacao?: string
}

export function HibridoWizard({
  projetoId,
  itemId,
  tipoLigacao,
}: {
  projetoId: string
  itemId?: string
  tipoLigacao: 'monofasico' | 'bifasico' | 'trifasico'
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  // Etapa 1: escolha do método
  const [metodo, setMetodo] = useState<Metodo>('memoria_massa')

  // Etapa 2: upload da planilha
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [analiseIA, setAnaliseIA] = useState<AnaliseIA | null>(null)

  // Etapa 3: ajustes de demanda/autonomia (editáveis)
  const [cargaCriticaKw, setCargaCriticaKw] = useState<number>(3)
  const [autonomiaHoras, setAutonomiaHoras] = useState<number>(4)
  const [usarPeakShaving, setUsarPeakShaving] = useState(false)
  const [usarComplementacao, setUsarComplementacao] = useState(false)
  const [preferirBat10, setPreferirBat10] = useState(false)
  // Composição da carga crítica (soma ~100%)
  const [percIndutiva, setPercIndutiva] = useState<number>(20)
  const [percResistiva, setPercResistiva] = useState<number>(60)
  const [percCapacitiva, setPercCapacitiva] = useState<number>(20)
  const [grupoTarifa, setGrupoTarifa] = useState<'A' | 'B'>('B')
  // Dados p/ visualização de impacto (opcionais)
  const [consumoMensalKwh, setConsumoMensalKwh] = useState<number>(600)
  const [geracaoMensalKwh, setGeracaoMensalKwh] = useState<number>(500)
  const [perfilCliente, setPerfilCliente] = useState<PerfilCliente>('residencial')

  // Aplica sugestão da IA
  function aplicarSugestaoIA(ia: AnaliseIA) {
    if (ia.demanda_carga_critica_kw_sugerida) setCargaCriticaKw(ia.demanda_carga_critica_kw_sugerida)
    if (ia.autonomia_horas_sugerida) setAutonomiaHoras(ia.autonomia_horas_sugerida)
  }

  async function analisarArquivo() {
    if (!arquivo) return
    setAnalisando(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      fd.append('metodo', metodo)
      fd.append('projeto_id', projetoId)

      const res = await fetch('/api/hibrido/analisar-planilha', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha na análise')

      setAnaliseIA(data.analise)
      aplicarSugestaoIA(data.analise)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setAnalisando(false)
    }
  }

  // Dimensionamento em tempo real (recalcula quando muda input)
  const dimensionamento: SaidaDimensionamentoHibrido | null = useMemo(() => {
    if (cargaCriticaKw <= 0 || autonomiaHoras <= 0) return null
    return dimensionarSistemaHibrido({
      demandaCargaCriticaKw: cargaCriticaKw,
      autonomiaDesejadaHoras: autonomiaHoras,
      tipoLigacao,
      percCargaIndutiva: percIndutiva,
      percCargaResistiva: percResistiva,
      percCargaCapacitiva: percCapacitiva,
      usarPeakShaving,
      usarComplementacaoDemanda: usarComplementacao,
      preferirBateria10kwh: preferirBat10,
    })
  }, [cargaCriticaKw, autonomiaHoras, tipoLigacao, percIndutiva, percResistiva, percCapacitiva, usarPeakShaving, usarComplementacao, preferirBat10])

  const somaCarga = percIndutiva + percResistiva + percCapacitiva
  const cargaValida = Math.abs(somaCarga - 100) <= 1

  function confirmar() {
    if (!dimensionamento) return
    setErro(null)
    startTransition(async () => {
      const res = await salvarDimensionamentoHibridoAction(projetoId, itemId || null, dimensionamento)
      if (res && 'erro' in res && res.erro) {
        setErro(res.erro)
        return
      }
      router.push(`/projetos/${projetoId}`)
    })
  }

  return (
    <div className="space-y-6">
      {/* ══════════════ ETAPA 1: método ══════════════ */}
      <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
        <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
          1. Como você vai definir a demanda do cliente?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <MetodoBtn
            atual={metodo} onChange={setMetodo} valor="memoria_massa"
            emoji="📊" label="Memória de massa"
            desc="Planilha CELESC com curva de carga (15min ou 1h). Método mais preciso."
          />
          <MetodoBtn
            atual={metodo} onChange={setMetodo} valor="analise_rede_medido"
            emoji="📡" label="Análise de rede medida"
            desc="Dados de analisador de qualidade de energia instalado no local."
          />
          <MetodoBtn
            atual={metodo} onChange={setMetodo} valor="levantamento_listagem"
            emoji="📝" label="Levantamento por listagem"
            desc="Somatório de cargas por equipamento. Menos preciso — use só se não tem os outros."
          />
        </div>
      </section>

      {/* ══════════════ ETAPA 2 (listagem): catálogo de equipamentos ══════════════ */}
      {metodo === 'levantamento_listagem' && (
        <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-2">
            2. Selecione os equipamentos do cliente
          </h2>
          <p className="text-[10px] text-white/50 mb-4">
            Escolha um a um os aparelhos do site — quantidade, horas de uso e se entra no backup ⭐.
            Ao final consulte o Mestre da Elétrica pra análise técnica.
          </p>
          <LevantamentoListagem
            onCalculado={(resumo, mestre) => {
              if (mestre) {
                setCargaCriticaKw(mestre.cargaCriticaSugeridaKw)
                setAutonomiaHoras(mestre.autonomiaSugeridaHoras)
                setPercIndutiva(mestre.composicao.indutiva)
                setPercResistiva(mestre.composicao.resistiva)
                setPercCapacitiva(mestre.composicao.capacitiva)
                if (resumo.consumoEstimadoMensalKwh > 0) {
                  setConsumoMensalKwh(Math.round(resumo.consumoEstimadoMensalKwh))
                }
              }
            }}
          />
        </section>
      )}

      {/* ══════════════ ETAPA 2 (planilha): upload/análise ══════════════ */}
      {metodo !== 'levantamento_listagem' && (
        <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
            2. Anexe a planilha
          </h2>

          <input
            type="file"
            accept=".xlsx,.xls,.csv,.ods,.pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            className="w-full text-xs text-white file:mr-3 file:px-3 file:py-2 file:bg-sol/10 file:text-sol file:border-0 file:rounded file:font-bold"
          />
          {arquivo && (
            <p className="text-[10px] text-white/60 mt-2">
              📎 {arquivo.name} · {(arquivo.size / 1024).toFixed(0)} KB
            </p>
          )}

          <button
            type="button"
            onClick={analisarArquivo}
            disabled={!arquivo || analisando}
            className="mt-3 w-full px-4 py-2.5 bg-weg-azul/20 border border-weg-azul/40 text-weg-azul font-bold rounded-lg hover:bg-weg-azul/30 disabled:opacity-40"
          >
            {analisando ? '🧑‍🔧 Mestre da Elétrica analisando...' : '🧑‍🔧 Analisar com Mestre da Elétrica'}
          </button>
        </section>
      )}

      {/* Análise IA */}
      {analiseIA && (
        <section className="p-5 bg-verde/5 border border-verde/30 rounded-xl">
          <h2 className="text-xs uppercase tracking-wider font-bold text-verde mb-3">
            🧑‍🔧 Análise do Mestre da Elétrica
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KPI label="Demanda média" valor={analiseIA.demanda_media_kw} unit="kW" />
            <KPI label="Demanda pico" valor={analiseIA.demanda_pico_kw} unit="kW" />
            <KPI label="Carga crítica" valor={analiseIA.demanda_carga_critica_kw_sugerida} unit="kW" destaque />
            <KPI label="Autonomia" valor={analiseIA.autonomia_horas_sugerida} unit="h" destaque />
          </div>

          {analiseIA.perfil_uso && (
            <p className="text-xs text-white/80 mb-1">
              <strong className="text-verde">Perfil:</strong> {analiseIA.perfil_uso}
              {analiseIA.picos_horarios && ` · Picos: ${analiseIA.picos_horarios}`}
            </p>
          )}

          {analiseIA.resumo && (
            <p className="text-xs text-white/70 mt-2 italic">💬 {analiseIA.resumo}</p>
          )}

          {analiseIA.pontos_criticos && analiseIA.pontos_criticos.length > 0 && (
            <div className="mt-3 space-y-1">
              {analiseIA.pontos_criticos.map((p, i) => (
                <div
                  key={i}
                  className={`text-xs p-2 rounded border ${
                    p.severidade === 'critico' ? 'bg-coral/10 border-coral/30 text-coral'
                      : p.severidade === 'alerta' ? 'bg-sol/10 border-sol/30 text-sol'
                      : 'bg-white/5 border-white/10 text-white/70'
                  }`}
                >
                  <strong>{p.titulo}:</strong> {p.detalhe}
                </div>
              ))}
            </div>
          )}

          {analiseIA.recomendacao && (
            <div className="mt-3 p-3 bg-verde/10 border-l-4 border-verde rounded text-xs text-white/90">
              <strong className="text-verde">Recomendação:</strong> {analiseIA.recomendacao}
            </div>
          )}
        </section>
      )}

      {/* ══════════════ ETAPA 3: ajustes ══════════════ */}
      <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
        <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
          3. Ajuste demanda crítica + autonomia
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NumInput
            label="Carga crítica de backup (kW)"
            valor={cargaCriticaKw}
            onChange={setCargaCriticaKw}
            step={0.5}
            min={0.5}
          />
          <NumInput
            label="Autonomia desejada (horas)"
            valor={autonomiaHoras}
            onChange={setAutonomiaHoras}
            step={0.5}
            min={0.5}
          />
        </div>

        {/* Composição da carga crítica */}
        <div className="mt-5 p-4 bg-noite/40 border border-white/10 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase font-bold text-white/70">
              Composição da carga crítica
            </p>
            <span className={`text-[10px] font-bold ${cargaValida ? 'text-verde' : 'text-coral'}`}>
              Total: {somaCarga.toFixed(0)}% {cargaValida ? '✓' : '(deve somar 100%)'}
            </span>
          </div>
          <p className="text-[10px] text-white/40 mb-3">
            Divide a carga crítica pela natureza — impacta o dimensionamento do inversor.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SliderCarga
              label="⚡ Indutiva"
              desc="Motores, ar cond, geladeira (pico partida 3-5×)"
              valor={percIndutiva}
              onChange={setPercIndutiva}
              cor="text-sol"
            />
            <SliderCarga
              label="🔥 Resistiva"
              desc="Chuveiro, incandescente, forno (linear)"
              valor={percResistiva}
              onChange={setPercResistiva}
              cor="text-verde"
            />
            <SliderCarga
              label="💻 Capacitiva"
              desc="Eletrônicos, LED, TV (harmônicos)"
              valor={percCapacitiva}
              onChange={setPercCapacitiva}
              cor="text-weg-azul"
            />
          </div>
        </div>

        {/* Grupo tarifário */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setGrupoTarifa('B'); setUsarPeakShaving(false) }}
            className={`p-3 rounded border text-left ${
              grupoTarifa === 'B' ? 'bg-sol/10 border-sol/40' : 'bg-white/[0.02] border-white/10'
            }`}
          >
            <p className="text-sm font-bold text-white">Grupo B</p>
            <p className="text-[10px] text-white/50">Residencial/comercial baixa tensão (padrão)</p>
          </button>
          <button
            type="button"
            onClick={() => setGrupoTarifa('A')}
            className={`p-3 rounded border text-left ${
              grupoTarifa === 'A' ? 'bg-sol/10 border-sol/40' : 'bg-white/[0.02] border-white/10'
            }`}
          >
            <p className="text-sm font-bold text-white">Grupo A</p>
            <p className="text-[10px] text-white/50">Comercial/industrial alta tensão · horário de ponta</p>
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {grupoTarifa === 'A' && (
            <Toggle
              checked={usarPeakShaving} onChange={setUsarPeakShaving}
              label="⚡ Peak shaving em horário de ponta"
              desc="Grupo A: bateria despacha no horário caro (18h-21h) pra reduzir demanda medida"
            />
          )}
          <Toggle
            checked={usarComplementacao} onChange={setUsarComplementacao}
            label="🔋 Complementação de demanda"
            desc="Bateria complementa quando geração solar não é suficiente pra carga"
          />
          <Toggle
            checked={preferirBat10} onChange={setPreferirBat10}
            label="🔋 Preferir baterias 10kWh (SBW CB100)"
            desc="Menos módulos, mais capacidade. Regra: TODAS iguais (5kWh OU 10kWh)."
          />
        </div>
      </section>

      {/* ══════════════ RESULTADO ══════════════ */}
      {dimensionamento && (
        <section className="p-5 bg-verde/10 border border-verde/40 rounded-xl">
          <h2 className="text-xs uppercase tracking-wider font-bold text-verde mb-3">
            ✓ Composição sugerida
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="p-3 bg-noite/40 rounded">
              <p className="text-[10px] uppercase text-white/50 mb-1">Inversor</p>
              <p className="text-sm font-bold text-white">{dimensionamento.qtdInversores}× {dimensionamento.inversor.modelo}</p>
              <p className="text-[10px] text-white/60">{dimensionamento.potenciaInversorTotalKw}kW total</p>
              {dimensionamento.usaParalelismo && (
                <p className="text-[10px] text-sol mt-1">⚡ Paralelismo ativo</p>
              )}
            </div>
            <div className="p-3 bg-noite/40 rounded">
              <p className="text-[10px] uppercase text-white/50 mb-1">Baterias</p>
              <p className="text-sm font-bold text-white">{dimensionamento.qtdBaterias}× {dimensionamento.bateria.modelo}</p>
              <p className="text-[10px] text-white/60">{dimensionamento.capacidadeBateriaTotalKwh}kWh total</p>
              <p className="text-[10px] text-verde mt-1">
                🕐 Autonomia real: <strong>{dimensionamento.autonomiaRealHoras.toFixed(1)}h</strong>
              </p>
            </div>
          </div>

          <p className="text-xs text-white/80 mb-2 font-bold">Componentes obrigatórios/adicionais:</p>
          <ul className="text-xs text-white/70 space-y-1 mb-3 ml-4">
            <li>• <strong>1×</strong> {MULTIMEDIDOR_WEG.modelo} <span className="text-[10px] text-white/50">(obrigatório)</span></li>
            {dimensionamento.qtdCaixasJuncao > 0 && (
              <li>• <strong>{dimensionamento.qtdCaixasJuncao}×</strong> {CAIXA_JUNCAO_WEG.modelo}</li>
            )}
            {dimensionamento.usaControladorParalelismo && (
              <li>• <strong>1×</strong> {CONTROLADOR_PARALELISMO_WEG.modelo}</li>
            )}
          </ul>

          {dimensionamento.alertas.length > 0 && (
            <div className="mt-3 space-y-1">
              {dimensionamento.alertas.map((a, i) => (
                <p key={i} className="text-[10px] text-sol">⚠️ {a}</p>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ══════════════ LISTA CA HÍBRIDA (materiais adicionais) ══════════════ */}
      {dimensionamento && (() => {
        const itensCaHibrida = gerarItensListaCaHibrida(dimensionamento)
        return (
          <section className="p-5 bg-weg-azul/5 border border-weg-azul/30 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xs uppercase tracking-wider font-bold text-weg-azul">
                  🧰 Materiais CA adicionais (BESS)
                </h2>
                <p className="text-[10px] text-white/50 mt-0.5">
                  {resumoListaCaHibrida(itensCaHibrida)} · salvos automaticamente ao confirmar
                </p>
              </div>
              <span className="text-2xl">📦</span>
            </div>

            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {itensCaHibrida.map((item, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-noite/40 rounded text-xs">
                  <span className="text-[10px] text-white/40 flex-shrink-0 w-6 pt-0.5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white truncate">{item.descricao}</p>
                    {item.observacao && (
                      <p className="text-[10px] text-white/50 italic">💡 {item.observacao}</p>
                    )}
                  </div>
                  <span className="text-sol font-bold flex-shrink-0 text-xs">
                    {item.qtd} {item.unidade}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[10px] text-white/40 italic">
              Esses itens serão adicionados à lista CA do projeto (separados da lista on-grid).
              Você pode editar/remover na página "Lista CA" antes de gerar o orçamento.
            </p>
          </section>
        )
      })()}

      {/* ══════════════ IMPACTO VISUAL ══════════════ */}
      {dimensionamento && (
        <section className="p-5 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
                📊 Impacto visual do sistema
              </h2>
              <p className="text-[10px] text-white/50 mt-0.5">
                Ajuda a mostrar pro cliente o antes/depois — vai pra proposta
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <NumInput
              label="Consumo mensal do cliente (kWh)"
              valor={consumoMensalKwh}
              onChange={setConsumoMensalKwh}
              min={0}
              step={50}
            />
            <NumInput
              label="Geração solar estimada (kWh/mês)"
              valor={geracaoMensalKwh}
              onChange={setGeracaoMensalKwh}
              min={0}
              step={50}
            />
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1">
                Perfil de uso
              </label>
              <select
                value={perfilCliente}
                onChange={(e) => setPerfilCliente(e.target.value as PerfilCliente)}
                className="w-full px-3 py-2 bg-noite border border-white/20 rounded text-white text-sm"
              >
                <option value="residencial">🏠 Residencial (picos manhã + noite)</option>
                <option value="comercial">🏢 Comercial (8h-18h)</option>
                <option value="industrial">🏭 Industrial (24h)</option>
              </select>
            </div>
          </div>

          <GraficoImpactoHibrido
            perfil={perfilCliente}
            consumoMensalKwh={consumoMensalKwh}
            geracaoMensalEstimadaKwh={geracaoMensalKwh}
            capacidadeBateriaKwh={dimensionamento.capacidadeBateriaTotalKwh}
            cargaCriticaKw={cargaCriticaKw}
            autonomiaHoras={dimensionamento.autonomiaRealHoras}
            usarPeakShaving={usarPeakShaving}
          />
        </section>
      )}

      {erro && (
        <div className="p-3 bg-coral/10 border border-coral/30 rounded text-sm text-coral">
          ⚠️ {erro}
        </div>
      )}

      <button
        onClick={confirmar}
        disabled={!dimensionamento || isPending}
        className="w-full px-4 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40"
      >
        {isPending ? 'Salvando...' : 'Confirmar dimensionamento → Voltar ao projeto'}
      </button>
    </div>
  )
}

function MetodoBtn({ atual, onChange, valor, emoji, label, desc }: {
  atual: Metodo; onChange: (v: Metodo) => void; valor: Metodo; emoji: string; label: string; desc: string
}) {
  const sel = atual === valor
  return (
    <button
      type="button"
      onClick={() => onChange(valor)}
      className={`p-3 rounded-lg border text-left transition ${
        sel ? 'bg-sol/10 border-sol/40' : 'bg-white/[0.02] border-white/10 hover:bg-white/5'
      }`}
    >
      <div className="text-2xl mb-1">{emoji}</div>
      <p className={`text-sm font-bold ${sel ? 'text-sol' : 'text-white/80'}`}>{label}</p>
      <p className="text-[10px] text-white/50 mt-1">{desc}</p>
    </button>
  )
}

function KPI({ label, valor, unit, destaque }: { label: string; valor?: number; unit: string; destaque?: boolean }) {
  return (
    <div className={`p-3 rounded ${destaque ? 'bg-verde/10 border border-verde/30' : 'bg-noite/40'}`}>
      <p className="text-[9px] uppercase text-white/50">{label}</p>
      <p className={`text-lg font-black ${destaque ? 'text-verde' : 'text-white'}`}>
        {valor !== undefined ? valor.toFixed(1) : '—'}<span className="text-[10px] font-normal ml-1">{unit}</span>
      </p>
    </div>
  )
}

function NumInput({ label, valor, onChange, step, min }: {
  label: string; valor: number; onChange: (n: number) => void; step: number; min: number
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-white/50 font-bold block mb-1">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={valor}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
      />
    </label>
  )
}

function SliderCarga({ label, desc, valor, onChange, cor }: {
  label: string; desc: string; valor: number; onChange: (n: number) => void; cor: string
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className={`text-xs font-bold ${cor}`}>{label}</span>
        <span className={`text-lg font-black ${cor}`}>{valor.toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={valor}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full accent-sol"
      />
      <p className="text-[9px] text-white/40 mt-1">{desc}</p>
    </div>
  )
}

function Toggle({ checked, onChange, label, desc }: {
  checked: boolean; onChange: (b: boolean) => void; label: string; desc: string
}) {
  return (
    <label className="flex items-start gap-3 p-2 rounded hover:bg-white/[0.02] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <div>
        <p className="text-sm text-white font-bold">{label}</p>
        <p className="text-[10px] text-white/50">{desc}</p>
      </div>
    </label>
  )
}
