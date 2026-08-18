'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  calcularLimpezaAutomatico,
  decidirQtdTecnicos,
  type EntradasLimpeza,
  type ParametrosLimpeza,
  type Sujidade,
} from '@/lib/precificacao/servico-limpeza'
import {
  OPCOES_TELHADO,
  OPCOES_PAVIMENTO,
  type TipoTelhado,
  type Pavimento,
} from '@/lib/precificacao/servico-retirada-recolocacao'
import { salvarPropostaTelhadoAction, editarTelhadoAction } from '@/app/crm/servicos/actions'

export type CidadeOpcao = { id: string; cidade: string; uf: string; km: number }

type Props = {
  telhadoId: string
  qtdPlacasInicial: number
  potenciaKwpInicial?: number | null
  cidadeTelhado?: string | null  // cidade cadastrada no card — casada com cidades_distancia automaticamente
  parametros: ParametrosLimpeza
  cidades: CidadeOpcao[]
  propostaAnterior?: {
    entradas: Partial<EntradasLimpeza>
    resultado: { subtotal: number }
    valor_final: number
  } | null
}

const OPT_STYLE: React.CSSProperties = { backgroundColor: '#050B16', color: '#ffffff' }

/**
 * Simulador de proposta de limpeza — versão compacta pra embutir no card do CRM.
 * Cálculo ao vivo (useMemo) conforme o vendedor mexe. Grava snapshot em
 * telhados.proposta_dados quando clica em Salvar.
 */
// Tenta bater a cidade cadastrada no telhado com a lista cadastrada pelo admin.
// Faz matching case-insensitive ignorando acentos, prefere match exato.
function acharCidadeMatch(cidadeTelhado: string | null | undefined, cidades: CidadeOpcao[]): string | null {
  if (!cidadeTelhado?.trim() || cidades.length === 0) return null
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const alvo = norm(cidadeTelhado)
  const exato = cidades.find((c) => norm(c.cidade) === alvo)
  if (exato) return exato.id
  const parcial = cidades.find((c) => norm(c.cidade).includes(alvo) || alvo.includes(norm(c.cidade)))
  return parcial?.id || null
}

