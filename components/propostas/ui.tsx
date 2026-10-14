'use client'

/** Peças visuais das composições de proposta (visual minimalista: cor na borda, botão cheio). */

export function Bloco({ n, titulo, valor, children }: { n?: string; titulo: string; valor?: string | null; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-black text-white">{n ? `${n}. ` : ''}{titulo}</h3>
        {valor && <span className="text-xs font-bold text-white/70 tabular-nums">{valor}</span>}
      </div>
      {children}
    </section>
  )
}

export function Opcao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`px-3 py-2 rounded-xl text-xs font-bold text-start border ${ativo ? 'bg-weg-azul border-weg-azul text-white' : 'border-white/15 text-white/70 hover:text-white'}`}>
      {ativo ? '✓ ' : ''}{children}
    </button>
  )
}

export function Rotulo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-white/60 mb-1">{texto}</span>
      {children}
    </label>
  )
}
