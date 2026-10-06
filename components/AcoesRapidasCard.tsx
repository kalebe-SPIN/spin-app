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
  atualizarVendaAction,
} from '@/app/projetos/[id]/orcamento/actions'
import { mudarEtapaProjetoAction } from '@/app/projetos/[id]/etapa/actions'
import { ConfirmarVendaModal, type DadosConfirmacao } from '@/components/ConfirmarVendaModal'
import { STATUS_FECHADOS } from '@/lib/financeiro/vendas-sistema'

type Props = {
  projetoId: string
  status: string
  homologacaoId?: string | null   // se já criada, link direto
  clienteNome?: string
  /** Kalebe 2026-09-17: pv_total pra pré-preencher o modal de confirmação. */
  precoSugerido?: number
  /** Kalebe 2026-10-06: admin atualiza venda já fechada (troca de projeto) */
  ehAdmin?: boolean
  vendaAtual?: Partial<DadosConfirmacao> | null
}

export function AcoesRapidasCard({ projetoId, status, homologacaoId, clienteNome, precoSugerido = 0, ehAdmin = false, vendaAtual = null }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmandoVenda, setConfirmandoVenda] = useState(false)
  const [editandoVenda, setEditandoVenda] = useState(false)

  async function confirmarVenda(dados: DadosConfirmacao) {
    setErro(null)
    const r = await marcarPropostaAceitaAction(projetoId, dados)
    if ('erro' in r && r.erro) {
      setErro(r.erro)
      throw new Error(r.erro)
    }
    setConfirmandoVenda(false)
    router.refresh()
  }

  async function salvarEdicaoVenda(dados: DadosConfirmacao) {
    setErro(null); setAviso(null)
    const r = await atualizarVendaAction(projetoId, dados)
    if (!r.sucesso) {
      setErro(r.erro)
      throw new Error(r.erro)
    }
    setEditandoVenda(false)
    setAviso(`Venda atualizada.${r.aviso ? ` ${r.aviso}` : ''}`)
    router.refresh()
  }

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
  // Kalebe 2026-10-06: venda fechada → admin pode atualizar (troca de projeto)
  if (ehAdmin && STATUS_FECHADOS.includes(status)) {
    acoes.push({
      chave: 'editar_venda',
      emoji: '✏️',
      titulo: 'Atualizar dados da venda',
      desc: 'Troca de projeto, novo valor, condição ou datas — o anterior fica no histórico da venda',
      classe: 'bg-sol/10 border-sol/40 hover:bg-sol/20',
      acao: 'editar_venda',
    })
  }
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
                // Kalebe 2026-09-17: aceite abre modal (não confirm nativo)
                // pra vendedor cadastrar preço + condição fechada.
                if (a.acao === 'aceita') {
                  setConfirmandoVenda(true)
                  return
                }
                if (a.acao === 'editar_venda') {
                  setEditandoVenda(true)
                  return
                }
                if (a.confirm && !window.confirm(a.confirm)) return
                acionar(() => {
                  if (a.acao === 'enviar') return marcarPropostaEnviadaAction(projetoId)
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
      {aviso && (
        <p className="mt-2 text-xs text-sol bg-sol/10 border border-sol/30 rounded p-2">
          ✓ {aviso}
          <button onClick={() => setAviso(null)} className="ml-2 text-white/50 hover:text-white">✕</button>
        </p>
      )}

      <ConfirmarVendaModal
        aberto={confirmandoVenda}
        onCancelar={() => setConfirmandoVenda(false)}
        onConfirmar={confirmarVenda}
        precoSugerido={precoSugerido}
        processando={isPending}
        // Refechamento (projeto que voltou de etapa): condição e datas da
        // venda anterior; o preço sugerido é o da proposta nova
        inicial={vendaAtual ? { ...vendaAtual, preco_final: undefined } : null}
      />
      <ConfirmarVendaModal
        aberto={editandoVenda}
        modoEdicao
        inicial={vendaAtual}
        onCancelar={() => setEditandoVenda(false)}
        onConfirmar={salvarEdicaoVenda}
        precoSugerido={precoSugerido}
        rotuloPreco="Preço final acordado (novo)"
        processando={isPending}
      />
    </section>
  )
}

type Acao = {
  chave: string
  emoji: string
  titulo: string
  desc: string
  classe: string
  acao?: 'enviar' | 'aceita' | 'recusar' | 'perdido' | 'editar_venda'
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
