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
    .select('id, codigo, cliente_id, cliente_razao_social, cliente_endereco')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Kalebe 2026-08-31: endereço do CLIENTE (fonte confiável) é prioridade
  // sobre o snapshot no projeto (que pode vir quebrado da extração de fatura).
  // O consultor cadastra/confere no perfil do cliente antes de vir aqui.
  let enderecoFonte: any = projeto.cliente_endereco || {}
  if (projeto.cliente_id) {
    const { data: cli } = await supabase
      .from('clientes').select('endereco').eq('id', projeto.cliente_id).maybeSingle()
    if (cli?.endereco && Object.keys(cli.endereco).length > 0) {
      enderecoFonte = cli.endereco
    }
  }
  const end = enderecoFonte
  const enderecoCompleto = [
    end.logradouro || end.rua,
    end.numero,
    end.bairro,
    end.cidade,
    end.uf,
    end.cep,
    'Brasil',
  ].filter(Boolean).join(', ')
  const enderecoIncompleto = !end.cidade || !(end.logradouro || end.rua)

  const { data: secoes } = await supabase
    .from('projetos_telhado_secoes')
    .select('*')
    .eq('projeto_id', params.id)
    .order('ordem', { ascending: true })

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-xl mx-auto">
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

        <div className="bg-verde/5 border border-verde/40 rounded-xl p-4 mb-4">
          <p className="text-sm text-white mb-1 font-bold">
            🏠 Telhado agora vive no perfil do cliente
          </p>
          <p className="text-xs text-white/70 mb-2">
            Kalebe 2026-08-31: o telhado é atributo do <strong className="text-white">imóvel do cliente</strong>,
            não da proposta. Cadastre uma vez no perfil e todas as propostas
            futuras vão herdar automaticamente.
          </p>
          {projeto.cliente_id && (
            <Link
              href={`/crm/clientes/${projeto.cliente_id}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-sol hover:underline"
            >
              → Ir pra o perfil do cliente e cadastrar/editar o telhado
            </Link>
          )}
        </div>

        {enderecoIncompleto && (
          <div className="bg-coral/10 border border-coral/40 rounded-xl p-4 mb-4">
            <p className="text-sm text-white font-bold mb-1">⚠ Endereço incompleto no cadastro do cliente</p>
            <p className="text-xs text-white/70 mb-2">
              O Google Maps precisa de rua + cidade pra achar o telhado. Complete no perfil do cliente
              antes de continuar — assim garante que o mapa vai localizar certo (extração de fatura
              costuma quebrar o endereço).
            </p>
            {projeto.cliente_id && (
              <Link
                href={`/crm/clientes/${projeto.cliente_id}`}
                className="inline-block text-xs font-bold text-sol hover:underline"
              >
                → Editar endereço no perfil do cliente
              </Link>
            )}
          </div>
        )}

        {!enderecoIncompleto && enderecoCompleto && (
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3 mb-4 flex items-start justify-between gap-3">
            <p className="text-xs text-white/60">
              <span className="text-white/40 uppercase tracking-wider text-[10px] mr-2">Endereço p/ mapa:</span>
              {enderecoCompleto}
            </p>
            {projeto.cliente_id && (
              <Link
                href={`/crm/clientes/${projeto.cliente_id}`}
                className="text-[10px] text-sol hover:underline whitespace-nowrap"
              >
                editar →
              </Link>
            )}
          </div>
        )}

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
