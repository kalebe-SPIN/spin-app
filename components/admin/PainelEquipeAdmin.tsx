'use client'

import { useEffect, useState, useTransition } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  buscarPainelEquipeAction,
  type PainelEquipe,
  type MetricasRepresentante,
  type MetricasVendedorServ,
  type MetricasProfissionalCampo,
  type LinhaRank,
  type EtapaFunil,
  type ComparativoMes,
} from '@/app/admin/equipe/actions'
import { GraficoPizza } from '@/components/GraficoPizza'

/**
 * Painel de desempenho da equipe comercial em tempo real.
 * Fetch inicial via server action + subscribe em postgres_changes das
 * 3 tabelas (projetos, telhados, execucoes_servicos). Ao receber evento,
 * refetch (menor overhead que patch localmente).
 *
 * Só é montado quando modo=admin (gated no /dashboard/page.tsx).
 */
export function PainelEquipeAdmin({ dadosIniciais }: { dadosIniciais: PainelEquipe }) {
  const [dados, setDados] = useState<PainelEquipe>(dadosIniciais)
  const [refetching, startRefetch] = useTransition()
  const [ultimaAtual, setUltimaAtual] = useState<Date>(new Date())
  const [aberto, setAberto] = useState<{ tipo: 'representante' | 'vendedor_serv' | 'campo'; id: string } | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // Refetch com debounce (evita rajada de queries se vários eventos chegarem juntos)
    let timer: ReturnType<typeof setTimeout> | null = null
    const refetchDebounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        startRefetch(async () => {
          const r = await buscarPainelEquipeAction()
          if (!('erro' in r)) {
            setDados(r)
            setUltimaAtual(new Date())
          }
        })
      }, 800)
    }

    const canal = supabase
      .channel('equipe-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projetos' }, refetchDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'telhados' }, refetchDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execucoes_servicos' }, refetchDebounced)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(canal)
    }
  }, [])

  const t = dados.totais

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
            👥 Equipe comercial <span className="text-white/40 normal-case font-normal">em tempo real</span>
          </h2>
          <p className="text-xs text-white/50 mt-0.5">
            Atualiza automaticamente quando alguém cria projeto, prospecta telhado ou conclui OS ·
            <span className="ml-1 text-white/40">
              última: {ultimaAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {refetching && ' · atualizando...'}
            </span>
          </p>
        </div>
      </div>

      {/* KPIs consolidados da equipe inteira */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTotal label="Projetos criados" valor={t.projetos_criados} cor="text-sol" hint="mês corrente" />
        <KpiTotal label="Contratos assinados" valor={t.contratos_assinados} cor="text-verde" hint={fmtBRL(t.vendas_valor)} />
        <KpiTotal label="Telhados no CRM" valor={t.telhados_prospectados} cor="text-weg-azul" hint={`${t.fechados_servicos} fechados`} />
        <KpiTotal label="OS executadas" valor={t.os_executadas} cor="text-coral" hint={fmtBRL(t.faturamento_execucao)} />
      </div>

      {/* ═══ Painel executivo ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Pizza — faturamento por linha */}
        <BlocoExec titulo="💰 Faturamento por linha" hint="mês corrente" cor="sol">
          <GraficoPizza
            fatias={dados.faturamentoPorLinha.map((f) => ({ rotulo: f.linha, valor: f.valor, cor: f.cor }))}
            tamanho={160}
            donut
            fmtValor={fmtBRL}
          />
        </BlocoExec>

        {/* Comparativo mês vs mês passado */}
        <BlocoExec titulo="📈 Mês corrente vs mês passado" hint="fechamentos + OS" cor="verde">
          <ComparativoBloco c={dados.comparativo} />
        </BlocoExec>

        {/* Funil comercial */}
        <BlocoExec titulo="🎯 Funil comercial consolidado" hint="kits solar + serviços" cor="weg-azul">
          <FunilBlocos funil={dados.funil} />
        </BlocoExec>
      </div>

      {/* Rank de vendedores */}
      <div className="mb-6">
        <BlocoExec titulo="🏆 Rank de vendedores no mês" hint={`top ${Math.min(dados.rankVendedores.length, 10)}`} cor="sol">
          <RankVendedores rank={dados.rankVendedores.slice(0, 10)} />
        </BlocoExec>
      </div>

      {/* 3 blocos por tipo de vendedor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Consultores solar */}
        <BlocoTipo
          titulo="☀️ Consultor Solar"
          sub={`${dados.representantes.length} ativo${dados.representantes.length === 1 ? '' : 's'}`}
          cor="sol"
          vazio={dados.representantes.length === 0}
        >
          {dados.representantes.map((r) => (
            <ItemRepres key={r.id} r={r} onClick={() => setAberto({ tipo: 'representante', id: r.id })} />
          ))}
        </BlocoTipo>

        {/* Vendedores de serviços */}
        <BlocoTipo
          titulo="🧽 Vendedor de Serviços"
          sub={`${dados.vendedoresServ.length} ativo${dados.vendedoresServ.length === 1 ? '' : 's'}`}
          cor="weg-azul"
          vazio={dados.vendedoresServ.length === 0}
        >
          {dados.vendedoresServ.map((v) => (
            <ItemVend key={v.id} v={v} onClick={() => setAberto({ tipo: 'vendedor_serv', id: v.id })} />
          ))}
        </BlocoTipo>

        {/* Profissionais de campo */}
        <BlocoTipo
          titulo="🚐 Profissional de Campo"
          sub={`${dados.profissionaisCampo.length} ativo${dados.profissionaisCampo.length === 1 ? '' : 's'}`}
          cor="verde"
          vazio={dados.profissionaisCampo.length === 0}
        >
          {dados.profissionaisCampo.map((c) => (
            <ItemCampo key={c.id} c={c} onClick={() => setAberto({ tipo: 'campo', id: c.id })} />
          ))}
        </BlocoTipo>
      </div>

      {aberto && (
        <ModalDrillDown
          dados={dados}
          selecao={aberto}
          onFechar={() => setAberto(null)}
        />
      )}
    </>
  )
}

