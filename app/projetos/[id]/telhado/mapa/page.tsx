import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MapaTelhadoEditor } from '@/components/MapaTelhadoEditor'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function MapaTelhadoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social, cliente_endereco')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  const end = projeto.cliente_endereco || {}
  const enderecoCompleto = [
    end.logradouro, end.numero, end.bairro, end.cidade, end.uf, end.cep, 'Brasil',
  ].filter(Boolean).join(', ')

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-4">
          <Link href={`/projetos/${projeto.id}/telhado`} className="text-xs text-white/40 hover:text-white/60 mb-1 inline-block">
            ← Voltar ao Telhado
          </Link>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white">
                🗺️ Desenhar telhado no mapa
              </h1>
              <p className="text-white/60 text-xs">
                {projeto.cliente_razao_social} · {enderecoCompleto}
              </p>
            </div>
          </div>
        </header>

        {!apiKey ? (
          <div className="bg-coral/10 border border-coral/30 rounded-xl p-6">
            <h2 className="text-lg font-bold text-coral mb-2">🔑 API do Google Maps não configurada</h2>
            <p className="text-sm text-white/80 mb-3">
              Pra usar o desenho no mapa, precisamos da chave{' '}
              <code className="text-sol bg-black/40 px-1.5 py-0.5 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{' '}
              configurada no Vercel.
            </p>
            <details className="text-xs text-white/60">
              <summary className="cursor-pointer text-sol">Como criar a chave</summary>
              <ol className="mt-2 space-y-1 pl-4 list-decimal">
                <li>Vai em <a href="https://console.cloud.google.com/" target="_blank" className="text-sol underline">Google Cloud Console</a></li>
                <li>Cria projeto "Spin Solar Portal"</li>
                <li>APIs & Services → Library → habilita: <strong>Maps JavaScript API</strong>, <strong>Places API</strong>, <strong>Geometry Library</strong></li>
                <li>Credentials → Create → API Key</li>
                <li>Restringe por HTTP referrer: <code>*.spinsolar.com.br/*</code></li>
                <li>No Vercel: Settings → Environment Variables → <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = sua_chave</code></li>
              </ol>
            </details>
          </div>
        ) : (
          <MapaTelhadoEditor
            projetoId={projeto.id}
            enderecoBusca={enderecoCompleto}
            apiKey={apiKey}
          />
        )}
      </div>
    </main>
  )
}
