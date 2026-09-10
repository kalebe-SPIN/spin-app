'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarAnaliseFaturaAction } from '@/app/projetos/[id]/fatura/actions'
import { HistoricoConsumo } from '@/components/HistoricoConsumo'

type Beneficiaria = {
  ordem: number
  uc: string
  titular: string
  analise: any
  cor_grafico: string
  arquivo_nome?: string
  status: 'aguardando' | 'analisando' | 'ok' | 'erro'
  erro?: string
}

type Props = {
  projetoId: string
  analiseSalva: any
  beneficiariasSalvas: Beneficiaria[]
}

const CORES_UC = ['#587FFF', '#5FCF80', '#F17A5C', '#B78BFF', '#4EC5C9', '#F5A623', '#EC4899', '#14B8A6']

export function FaturaForm({ projetoId, analiseSalva, beneficiariasSalvas }: Props) {
  const router = useRouter()
  // Kalebe 2026-09-10: 2 refs de input pra separar câmera (mobile) de arquivo.
  // capture="environment" força a câmera traseira no mobile.
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const inputCameraRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [analise, setAnalise] = useState<any>(analiseSalva || null)
  // Kalebe 2026-09-10: modo manual pra quando IA falhar ou usuário preferir digitar
  const [modoManual, setModoManual] = useState(false)

  // Beneficiárias
  const [qtdBeneficiarias, setQtdBeneficiarias] = useState<number>(beneficiariasSalvas?.length || 0)
  const [beneficiarias, setBeneficiarias] = useState<Beneficiaria[]>(beneficiariasSalvas || [])

  async function processarFatura(file: File): Promise<any | null> {
    const formData = new FormData()
    formData.append('arquivo', file)
    const res = await fetch('/api/analisar-fatura', {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || json.erro || 'Erro ao analisar')
    return json.dados || json
  }

  async function analisarPrincipal(file: File) {
    setErro(null)
    setAnalisando(true)
    try {
      const dados = await processarFatura(file)
      setAnalise(dados)
    } catch (e: any) {
      setErro(e.message || 'Erro ao processar fatura')
    } finally {
      setAnalisando(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivo(file)
    analisarPrincipal(file)
  }

  async function analisarBeneficiaria(idx: number, file: File) {
    // Atualiza status pra "analisando"
    setBeneficiarias(prev => prev.map((b, i) =>
      i === idx ? { ...b, status: 'analisando', arquivo_nome: file.name, erro: undefined } : b
    ))
    try {
      const dados = await processarFatura(file)
      setBeneficiarias(prev => prev.map((b, i) =>
        i === idx ? {
          ...b,
          status: 'ok',
          arquivo_nome: file.name,
          uc: dados.uc || b.uc,
          titular: dados.razao_social || b.titular,
          analise: dados,
        } : b
      ))
    } catch (e: any) {
      setBeneficiarias(prev => prev.map((b, i) =>
        i === idx ? { ...b, status: 'erro', erro: e.message || 'Erro ao analisar' } : b
      ))
    }
  }

  function ajustarQtdBeneficiarias(nova: number) {
    const n = Math.max(0, Math.min(20, nova))
    setQtdBeneficiarias(n)
    setBeneficiarias(prev => {
      if (n > prev.length) {
        // Adicionar novas beneficiárias vazias
        const novas: Beneficiaria[] = []
        for (let i = prev.length; i < n; i++) {
          novas.push({
            ordem: i + 1,
            uc: '',
            titular: '',
            analise: null,
            cor_grafico: CORES_UC[(i + 1) % CORES_UC.length],
            status: 'aguardando',
          })
        }
        return [...prev, ...novas]
      }
      // Reduzir
      return prev.slice(0, n)
    })
  }

  function handleConfirmar() {
    if (!analise) {
      setErro('Analise a fatura principal primeiro.')
      return
    }
    // Beneficiárias — pelo menos aceita salvar mesmo com algumas incompletas
    startTransition(async () => {
      const result = await salvarAnaliseFaturaAction(projetoId, analise, beneficiarias.filter(b => b.status === 'ok'))
      if (result.sucesso) {
        router.push(`/projetos/${projetoId}`)
      } else {
        setErro(result.erro || 'Erro ao salvar')
      }
    })
  }

  const alertaEndereco = analise?.endereco || analise?.logradouro
    ? '⚠️ Endereço da CELESC vem abreviado. Confira com o cliente.'
    : null

  // Histórico consolidado (principal + beneficiárias com dados OK)
  const historiasConsolidadas = analise ? [
    {
      uc: analise.uc || 'Principal',
      titular: analise.razao_social || 'UC Principal',
      cor: '#F5B400', // amarelo Spin
      historico: analise.historico_12_meses || [],
      media: analise.consumo_medio_12m_kwh || analise.consumo_mes_kwh || 0,
    },
    ...beneficiarias
      .filter(b => b.status === 'ok' && b.analise)
      .map(b => ({
        uc: b.uc || `#${b.ordem}`,
        titular: b.titular || `Beneficiária ${b.ordem}`,
        cor: b.cor_grafico,
        historico: b.analise.historico_12_meses || [],
        media: b.analise.consumo_medio_12m_kwh || b.analise.consumo_mes_kwh || 0,
      })),
  ] : []

  const consumoMedioTotal = historiasConsolidadas.reduce((sum, h) => sum + (h.media || 0), 0)

  return (
    <div className="space-y-6">
      {/* Upload principal — 3 opções: câmera / arquivo / manual */}
      {!arquivo && !analise && !modoManual && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => inputCameraRef.current?.click()}
              className="p-5 border-2 border-dashed border-white/20 rounded-lg text-center hover:border-sol/40 hover:bg-white/[0.02] transition"
            >
              <p className="text-lg font-bold text-white mb-0.5">📷 Câmera</p>
              <p className="text-[11px] text-white/50">Tirar foto da fatura</p>
            </button>
            <button
              type="button"
              onClick={() => inputArquivoRef.current?.click()}
              className="p-5 border-2 border-dashed border-white/20 rounded-lg text-center hover:border-sol/40 hover:bg-white/[0.02] transition"
            >
              <p className="text-lg font-bold text-white mb-0.5">📁 Arquivo</p>
              <p className="text-[11px] text-white/50">PDF ou imagem do dispositivo</p>
            </button>
            <button
              type="button"
              onClick={() => setModoManual(true)}
              className="p-5 border-2 border-dashed border-white/20 rounded-lg text-center hover:border-weg-azul/40 hover:bg-white/[0.02] transition"
            >
              <p className="text-lg font-bold text-white mb-0.5">✏ Cadastrar manualmente</p>
              <p className="text-[11px] text-white/50">Digitar os dados sem enviar fatura</p>
            </button>
          </div>
          <p className="text-[11px] text-white/40 text-center">
            A IA lê fatura CELESC em ~15s. Se falhar, dá pra cadastrar manualmente.
          </p>
        </div>
      )}

      {/* Formulário manual (aparece quando usuário escolhe ou fallback de erro) */}
      {modoManual && !analise && (
        <FaturaManualForm
          onSalvar={(dados) => {
            setAnalise(dados)
            setModoManual(false)
            setErro(null)
          }}
          onCancelar={() => setModoManual(false)}
        />
      )}

      {/* Input de câmera (força captura pela câmera traseira no mobile) */}
      <input
        ref={inputCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
      {/* Input de arquivo (PDF ou imagem da galeria) */}
      <input
        ref={inputArquivoRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {analisando && (
        <div className="bg-sol/10 border border-sol/30 rounded-lg p-4">
          <p className="text-sm text-sol">⏳ Analisando fatura principal com IA... aguarde ~15s</p>
        </div>
      )}

      {arquivo && !analisando && (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">{arquivo.name}</p>
            <p className="text-xs text-white/40">{(arquivo.size / 1024).toFixed(0)} KB · Principal</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setArquivo(null); setAnalise(null); setErro(null)
              if (inputArquivoRef.current) inputArquivoRef.current.value = ''
              if (inputCameraRef.current) inputCameraRef.current.value = ''
            }}
            className="text-xs text-coral hover:text-coral/80"
          >
            Remover
          </button>
        </div>
      )}

      {/* Resultado análise principal */}
      {analise && !analisando && (
        <div className="space-y-4">
          <div className="bg-verde/10 border border-verde/30 rounded-lg p-4">
            <p className="text-sm text-verde font-bold mb-2">✅ UC principal analisada</p>
            {alertaEndereco && <p className="text-xs text-sol">{alertaEndereco}</p>}
          </div>

          {Array.isArray(analise._avisos) && analise._avisos.length > 0 && (
            <div className="bg-sol/10 border border-sol/40 rounded-lg p-4">
              <p className="text-xs font-bold uppercase text-sol mb-2">⚠️ Atenção do consultor</p>
              <ul className="space-y-1.5">
                {analise._avisos.map((av: string, i: number) => (
                  <li key={i} className="text-xs text-white/80 flex gap-2">
                    <span className="text-sol">•</span><span>{av}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Info label="Titular" value={analise.razao_social || analise.titular || '—'} />
            <Info label="Grupo tarifário" value={analise.grupo || analise.grupo_tarifario || '—'} />
            <Info label="Tipo ligação" value={analise.tipo_ligacao || '—'} />
            <Info
              label={`Consumo médio ${analise.meses_com_dados ? `(${analise.meses_com_dados}m)` : ''}`}
              value={analise.consumo_medio_12m_kwh ? `${Math.round(analise.consumo_medio_12m_kwh)} kWh/mês` : '—'}
              highlight
            />
            <Info label="Consumo mês atual" value={analise.consumo_mes_kwh ? `${Math.round(analise.consumo_mes_kwh)} kWh` : '—'} />
            <Info label="Demanda contratada" value={analise.demanda_contratada_kw ? `${analise.demanda_contratada_kw} kW` : '—'} />
            <Info label="Geração atual" value={analise.tem_geracao_propria ? 'Sim (ver histórico)' : 'Não tem'} />
            <Info label="UC" value={analise.uc || analise.unidade_consumidora || '—'} />
            <Info label="Cidade/UF" value={`${analise.endereco?.cidade || analise.cidade || '—'}${(analise.endereco?.uf || analise.uf) ? '/' + (analise.endereco?.uf || analise.uf) : ''}`} />
          </div>
        </div>
      )}

      {/* Beneficiárias — só aparece depois da fatura principal ser analisada */}
      {analise && !analisando && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-white">Unidades beneficiárias (rateio)</h3>
              <p className="text-[10px] text-white/40 mt-0.5">
                Se o cliente rateia energia gerada com outras UCs, cadastre cada uma.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => ajustarQtdBeneficiarias(qtdBeneficiarias - 1)}
                disabled={qtdBeneficiarias === 0}
                className="w-8 h-8 bg-white/5 border border-white/10 rounded text-white disabled:opacity-30 hover:bg-white/10"
              >
                −
              </button>
              <input
                type="number"
                min="0"
                max="20"
                value={qtdBeneficiarias}
                onChange={e => ajustarQtdBeneficiarias(parseInt(e.target.value) || 0)}
                className="w-14 px-2 py-1 bg-noite/40 border border-white/10 rounded text-center text-white text-sm"
              />
              <button
                type="button"
                onClick={() => ajustarQtdBeneficiarias(qtdBeneficiarias + 1)}
                disabled={qtdBeneficiarias >= 20}
                className="w-8 h-8 bg-sol/20 border border-sol/40 rounded text-sol font-bold hover:bg-sol/30"
              >
                +
              </button>
            </div>
          </div>

          {qtdBeneficiarias > 0 && (
            <div className="space-y-2 mt-4">
              {beneficiarias.map((b, idx) => (
                <BeneficiariaRow
                  key={idx}
                  beneficiaria={b}
                  onFileSelect={file => analisarBeneficiaria(idx, file)}
                  onManual={(dados) => {
                    // Fallback manual: monta a beneficiária como se IA tivesse lido
                    setBeneficiarias(prev => prev.map((row, i) =>
                      i === idx ? {
                        ...row,
                        status: 'ok',
                        arquivo_nome: 'Cadastro manual',
                        uc: dados.uc || row.uc,
                        titular: dados.razao_social || row.titular,
                        analise: dados,
                        erro: undefined,
                      } : row
                    ))
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gráfico consolidado — UC principal + beneficiárias */}
      {analise && historiasConsolidadas.some(h => h.historico.length > 0) && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">📊 Consumo consolidado</h3>
            <p className="text-xs text-white/60">
              Total médio: <strong className="text-sol">{Math.round(consumoMedioTotal)} kWh/mês</strong>
            </p>
          </div>
          <HistoricoConsumoMulti series={historiasConsolidadas} />
        </div>
      )}

      {/* Debug */}
      {analise && (
        <details className="bg-white/[0.02] border border-white/10 rounded-lg p-3">
          <summary className="cursor-pointer text-[10px] font-bold uppercase text-white/40 tracking-wider">
            🔧 Ver dados brutos (debug)
          </summary>
          <pre className="mt-3 text-[10px] text-white/60 font-mono overflow-auto max-h-96 bg-noite/40 p-3 rounded border border-white/5">
            {JSON.stringify({ principal: analise, beneficiarias }, null, 2)}
          </pre>
        </details>
      )}

      {erro && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-4 space-y-3">
          <p className="text-sm text-coral">❌ {erro}</p>
          {!analise && !modoManual && (
            <button
              type="button"
              onClick={() => {
                setArquivo(null); setErro(null); setModoManual(true)
                if (inputArquivoRef.current) inputArquivoRef.current.value = ''
                if (inputCameraRef.current) inputCameraRef.current.value = ''
              }}
              className="w-full px-4 py-2.5 bg-weg-azul/20 border border-weg-azul/40 rounded text-sm font-bold text-weg-azul hover:bg-weg-azul/30 transition"
            >
              ✏ Cadastrar dados manualmente
            </button>
          )}
        </div>
      )}

      {analise && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={isPending}
            className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
          >
            {isPending ? 'Salvando...' : 'Confirmar análise → Passo 3 Telhado'}
          </button>
        </div>
      )}
    </div>
  )
}

// ==========================================================
// SUB-COMPONENTS
// ==========================================================

function BeneficiariaRow({
  beneficiaria,
  onFileSelect,
  onManual,
}: {
  beneficiaria: Beneficiaria
  onFileSelect: (file: File) => void
  onManual: (dados: any) => void
}) {
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const inputCameraRef = useRef<HTMLInputElement>(null)
  const [manualAberto, setManualAberto] = useState(false)
  const b = beneficiaria

  return (
    <div className="p-3 bg-white/[0.02] border border-white/10 rounded-lg space-y-2">
      <div className="flex items-center gap-3">
        {/* Bolinha colorida */}
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-noite shrink-0" style={{ background: b.cor_grafico }}>
          {b.ordem}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          {b.status === 'ok' ? (
            <>
              <p className="text-sm font-bold text-white truncate">{b.titular || 'Sem titular'}</p>
              <p className="text-xs text-white/60">
                UC {b.uc || '—'} · <span className="text-verde">✓ {b.analise?.origem === 'manual' ? 'Manual' : 'Analisada'}</span>
                {b.analise?.consumo_medio_12m_kwh && (
                  <> · Média: <strong className="text-sol">{Math.round(b.analise.consumo_medio_12m_kwh)} kWh/mês</strong></>
                )}
              </p>
            </>
          ) : b.status === 'analisando' ? (
            <p className="text-xs text-sol">⏳ Analisando {b.arquivo_nome}...</p>
          ) : b.status === 'erro' ? (
            <>
              <p className="text-xs text-coral">❌ Erro: {b.erro}</p>
              <p className="text-[10px] text-white/40">{b.arquivo_nome}</p>
            </>
          ) : (
            <p className="text-xs text-white/50">Aguardando cadastro...</p>
          )}
        </div>

        {/* Botões: câmera + arquivo + manual */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => inputCameraRef.current?.click()}
            disabled={b.status === 'analisando'}
            title="Tirar foto"
            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            📷
          </button>
          <button
            type="button"
            onClick={() => inputArquivoRef.current?.click()}
            disabled={b.status === 'analisando'}
            title="Escolher arquivo"
            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            📁
          </button>
          <button
            type="button"
            onClick={() => setManualAberto((v) => !v)}
            disabled={b.status === 'analisando'}
            title="Cadastrar manualmente"
            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            ✏
          </button>
        </div>

        <input
          ref={inputCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onFileSelect(f)
          }}
        />
        <input
          ref={inputArquivoRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onFileSelect(f)
          }}
        />
      </div>

      {/* Fallback manual pra essa beneficiária — aparece ao clicar em ✏ ou em erro */}
      {(manualAberto || b.status === 'erro') && (
        <div className="pt-2 border-t border-white/10">
          <FaturaManualForm
            compacto
            onSalvar={(dados) => {
              onManual(dados)
              setManualAberto(false)
            }}
            onCancelar={() => setManualAberto(false)}
          />
        </div>
      )}
    </div>
  )
}

// ==========================================================
// FORMULÁRIO MANUAL — fallback quando IA não lê ou usuário prefere digitar
// ==========================================================
// Kalebe 2026-09-10: monta um objeto `analise` compatível com o que a IA
// retornaria, pra o resto do fluxo (histograma, salvamento, dimensionamento)
// não precisar saber a origem.
function FaturaManualForm({
  onSalvar,
  onCancelar,
  compacto = false,
}: {
  onSalvar: (dados: any) => void
  onCancelar?: () => void
  compacto?: boolean
}) {
  const [titular, setTitular] = useState('')
  const [uc, setUc] = useState('')
  const [grupo, setGrupo] = useState<'B' | 'A'>('B')
  const [tipoLigacao, setTipoLigacao] = useState<'monofasico' | 'bifasico' | 'trifasico'>('trifasico')
  const [consumoMedio, setConsumoMedio] = useState('')
  const [demanda, setDemanda] = useState('')
  const [temGeracao, setTemGeracao] = useState(false)
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('SC')
  const [observacao, setObservacao] = useState('')

  const consumoNum = parseFloat(consumoMedio.replace(',', '.')) || 0
  const demandaNum = parseFloat(demanda.replace(',', '.')) || 0

  const podeSalvar = consumoNum > 0

  function salvar() {
    if (!podeSalvar) return
    // Monta objeto compatível com IA. `origem: 'manual'` marca a origem.
    // historico_12_meses fica vazio (não temos, é manual) — gráfico usa só a média.
    const dados: any = {
      origem: 'manual',
      razao_social: titular || undefined,
      titular: titular || undefined,
      uc: uc || undefined,
      unidade_consumidora: uc || undefined,
      grupo,
      grupo_tarifario: grupo,
      tipo_ligacao: tipoLigacao,
      consumo_medio_12m_kwh: consumoNum,
      consumo_mes_kwh: consumoNum,
      meses_com_dados: 12,
      demanda_contratada_kw: grupo === 'A' && demandaNum > 0 ? demandaNum : undefined,
      tem_geracao_propria: temGeracao,
      endereco: {
        cidade: cidade || undefined,
        uf: uf || undefined,
      },
      cidade: cidade || undefined,
      uf: uf || undefined,
      observacao: observacao || undefined,
      historico_12_meses: [],
      _avisos: ['Dados inseridos manualmente — sem histórico de 12 meses da CELESC.'],
    }
    onSalvar(dados)
  }

  return (
    <div className={compacto ? 'space-y-3' : 'space-y-4 p-1'}>
      {!compacto && (
        <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-lg p-3">
          <p className="text-xs text-white/80">
            ✏ <strong className="text-weg-azul">Cadastro manual</strong> — informe os dados essenciais da fatura.
            O consumo médio é obrigatório; o resto ajuda no dimensionamento.
          </p>
        </div>
      )}

      <div className={`grid ${compacto ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-3`}>
        <ManualField label="Titular / Razão social">
          <input
            value={titular}
            onChange={(e) => setTitular(e.target.value)}
            placeholder="Nome de quem consta na fatura"
            className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
          />
        </ManualField>
        <ManualField label="Unidade consumidora (UC)">
          <input
            value={uc}
            onChange={(e) => setUc(e.target.value.replace(/\D/g, ''))}
            placeholder="Ex. 1234567890"
            className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white font-mono"
          />
        </ManualField>
        <ManualField label="Grupo tarifário">
          <select
            value={grupo}
            onChange={(e) => setGrupo(e.target.value as 'B' | 'A')}
            className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
          >
            <option value="B">B (residencial / pequeno comercial)</option>
            <option value="A">A (indústria / grandes comerciais)</option>
          </select>
        </ManualField>
        <ManualField label="Tipo de ligação">
          <select
            value={tipoLigacao}
            onChange={(e) => setTipoLigacao(e.target.value as any)}
            className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
          >
            <option value="monofasico">Monofásico</option>
            <option value="bifasico">Bifásico</option>
            <option value="trifasico">Trifásico</option>
          </select>
        </ManualField>
        <ManualField label="Consumo médio mensal (kWh) *" destaque>
          <input
            value={consumoMedio}
            onChange={(e) => setConsumoMedio(e.target.value)}
            placeholder="Ex. 850"
            inputMode="decimal"
            className="w-full px-3 py-2 bg-sol/10 border border-sol/30 rounded text-sm text-white font-bold"
          />
        </ManualField>
        {grupo === 'A' && (
          <ManualField label="Demanda contratada (kW)">
            <input
              value={demanda}
              onChange={(e) => setDemanda(e.target.value)}
              placeholder="Ex. 75"
              inputMode="decimal"
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
            />
          </ManualField>
        )}
        <ManualField label="Cidade">
          <input
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Ex. Florianópolis"
            className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
          />
        </ManualField>
        <ManualField label="UF">
          <input
            value={uf}
            onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="SC"
            className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white font-mono uppercase"
          />
        </ManualField>
      </div>

      <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
        <input
          type="checkbox"
          checked={temGeracao}
          onChange={(e) => setTemGeracao(e.target.checked)}
          className="w-4 h-4 accent-sol"
        />
        Cliente já tem geração própria (ampliação de sistema existente)
      </label>

      {!compacto && (
        <ManualField label="Observação (opcional)">
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Contexto útil pro dimensionamento — piscina aquecida, ar-condicionado, plano de expansão etc."
            className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
          />
        </ManualField>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="px-3 py-2 text-xs text-white/60 hover:text-white/80"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={salvar}
          disabled={!podeSalvar}
          className="px-4 py-2 bg-sol text-noite font-bold text-xs rounded disabled:opacity-40"
        >
          Salvar dados manualmente
        </button>
      </div>
    </div>
  )
}

function ManualField({
  label, children, destaque,
}: { label: string; children: React.ReactNode; destaque?: boolean }) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-wider font-bold mb-1 ${destaque ? 'text-sol' : 'text-white/50'}`}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-sol/10 border-sol/30' : 'bg-white/[0.02] border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-sol' : 'text-white'}`}>{value}</p>
    </div>
  )
}

// Wrapper simples usando HistoricoConsumo pra 1 série (principal) e cards de série pro resto
function HistoricoConsumoMulti({ series }: { series: Array<{ uc: string; titular: string; cor: string; historico: any[]; media: number }> }) {
  const seriesValidas = series.filter(s => s.historico.length > 0)
  if (seriesValidas.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Legenda das UCs */}
      <div className="flex flex-wrap gap-2 p-3 bg-white/[0.02] border border-white/10 rounded-lg">
        {seriesValidas.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full" style={{ background: s.cor }} />
            <span className="text-white/80">{s.uc}</span>
            <span className="text-white/40">({Math.round(s.media)} kWh/mês)</span>
          </div>
        ))}
      </div>

      {/* Gráfico multi-linha */}
      <MultiLinhaSVG series={seriesValidas} />
    </div>
  )
}

function MultiLinhaSVG({ series }: { series: Array<{ uc: string; cor: string; historico: any[]; media: number }> }) {
  const W = 720, H = 260
  const paddingLeft = 48, paddingRight = 16, paddingTop = 24, paddingBottom = 40
  const plotW = W - paddingLeft - paddingRight
  const plotH = H - paddingTop - paddingBottom

  const todosPontos = series.flatMap(s => s.historico.map(h => Number(h.consumo_kwh) || 0))
  const maxKwh = Math.max(...todosPontos, 0) * 1.1
  const nMeses = Math.max(...series.map(s => s.historico.length))

  const yPixel = (kwh: number) => paddingTop + plotH - (maxKwh > 0 ? (kwh / maxKwh) * plotH : 0)
  const xPixel = (idx: number) => paddingLeft + (nMeses > 1 ? (idx / (nMeses - 1)) * plotW : plotW / 2)
  const yTicks = [0, 0.33, 0.66, 1].map(f => Math.round(maxKwh * f))

  // Média consolidada = soma das médias
  const mediaConsolidada = series.reduce((sum, s) => sum + s.media, 0)

  return (
    <div className="overflow-x-auto bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[600px]">
        {/* Grid + labels Y */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={paddingLeft} y1={yPixel(tick)} x2={W - paddingRight} y2={yPixel(tick)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={paddingLeft - 8} y={yPixel(tick) + 4} fontSize="10" fill="rgba(255,255,255,0.4)" textAnchor="end" fontFamily="system-ui">
              {tick}
            </text>
          </g>
        ))}

        {/* Linha média consolidada */}
        {mediaConsolidada > 0 && (
          <>
            <line x1={paddingLeft} y1={yPixel(mediaConsolidada)} x2={W - paddingRight} y2={yPixel(mediaConsolidada)} stroke="#FFB94D" strokeWidth="2" strokeDasharray="6 4" />
            <text x={W - paddingRight - 4} y={yPixel(mediaConsolidada) - 6} fontSize="10" fill="#FFB94D" textAnchor="end" fontWeight="bold" fontFamily="system-ui">
              Média consolidada — {Math.round(mediaConsolidada)} kWh
            </text>
          </>
        )}

        {/* Cada série (UC) uma linha */}
        {series.map((s, si) => {
          const path = s.historico
            .map((h, i) => `${i === 0 ? 'M' : 'L'} ${xPixel(i)} ${yPixel(Number(h.consumo_kwh) || 0)}`)
            .join(' ')
          return (
            <g key={si}>
              <path d={path} fill="none" stroke={s.cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {s.historico.map((h, i) => (
                <circle key={i} cx={xPixel(i)} cy={yPixel(Number(h.consumo_kwh) || 0)} r="3.5" fill={s.cor} stroke="#0B0F1A" strokeWidth="1.5" />
              ))}
            </g>
          )
        })}

        {/* Labels do eixo X (usar meses da série principal) */}
        {series[0]?.historico.map((h, i) => (
          <text key={i} x={xPixel(i)} y={H - paddingBottom + 16} fontSize="10" fill="rgba(255,255,255,0.5)" textAnchor="middle" fontFamily="system-ui">
            {h.mes_ano}
          </text>
        ))}
      </svg>
    </div>
  )
}
