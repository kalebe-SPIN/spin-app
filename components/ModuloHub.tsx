import Link from 'next/link'

export type CardModulo = {
  href?: string
  emoji: string
  titulo: string
  desc: string
  stats?: React.ReactNode
  emBreve?: boolean
  restrito?: boolean
}

export function ModuloHub({
  titulo,
  icone,
  descricao,
  voltar = { href: '/dashboard', label: '← Dashboard' },
  cards,
}: {
  titulo: string
  icone: string
  descricao: string
  voltar?: { href: string; label: string }
  cards: CardModulo[]
}) {
  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href={voltar.href} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            {voltar.label}
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{icone}</span>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white">{titulo}</h1>
              <p className="text-white/60 mt-1 text-sm">{descricao}</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card, i) => (
            <CardBloco key={i} card={card} />
          ))}
        </div>
      </div>
    </main>
  )
}

function CardBloco({ card }: { card: CardModulo }) {
  const conteudo = (
    <div
      className={`
        relative h-full p-5 rounded-xl border transition-all flex flex-col
        ${card.emBreve
          ? 'bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed'
          : 'bg-white/[0.03] border-white/10 hover:border-sol/40 hover:bg-white/[0.06] cursor-pointer'
        }
      `}
    >
      {card.restrito && (
        <span className="absolute top-2 right-2 text-[9px] uppercase font-bold text-weg-azul bg-white px-1.5 py-0.5 rounded">
          Admin
        </span>
      )}
      <div className="text-3xl mb-2">{card.emoji}</div>
      <h3 className="text-base font-bold text-white mb-1">{card.titulo}</h3>
      <p className="text-xs text-white/60 leading-relaxed">{card.desc}</p>
      {card.emBreve && (
        <span className="mt-2 inline-block text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          Em breve
        </span>
      )}
      {card.stats}
    </div>
  )
  if (card.emBreve || !card.href) return conteudo
  return <Link href={card.href}>{conteudo}</Link>
}
