'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fmtNum } from '@/lib/formatters'
import type { VersaoProposta } from '@/lib/proposta/historico'
import {
  prepararVersaoPropostaAction,
  excluirVersaoPropostaAction,
} from '@/app/projetos/[id]/orcamento/actions'

/**
 * Histórico de propostas emitidas (Kalebe 2026-09-22) + ações por versão
 * (Kalebe 2026-10-01):
 *   ✏️ Editar           → abre o orçamento com o desconto daquela versão; o
 *                          próximo "Gerar PDF" substitui a versão
 *   🔄 Atualizar valores → gera de novo na hora com kit, extras e preços atuais
 *   🗑 Excluir          → tira da lista (fica registro de quem e quando)
 */
export function HistoricoPropostasClient({
  projetoId,
  versoes,
  migracaoPendente,
  versaoEmEdicaoId,
}: {
  projetoId: string
  versoes: VersaoProposta[]
  migracaoPendente: boolean
  versaoEmEdicaoId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  if (!versoes.length) return null

  const brl = (n: number | null) => (n == null ? '—' : `R$ ${fmtNum(n, 2)}`)
  const data = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  function abrir(v: VersaoProposta, gerar: boolean) {
    setErro(null)
    if (gerar && !window.confirm(
      `Atualizar a v${v.numero} com os valores de hoje (kit, extras e preços atuais)?\n\n` +
      `O desconto da v${v.numero} é mantido e o PDF dela é substituído — não cria versão nova.`,
    )) return
    setOcupado(v.id)
    startTransition(async () => {
      const r = await prepararVersaoPropostaAction(projetoId, v.id)
      if ('erro' in r) { setErro(r.erro); setOcupado(null); return }
      router.push(`/projetos/${projetoId}/orcamento?versao=${v.id}${gerar ? '&gerar=1' : ''}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setOcupado(null)
    })
  }

  function excluir(v: VersaoProposta) {
    setErro(null)
    if (!window.confirm(
      `Excluir a v${v.numero} (${brl(v.pv_total)}) do histórico?\n\n` +
      'Ela sai da lista e deixa de ser a proposta atual do projeto. Fica registrado quem excluiu e quando.',
    )) return
    setOcupado(v.id)
    startTransition(async () => {
      const r = await excluirVersaoPropostaAction(projetoId, v.id)
      if ('erro' in r) setErro(r.erro)
      else router.refresh()
      setOcupado(null)
    })
  }

  const btn = 'inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-bold transition disabled:opacity-40'

  return (
    <section className="mt-8 bg-white/[0.03] border border-white/10 rounded-xl p-5">
      <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        📄 Histórico de propostas emitidas <span className="text-white/40 font-normal">({versoes.length})</span>
      </h2>
      {migracaoPendente && (
        <p className="mb-3 text-[11px] text-sol">
          ⚠ Editar e excluir versões precisam da migration 132 no Supabase.
        </p>
      )}
      {erro && <p className="mb-3 text-xs text-coral">❌ {erro}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-white/10 text-[10px] uppercase text-white/50 font-bold">
              <th className="pb-2 pr-3">Versão</th>
              <th className="pb-2 pr-3">Data</th>
              <th className="pb-2 pr-3">Autor</th>
              <th className="pb-2 pr-3">Potência</th>
              <th className="pb-2 pr-3">Desconto</th>
              <th className="pb-2 pr-3">PV total</th>
              <th className="pb-2 pr-3">PDF</th>
              <th className="pb-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {versoes.map((v) => {
              const desc = v.desconto_pct != null && v.desconto_pct !== 0
                ? `${fmtNum(v.desconto_pct, 2)}%`
                : (v.desconto_valor != null && v.desconto_valor !== 0 ? brl(v.desconto_valor) : '—')
              const emEdicao = v.id === versaoEmEdicaoId
              const travado = pending && ocupado === v.id
              // PDF da venda de equipamentos (projeto combinado): edita na tela da venda
              const ehVenda = v.modo_composicao === 'venda_direta'
              return (
                <tr key={v.id} className={`border-b border-white/5 ${emEdicao ? 'bg-sol/5' : ''}`}>
                  <td className="py-3 pr-3 text-white/70 text-xs font-mono">
                    v{v.numero}
                    {ehVenda && <span className="block text-[10px] text-weg-azul font-sans">📦 equipamentos</span>}
                    {emEdicao && <span className="block text-[10px] text-sol font-sans">editando</span>}
                  </td>
                  <td className="py-3 pr-3 text-white/80 text-xs">
                    {data(v.gerado_em)}
                    {v.atualizado_em && <span className="block text-[10px] text-white/45">atualizada {data(v.atualizado_em)}</span>}
                  </td>
                  <td className="py-3 pr-3 text-white/80 text-xs">{v.autor || '—'}</td>
                  <td className="py-3 pr-3 text-white/80 text-xs">
                    {v.potencia_cc_kwp ? `${fmtNum(v.potencia_cc_kwp, 2)} kWp` : '—'}
                  </td>
                  <td className="py-3 pr-3 text-white/80 text-xs" title={v.desconto_motivo || ''}>{desc}</td>
                  <td className="py-3 pr-3 text-sol font-bold text-sm">{brl(v.pv_total)}</td>
                  <td className="py-3 pr-3">
                    {v.arquivo_expirado_em ? (
                      <span className="text-[11px] text-white/40" title="Removido pela regra de 180 dias (cliente sem negócio fechado)">
                        🗑 removido
                      </span>
                    ) : (
                      <a href={v.url_pdf} target="_blank" rel="noopener noreferrer"
                        className={`${btn} bg-sol/10 border-sol/40 text-sol hover:bg-sol/20`}>
                        📥 Baixar
                      </a>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {ehVenda ? (
                        <Link href={`/projetos/${projetoId}/venda-direta`}
                          title="Abre a tela da venda de equipamentos pra ajustar e gerar o PDF de novo"
                          className={`${btn} bg-white/5 border-white/15 text-white/80 hover:bg-white/10`}>
                          ✏️ Editar
                        </Link>
                      ) : (
                        <>
                          <button type="button" onClick={() => abrir(v, false)} disabled={pending || emEdicao}
                            title="Abre o orçamento com o desconto desta versão; o próximo PDF substitui esta versão"
                            className={`${btn} bg-white/5 border-white/15 text-white/80 hover:bg-white/10`}>
                            ✏️ Editar
                          </button>
                          <button type="button" onClick={() => abrir(v, true)} disabled={pending}
                            title="Gera de novo com kit, extras e preços atuais (mantém o desconto desta versão)"
                            className={`${btn} bg-weg-azul/10 border-weg-azul/40 text-weg-azul hover:bg-weg-azul/20`}>
                            {travado ? '⏳' : '🔄'} Atualizar valores
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => excluir(v)} disabled={pending}
                        className={`${btn} bg-coral/10 border-coral/30 text-coral hover:bg-coral/20`}>
                        🗑 Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
