'use client'

import { useEffect, useState, useTransition } from 'react'
import { fmtNum } from '@/lib/formatters'
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

      {/* KPIs consolidados — 4 cards do mês (Kalebe 2026-09-06) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* Card 1 — PROJETOS (Kalebe 2026-09-11: reformado) */}
        <CardProjetosDoMes card={dados.cardProjetos} />

        {/* Card 2 — PERFIL DAS PROPOSTAS (Kalebe 2026-09-11: reformado) */}
        <CardPerfilDasPropostas card={dados.cardPerfil} />

        {/* Card 3 — NEGÓCIOS DO MÊS (Kalebe 2026-09-11: reformado) */}
        <CardNegociosDoMes card={dados.cardNegocios} />

        {/* Card 4 — OS executadas (mantido) */}
        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-2">OS executadas</p>
          <div className="flex items-baseline gap-3 mb-3">
            <p className="text-4xl font-black text-coral">{t.os_executadas}</p>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">no mês</p>
          </div>
          <div className="pt-3 border-t border-white/5">
            <MiniLinha label="Faturamento" valor={fmtBRL(t.faturamento_execucao)} destaque="coral" />
          </div>
        </div>
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
          titulo="⭐ Representante Spin"
          sub={`${dados.representantes.length} ativo${dados.representantes.length === 1 ? '' : 's'}`}
          cor="sol"
          vazio={dados.representantes.length === 0}
        >
          {dados.representantes.map((r) => (
            <ItemRepres key={r.id} r={r} onClick={() => setAberto({ tipo: 'representante', id: r.id })} />
          ))}
        </BlocoTipo>

        {/* Vendedores de serviços — só renderiza se ainda houver usuários
            com role legado 'vendedor_servicos' (não unificados). Ficou aqui
            só pra transição — se tudo migrou pra representante, some. */}
        {dados.vendedoresServ.length > 0 && (
          <BlocoTipo
            titulo="🧽 Vendedor de Serviços (legado)"
            sub={`${dados.vendedoresServ.length} ativo${dados.vendedoresServ.length === 1 ? '' : 's'}`}
            cor="weg-azul"
            vazio={false}
          >
            {dados.vendedoresServ.map((v) => (
              <ItemVend key={v.id} v={v} onClick={() => setAberto({ tipo: 'vendedor_serv', id: v.id })} />
            ))}
          </BlocoTipo>
        )}

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
              {selecao.tipo === 'representante' ? 'Representante Spin' : selecao.tipo === 'vendedor_serv' ? 'Vendedor de Serviços' : 'Profissional de Campo'}
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
          {sinal} {fmtNum(Math.abs(delta), 0)}%
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

/** Kalebe 2026-09-06: linha compacta pra breakdown dentro dos 4 KPIs do topo */
function MiniLinha({ label, valor, destaque }: {
  label: string
  valor: string
  destaque?: 'sol' | 'verde' | 'coral' | 'weg-azul'
}) {
  const cor = destaque === 'sol' ? 'text-sol'
    : destaque === 'verde' ? 'text-verde'
    : destaque === 'coral' ? 'text-coral'
    : destaque === 'weg-azul' ? 'text-weg-azul'
    : 'text-white'
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-white/50">{label}</span>
      <span className={`${cor} font-mono font-semibold`}>{valor}</span>
    </div>
  )
}

