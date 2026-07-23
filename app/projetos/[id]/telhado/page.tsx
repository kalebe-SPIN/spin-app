import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TelhadoSecoesManager } from '@/components/TelhadoSecoesManager'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Passo 3 — Telhado (uma ou múltiplas seções)
 */
export default async function TelhadoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social, cliente_endereco')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Monta string de endereço pra geocoding
  const end = projeto.cliente_endereco || {}
  const enderecoCompleto = [
    end.logradouro,
    end.bairro,
    end.cidade,
    end.uf,
    end.cep,
    'Brasil',
  ].filter(Boolean).join(', ')

  const { data: secoes } = await supabase
    .from('projetos_telhado_secoes')
    .select('*')
    .eq('projeto_id', params.id)
    .order('ordem', { ascending: true })

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Passo 3 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Telhado da instalação
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Adicione uma ou mais seções de telhado
          </p>
        </header>

        <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-xl p-4 mb-4">
          <p className="text-sm text-white/80">
            <strong className="text-white">Telhado pode ter múltiplas seções</strong> com tipos
            diferentes (ex: parte fibrocimento + parte metálico). Cadastre cada seção separadamente
            com sua área, orientação e características.
          </p>
        </div>

        <Link
          href={`/projetos/${projeto.id}/telhado/mapa`}
          className="block mb-6 p-4 bg-gradient-to-br from-sol/10 to-verde/5 border border-sol/40 hover:border-sol/70 rounded-xl transition"
        >
          <div className="flex items-center gap-3">
            <div className="text-3xl">🗺️</div>
            <div className="flex-1">
              <p className="font-bold text-white flex items-center gap-2">
                Desenhar telhado no mapa satélite
                <span className="text-[10px] font-bold text-sol bg-sol/10 border border-sol/30 px-2 py-0.5 rounded uppercase">Novo</span>
              </p>
              <p className="text-xs text-white/60 mt-0.5">
                Google Maps + ferramenta de polígono. Calcula área, orientação e estimativa de placas automaticamente.
              </p>
            </div>
            <span className="text-sol">→</span>
          </div>
        </Link>

        <TelhadoSecoesManager
          projetoId={projeto.id}
          secoesIniciais={secoes || []}
          enderecoCliente={enderecoCompleto || undefined}
        />
      </div>
    </main>
  )
}
