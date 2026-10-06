import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { carregarLista, LISTAS } from '@/lib/dashboard/listas'
import { janelaMes } from '@/lib/dashboard/regras'
import { formatarMoedaBRL } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/lista?m=<indicador>&mes=YYYY-MM&pessoa=<id> — Kalebe 2026-10-06:
 * "no dashboard eu possa acessar as vendas em lista do mês, a lista de
 * leads do mês, dos projetos... cada um dos campos eu posso acessar a lista".
 */
const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const dataBR = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

function mesVizinho(mes: string, delta: number) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default async function ListaDashboardPage({ searchParams }: { searchParams: { m?: string; mes?: string; pessoa?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chave = searchParams.m || ''
  if (!LISTAS[chave]) redirect('/dashboard')
  const r = await carregarLista(chave, { mes: searchParams.mes, pessoa: searchParams.pessoa })
  const janela = janelaMes(searchParams.mes)
  const url = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams()
    q.set('m', chave)
    const mes = extra.mes !== undefined ? extra.mes : searchParams.mes || null
    const pessoa = extra.pessoa !== undefined ? extra.pessoa : searchParams.pessoa || null
    if (mes) q.set('mes', mes)
    if (pessoa) q.set('pessoa', pessoa)
    return `/dashboard/lista?${q}`
  }

  if ('erro' in r) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-xl mx-auto space-y-3">
          <Link href="/dashboard" className="text-sm text-white/60 hover:text-white">← Dashboard</Link>
          <div className="p-4 rounded-xl bg-coral/10 border border-coral/30 text-sm text-coral">{r.erro}</div>
        </div>
      </main>
    )
  }

  const total = r.linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const nomePessoa = searchParams.pessoa ? r.linhas.find((l) => l.pessoa)?.pessoa || 'pessoa selecionada' : null
  const [ano, mes] = janela.mes.split('-').map(Number)

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="max-w-screen-xl mx-auto space-y-5">
        <header className="space-y-2">
          <Link href="/dashboard" className="text-xs text-white/50 hover:text-white">← Dashboard</Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">
                {r.titulo}{r.porMes && <span className="text-sol"> · {NOME_MES[mes - 1]} de {ano}</span>}
              </h1>
              <p className="text-xs text-white/55 mt-1 max-w-3xl">{r.regra}</p>
            </div>
            {r.porMes && (
              <div className="flex items-center gap-1">
                <Link href={url({ mes: mesVizinho(janela.mes, -1) })} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:text-white">← mês anterior</Link>
                <Link href={url({ mes: mesVizinho(janela.mes, 1) })} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:text-white">próximo →</Link>
              </div>
            )}
          </div>
          {nomePessoa && (
            <p className="text-xs">
              <span className="px-2 py-1 rounded-full bg-sol/10 border border-sol/30 text-sol">👤 {nomePessoa}</span>
              <Link href={url({ pessoa: null })} className="ml-2 text-white/50 hover:text-white underline">ver de todos</Link>
            </p>
          )}
        </header>

        <div className="flex flex-wrap gap-3">
          <div className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10">
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Quantidade</p>
            <p className="text-2xl font-black text-white">{r.linhas.length.toLocaleString('pt-BR')}</p>
          </div>
          {r.somaValor && (
            <div className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10">
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Valor total</p>
              <p className="text-2xl font-black text-verde">{formatarMoedaBRL(total)}</p>
            </div>
          )}
        </div>

        {r.linhas.length === 0 ? (
          <p className="text-sm text-white/40 py-12 text-center">Nada nesta lista{r.porMes ? ' neste mês' : ''}.</p>
        ) : (
          <>
            {/* Celular: cartões */}
            <div className="md:hidden space-y-2">
              {r.linhas.map((l) => (
                <Link key={l.id} href={l.href} className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-sol/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white">{l.cliente}</p>
                    {r.somaValor && l.valor ? <p className="text-sm font-bold text-verde shrink-0">{formatarMoedaBRL(l.valor)}</p> : null}
                  </div>
                  <p className="text-[11px] text-white/55">
                    {[l.codigo, l.status, l.extra, l.pessoa].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-[11px] text-white/40">{r.rotuloData}: {dataBR(l.data)}</p>
                </Link>
              ))}
            </div>

            {/* Computador: tabela */}
            <div className="hidden md:block rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wider text-white/50">
                  <tr>
                    <th className="text-left px-3 py-2">Cliente</th>
                    <th className="text-left px-3 py-2">Projeto</th>
                    <th className="text-left px-3 py-2">Etapa</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Responsável</th>
                    <th className="text-left px-3 py-2">{r.rotuloData}</th>
                    {r.somaValor && <th className="text-right px-3 py-2">Valor</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {r.linhas.map((l) => (
                    <tr key={l.id} className="hover:bg-white/[0.03]">
                      <td className="px-3 py-2"><Link href={l.href} className="text-white font-semibold hover:text-sol">{l.cliente}</Link></td>
                      <td className="px-3 py-2 text-white/60 font-mono text-xs">{l.codigo || '—'}</td>
                      <td className="px-3 py-2 text-white/70">{l.status || '—'}</td>
                      <td className="px-3 py-2 text-white/60">{l.extra || '—'}</td>
                      <td className="px-3 py-2 text-white/60">{l.pessoa || '—'}</td>
                      <td className="px-3 py-2 text-white/60">{dataBR(l.data)}</td>
                      {r.somaValor && <td className="px-3 py-2 text-right text-white font-semibold">{l.valor ? formatarMoedaBRL(l.valor) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
