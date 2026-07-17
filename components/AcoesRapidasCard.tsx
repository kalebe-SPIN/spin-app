'use client'

/**
 * Card de "ações rápidas" contextuais ao status do projeto.
 * Aparece na tela do projeto e sugere o próximo passo natural:
 *   - Orçamento gerado → 📤 Enviar proposta
 *   - Proposta enviada / negociando → ✅ Cliente aceitou · ❌ Cliente recusou
 *   - Vendido → 🏗️ Ver homologação (link)
 * Cada ação chama server action com auditoria + automações.
 */

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  marcarPropostaEnviadaAction,
  marcarPropostaAceitaAction,
} from '@/app/projetos/[id]/orcamento/actions'
import { mudarEtapaProjetoAction } from '@/app/projetos/[id]/etapa/actions'

type Props = {
  projetoId: string
  status: string
  homologacaoId?: string | null   // se já criada, link direto
  clienteNome?: string
}

export function AcoesRapidasCard({ projetoId, status, homologacaoId, clienteNome }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function acionar(fn: () => Promise<any>) {
    setErro(null)
    startTransition(async () => {
      const res = await fn()
      if (res && 'erro' in res && res.erro) setErro(res.erro)
      else router.refresh()
    })
  }

  // Não mostra card se status não tem ação rápida associada
  const acoes = getAcoes(status, projetoId, homologacaoId)
  if (acoes.length === 0) return null

  return (
    <section className="mb-6 p-4 bg-verde/[0.06] border border-verde/30 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⚡</span>
        <h2 className="text-xs uppercase tracking-wider font-bold text-verde">
          Próximas ações
        </h2>
        <p className="text-[10px] text-white/40">
          {clienteNome && `para ${clienteNome}`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {acoes.map((a) => (
          a.href ? (
            <Link
              key={a.chave}
              href={a.href}
              className={`p-3 rounded-lg border ${a.classe} transition text-left flex items-center gap-3`}
            >
              <span className="text-2xl">{a.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{a.titulo}</p>
                <p className="text-[10px] text-white/60">{a.desc}</p>
              </div>
              <span className="text-white/40">→</span>
            </Link>
          ) : (
            <button
              key={a.chave}
              onClick={() => {
                if (a.confirm && !window.confirm(a.confirm)) return
                acionar(() => {
                  if (a.acao === 'enviar') return marcarPropostaEnviadaAction(projetoId)
                  if (a.acao === 'aceita') return marcarPropostaAceitaAction(projetoId)
                  if (a.acao === 'recusar') return mudarEtapaProjetoAction(projetoId, 'recusado', 'Cliente recusou')
                  if (a.acao === 'perdido') return mudarEtapaProjetoAction(projetoId, 'perdido', 'Proposta perdida (sem resposta)')
                  return Promise.resolve({ erro: 'ação desconhecida' })
                })
              }}
              disabled={isPending}
              className={`p-3 rounded-lg border ${a.classe} transition text-left flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="text-2xl">{a.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">
                  {isPending ? '⏳ Processando...' : a.titulo}
                </p>
                <p className="text-[10px] text-white/60">{a.desc}</p>
              </div>
            </button>
          )
        ))}
      </div>

      {erro && (
        <p className="mt-2 text-xs text-coral">⚠️ {erro}</p>
      )}
    </section>
  )
}

type Acao = {
  chave: string
  emoji: string
  titulo: string
  desc: string
  classe: string
  acao?: 'enviar' | 'aceita' | 'recusar' | 'perdido'
  href?: string
  confirm?: string
}

function getAcoes(status: string, projetoId: string, homologacaoId?: string | null): Acao[] {
  switch (status) {
    case 'orcamento_gerado':
      return [{
        chave: 'enviar',
        emoji: '📤',
        titulo: 'Enviar proposta ao cliente',
        desc: 'Marca como enviada · cai em "Negociação" no CRM · Bianca cria follow-up em 3 dias',
        classe: 'bg-sol/10 border-sol/40 hover:bg-sol/20',
        acao: 'enviar',
      }]

    case 'proposta_enviada':
    case 'negociando':
    case 'em_fechamento':
      return [
        {
          chave: 'aceita',
          emoji: '✅',
          titulo: 'Cliente aceitou — fechar venda',
          desc: 'Cria homologação automática + tarefas de contrato + notifica admin',
          classe: 'bg-verde/10 border-verde/40 hover:bg-verde/20',
          acao: 'aceita',
          confirm: 'Confirmar venda fechada? Vou criar a homologação automaticamente e notificar o admin.',
        },
        {
          chave: 'recusar',
          emoji: '❌',
          titulo: 'Cliente recusou',
          desc: 'Marca como perdido — histórico preservado pra CRM',
          classe: 'bg-coral/10 border-coral/40 hover:bg-coral/20',
          acao: 'recusar',
          confirm: 'Marcar como recusada?',
        },
      ]

    case 'vendido':
    case 'aceito':
      return homologacaoId
        ? [{
            chave: 'ver_hom',
            emoji: '🏗️',
            titulo: 'Ver homologação em andamento',
            desc: 'Acompanhe as 6 etapas até o envio à CELESC',
            classe: 'bg-weg-azul/10 border-weg-azul/40 hover:bg-weg-azul/20',
            href: `/homologacoes/${homologacaoId}`,
          }]
        : [{
            chave: 'sem_hom',
            emoji: '⚠️',
            titulo: 'Homologação não foi criada',
            desc: 'Contate o admin — deve ter falhado na automação',
            classe: 'bg-coral/10 border-coral/40',
          }]

    case 'em_homologacao':
      return homologacaoId ? [{
        chave: 'acompanhar_hom',
        emoji: '📋',
        titulo: 'Acompanhar homologação CELESC',
        desc: 'Ver etapas pendentes e responsáveis',
        classe: 'bg-weg-azul/10 border-weg-azul/40 hover:bg-weg-azul/20',
        href: `/homologacoes/${homologacaoId}`,
      }] : []

    default:
      return []
  }
}
