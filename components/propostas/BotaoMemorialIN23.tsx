'use client'

import { useState } from 'react'
import { gerarMemorialIN23Action } from '@/app/projetos/[id]/ve/actions'

/**
 * Memorial técnico da IN 23 do CBMSC (Kalebe 2026-10-17) — PDF sem preços pro
 * RT, gerado da proposta salva da estação de recarga.
 */
export function BotaoMemorialIN23({ projetoId }: { projetoId: string }) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    setErro(null); setOcupado(true)
    // Abre a aba antes (bloqueio de pop-up) e manda pro PDF quando ficar pronto
    const aba = window.open('', '_blank')
    try {
      const r = await gerarMemorialIN23Action(projetoId)
      if ('erro' in r) { aba?.close(); setErro(r.erro); return }
      if (aba) aba.location.href = r.url_pdf
      else window.location.href = r.url_pdf
    } finally { setOcupado(false) }
  }

  return (
    <div className="space-y-1">
      <button type="button" onClick={abrir} disabled={ocupado}
        className="px-3 py-2 rounded-xl bg-weg-azul text-white text-xs font-bold text-start disabled:opacity-40">
        {ocupado ? 'Gerando memorial…' : '📋 Memorial técnico IN 23 (PDF)'}
      </button>
      {erro && <p className="text-[11px] text-white/80 border border-coral/45 rounded-lg px-2 py-1">⚠ {erro}</p>}
    </div>
  )
}
