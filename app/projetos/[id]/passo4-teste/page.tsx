import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function Passo4TestePage({ params }: { params: { id: string } }) {
  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-3xl mx-auto bg-verde/10 border border-verde/40 rounded-xl p-8 text-center">
        <h1 className="text-3xl font-black text-verde mb-3">✅ Vercel deployou OK</h1>
        <p className="text-white/80 text-sm mb-2">
          Esta página `/passo4-teste` foi criada APÓS o problema do 404. Se você está vendo essa
          mensagem, significa que o deploy do Vercel está funcionando corretamente.
        </p>
        <p className="text-white/60 text-xs mb-4">Projeto ID: {params.id}</p>
        <Link
          href={`/projetos/${params.id}`}
          className="inline-block px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg"
        >
          ← Voltar ao projeto
        </Link>
      </div>
    </main>
  )
}