function BlocoTipo({ titulo, sub, cor, vazio, children }: {
  titulo: string; sub: string; cor: 'sol' | 'weg-azul' | 'verde'; vazio: boolean; children: React.ReactNode
}) {
  const borderClass = cor === 'sol' ? 'border-sol/30' : cor === 'weg-azul' ? 'border-weg-azul/30' : 'border-verde/30'
  const textClass = cor === 'sol' ? 'text-sol' : cor === 'weg-azul' ? 'text-weg-azul' : 'text-verde'
  return (
    <div className={`bg-white/[0.02] border ${borderClass} rounded-xl p-4`}>
      <div className="mb-3 pb-2 border-b border-white/10 flex items-baseline justify-between">
        <p className={`text-xs font-bold ${textClass}`}>{titulo}</p>
        <p className="text-[10px] text-white/40 uppercase tracking-wider">{sub}</p>
      </div>
      {vazio ? (
        <p className="text-xs text-white/30 italic text-center py-4">nenhum cadastrado</p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  )
}

function ItemRepres({ r, onClick }: { r: MetricasRepresentante; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left p-2 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 rounded-lg transition">
      <p className="text-xs text-white font-semibold truncate">{r.nome}</p>
      <div className="flex items-baseline justify-between mt-0.5 text-[10px]">
        <span className="text-white/50">
          <strong className="text-sol">{r.projetos_criados}</strong> proj ·
          <strong className="text-verde ml-1">{r.contratos_assinados}</strong> venda
        </span>
        <span className="text-verde tabular-nums font-bold">{fmtBRL(r.vendas_valor)}</span>
      </div>
    </button>
  )
}

function ItemVend({ v, onClick }: { v: MetricasVendedorServ; onClick: () => void }) {
  const totalCards = v.telhados_prospectados + v.em_contato + v.em_proposta + v.fechados
  return (
    <button onClick={onClick}
      className="w-full text-left p-2 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 rounded-lg transition">
      <p className="text-xs text-white font-semibold truncate">{v.nome}</p>
      <div className="flex items-baseline justify-between mt-0.5 text-[10px]">
        <span className="text-white/50">
          <strong className="text-weg-azul">{totalCards}</strong> cards ·
          <strong className="text-verde ml-1">{v.fechados}</strong> fech
        </span>
        <span className="text-verde tabular-nums font-bold">{fmtBRL(v.valor_propostas)}</span>
      </div>
    </button>
  )
}

function ItemCampo({ c, onClick }: { c: MetricasProfissionalCampo; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left p-2 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 rounded-lg transition">
      <p className="text-xs text-white font-semibold truncate">{c.nome}</p>
      <div className="flex items-baseline justify-between mt-0.5 text-[10px]">
        <span className="text-white/50">
          <strong className="text-coral">{c.os_executadas}</strong> OS este mês
        </span>
        <span className="text-verde tabular-nums font-bold">{fmtBRL(c.valor_faturado)}</span>
      </div>
    </button>
  )
}

function KpiTotal({ label, valor, cor, hint }: { label: string; valor: number; cor: string; hint: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{label}</p>
      <p className={`text-2xl md:text-3xl font-black mt-1 tabular-nums ${cor}`}>{valor.toLocaleString('pt-BR')}</p>
      <p className="text-[10px] text-white/40 mt-0.5">{hint}</p>
    </div>
  )
}

function ModalDrillDown({ dados, selecao, onFechar }: {
  dados: PainelEquipe
  selecao: { tipo: 'representante' | 'vendedor_serv' | 'campo'; id: string }
  onFechar: () => void
}) {
  const pessoa = selecao.tipo === 'representante'
    ? dados.representantes.find((p) => p.id === selecao.id)
    : selecao.tipo === 'vendedor_serv'
    ? dados.vendedoresServ.find((p) => p.id === selecao.id)
    : dados.profissionaisCampo.find((p) => p.id === selecao.id)

  if (!pessoa) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onFechar}>
      <div className="bg-noite border border-sol/25 rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">
              {selecao.tipo === 'representante' ? 'Consultor Solar' : selecao.tipo === 'vendedor_serv' ? 'Vendedor de Serviços' : 'Profissional de Campo'}
            </p>
            <p className="text-lg font-black text-white">{pessoa.nome}</p>
          </div>
          <button onClick={onFechar} className="text-white/50 hover:text-white text-xl">×</button>
        </div>

        {selecao.tipo === 'representante' && 'projetos_criados' in pessoa && (
          <div className="space-y-2">
            <LinhaDetalhe rotulo="Projetos criados no mês" valor={String(pessoa.projetos_criados)} />
            <LinhaDetalhe rotulo="Projetos ativos" valor={String(pessoa.projetos_ativos)} />
            <LinhaDetalhe rotulo="Propostas enviadas" valor={String(pessoa.propostas_enviadas)} />
            <LinhaDetalhe rotulo="Contratos assinados" valor={String(pessoa.contratos_assinados)} destaque />
            <LinhaDetalhe rotulo="Total em vendas" valor={fmtBRL(pessoa.vendas_valor)} destaque cor="verde" />
          </div>
        )}

        {selecao.tipo === 'vendedor_serv' && 'telhados_prospectados' in pessoa && (
          <div className="space-y-2">
            <LinhaDetalhe rotulo="Em prospecção" valor={String(pessoa.telhados_prospectados)} />
            <LinhaDetalhe rotulo="Em contato" valor={String(pessoa.em_contato)} />
            <LinhaDetalhe rotulo="Em proposta" valor={String(pessoa.em_proposta)} />
            <LinhaDetalhe rotulo="Fechados" valor={String(pessoa.fechados)} destaque />
            <LinhaDetalhe rotulo="Valor das propostas" valor={fmtBRL(pessoa.valor_propostas)} destaque cor="verde" />
          </div>
        )}

        {selecao.tipo === 'campo' && 'os_executadas' in pessoa && (
          <div className="space-y-2">
            <LinhaDetalhe rotulo="OS executadas no mês" valor={String(pessoa.os_executadas)} destaque />
            <LinhaDetalhe rotulo="Faturamento das OS" valor={fmtBRL(pessoa.valor_faturado)} destaque cor="verde" />
          </div>
        )}
      </div>
    </div>
  )
}

