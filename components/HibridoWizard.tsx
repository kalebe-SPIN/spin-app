'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  dimensionarSistemaHibrido,
  dimensionarHibridoDireto,
  type SaidaDimensionamentoHibrido,
} from '@/lib/hibrido/dimensionamento'
import {
  MULTIMEDIDOR_WEG,
  CAIXA_JUNCAO_WEG,
  CONTROLADOR_PARALELISMO_WEG,
} from '@/lib/hibrido/catalogo-weg'
import { salvarDimensionamentoHibridoAction, salvarLevantamentoListagemAction } from '@/app/projetos/[id]/hibrido/actions'
import { GraficoImpactoHibrido } from '@/components/GraficoImpactoHibrido'
import type { PerfilCliente } from '@/lib/hibrido/perfil-consumo'
import { LevantamentoListagem, type MestreConsideracoes } from '@/components/LevantamentoListagem'
import { gerarItensListaCaHibrida, resumoListaCaHibrida } from '@/lib/hibrido/lista-ca-hibrida'
import type { ItemKit } from '@/lib/kit-auto/montar-kit'

type Metodo = 'memoria_massa' | 'analise_rede_medido' | 'analisador_segregado_cc' | 'levantamento_listagem' | 'kit_direto_espelho'

/**
 * Matriz de cobertura: cada método entrega SOME das 3 grandezas
 * (consumo mensal, demanda pico, carga crítica). O consultor precisa saber
 * o que ficou faltando pra buscar em outra fonte (ex: fatura CELESC).
 */