// ==========================================================
// CARD PROJETOS DO MÊS (Kalebe 2026-09-11)
// Layout: valor total (grande) + qtd abertos (grande) lado a lado no topo.
// Breakdown por origem (campanha/pós-venda/prospecção) com barra empilhada
// horizontal e legenda em baixo.
// ==========================================================
function CardProjetosDoMes({ card }: {
  card: {
    abertos_mes: number
    com_proposta: number
    valor_total: number
    por_origem: { campanha: number; pos_venda: number; prospeccao: number }
  }
}) {
  const { por_origem, abertos_mes, com_proposta, valor_total } = card
  const totalOrigem = por_origem.campanha + por_origem.pos_venda + por_origem.prospeccao
  const pct = (n: number) => totalOrigem === 0 ? 0 : Math.round((n / totalOrigem) * 100)

  // Formata valor grande — se valor total >= 100k, usa fonte um pouco menor pra caber.
  const valorStr = fmtBRL(valor_total)
  const valorFonte = valor_total >= 1000000 ? 'text-xl'
    : valor_total >= 100000 ? 'text-2xl'
    : 'text-3xl'

  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-3">Projetos do mês</p>

      {/* Topo: valor total (grande) + qtd abertos (grande) */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className={`${valorFonte} font-black text-sol leading-none whitespace-nowrap`}>{valorStr}</p>
          <p className="text-[9px] text-white/40 uppercase tracking-wider mt-1.5">Valor total</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black text-white leading-none">{abertos_mes}</p>
          <p className="text-[9px] text-white/40 uppercase tracking-wider mt-1.5">Abertos</p>
        </div>
      </div>

      {/* Barra empilhada — proporção por origem */}
      {totalOrigem > 0 ? (
        <>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden flex mb-2.5">
            {por_origem.campanha > 0 && (
              <div
                title={`Campanha · ${por_origem.campanha}`}
                style={{ width: `${(por_origem.campanha / totalOrigem) * 100}%` }}
                className="bg-sol"
              />
            )}
            {por_origem.pos_venda > 0 && (
              <div
                title={`Pós-venda · ${por_origem.pos_venda}`}
                style={{ width: `${(por_origem.pos_venda / totalOrigem) * 100}%` }}
                className="bg-verde"
              />
            )}
            {por_origem.prospeccao > 0 && (
              <div
                title={`Prospecção · ${por_origem.prospeccao}`}
                style={{ width: `${(por_origem.prospeccao / totalOrigem) * 100}%` }}
                className="bg-weg-azul"
              />
            )}
          </div>

          {/* Legenda */}
          <div className="space-y-1 text-[11px]">
            <OrigemLinha cor="bg-sol" label="Campanha" n={por_origem.campanha} pct={pct(por_origem.campanha)} />
            <OrigemLinha cor="bg-verde" label="Pós-venda" n={por_origem.pos_venda} pct={pct(por_origem.pos_venda)} />
            <OrigemLinha cor="bg-weg-azul" label="Prospecção" n={por_origem.prospeccao} pct={pct(por_origem.prospeccao)} />
          </div>
        </>
      ) : (
        <p className="text-[11px] text-white/40 italic">Sem projetos abertos este mês.</p>
      )}

      {/* Rodapé — com proposta */}
      <div className="pt-3 mt-3 border-t border-white/5 text-[11px]">
        <MiniLinha label="Com proposta" valor={String(com_proposta)} destaque="sol" />
      </div>
    </div>
  )
}