function LinhaDetalhe({ rotulo, valor, destaque, cor }: { rotulo: string; valor: string; destaque?: boolean; cor?: 'verde' | 'sol' }) {
  const corClass = cor === 'verde' ? 'text-verde' : cor === 'sol' ? 'text-sol' : 'text-white'
  return (
    <div className={`flex items-center justify-between p-2.5 rounded-lg ${destaque ? 'bg-white/[0.05] border border-white/10' : ''}`}>
      <span className="text-sm text-white/70">{rotulo}</span>
      <span className={`text-sm font-bold tabular-nums ${corClass}`}>{valor}</span>
    </div>
  )
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// ═══════════════════════════════════════════════════════════════
// Bloco executivo (contêiner das seções de faturamento/funil/rank)
// ═══════════════════════════════════════════════════════════════
function BlocoExec({ titulo, hint, cor, children }: {
  titulo: string; hint: string; cor: 'sol' | 'verde' | 'weg-azul'; children: React.ReactNode
}) {
  const borderClass =
    cor === 'sol' ? 'border-sol/30' : cor === 'weg-azul' ? 'border-weg-azul/30' : 'border-verde/30'
  const textClass =
    cor === 'sol' ? 'text-sol' : cor === 'weg-azul' ? 'text-weg-azul' : 'text-verde'
  return (
    <div className={`bg-white/[0.02] border ${borderClass} rounded-xl p-4`}>
      <div className="mb-3 pb-2 border-b border-white/10 flex items-baseline justify-between">
        <p className={`text-xs font-bold ${textClass}`}>{titulo}</p>
        <p className="text-[10px] text-white/40 uppercase tracking-wider">{hint}</p>
      </div>
      {children}
    </div>
  )
}

// ─── Comparativo mês vs mês passado ────────────────────────────
function ComparativoBloco({ c }: { c: ComparativoMes }) {
  return (
    <div className="space-y-3">
      <DeltaLinha
        rotulo="Faturamento"
        atual={c.faturamento_mes}
        anterior={c.faturamento_mes_passado}
        formatador={fmtBRL}
      />
      <DeltaLinha
        rotulo="Contratos fechados"
        atual={c.contratos_mes}
        anterior={c.contratos_mes_passado}
      />
      <DeltaLinha
        rotulo="OS executadas"
        atual={c.os_mes}
        anterior={c.os_mes_passado}
      />
    </div>
  )
}

function DeltaLinha({ rotulo, atual, anterior, formatador }: {
  rotulo: string; atual: number; anterior: number; formatador?: (v: number) => string
}) {
  const fmt = formatador || ((v: number) => v.toLocaleString('pt-BR'))
  const delta = anterior === 0 ? (atual > 0 ? 100 : 0) : ((atual - anterior) / anterior) * 100
  const sinal = delta > 0 ? '▲' : delta < 0 ? '▼' : '='
  const cor = delta > 0 ? 'text-verde' : delta < 0 ? 'text-coral' : 'text-white/50'

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-white/60">{rotulo}</span>
        <span className={`font-bold tabular-nums ${cor}`}>
          {sinal} {Math.abs(delta).toFixed(0)}%
        </span>
      </div>
      <div className="flex items-baseline justify-between text-[11px] mt-0.5">
        <span className="text-white/80 font-bold tabular-nums">{fmt(atual)}</span>
        <span className="text-white/30 tabular-nums">antes: {fmt(anterior)}</span>
      </div>
    </div>
  )
}

