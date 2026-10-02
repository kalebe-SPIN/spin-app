'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { dadosLancamentoRapidoAction } from '@/app/financeiro/fluxo-caixa/actions'
import { ModalLancamento } from './ModalLancamento'
import { ModalPassivo } from './ModalPassivo'

/**
 * Atalho "Registrar saída" (Kalebe 2026-10-01): de qualquer tela, pelo menu
 * Financeiro (passar o mouse) ou pelo ☰ no celular. Usa o mesmo cadastro
 * dinâmico do fluxo de caixa, só com os tipos de saída e "já foi pago"
 * marcado — grava em fluxo_lancamentos e já entra no consolidado.
 *
 * Quem abre dispara o evento EVENTO_REGISTRAR_SAIDA; este componente (montado
 * uma vez no cabeçalho, só pro admin) cuida do resto. Fica no <body> via
 * portal: dentro do header (backdrop-blur) o "fixed" ficava preso nele.
 */
export const EVENTO_REGISTRAR_SAIDA = 'spin:registrar-saida'

export function abrirRegistroSaida() {
  window.dispatchEvent(new Event(EVENTO_REGISTRAR_SAIDA))
}

type Dados = {
  fornecedores: any[]; categorias: any[]
  projetos: Array<{ id: string; nome: string }>; equipe: Array<{ id: string; nome: string }>
}

export function LancamentoRapido() {
  const router = useRouter()
  const [montado, setMontado] = useState(false)
  const [aberto, setAberto] = useState<null | 'lancamento' | 'passivo'>(null)
  const [dados, setDados] = useState<Dados | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => { setMontado(true) }, [])

  useEffect(() => {
    async function abrir() {
      setAviso(null)
      setAberto('lancamento')
      // Recarrega a cada abertura: fornecedor/categoria novos aparecem
      setCarregando(true)
      try {
        const r = await dadosLancamentoRapidoAction()
        if ('erro' in r) { setAviso({ ok: false, texto: r.erro }); setAberto(null); return }
        setDados({ fornecedores: r.fornecedores, categorias: r.categorias, projetos: r.projetos, equipe: r.equipe })
      } finally { setCarregando(false) }
    }
    window.addEventListener(EVENTO_REGISTRAR_SAIDA, abrir)
    return () => window.removeEventListener(EVENTO_REGISTRAR_SAIDA, abrir)
  }, [])

  // Aviso some sozinho
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  function pronto(msg: string) {
    setAberto(null)
    setAviso({ ok: true, texto: `✓ ${msg} — já está no fluxo de caixa.` })
    router.refresh()   // se o fluxo de caixa estiver aberto, atualiza
  }

  if (!montado) return null
  return createPortal(
    <>
      {aberto === 'lancamento' && carregando && !dados && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <p className="px-4 py-3 rounded-lg bg-noite border border-white/15 text-sm text-white/80">Carregando…</p>
        </div>
      )}
      {aberto === 'lancamento' && dados && (
        <ModalLancamento
          key="rapido"
          fornecedores={dados.fornecedores}
          categorias={dados.categorias}
          projetos={dados.projetos}
          equipe={dados.equipe}
          apenasSaidas
          jaPagoPadrao
          onFechar={() => setAberto(null)}
          onSalvo={pronto}
          onAbrirPassivo={() => setAberto('passivo')}
        />
      )}
      {aberto === 'passivo' && <ModalPassivo onFechar={() => setAberto(null)} onSalvo={pronto} />}
      {aviso && (
        <div className={`fixed bottom-4 right-4 z-[80] max-w-sm px-4 py-3 rounded-xl border shadow-2xl text-sm flex items-start gap-3 ${
          aviso.ok ? 'bg-noite border-verde/40 text-verde' : 'bg-noite border-coral/40 text-coral'
        }`}>
          <span className="flex-1">{aviso.texto}</span>
          <a href="/financeiro/fluxo-caixa" className="text-xs text-white/60 hover:text-white underline shrink-0">Ver fluxo</a>
          <button type="button" onClick={() => setAviso(null)} className="text-white/50 hover:text-white shrink-0" aria-label="Fechar">✕</button>
        </div>
      )}
    </>,
    document.body,
  )
}