function OrigemLinha({ cor, label, n, pct }: { cor: string; label: string; n: number; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cor}`} />
      <span className="text-white/70 flex-1 truncate">{label}</span>
      <span className="text-white font-mono font-semibold tabular-nums w-6 text-right">{n}</span>
      <span className="text-white/40 font-mono tabular-nums w-9 text-right">{pct}%</span>
    </div>
  )
}

// ==========================================================
// CARD PERFIL DAS PROPOSTAS (Kalebe 2026-09-11)
// Topo: qtd propostas + % de conversão do funil do mês (propostas ÷ leads).
// Mini donut PJ × PF (com propostas) + legenda com efetividade de cada tipo.
// Removido: breakdown de tipo (on-grid/híbrido/limpeza/O&M).
// ==========================================================
function CardPerfilDasPropostas({ card }: {
  card: {
    total_propostas: number
    pj: number
    pf: number
    leads_pj_mes: number
    leads_pf_mes: number
    leads_total_mes: number
    efetividade_pct: number
    efetividade_pj_pct: number
    efetividade_pf_pct: number
  }
}) {
  const { total_propostas, pj, pf, leads_pj_mes, leads_pf_mes, leads_total_mes } = card
  const totalNoDonut = pj + pf
  const pctPj = totalNoDonut === 0 ? 0 : Math.round((pj / totalNoDonut) * 100)
  const pctPf = totalNoDonut === 0 ? 0 : Math.round((pf / totalNoDonut) * 100)

  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-3">Perfil das propostas</p>

      {/* Topo: propostas + conversão */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-3xl font-black text-weg-azul leading-none">{total_propostas}</p>
          <p className="text-[9px] text-white/40 uppercase tracking-wider mt-1.5">Propostas</p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-black leading-none ${card.efetividade_pct >= 50 ? 'text-verde' : card.efetividade_pct >= 25 ? 'text-sol' : 'text-coral'}`}>
            {card.efetividade_pct}%
          </p>
          <p className="text-[9px] text-white/40 uppercase tracking-wider mt-1.5">
            Conversão · {total_propostas}/{leads_total_mes}
          </p>
        </div>
      </div>

      {/* Donut PJ × PF + legenda com efetividade */}
      {totalNoDonut > 0 ? (
        <div className="flex items-center gap-3">
          <MiniDonutPjPf pj={pj} pf={pf} />
          <div className="flex-1 space-y-1.5 text-[11px]">
            <TipoLinha
              cor="bg-weg-azul"
              label="PF"
              n={pf}
              pct={pctPf}
              efetividade={card.efetividade_pf_pct}
              denominador={leads_pf_mes}
            />
            <TipoLinha
              cor="bg-sol"
              label="PJ"
              n={pj}
              pct={pctPj}
              efetividade={card.efetividade_pj_pct}
              denominador={leads_pj_mes}
            />
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-white/40 italic">Sem propostas emitidas este mês.</p>
      )}
    </div>
  )
}

function MiniDonutPjPf({ pj, pf }: { pj: number; pf: number }) {
  const total = pj + pf
  if (total === 0) return null
  const size = 72
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  // PF primeiro (weg-azul), PJ depois (sol)
  const pfLen = (pf / total) * c
  const pjLen = (pj / total) * c
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      {/* PF (weg-azul) — começa no topo, sentido horário */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#587FFF"
        strokeWidth={stroke}
        strokeDasharray={`${pfLen} ${c - pfLen}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="butt"
      />
      {/* PJ (sol) — começa depois do PF */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#F5B400"
        strokeWidth={stroke}
        strokeDasharray={`${pjLen} ${c - pjLen}`}
        strokeDashoffset={-pfLen}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="butt"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="16"
        fontWeight="900"
        fill="rgba(255,255,255,0.9)"
        fontFamily="system-ui"
      >
        {total}
      </text>
    </svg>
  )
}

function TipoLinha({ cor, label, n, pct, efetividade, denominador }: {
  cor: string
  label: string
  n: number
  pct: number
  efetividade: number
  denominador: number
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${cor}`} />
        <span className="text-white/80 font-semibold">{label}</span>
        <span className="text-white font-mono tabular-nums ml-1">{n}</span>
        <span className="text-white/40 font-mono tabular-nums">({pct}%)</span>
      </div>
      <p className="text-[10px] text-white/50 pl-4">
        conv. <span className={`font-mono font-semibold ${efetividade >= 50 ? 'text-verde' : efetividade >= 25 ? 'text-sol' : 'text-coral'}`}>{efetividade}%</span>
        <span className="text-white/30 ml-1">({n}/{denominador})</span>
      </p>
    </div>
  )
}

