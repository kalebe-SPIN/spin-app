'use client'

/**
 * Levantamento por listagem — método menos preciso pra dimensionar híbrido.
 * O consultor no site do cliente seleciona equipamento por equipamento
 * e o sistema calcula potência total, composição de carga e sugere carga crítica.
 *
 * Ao final o consultor pode consultar o Mestre da Elétrica (Claude Sonnet 4.5)
 * pra receber considerações sobre fatores de simultaneidade, picos de partida
 * e priorização de backup.
 */

import { useState, useMemo } from 'react'
import {
  EQUIPAMENTOS,
  calcularResumoLevantamento,
  type CategoriaEquipamento,
  type ItemLevantamento,
  type ResumoLevantamento,
  type Equipamento,
} from '@/lib/hibrido/catalogo-equipamentos'

export type MestreConsideracoes = {
  potenciaEfetivaSugeridaKw: number
  cargaCriticaSugeridaKw: number
  autonomiaSugeridaHoras: number
  composicao: { indutiva: number; resistiva: number; capacitiva: number }
  fatorSimultaneidade: number
  observacoes: string[]
  alertaPicoPartida?: string
  resumoTexto: string
}

export function LevantamentoListagem({
  onCalculado,
  onSalvar,
}: {
  onCalculado?: (resumo: ResumoLevantamento, mestre?: MestreConsideracoes) => void
  onSalvar?: (resumo: ResumoLevantamento, mestre: MestreConsideracoes) => Promise<void>
}) {
  const [categoria, setCategoria] = useState<CategoriaEquipamento | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<ItemLevantamento[]>([])

  // Chat com o Mestre da Elétrica
  const [consultandoMestre, setConsultandoMestre] = useState(false)
  const [respostaMestre, setRespostaMestre] = useState<MestreConsideracoes | null>(null)
  const [erroMestre, setErroMestre] = useState<string | null>(null)
  const [perguntaLivre, setPerguntaLivre] = useState('')
  const [conversa, setConversa] = useState<{ quem: 'consultor' | 'mestre'; texto: string }[]>([])
  const [enviandoPergunta, setEnviandoPergunta] = useState(false)

  const equipamentosFiltrados = useMemo(() => {
    const busca_ = busca.toLowerCase().trim()
    return EQUIPAMENTOS.filter((e) => {
      if (categoria !== 'todos' && !e.categoria.includes(categoria as CategoriaEquipamento)) return false
      if (busca_ && !e.nome.toLowerCase().includes(busca_)) return false
      return true
    })
  }, [categoria, busca])

  const resumo = useMemo(() => calcularResumoLevantamento(itens), [itens])

  function adicionar(eq: Equipamento) {
    setItens((prev) => {
      const existente = prev.find((i) => i.equipamentoId === eq.id)
      if (existente) {
        return prev.map((i) =>
          i.equipamentoId === eq.id
            ? { ...i, quantidade: i.quantidade + 1 }
            : i,
        )
      }
      return [...prev, {
        equipamentoId: eq.id,
        quantidade: 1,
        horasUsoDia: 4,
        ehCargaCritica: eq.prioridadeBackup === 'essencial',
      }]
    })
  }

  function atualizarQtd(equipamentoId: string, delta: number) {
    setItens((prev) =>
      prev.map((i) =>
        i.equipamentoId === equipamentoId
          ? { ...i, quantidade: Math.max(0, i.quantidade + delta) }
          : i,
      ).filter((i) => i.quantidade > 0),
    )
  }

  function atualizarHoras(equipamentoId: string, horas: number) {
    setItens((prev) =>
      prev.map((i) => i.equipamentoId === equipamentoId ? { ...i, horasUsoDia: horas } : i),
    )
  }

  function toggleCritico(equipamentoId: string) {
    setItens((prev) =>
      prev.map((i) => i.equipamentoId === equipamentoId ? { ...i, ehCargaCritica: !i.ehCargaCritica } : i),
    )
  }

  async function consultarMestre() {
    setConsultandoMestre(true)
    setErroMestre(null)
    try {
      const resp = await fetch('/api/hibrido/consultar-mestre-eletrica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: resumo.itens.map((i) => ({
            nome: i.equipamento.nome,
            potenciaW: i.equipamento.potenciaW,
            tipoCarga: i.equipamento.tipoCarga,
            quantidade: i.quantidade,
            horasUsoDia: i.horasUsoDia,
            ehCargaCritica: i.ehCargaCritica,
          })),
          resumo: {
            potenciaInstaladaW: resumo.potenciaInstaladaW,
            potenciaCargaCriticaW: resumo.potenciaCargaCriticaW,
            percIndutiva: resumo.percIndutiva,
            percResistiva: resumo.percResistiva,
            percCapacitiva: resumo.percCapacitiva,
            consumoEstimadoMensalKwh: resumo.consumoEstimadoMensalKwh,
          },
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Erro na consulta')
      setRespostaMestre(data.consideracoes)
      setConversa([{ quem: 'mestre', texto: data.consideracoes.resumoTexto }])
      onCalculado?.(resumo, data.consideracoes)
      // Salva no Supabase (não bloqueia UI)
      if (onSalvar) {
        onSalvar(resumo, data.consideracoes).catch((err) => console.error('[levantamento] salvar:', err))
      }
    } catch (e: any) {
      setErroMestre(e.message)
    } finally {
      setConsultandoMestre(false)
    }
  }

  async function enviarPergunta() {
    if (!perguntaLivre.trim() || !respostaMestre) return
    const pergunta = perguntaLivre.trim()
    setPerguntaLivre('')
    setConversa((c) => [...c, { quem: 'consultor', texto: pergunta }])
    setEnviandoPergunta(true)
    try {
      const resp = await fetch('/api/hibrido/consultar-mestre-eletrica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: 'chat',
          pergunta,
          contextoResumo: respostaMestre,
          conversa,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Erro no chat')
      setConversa((c) => [...c, { quem: 'mestre', texto: data.resposta }])
    } catch (e: any) {
      setConversa((c) => [...c, { quem: 'mestre', texto: `⚠️ ${e.message}` }])
    } finally {
      setEnviandoPergunta(false)
    }
  }

  const potenciaKw = resumo.potenciaInstaladaW / 1000
  const potenciaCriticaKw = resumo.potenciaCargaCriticaW / 1000

  return (
    <div className="space-y-4">
      {/* Filtros de categoria */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['todos', 'residencial', 'comercial', 'industrial'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoria(cat)}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition ${
              categoria === cat
                ? 'bg-sol text-noite'
                : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
            }`}
          >
            {cat === 'todos' && '🌐 Todos'}
            {cat === 'residencial' && '🏠 Residencial'}
            {cat === 'comercial' && '🏢 Comercial'}
            {cat === 'industrial' && '🏭 Industrial'}
          </button>
        ))}
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar equipamento..."
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-noite border border-white/20 rounded text-white text-sm placeholder:text-white/40"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* CATÁLOGO — 2/3 */}
        <div className="lg:col-span-2 space-y-1 max-h-[500px] overflow-y-auto p-2 bg-noite/40 border border-white/10 rounded-lg">
          <p className="text-[10px] uppercase font-bold text-white/50 mb-2 px-1">
            {equipamentosFiltrados.length} equipamento{equipamentosFiltrados.length !== 1 && 's'} disponíve{equipamentosFiltrados.length !== 1 ? 'is' : 'l'}
          </p>
          {equipamentosFiltrados.map((eq) => {
            const jaSelecionado = itens.find((i) => i.equipamentoId === eq.id)
            return (
              <button
                key={eq.id}
                type="button"
                onClick={() => adicionar(eq)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition ${
                  jaSelecionado
                    ? 'bg-verde/10 border border-verde/30 hover:bg-verde/20'
                    : 'bg-white/[0.02] hover:bg-white/[0.06] border border-transparent'
                }`}
              >
                <span className="text-lg flex-shrink-0">{eq.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{eq.nome}</p>
                  <p className="text-[9px] text-white/50">
                    {eq.potenciaW}W · <span className={
                      eq.tipoCarga === 'indutiva' ? 'text-sol' :
                      eq.tipoCarga === 'resistiva' ? 'text-verde' : 'text-weg-azul'
                    }>{eq.tipoCarga}</span>
                    {eq.prioridadeBackup === 'essencial' && ' · ⭐ essencial'}
                  </p>
                </div>
                {jaSelecionado && (
                  <span className="text-xs font-bold text-verde px-2 py-0.5 bg-verde/20 rounded">
                    ×{jaSelecionado.quantidade}
                  </span>
                )}
                <span className="text-xs text-white/40 flex-shrink-0">+</span>
              </button>
            )
          })}
        </div>

        {/* CARRINHO — 1/3 */}
        <div className="space-y-3">
          <div className="p-3 bg-sol/10 border border-sol/30 rounded-lg">
            <p className="text-[10px] uppercase font-bold text-sol mb-1">Total instalado</p>
            <p className="text-2xl font-black text-white">{potenciaKw.toFixed(2)} <span className="text-sm text-white/50">kW</span></p>
            <p className="text-[10px] text-white/60 mt-0.5">{resumo.totalItens} equipamento{resumo.totalItens !== 1 && 's'}</p>
          </div>

          <div className="p-3 bg-coral/10 border border-coral/30 rounded-lg">
            <p className="text-[10px] uppercase font-bold text-coral mb-1">Carga crítica (backup)</p>
            <p className="text-xl font-black text-white">{potenciaCriticaKw.toFixed(2)} <span className="text-sm text-white/50">kW</span></p>
            <p className="text-[10px] text-white/50 mt-0.5">só itens marcados ⭐</p>
          </div>

          {/* Composição */}
          {resumo.potenciaInstaladaW > 0 && (
            <div className="p-3 bg-noite/60 border border-white/10 rounded-lg">
              <p className="text-[10px] uppercase font-bold text-white/60 mb-2">Composição da carga</p>
              <BarraCarga cor="bg-sol" label="Indutiva" perc={resumo.percIndutiva} />
              <BarraCarga cor="bg-verde" label="Resistiva" perc={resumo.percResistiva} />
              <BarraCarga cor="bg-weg-azul" label="Capacitiva" perc={resumo.percCapacitiva} />
            </div>
          )}

          {resumo.consumoEstimadoMensalKwh > 0 && (
            <div className="p-3 bg-white/[0.03] border border-white/10 rounded">
              <p className="text-[10px] uppercase text-white/50">Consumo estimado</p>
              <p className="text-lg font-black text-white">{resumo.consumoEstimadoMensalKwh.toFixed(0)} kWh/mês</p>
            </div>
          )}
        </div>
      </div>

      {/* Lista de selecionados com quantidade + horas + critico */}
      {resumo.itens.length > 0 && (
        <div className="p-4 bg-noite/40 border border-white/10 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase font-bold text-white/70">
              🛒 Itens selecionados ({resumo.totalItens})
            </p>
            <button
              type="button"
              onClick={() => setItens([])}
              className="text-[10px] text-coral hover:text-coral/80"
            >
              Limpar tudo
            </button>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {resumo.itens.map((i) => (
              <div key={i.equipamentoId} className="flex items-center gap-2 p-2 bg-white/[0.03] rounded">
                <span className="text-lg flex-shrink-0">{i.equipamento.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{i.equipamento.nome}</p>
                  <p className="text-[9px] text-white/50">
                    {i.equipamento.potenciaW}W × {i.quantidade} = <strong className="text-sol">{(i.potenciaTotalW/1000).toFixed(2)}kW</strong>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => atualizarQtd(i.equipamentoId, -1)}
                    className="w-6 h-6 flex items-center justify-center bg-white/10 rounded text-sm hover:bg-white/20">−</button>
                  <span className="w-8 text-center text-sm font-bold text-white">{i.quantidade}</span>
                  <button type="button" onClick={() => atualizarQtd(i.equipamentoId, 1)}
                    className="w-6 h-6 flex items-center justify-center bg-white/10 rounded text-sm hover:bg-white/20">+</button>
                </div>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={24}
                  value={i.horasUsoDia || 0}
                  onChange={(e) => atualizarHoras(i.equipamentoId, parseFloat(e.target.value) || 0)}
                  className="w-14 px-1 py-0.5 bg-white/5 border border-white/10 rounded text-xs text-white text-center"
                  title="Horas de uso por dia"
                />
                <span className="text-[9px] text-white/40 hidden md:inline">h/dia</span>
                <button
                  type="button"
                  onClick={() => toggleCritico(i.equipamentoId)}
                  className={`px-2 py-1 rounded text-[9px] font-bold ${
                    i.ehCargaCritica
                      ? 'bg-coral/20 border border-coral/40 text-coral'
                      : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/70'
                  }`}
                  title="Marcar como carga crítica (backup)"
                >
                  {i.ehCargaCritica ? '⭐ Backup' : 'Add backup'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botão consultar Mestre da Elétrica */}
      {resumo.totalItens > 0 && (
        <div className="space-y-3">
          {!respostaMestre && (
            <button
              type="button"
              onClick={consultarMestre}
              disabled={consultandoMestre}
              className="w-full px-4 py-3 bg-gradient-to-r from-weg-azul to-verde text-white font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {consultandoMestre ? '🧙‍♂️ Consultando Mestre da Elétrica...' : '🧙‍♂️ Consultar Mestre da Elétrica'}
            </button>
          )}

          {erroMestre && (
            <div className="p-3 bg-coral/10 border border-coral/30 rounded text-sm text-coral">
              ⚠️ {erroMestre}
            </div>
          )}

          {/* Resultado do Mestre */}
          {respostaMestre && (
            <div className="p-5 bg-gradient-to-br from-weg-azul/10 to-verde/10 border border-verde/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🧙‍♂️</span>
                <div>
                  <h3 className="text-sm font-bold text-white">Mestre da Elétrica</h3>
                  <p className="text-[10px] text-white/50">Análise técnica do levantamento</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 bg-noite/40 rounded text-center">
                  <p className="text-[9px] uppercase text-white/50">Potência efetiva</p>
                  <p className="text-lg font-black text-sol">{respostaMestre.potenciaEfetivaSugeridaKw.toFixed(1)} kW</p>
                  <p className="text-[9px] text-white/40">fator {(respostaMestre.fatorSimultaneidade * 100).toFixed(0)}%</p>
                </div>
                <div className="p-2 bg-noite/40 rounded text-center">
                  <p className="text-[9px] uppercase text-white/50">Carga crítica</p>
                  <p className="text-lg font-black text-coral">{respostaMestre.cargaCriticaSugeridaKw.toFixed(1)} kW</p>
                </div>
                <div className="p-2 bg-noite/40 rounded text-center">
                  <p className="text-[9px] uppercase text-white/50">Autonomia sugerida</p>
                  <p className="text-lg font-black text-verde">{respostaMestre.autonomiaSugeridaHoras.toFixed(1)}h</p>
                </div>
              </div>

              {respostaMestre.alertaPicoPartida && (
                <div className="p-2 bg-sol/10 border border-sol/30 rounded">
                  <p className="text-[11px] text-sol">⚡ {respostaMestre.alertaPicoPartida}</p>
                </div>
              )}

              {respostaMestre.observacoes.length > 0 && (
                <div className="p-3 bg-noite/40 rounded">
                  <p className="text-[10px] uppercase font-bold text-white/60 mb-2">Considerações</p>
                  <ul className="space-y-1.5">
                    {respostaMestre.observacoes.map((obs, i) => (
                      <li key={i} className="text-xs text-white/80 leading-relaxed">
                        <span className="text-verde">→</span> {obs}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Chat pra continuar conversa */}
              <div className="mt-4 pt-3 border-t border-white/10">
                <p className="text-[10px] uppercase font-bold text-white/60 mb-2">💬 Conversar com o Mestre</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto mb-3">
                  {conversa.map((msg, i) => (
                    <div key={i} className={msg.quem === 'consultor' ? 'text-right' : ''}>
                      <div className={`inline-block max-w-[85%] p-2 rounded text-xs ${
                        msg.quem === 'consultor'
                          ? 'bg-sol/20 border border-sol/30 text-white'
                          : 'bg-noite/60 border border-white/10 text-white/80'
                      }`}>
                        <p className="text-[9px] uppercase font-bold mb-1 opacity-70">
                          {msg.quem === 'consultor' ? '👤 Você' : '🧙‍♂️ Mestre'}
                        </p>
                        <p className="whitespace-pre-wrap">{msg.texto}</p>
                      </div>
                    </div>
                  ))}
                  {enviandoPergunta && (
                    <p className="text-[10px] text-white/40 italic">🧙‍♂️ Mestre pensando...</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={perguntaLivre}
                    onChange={(e) => setPerguntaLivre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && enviarPergunta()}
                    placeholder="Pergunte algo ao Mestre..."
                    disabled={enviandoPergunta}
                    className="flex-1 px-3 py-2 bg-noite border border-white/20 rounded text-white text-sm placeholder:text-white/40"
                  />
                  <button
                    type="button"
                    onClick={enviarPergunta}
                    disabled={enviandoPergunta || !perguntaLivre.trim()}
                    className="px-4 py-2 bg-verde text-noite font-bold rounded hover:bg-verde/90 disabled:opacity-40 text-sm"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BarraCarga({ cor, label, perc }: { cor: string; label: string; perc: number }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-white/70">{label}</span>
        <span className="text-white font-bold">{perc.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded overflow-hidden">
        <div className={`h-full ${cor} rounded transition-all`} style={{ width: `${perc}%` }} />
      </div>
    </div>
  )
}