// ─── Funil comercial (barras horizontais escalonadas) ──────────
function FunilBlocos({ funil }: { funil: EtapaFunil[] }) {
  const maxQtd = Math.max(...funil.map((e) => e.quantidade), 1)
  const cores: Record<EtapaFunil['chave'], string> = {
    prospeccao: '#6B7280',
    contato:    '#587FFF',
    proposta:   '#F5B400',
    fechado:    '#4EDC8A',
  }
  return (
    <div className="space-y-2">
      {funil.map((e) => {
        const pct = (e.quantidade / maxQtd) * 100
        return (
          <div key={e.chave}>
            <div className="flex items-baseline justify-between text-[11px] mb-1">
              <span className="text-white/70">{e.rotulo}</span>
              <span className="text-white font-bold tabular-nums">
                {e.quantidade}
                {e.valor > 0 && <span className="text-white/40 ml-1.5 font-normal">· {fmtBRL(e.valor)}</span>}
              </span>
            </div>
            <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(pct, 2)}%`, background: cores[e.chave] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Rank consolidado de vendedores ────────────────────────────
function RankVendedores({ rank }: { rank: LinhaRank[] }) {
  if (rank.length === 0) {
    return (
      <p className="text-xs text-white/30 italic text-center py-6">
        Nenhum vendedor com fechamento ainda neste mês.
      </p>
    )
  }
  const topValor = rank[0]?.vendido || 1
  return (
    <div className="space-y-1.5">
      {rank.map((v, i) => {
        const pct = topValor > 0 ? (v.vendido / topValor) * 100 : 0
        const roleLabel = v.role === 'representante' ? '☀️ Solar' : '🧽 Serviços'
        const roleCor = v.role === 'representante' ? 'text-sol' : 'text-weg-azul'
        const rotuloReal = v.role === 'admin' ? '👑 Admin/Solar' : roleLabel
        return (
          <div key={v.id} className="flex items-center gap-3 p-2 bg-white/[0.03] border border-white/5 rounded-lg">
            <span className="text-white/40 font-black text-sm tabular-nums w-6 text-center">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-white font-semibold truncate">{v.nome}</p>
                <p className="text-xs text-verde tabular-nums font-bold flex-shrink-0 ml-2">
                  {fmtBRL(v.vendido)}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] uppercase tracking-wider font-bold ${roleCor}`}>{rotuloReal}</span>
                <div className="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-verde rounded-full"
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/40 tabular-nums flex-shrink-0">
                  {v.em_proposta} em proposta
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