const COBERTURA_METODO: Record<Metodo, {
  consumo: boolean
  pico: boolean
  cargaCritica: boolean
  precisao: 'alta' | 'media' | 'baixa'
  complemento: string
}> = {
  memoria_massa: {
    consumo: true, pico: true, cargaCritica: false, precisao: 'alta',
    complemento: 'Falta CARGA CRÍTICA — usar listagem ou instalar analisador segregado',
  },
  analise_rede_medido: {
    consumo: false, pico: true, cargaCritica: false, precisao: 'alta',
    complemento: 'Analisador no ramal principal. Falta CONSUMO (fatura) + CARGA CRÍTICA (listagem/analisador CC)',
  },
  analisador_segregado_cc: {
    consumo: false, pico: false, cargaCritica: true, precisao: 'alta',
    complemento: 'Analisador SÓ na carga crítica segregada. Falta CONSUMO (fatura) + POTÊNCIA PICO (memória de massa)',
  },
  levantamento_listagem: {
    consumo: false, pico: false, cargaCritica: true, precisao: 'baixa',
    complemento: 'Estimativa somando equipamentos. Falta CONSUMO (fatura) + POTÊNCIA PICO (estimar)',
  },
  kit_direto_espelho: {
    consumo: false, pico: false, cargaCritica: false, precisao: 'media',
    complemento: 'Modo espelho: você informa Pcc + Pca + kWh e o sistema monta o kit direto',
  },
}

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
  // Composição da carga crítica (soma sempre = 100% via ajusteProporcional)
  const [percIndutiva, setPercIndutiva] = useState<number>(20)
  const [percResistiva, setPercResistiva] = useState<number>(60)
  const [percCapacitiva, setPercCapacitiva] = useState<number>(20)
  // Origem dos valores da composição (importante pra rastreabilidade)
  const [origemComposicao, setOrigemComposicao] = useState<'manual' | 'listagem' | 'analisador' | 'mestre_ia'>('manual')
  const [grupoTarifa, setGrupoTarifa] = useState<'A' | 'B'>('B')

  /**
   * Ajusta um dos 3 percentuais mantendo soma = 100.
   * Os outros 2 se compensam proporcionalmente ao valor atual deles.
   * Se ambos = 0, distribui o resto 50/50.
   */
  function ajustarComposicao(qual: 'ind' | 'res' | 'cap', novoValor: number) {
    setOrigemComposicao('manual') // ao mexer manualmente, sai do modo auto
    const v = Math.max(0, Math.min(100, novoValor))
    const atual = { ind: percIndutiva, res: percResistiva, cap: percCapacitiva }
    atual[qual] = v
    const resto = 100 - v
    // Descobre os outros 2
    const outros = qual === 'ind' ? ['res', 'cap'] : qual === 'res' ? ['ind', 'cap'] : ['ind', 'res']
    const k1 = outros[0] as 'ind' | 'res' | 'cap'
    const k2 = outros[1] as 'ind' | 'res' | 'cap'
    const soma = atual[k1] + atual[k2]
    if (soma === 0) {
      // Distribui 50/50
      atual[k1] = resto / 2
      atual[k2] = resto / 2
    } else {
      // Proporcional
      atual[k1] = (atual[k1] / soma) * resto
      atual[k2] = (atual[k2] / soma) * resto
    }
    setPercIndutiva(Math.round(atual.ind))
    setPercResistiva(Math.round(atual.res))
    setPercCapacitiva(Math.round(atual.cap))
  }
  // Dados p/ visualização de impacto (opcionais)
  const [consumoMensalKwh, setConsumoMensalKwh] = useState<number>(600)
  const [geracaoMensalKwh, setGeracaoMensalKwh] = useState<number>(500)
  const [perfilCliente, setPerfilCliente] = useState<PerfilCliente>('residencial')

  // Modo espelho concorrente (entrada direta de Pcc/Pca/CapKwh)
  const [espPcc, setEspPcc] = useState<number>(8)          // kWp
  const [espPca, setEspPca] = useState<number>(6)          // kW
  const [espCapKwh, setEspCapKwh] = useState<number>(20)   // kWh

  // Lista CA híbrida editável — null = usar padrão gerado do dimensionamento
  const [listaCaEditada, setListaCaEditada] = useState<ItemKit[] | null>(null)

  // Estratégia de despacho + backup (usada pelo gráfico de energia)
  const [percDespachoMax, setPercDespachoMax] = useState<number>(50)
  const [percBackupReservado, setPercBackupReservado] = useState<number>(20)
  const [horaSimularQueda, setHoraSimularQueda] = useState<number>(18)

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
    // Modo espelho concorrente — 3 valores diretos
    if (metodo === 'kit_direto_espelho') {
      if (espPcc <= 0 || espPca <= 0 || espCapKwh <= 0) return null
      return dimensionarHibridoDireto({
        potenciaCcKwpDesejada: espPcc,
        potenciaCaKwDesejada: espPca,
        capacidadeArmazenamentoKwh: espCapKwh,
        tipoLigacao,
        preferirBateria10kwh: preferirBat10,
      })
    }
    // Modo tradicional — 3 grandezas do cliente
    if (cargaCriticaKw <= 0 || autonomiaHoras <= 0 || consumoMensalKwh <= 0) return null
    return dimensionarSistemaHibrido({
      consumoMensalKwh,
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
  }, [metodo, espPcc, espPca, espCapKwh, consumoMensalKwh, cargaCriticaKw, autonomiaHoras, tipoLigacao, percIndutiva, percResistiva, percCapacitiva, usarPeakShaving, usarComplementacao, preferirBat10])

  const somaCarga = percIndutiva + percResistiva + percCapacitiva
  const cargaValida = Math.abs(somaCarga - 100) <= 1

  function confirmar() {
    if (!dimensionamento) return
    setErro(null)
    startTransition(async () => {
      const res = await salvarDimensionamentoHibridoAction(projetoId, itemId || null, dimensionamento, listaCaEditada)
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
        <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-2">
          1. Como você vai definir a demanda do cliente?
        </h2>
        <p className="text-[10px] text-white/50 mb-3">
          Cada método entrega grandezas diferentes. Consumo pode sempre vir da fatura CELESC.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <MetodoBtn
            atual={metodo} onChange={setMetodo} valor="memoria_massa"
            emoji="📊" label="Memória de massa (12 meses)"
            desc="Planilha CELESC com curva de carga (15min/1h). ✓ Consumo · ✓ Pico · ✗ Carga crítica"
          />
          <MetodoBtn
            atual={metodo} onChange={setMetodo} valor="analise_rede_medido"
            emoji="📡" label="Analisador — ramal principal"
            desc="Equipamento de qualidade instalado no QGBT. ✓ Pico · ✗ Consumo · ✗ Carga crítica"
          />
          <MetodoBtn
            atual={metodo} onChange={setMetodo} valor="analisador_segregado_cc"
            emoji="🎯" label="Analisador — segregado na carga crítica"
            desc="Analisador SÓ no ramal da carga crítica (segrega os disjuntores). ✓ Carga crítica medida real"
          />
          <MetodoBtn
            atual={metodo} onChange={setMetodo} valor="levantamento_listagem"
            emoji="📝" label="Levantamento por listagem"
            desc="Somatório de cargas por equipamento. ✓ Carga crítica estimada (menos preciso)"
          />
          <div className="md:col-span-2">
            <MetodoBtn
              atual={metodo} onChange={setMetodo} valor="kit_direto_espelho"
              emoji="🪞" label="Kit direto — espelho de proposta concorrente"
              desc="Você já tem Pcc (kWp) + Pca (kW) + capacidade (kWh). Sistema monta a composição WEG direta, incluindo paralelismo se necessário. Sem análise de demanda."
            />
          </div>
        </div>

        {/* Matriz de cobertura do método escolhido */}
        <div className="mt-4 p-3 bg-noite/40 border border-white/10 rounded-lg">
          <p className="text-[10px] uppercase font-bold text-white/60 mb-2">
            🎯 O que o método <span className="text-sol">{metodo.replace(/_/g, ' ')}</span> te dá:
          </p>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <MatrizCard
              icone="☀️" label="Consumo mensal (kWh)"
              temMetodo={COBERTURA_METODO[metodo].consumo}
              alternativa="Fatura CELESC"
            />
            <MatrizCard
              icone="⚡" label="Pico de potência (kW)"
              temMetodo={COBERTURA_METODO[metodo].pico}
              alternativa="Fatura ou memória de massa"
            />
            <MatrizCard
              icone="🔴" label="Carga crítica (kW)"
              temMetodo={COBERTURA_METODO[metodo].cargaCritica}
              alternativa="Listagem ou analisador segregado"
            />
          </div>
          <p className="text-[10px] text-white/50 italic">
            💡 {COBERTURA_METODO[metodo].complemento}
          </p>
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
                setPercIndutiva(Math.round(mestre.composicao.indutiva))
                setPercResistiva(Math.round(mestre.composicao.resistiva))
                setPercCapacitiva(Math.round(mestre.composicao.capacitiva))
                setOrigemComposicao('listagem') // veio da lista processada pelo Mestre
                if (resumo.consumoEstimadoMensalKwh > 0) {
                  setConsumoMensalKwh(Math.round(resumo.consumoEstimadoMensalKwh))
                }
              }
            }}
            onSalvar={async (resumo, mestre) => {
              await salvarLevantamentoListagemAction({
                projetoId,
                itemId: itemId || null,
                itens: resumo.itens.map((i) => ({
                  nome: i.equipamento.nome,
                  potenciaW: i.equipamento.potenciaW,
                  tipoCarga: i.equipamento.tipoCarga,
                  quantidade: i.quantidade,
                  horasUsoDia: i.horasUsoDia,
                  ehCargaCritica: i.ehCargaCritica,
                })),
                resumoLevantamento: {
                  potenciaInstaladaW: resumo.potenciaInstaladaW,
                  potenciaCargaCriticaW: resumo.potenciaCargaCriticaW,
                  percIndutiva: resumo.percIndutiva,
                  percResistiva: resumo.percResistiva,
                  percCapacitiva: resumo.percCapacitiva,
                  consumoEstimadoMensalKwh: resumo.consumoEstimadoMensalKwh,
                },
                respostaMestre: mestre,
              })
            }}
          />
        </section>
      )}

      {/* ══════════════ ETAPA 2 (planilha): upload/análise ══════════════ */}
      {/* ══════════════ ETAPA 2 (espelho concorrente): 3 inputs diretos ══════════════ */}
      {metodo === 'kit_direto_espelho' && (
        <section className="p-5 bg-weg-azul/5 border border-weg-azul/30 rounded-xl">
          <h2 className="text-xs uppercase tracking-wider font-bold text-weg-azul mb-2">
            2. 🪞 Composição do espelho — 3 valores da proposta concorrente
          </h2>
          <p className="text-[10px] text-white/50 mb-3">
            Consultor informa os 3 valores. Sistema calcula quantos módulos + qual inversor (com paralelismo se necessário) + qual bateria (5kWh ou 10kWh) + componentes obrigatórios.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-noite/40 rounded-lg border border-sol/30">
              <NumInput label="☀️ Potência CC (kWp)" valor={espPcc} onChange={setEspPcc} step={0.55} min={0.5} />
              <p className="text-[9px] text-white/40 mt-1">Módulos FV totais</p>
            </div>
            <div className="p-3 bg-noite/40 rounded-lg border border-weg-azul/30">
              <NumInput label="⚡ Potência CA (kW)" valor={espPca} onChange={setEspPca} step={0.5} min={0.5} />
              <p className="text-[9px] text-white/40 mt-1">Inversor (paralelismo automático)</p>
            </div>
            <div className="p-3 bg-noite/40 rounded-lg border border-coral/30">
              <NumInput label="🔋 Capacidade banco (kWh)" valor={espCapKwh} onChange={setEspCapKwh} step={5} min={5} />
              <p className="text-[9px] text-white/40 mt-1">Baterias SBW (5kWh ou 10kWh)</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[9px] uppercase text-white/50 self-center mr-1">Presets:</span>
            <PresetEspelho label="Residencial 5+8" pcc={5} pca={5} cap={10}
              aplicar={() => { setEspPcc(5); setEspPca(5); setEspCapKwh(10) }} />
            <PresetEspelho label="Residencial 8+15" pcc={8} pca={5} cap={15}
              aplicar={() => { setEspPcc(8); setEspPca(5); setEspCapKwh(15) }} />
            <PresetEspelho label="Comercial 20+40" pcc={20} pca={15} cap={40}
              aplicar={() => { setEspPcc(20); setEspPca(15); setEspCapKwh(40) }} />
            <PresetEspelho label="Comercial 30+60" pcc={30} pca={30} cap={60}
              aplicar={() => { setEspPcc(30); setEspPca(30); setEspCapKwh(60) }} />
          </div>
        </section>
      )}

      {metodo !== 'levantamento_listagem' && metodo !== 'kit_direto_espelho' && (
        <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-2">
            2. {metodo === 'memoria_massa' && 'Anexe a memória de massa (Excel CELESC)'}
            {metodo === 'analise_rede_medido' && 'Anexe o relatório do analisador (ramal principal)'}
            {metodo === 'analisador_segregado_cc' && 'Anexe o relatório do analisador (carga crítica)'}
          </h2>

          {metodo === 'analisador_segregado_cc' && (
            <div className="mb-3 p-3 bg-verde/10 border border-verde/30 rounded text-[11px] text-verde/90">
              🎯 <strong>Método mais preciso pra carga crítica:</strong> analisador instalado
              SOMENTE no ramal da carga crítica (com os disjuntores segregados). Mede
              exatamente o que virará backup — sem estimativas.
            </div>
          )}

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
      {metodo !== 'kit_direto_espelho' && (
      <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
        <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
          3. Grandezas do cliente — 3 dados definem tudo
        </h2>
        <p className="text-[10px] text-white/50 mb-3">
          ☀️ <strong>Consumo</strong> define módulos CC · ⚡ <strong>Carga crítica</strong> define inversor CA ·
          🔋 <strong>Autonomia</strong> define baterias
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 bg-sol/5 border border-sol/20 rounded-lg">
            <NumInput
              label="☀️ Consumo mensal (kWh)"
              valor={consumoMensalKwh}
              onChange={setConsumoMensalKwh}
              step={50}
              min={0}
            />
            <p className="text-[9px] text-white/40 mt-1">
              {COBERTURA_METODO[metodo].consumo
                ? '✓ Extraído da análise'
                : '⚠ Buscar na fatura CELESC (Passo 2 do projeto)'}
            </p>
          </div>
          <div className="p-3 bg-weg-azul/5 border border-weg-azul/20 rounded-lg">
            <NumInput
              label="⚡ Carga crítica (kW)"
              valor={cargaCriticaKw}
              onChange={setCargaCriticaKw}
              step={0.5}
              min={0.5}
            />
            <p className="text-[9px] text-white/40 mt-1">
              {COBERTURA_METODO[metodo].cargaCritica
                ? '✓ Medido/estimado no método'
                : '⚠ Usar listagem ou instalar analisador segregado'}
            </p>
          </div>
          <div className="p-3 bg-coral/5 border border-coral/20 rounded-lg">
            <NumInput
              label="🔋 Autonomia desejada (h)"
              valor={autonomiaHoras}
              onChange={setAutonomiaHoras}
              step={0.5}
              min={0.5}
            />
            <p className="text-[9px] text-white/40 mt-1">Definida com o cliente · típico 2-6h</p>
          </div>
        </div>

        {/* Composição da carga crítica */}
        <div className="mt-5 p-4 bg-noite/40 border border-white/10 rounded-lg">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs uppercase font-bold text-white/70">
                Composição da carga crítica
              </p>
              <BadgeOrigem origem={origemComposicao} metodo={metodo} />
            </div>
            <span className={`text-[10px] font-bold ${cargaValida ? 'text-verde' : 'text-coral'}`}>
              Total: {somaCarga.toFixed(0)}% {cargaValida ? '✓' : '(deve somar 100%)'}
            </span>
          </div>
          <p className="text-[10px] text-white/40 mb-3">
            Divide a carga crítica pela natureza — impacta o dimensionamento do inversor.
            Ao mexer num, os outros se ajustam pra manter 100%.
          </p>

          {/* Presets rápidos por perfil (quando não veio de método automático) */}
          {origemComposicao === 'manual' && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <span className="text-[9px] uppercase text-white/50 self-center mr-1">Presets:</span>
              <PresetComposicao label="🏠 Residencial padrão" ind={30} res={50} cap={20}
                aplicar={() => { setPercIndutiva(30); setPercResistiva(50); setPercCapacitiva(20) }} />
              <PresetComposicao label="🏢 Comercial" ind={40} res={30} cap={30}
                aplicar={() => { setPercIndutiva(40); setPercResistiva(30); setPercCapacitiva(30) }} />
              <PresetComposicao label="🏭 Industrial" ind={70} res={20} cap={10}
                aplicar={() => { setPercIndutiva(70); setPercResistiva(20); setPercCapacitiva(10) }} />
              <PresetComposicao label="🖥️ Data center" ind={10} res={10} cap={80}
                aplicar={() => { setPercIndutiva(10); setPercResistiva(10); setPercCapacitiva(80) }} />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SliderCarga
              label="⚡ Indutiva"
              desc="Motores, ar cond, geladeira (pico partida 3-5×)"
              valor={percIndutiva}
              onChange={(v) => ajustarComposicao('ind', v)}
              cor="text-sol"
            />
            <SliderCarga
              label="🔥 Resistiva"
              desc="Chuveiro, incandescente, forno (linear)"
              valor={percResistiva}
              onChange={(v) => ajustarComposicao('res', v)}
              cor="text-verde"
            />
            <SliderCarga
              label="💻 Capacitiva"
              desc="Eletrônicos, LED, TV (harmônicos)"
              valor={percCapacitiva}
              onChange={(v) => ajustarComposicao('cap', v)}
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
      )}

      {/* Toggle Bat 10kWh também disponível no modo espelho */}
      {metodo === 'kit_direto_espelho' && (
        <section className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          <Toggle
            checked={preferirBat10} onChange={setPreferirBat10}
            label="🔋 Preferir baterias 10kWh (SBW CB100)"
            desc="Menos módulos = mais capacidade por rack. Sistema também troca automaticamente se 5kWh não couber."
          />
        </section>
      )}

      {/* ══════════════ RESULTADO ══════════════ */}
      {dimensionamento && (
        <section className="p-5 bg-verde/10 border border-verde/40 rounded-xl">
          <h2 className="text-xs uppercase tracking-wider font-bold text-verde mb-3">
            ✓ Composição sugerida — 3 dimensionamentos
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {/* MÓDULOS FV (do consumo) */}
            <div className="p-3 bg-noite/40 rounded border border-sol/20">
              <p className="text-[10px] uppercase text-sol mb-1">☀️ Módulos FV · CC</p>
              <p className="text-sm font-bold text-white">{dimensionamento.qtdModulos}× {dimensionamento.moduloPotenciaWp}Wp</p>
              <p className="text-[10px] text-white/60">{dimensionamento.potenciaCcKwp.toFixed(2)} kWp total</p>
              <p className="text-[10px] text-white/50 mt-1 italic">
                do consumo: {consumoMensalKwh} kWh/mês
              </p>
              <p className="text-[10px] text-verde mt-0.5">
                ⚡ Gera ~{dimensionamento.geracaoMensalEstimadaKwh.toFixed(0)} kWh/mês
              </p>
            </div>

            {/* INVERSOR (da carga crítica) */}
            <div className="p-3 bg-noite/40 rounded border border-weg-azul/20">
              <p className="text-[10px] uppercase text-weg-azul mb-1">⚡ Inversor · CA</p>
              <p className="text-sm font-bold text-white">{dimensionamento.qtdInversores}× {dimensionamento.inversor.modelo}</p>
              <p className="text-[10px] text-white/60">{dimensionamento.potenciaInversorTotalKw}kW total</p>
              <p className="text-[10px] text-white/50 mt-1 italic">
                da carga crítica: {cargaCriticaKw} kW
              </p>
              {dimensionamento.usaParalelismo && (
                <p className="text-[10px] text-sol mt-0.5">⚡ Paralelismo ativo</p>
              )}
              <p className={`text-[10px] mt-0.5 ${
                dimensionamento.fciPercentual > 130 ? 'text-coral' :
                dimensionamento.fciPercentual < 100 ? 'text-sol' : 'text-verde'
              }`}>
                🎯 FCI: {dimensionamento.fciPercentual.toFixed(0)}% {dimensionamento.fciPercentual >= 100 && dimensionamento.fciPercentual <= 130 ? '✓' : '⚠️'}
              </p>
            </div>

            {/* BATERIAS (da autonomia) */}
            <div className="p-3 bg-noite/40 rounded border border-coral/20">
              <p className="text-[10px] uppercase text-coral mb-1">🔋 Baterias · Backup</p>
              <p className="text-sm font-bold text-white">{dimensionamento.qtdBaterias}× {dimensionamento.bateria.modelo}</p>
              <p className="text-[10px] text-white/60">{dimensionamento.capacidadeBateriaTotalKwh}kWh total</p>
              <p className="text-[10px] text-white/50 mt-1 italic">
                da autonomia: {autonomiaHoras}h × {cargaCriticaKw}kW
              </p>
              <p className="text-[10px] text-verde mt-0.5">
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
        const itensAutomaticos = gerarItensListaCaHibrida(dimensionamento)
        const itensCaHibrida = listaCaEditada ?? itensAutomaticos
        const foiEditada = listaCaEditada !== null

        function alterarQtd(idx: number, delta: number) {
          const atual = listaCaEditada ?? itensAutomaticos
          const nova = atual.map((it, i) => i === idx ? { ...it, qtd: Math.max(0, it.qtd + delta) } : it)
          setListaCaEditada(nova)
        }
        function alterarQtdDireta(idx: number, valor: number) {
          const atual = listaCaEditada ?? itensAutomaticos
          const nova = atual.map((it, i) => i === idx ? { ...it, qtd: Math.max(0, valor) } : it)
          setListaCaEditada(nova)
        }
        function removerItem(idx: number) {
          const atual = listaCaEditada ?? itensAutomaticos
          setListaCaEditada(atual.filter((_, i) => i !== idx))
        }
        function restaurarPadrao() {
          if (foiEditada && !confirm('Descartar edições e restaurar a lista automática do dimensionamento?')) return
          setListaCaEditada(null)
        }

        return (
          <section className="p-5 bg-weg-azul/5 border border-weg-azul/30 rounded-xl">
            <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs uppercase tracking-wider font-bold text-weg-azul">
                    🧰 Materiais CA adicionais (BESS)
                  </h2>
                  {foiEditada && (
                    <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border bg-sol/10 border-sol/30 text-sol">
                      ✍️ Editada
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-white/50 mt-0.5">
                  {resumoListaCaHibrida(itensCaHibrida)} · salvos ao confirmar
                </p>
              </div>
              <div className="flex items-center gap-2">
                {foiEditada && (
                  <button
                    type="button"
                    onClick={restaurarPadrao}
                    className="text-[10px] px-2 py-1 bg-white/5 border border-white/10 rounded hover:bg-white/10 text-white/70 hover:text-white transition"
                    title="Descarta edições e volta pra lista automática"
                  >
                    🔄 Restaurar padrão
                  </button>
                )}
                <span className="text-2xl">📦</span>
              </div>
            </div>

            {itensCaHibrida.length === 0 ? (
              <div className="p-4 text-center text-xs text-white/40 bg-noite/40 rounded border border-dashed border-white/10">
                Nenhum item na lista. <button type="button" onClick={restaurarPadrao} className="text-sol underline hover:text-sol/80">Restaurar padrão</button>
              </div>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {itensCaHibrida.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-noite/40 rounded text-xs group hover:bg-noite/60">
                    <span className="text-[10px] text-white/40 flex-shrink-0 w-6">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white truncate">{item.descricao}</p>
                      {item.observacao && (
                        <p className="text-[10px] text-white/50 italic truncate">💡 {item.observacao}</p>
                      )}
                    </div>
                    {/* Controles +/- + input direto */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => alterarQtd(i, -1)}
                        disabled={item.qtd <= 0}
                        className="w-6 h-6 flex items-center justify-center bg-white/10 rounded text-sm hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Diminuir"
                      >−</button>
                      <input
                        type="number"
                        min={0}
                        step={item.unidade === 'm' ? 1 : 1}
                        value={item.qtd}
                        onChange={(e) => alterarQtdDireta(i, parseFloat(e.target.value) || 0)}
                        className="w-14 px-1 py-0.5 bg-white/5 border border-white/10 rounded text-xs text-white text-center font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => alterarQtd(i, 1)}
                        className="w-6 h-6 flex items-center justify-center bg-white/10 rounded text-sm hover:bg-white/20"
                        title="Aumentar"
                      >+</button>
                      <span className="text-[10px] text-white/40 w-6">{item.unidade}</span>
                      <button
                        type="button"
                        onClick={() => removerItem(i)}
                        className="w-6 h-6 flex items-center justify-center rounded text-coral/60 hover:text-coral hover:bg-coral/10 transition"
                        title="Remover item"
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
            <div className="p-2 bg-sol/5 border border-sol/20 rounded text-center">
              <p className="text-[9px] uppercase text-white/50">Consumo (da etapa 3)</p>
              <p className="text-lg font-bold text-sol">{consumoMensalKwh} kWh/mês</p>
            </div>
            <div className="p-2 bg-verde/5 border border-verde/20 rounded text-center">
              <p className="text-[9px] uppercase text-white/50">Geração solar (calculada)</p>
              <p className="text-lg font-bold text-verde">{dimensionamento.geracaoMensalEstimadaKwh.toFixed(0)} kWh/mês</p>
              <p className="text-[9px] text-white/40">{dimensionamento.potenciaCcKwp.toFixed(1)}kWp × HSP × PR</p>
            </div>
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

          {/* Controles de simulação (impactam ambos gráficos) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-3 bg-noite/60 rounded-lg border border-white/10">
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1">
                ⚡ % Despacho máx do banco
              </label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5}
                  value={percDespachoMax}
                  onChange={(e) => setPercDespachoMax(parseInt(e.target.value))}
                  className="flex-1 accent-purple-500" />
                <span className="text-sm font-bold text-purple-400 w-10">{percDespachoMax}%</span>
              </div>
              <p className="text-[9px] text-white/40 mt-1">Máximo do banco usado pra peak shaving</p>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1">
                🔒 % Reservado pro backup
              </label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={80} step={5}
                  value={percBackupReservado}
                  onChange={(e) => setPercBackupReservado(parseInt(e.target.value))}
                  className="flex-1 accent-coral" />
                <span className="text-sm font-bold text-coral w-10">{percBackupReservado}%</span>
              </div>
              <p className="text-[9px] text-white/40 mt-1">Nunca descarrega abaixo disso (garante backup)</p>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1">
                ⏰ Simular queda às
              </label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={23} step={1}
                  value={horaSimularQueda}
                  onChange={(e) => setHoraSimularQueda(parseInt(e.target.value))}
                  className="flex-1 accent-purple-500" />
                <span className="text-sm font-bold text-purple-400 w-10">{horaSimularQueda}h</span>
              </div>
              <p className="text-[9px] text-white/40 mt-1">Hora que a rede cai no gráfico B</p>
            </div>
          </div>

          <GraficoImpactoHibrido
            perfil={perfilCliente}
            consumoMensalKwh={consumoMensalKwh}
            geracaoMensalEstimadaKwh={dimensionamento.geracaoMensalEstimadaKwh}
            capacidadeBateriaKwh={dimensionamento.capacidadeBateriaTotalKwh}
            potenciaBateriaKw={dimensionamento.qtdBaterias * (dimensionamento.bateria.potencia_continua_kw ?? dimensionamento.bateria.capacidade_kwh)}
            potenciaInversorKw={dimensionamento.potenciaInversorTotalKw}
            cargaCriticaKw={cargaCriticaKw}
            autonomiaHoras={dimensionamento.autonomiaRealHoras}
            percDespachoMax={percDespachoMax}
            percBackupReservado={percBackupReservado}
            usarPeakShaving={usarPeakShaving}
            horaSimularQueda={horaSimularQueda}
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

function PresetEspelho({ label, pcc, pca, cap, aplicar }: {
  label: string; pcc: number; pca: number; cap: number; aplicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aplicar}
      className="text-[10px] px-2 py-1 bg-white/[0.03] border border-white/10 rounded hover:bg-white/10 hover:border-weg-azul/30 text-white/70 hover:text-white transition"
      title={`Pcc ${pcc}kWp · Pca ${pca}kW · Bat ${cap}kWh`}
    >
      {label}
    </button>
  )
}

function PresetComposicao({ label, ind, res, cap, aplicar }: {
  label: string; ind: number; res: number; cap: number; aplicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aplicar}
      className="text-[10px] px-2 py-1 bg-white/[0.03] border border-white/10 rounded hover:bg-white/10 hover:border-sol/30 text-white/70 hover:text-white transition"
      title={`I:${ind}% R:${res}% C:${cap}%`}
    >
      {label}
    </button>
  )
}

function BadgeOrigem({ origem, metodo }: {
  origem: 'manual' | 'listagem' | 'analisador' | 'mestre_ia'
  metodo: Metodo
}) {
  const info: Record<typeof origem, { emoji: string; label: string; classe: string }> = {
    manual: {
      emoji: '✍️',
      label: 'Ajuste manual',
      classe: 'bg-white/5 border-white/20 text-white/60',
    },
    listagem: {
      emoji: '🧮',
      label: 'Calculado da lista',
      classe: 'bg-verde/10 border-verde/30 text-verde',
    },
    analisador: {
      emoji: '📡',
      label: metodo === 'analisador_segregado_cc' ? 'Medido no analisador segregado' : 'Medido pelo analisador',
      classe: 'bg-weg-azul/10 border-weg-azul/30 text-weg-azul',
    },
    mestre_ia: {
      emoji: '🧙‍♂️',
      label: 'Sugestão do Mestre',
      classe: 'bg-sol/10 border-sol/30 text-sol',
    },
  }
  const cur = info[origem]
  return (
    <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${cur.classe}`}>
      {cur.emoji} {cur.label}
    </span>
  )
}

function MatrizCard({ icone, label, temMetodo, alternativa }: {
  icone: string; label: string; temMetodo: boolean; alternativa: string
}) {
  return (
    <div className={`p-2 rounded border text-center ${
      temMetodo
        ? 'bg-verde/10 border-verde/40'
        : 'bg-white/[0.03] border-white/10'
    }`}>
      <p className="text-lg">{icone}</p>
      <p className="text-[9px] uppercase font-bold text-white/70 leading-tight">{label}</p>
      <p className={`text-[10px] font-bold mt-1 ${temMetodo ? 'text-verde' : 'text-white/40'}`}>
        {temMetodo ? '✓ Coberto' : '✗ Complemento'}
      </p>
      {!temMetodo && (
        <p className="text-[9px] text-white/40 mt-0.5 italic leading-tight">
          via {alternativa}
        </p>
      )}
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