export function SimuladorPropostaEmbutido({
  telhadoId, qtdPlacasInicial, potenciaKwpInicial, cidadeTelhado, parametros, cidades, propostaAnterior,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const inicial = propostaAnterior?.entradas || {}

  // Qtd placas — pode ser ajustada pelo vendedor durante a montagem da proposta.
  // Se a proposta anterior tinha um valor, usa esse; senão o valor cadastrado do telhado.
  const [qtdPlacas, setQtdPlacas] = useState<number>(
    (inicial.qtd_modulos as number) || qtdPlacasInicial || 0,
  )
  const potenciaKwpAtual = Number((qtdPlacas * 0.55).toFixed(2))

  // Cidade: prefere a que veio da proposta salva; senão faz matching com a cidade do card;
  // senão pega a primeira da lista.
  const cidadeMatch = acharCidadeMatch(cidadeTelhado, cidades)
  const [cidadeId, setCidadeId] = useState<string>(
    (inicial.cidade_id as string) || cidadeMatch || cidades[0]?.id || '',
  )
  const cidadeFoiMatchada = !!cidadeMatch && cidadeId === cidadeMatch && !inicial.cidade_id
  const cidadeDoTelhadoNaoAchou = !!cidadeTelhado?.trim() && !cidadeMatch

  const [tipoTelhado, setTipoTelhado] = useState<TipoTelhado>(
    (inicial.tipo_telhado as TipoTelhado) || 'fibrocimento',
  )
  const [pavimento, setPavimento] = useState<Pavimento>(
    (inicial.pavimento as Pavimento) || 'terreo',
  )
  const [peDireitoM, setPeDireitoM] = useState<number>(
    (inicial.pe_direito_m as number) ?? 3,
  )
  const [sujidade, setSujidade] = useState<Sujidade>(
    (inicial.sujidade as Sujidade) || 'medio',
  )
  const [temPontoAgua, setTemPontoAgua] = useState<boolean>(inicial.tem_ponto_agua ?? true)
  const [temPontoEnergia, setTemPontoEnergia] = useState<boolean>(inicial.tem_ponto_energia ?? true)
  const [clienteAjudante, setClienteAjudante] = useState<boolean>(
    inicial.cliente_disponibiliza_ajudante ?? false,
  )
  const [ajusteManual, setAjusteManual] = useState<number>(0)

  const cidadeAtual = cidades.find((c) => c.id === cidadeId)
  const kmDeslocamento = cidadeAtual?.km ?? 0

  const entradas: EntradasLimpeza = {
    qtd_modulos: qtdPlacas,
    tipo_telhado: tipoTelhado,
    altura_telhado_m: null,
    pavimento,
    km_deslocamento: kmDeslocamento,
    programacao: 'normal',
    qtd_instaladores: 1,   // será sobrescrito pela decisão automática
    dias_estimados: 1,     // idem
    tem_ponto_agua: temPontoAgua,
    tem_ponto_energia: temPontoEnergia,
    sujidade,
    cliente_disponibiliza_ajudante: clienteAjudante,
    pe_direito_m: peDireitoM,
    cidade_id: cidadeId,
  }

  // Decide qtd técnicos SEM considerar o toggle do ajudante — pra saber se toggle deve aparecer
  const tecnicosNaturais = useMemo(
    () => decidirQtdTecnicos({ ...entradas, cliente_disponibiliza_ajudante: false }, parametros),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qtdPlacas, pavimento, peDireitoM, parametros],
  )

  const resultado = useMemo(
    () => calcularLimpezaAutomatico(entradas, parametros),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cidadeId, tipoTelhado, pavimento, peDireitoM, sujidade, temPontoAgua, temPontoEnergia, clienteAjudante, qtdPlacas, parametros],
  )

  const valorFinal = Math.max(0, resultado.subtotal + ajusteManual)

  function salvar() {
    if (!qtdPlacas || qtdPlacas < 1) { setErro('Informe a quantidade de placas'); return }
    setMsg(null); setErro(null)
    startTransition(async () => {
      // Salva a proposta E atualiza a qtd de placas cadastrada no telhado
      // (o vendedor pode ter ajustado durante a montagem da proposta).
      const [r1, r2] = await Promise.all([
        salvarPropostaTelhadoAction(telhadoId, {
          entradas: entradas as unknown as Record<string, unknown>,
          resultado: { ...resultado, ajuste_manual: ajusteManual, valor_final: valorFinal } as unknown as Record<string, unknown>,
          valor_final: valorFinal,
        }),
        qtdPlacas !== qtdPlacasInicial
          ? editarTelhadoAction(telhadoId, { qtd_placas_estimada: qtdPlacas })
          : Promise.resolve({ sucesso: true } as const),
      ])
      if (r1?.erro) { setErro(r1.erro); return }
      if ('erro' in r2 && r2.erro) { setErro(r2.erro); return }
      setMsg('✓ Proposta salva')
      router.refresh()
    })
  }

  if (cidades.length === 0) {
    return (
      <div className="p-3 bg-coral/10 border border-coral/30 rounded-lg text-xs text-coral">
        Nenhuma cidade cadastrada em <strong>/admin/precificacao/cidades</strong>. Adicione cidades ativas pra o simulador funcionar.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header do sistema — placas editáveis + cidade automática */}
      <div className="grid grid-cols-2 gap-2 p-2.5 bg-white/[0.04] border border-white/10 rounded-lg">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Placas do sistema</p>
          <div className="flex items-baseline gap-1.5">
            <input
              type="number" min={1} max={10000} value={qtdPlacas || ''}
              onChange={(e) => setQtdPlacas(Number(e.target.value))}
              className="w-16 px-1.5 py-0.5 bg-white/5 border border-white/15 rounded text-sm text-white font-bold text-right tabular-nums"
            />
            <span className="text-[11px] text-white/50">placas</span>
            <span className="text-[11px] text-sol tabular-nums">· {potenciaKwpAtual} kWp</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Cidade / km</p>
          <p className="text-sm text-white font-bold">
            {cidadeAtual ? (
              <>
                {cidadeAtual.cidade}
                <span className="text-sol"> · {cidadeAtual.km}km</span>
              </>
            ) : '—'}
          </p>
        </div>
      </div>

      {/* Fallback: cidade do telhado não bateu com a lista → precisa escolher manual */}
      {cidadeDoTelhadoNaoAchou && (
        <div className="p-2.5 bg-coral/10 border border-coral/25 rounded-lg space-y-2">
          <p className="text-[11px] text-coral leading-snug">
            ⚠ A cidade cadastrada no telhado (<strong>{cidadeTelhado}</strong>) não está na lista de cidades atendidas.
            Escolhe abaixo ou pede pro admin cadastrar em <code className="text-sol">/admin/precificacao/cidades</code>.
          </p>
          <select value={cidadeId} onChange={(e) => setCidadeId(e.target.value)} className="input">
            {cidades.map((c) => (
              <option key={c.id} value={c.id} style={OPT_STYLE}>{c.cidade}/{c.uf} · {c.km}km</option>
            ))}
          </select>
        </div>
      )}

      {/* Caso cidade veio da proposta salva antiga (diferente da atual do telhado): permite trocar */}
      {!cidadeDoTelhadoNaoAchou && !cidadeFoiMatchada && cidades.length > 0 && (
        <details className="p-2.5 bg-white/[0.02] border border-white/10 rounded-lg text-xs">
          <summary className="text-white/50 cursor-pointer">Trocar cidade (opcional)</summary>
          <select value={cidadeId} onChange={(e) => setCidadeId(e.target.value)} className="input mt-2">
            {cidades.map((c) => (
              <option key={c.id} value={c.id} style={OPT_STYLE}>{c.cidade}/{c.uf} · {c.km}km</option>
            ))}
          </select>
        </details>
      )}

      {/* Tipo de telhado */}
      <Campo label="Tipo de telhado">
        <select value={tipoTelhado} onChange={(e) => setTipoTelhado(e.target.value as TipoTelhado)} className="input">
          {OPCOES_TELHADO.map((t) => (
            <option key={t.id} value={t.id} style={OPT_STYLE}>{t.label}</option>
          ))}
        </select>
      </Campo>

      <div className="grid grid-cols-2 gap-2">
        <Campo label="Pavimento">
          <select value={pavimento} onChange={(e) => setPavimento(e.target.value as Pavimento)} className="input">
            {OPCOES_PAVIMENTO.map((p) => (
              <option key={p.id} value={p.id} style={OPT_STYLE}>{p.label}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Pé direito (m)">
          <input type="number" min={2} max={30} step={0.5} value={peDireitoM}
            onChange={(e) => setPeDireitoM(Number(e.target.value))}
            className="input" />
        </Campo>
      </div>

      {/* Sujidade */}
      <Campo label="Nível de sujidade">
        <div className="grid grid-cols-3 gap-1">
          {(['leve', 'medio', 'pesado'] as Sujidade[]).map((s) => (
            <button key={s} type="button" onClick={() => setSujidade(s)}
              className={`px-2 py-1.5 text-xs font-semibold rounded border transition ${
                sujidade === s ? 'bg-sol text-noite-0 border-sol' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
              }`}>
              {s === 'leve' ? 'Leve' : s === 'medio' ? 'Médio' : 'Pesado'}
            </button>
          ))}
        </div>
      </Campo>

      {/* Pontos no local */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded cursor-pointer text-xs text-white/80">
          <input type="checkbox" checked={temPontoAgua} onChange={(e) => setTemPontoAgua(e.target.checked)} className="accent-sol" />
          <span>💧 Ponto de água no local</span>
        </label>
        <label className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded cursor-pointer text-xs text-white/80">
          <input type="checkbox" checked={temPontoEnergia} onChange={(e) => setTemPontoEnergia(e.target.checked)} className="accent-sol" />
          <span>⚡ Ponto de energia</span>
        </label>
      </div>

      {/* Toggle ajudante — só aparece se seria 2 técnicos */}
      {tecnicosNaturais === 2 && (
        <label className="flex items-start gap-2 p-3 bg-weg-azul/10 border border-weg-azul/30 rounded-lg cursor-pointer">
          <input type="checkbox" checked={clienteAjudante} onChange={(e) => setClienteAjudante(e.target.checked)}
            className="mt-0.5 accent-sol" />
          <div>
            <p className="text-xs text-weg-azul font-bold">🤝 Cliente disponibiliza ajudante de chão</p>
            <p className="text-[11px] text-white/60 leading-snug mt-0.5">
              Como o serviço exigiria 2 técnicos ({tecnicosNaturais > 200 ? '>200 placas' : ''}
              {pavimento !== 'terreo' ? ` pavimento ${pavimento}` : ''}
              {peDireitoM > 6 ? ` pé direito ${peDireitoM}m` : ''}), marcar essa opção reduz pra 1 técnico e diminui o custo.
            </p>
          </div>
        </label>
      )}

      {/* Resumo do cálculo */}
      <div className="mt-3 p-3 bg-sol/[0.06] border border-sol/25 rounded-lg space-y-2">
        <div className="grid grid-cols-2 gap-2 text-center">
          <ResumoItem label="Técnicos" valor={String(resultado.qtd_tecnicos_calculado ?? '—')} />
          <ResumoItem label="Dias" valor={String(resultado.dias_calculado ?? '—')} />
        </div>

        <div className="pt-2 border-t border-white/10 space-y-0.5 text-[11px] text-white/60">
          <LinhaBreakdown rotulo="Mão de obra" valor={resultado.mao_obra} />
          <LinhaBreakdown rotulo="Deslocamento" valor={resultado.deslocamento} />
          <LinhaBreakdown rotulo="Diárias" valor={resultado.diarias} />
          <LinhaBreakdown rotulo="Insumos + EPI" valor={resultado.insumos_total} />
        </div>

        <div className="pt-2 border-t border-white/10 flex items-baseline justify-between">
          <span className="text-xs text-white/70">Subtotal</span>
          <span className="text-lg font-black text-white tabular-nums">{brl(resultado.subtotal)}</span>
        </div>

        {resultado.aplicou_visita_minima && (
          <p className="text-[10px] text-sol">⚠ Aplicada visita mínima ({brl(parametros.valor_minimo_visita)}).</p>
        )}
      </div>

      {/* Ajuste manual */}
      <Campo label={`Ajuste manual (R$) — desconto ou acréscimo`}>
        <input type="number" step={10} value={ajusteManual}
          onChange={(e) => setAjusteManual(Number(e.target.value))}
          placeholder="0"
          className="input" />
      </Campo>

      {/* Valor final */}
      <div className="p-3 bg-verde/[0.08] border border-verde/30 rounded-lg flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider font-bold text-verde">Valor da proposta</span>
        <span className="text-2xl font-black text-verde tabular-nums">{brl(valorFinal)}</span>
      </div>

      {erro && <p className="text-xs text-coral">{erro}</p>}
      {msg && <p className="text-xs text-verde">{msg}</p>}

      <button
        onClick={salvar}
        disabled={isPending}
        className="w-full px-4 py-2.5 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro disabled:opacity-50"
      >
        {isPending ? 'Salvando...' : propostaAnterior ? '↻ Atualizar proposta' : '💾 Salvar proposta'}
      </button>

      {propostaAnterior && (
        <p className="text-[10px] text-white/40 text-center">
          Proposta anterior: {brl(propostaAnterior.valor_final)}
        </p>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.375rem 0.5rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 0.375rem;
          color: white;
          font-size: 0.8125rem;
        }
      `}</style>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">{label}</label>
      {children}
    </div>
  )
}

function ResumoItem({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-white/5 rounded p-1.5">
      <p className="text-[9px] uppercase text-white/40">{label}</p>
      <p className="text-sm font-bold text-white">{valor}</p>
    </div>
  )
}

function LinhaBreakdown({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex justify-between">
      <span>{rotulo}</span>
      <span className="tabular-nums">{brl(valor)}</span>
    </div>
  )
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