// ==========================================================
// CARD NEGÓCIOS DO MÊS (Kalebe 2026-09-11)
// Topo: qtd fechados + valor acumulado (grande).
// Barra empilhada horizontal por VALOR: quanto do R$ vem de projetos
// criados neste mês × criados em meses anteriores.
// Rodapé: em negociação · perdidos · parados.
// ==========================================================
function CardNegociosDoMes({ card }: {
  card: {
    fechados_qtd: number
    fechados_valor: number
    fechados_novos_qtd: number
    fechados_novos_valor: number
    fechados_antigos_qtd: number
    fechados_antigos_valor: number
    em_negociacao: number
    perdidos: number
    parados: number
  }
}) {
  const totalValor = card.fechados_valor
  const totalQtd = card.fechados_qtd
  const pctNovosValor = totalValor === 0 ? 0 : Math.round((card.fechados_novos_valor / totalValor) * 100)
  const pctAntigosValor = totalValor === 0 ? 0 : 100 - pctNovosValor

  // Fonte do valor grande escala pra caber
  const valorStr = fmtBRL(totalValor)
  const valorFonte = totalValor >= 1000000 ? 'text-xl'
    : totalValor >= 100000 ? 'text-2xl'
    : 'text-3xl'

  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-3">Negócios do mês</p>

      {/* Topo: qtd fechados + valor acumulado */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-3xl font-black text-verde leading-none">{totalQtd}</p>
          <p className="text-[9px] text-white/40 uppercase tracking-wider mt-1.5">Fechados</p>
        </div>
        <div className="text-right">
          <p className={`${valorFonte} font-black text-verde leading-none whitespace-nowrap`}>{valorStr}</p>
          <p className="text-[9px] text-white/40 uppercase tracking-wider mt-1.5">Valor acumulado</p>
        </div>
      </div>

      {/* Barra empilhada por VALOR + legenda */}
      {totalValor > 0 ? (
        <>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden flex mb-2.5">
            {card.fechados_novos_valor > 0 && (
              <div
                title={`Projetos novos · ${fmtBRL(card.fechados_novos_valor)}`}
                style={{ width: `${(card.fechados_novos_valor / totalValor) * 100}%` }}
                className="bg-sol"
              />
            )}
            {card.fechados_antigos_valor > 0 && (
              <div
                title={`Projetos antigos · ${fmtBRL(card.fechados_antigos_valor)}`}
                style={{ width: `${(card.fechados_antigos_valor / totalValor) * 100}%` }}
                className="bg-weg-azul"
              />
            )}
          </div>

          <div className="space-y-1 text-[11px]">
            <OrigemTemporalLinha
              cor="bg-sol"
              label="Projetos novos"
              qtd={card.fechados_novos_qtd}
              valor={card.fechados_novos_valor}
              pct={pctNovosValor}
            />
            <OrigemTemporalLinha
              cor="bg-weg-azul"
              label="Projetos antigos"
              qtd={card.fechados_antigos_qtd}
              valor={card.fechados_antigos_valor}
              pct={pctAntigosValor}
            />
          </div>
        </>
      ) : (
        <p className="text-[11px] text-white/40 italic">Sem negócios fechados este mês.</p>
      )}

      {/* Rodapé — situação do pipeline */}
      <div className="pt-3 mt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-[10px]">
        <MiniLinha label="Em nego." valor={String(card.em_negociacao)} destaque="sol" />
        <MiniLinha label="Perdidos" valor={String(card.perdidos)} destaque="coral" />
        <MiniLinha label="Parados" valor={String(card.parados)} destaque="coral" />
      </div>
    </div>
  )
}

function OrigemTemporalLinha({ cor, label, qtd, valor, pct }: {
  cor: string; label: string; qtd: number; valor: number; pct: number
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cor}`} />
      <span className="text-white/70 flex-1 truncate">{label}</span>
      <span className="text-white/60 font-mono tabular-nums text-[10px]">{qtd}</span>
      <span className="text-white font-mono font-semibold tabular-nums">{fmtBRL(valor)}</span>
      <span className="text-white/40 font-mono tabular-nums w-9 text-right">{pct}%</span>
    </div>
  )
}
