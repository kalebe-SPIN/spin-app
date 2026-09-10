import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NovoProjetoForm } from '@/components/NovoProjetoForm'

/**
 * Novo projeto — /projetos/novo
 *
 * Passo 1 do workflow: dados básicos do cliente + UC.
 * Após salvar, redireciona pra /projetos/[id] (próximos passos).
 *
 * Kalebe 2026-09-10: aceita ?produto_id&categoria de vindo do /catalogo.
 * Quando presente, busca o produto e passa como sugestão inicial pro
 * form — banner "kit inicial: [modelo]" aparece + criarProjetoAction
 * grava o item em kit_selecionado. Assim o consultor não precisa
 * reselecionar no passo /kit.
 */
export default async function NovoProjetoPage({
  searchParams,
}: {
  searchParams: { produto_id?: string; categoria?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Busca produto sugerido (opcional, veio do /catalogo)
  let produtoInicial: any = null
  const produtoId = searchParams.produto_id
  if (produtoId && /^[0-9a-f-]{20,}$/i.test(produtoId)) {
    const { data: prod } = await supabase
      .from('produtos')
      .select('id, modelo, fabricante, categoria, subcategoria, specs, disponivel_estoque, precos_produtos(preco_venda, vigente_de, vigente_ate)')
      .eq('id', produtoId)
      .eq('ativo', true)
      .maybeSingle()
    if (prod) {
      const hoje = new Date().toISOString().slice(0, 10)
      const precos = (prod.precos_produtos || []) as any[]
      const vigentes = precos.filter(p => (!p.vigente_de || p.vigente_de <= hoje) && (!p.vigente_ate || p.vigente_ate >= hoje))
      const preco = (vigentes[0] || precos[0])?.preco_venda ?? 0
      produtoInicial = {
        id: prod.id,
        modelo: prod.modelo,
        marca: prod.fabricante,
        categoria: prod.categoria,
        subcategoria: prod.subcategoria,
        potencia_wp: prod.specs?.potencia_wp || null,
        potencia_kw: prod.specs?.potencia_kw || null,
        preco_venda: Number(preco) || 0,
      }
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <Link href="/projetos" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Projetos
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Novo projeto
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Passo 1 de 7 — Cliente + endereço + telhado
          </p>
        </header>

        {/* Banner de produto sugerido (Kalebe 2026-09-10) */}
        {produtoInicial && (
          <div className="mb-6 bg-gradient-to-br from-sol/10 to-sol/[0.03] border border-sol/40 rounded-xl p-4 flex items-center gap-4">
            <span className="text-3xl">
              {produtoInicial.categoria === 'placa' ? '☀️'
                : produtoInicial.categoria === 'inversor' ? '🔌'
                : produtoInicial.categoria === 'bateria' ? '🔋'
                : '📦'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-sol mb-0.5">
                Kit inicial escolhido no catálogo
              </p>
              <p className="text-sm font-bold text-white truncate">
                {produtoInicial.marca ? `${produtoInicial.marca} · ` : ''}{produtoInicial.modelo}
                {produtoInicial.potencia_wp ? <span className="text-white/50 ml-1 font-normal">({produtoInicial.potencia_wp}Wp)</span> : null}
                {produtoInicial.potencia_kw ? <span className="text-white/50 ml-1 font-normal">({produtoInicial.potencia_kw}kW)</span> : null}
              </p>
              <p className="text-[11px] text-white/50 mt-0.5">
                Ao criar o projeto, este item já vai pré-selecionado no passo Kit.
              </p>
            </div>
            <Link
              href="/catalogo"
              className="text-xs text-white/50 hover:text-white/80 shrink-0"
              title="Voltar ao catálogo pra trocar"
            >
              ← trocar
            </Link>
          </div>
        )}

        {/* Stepper */}
        <Stepper passoAtual={1} />

        {/* Form */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
          <NovoProjetoForm consultorId={user.id} produtoInicial={produtoInicial} />
        </div>
      </div>
    </main>
  )
}

function Stepper({ passoAtual }: { passoAtual: number }) {
  // Kalebe 2026-08-31: etapa Telhado saiu da trilha — foi fundida
  // com a etapa Cliente (endereço + telhado no perfil). Wizard agora
  // tem 7 passos em vez de 8.
  const passos = [
    { n: 1, label: 'Cliente + Telhado' },
    { n: 2, label: 'Fatura' },
    { n: 3, label: 'Padrão' },
    { n: 4, label: 'Dimensionar' },
    { n: 5, label: 'Kit' },
    { n: 6, label: 'Lista CA' },
    { n: 7, label: 'Orçamento' },
  ]

  return (
    <div className="mb-8 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-fit">
        {passos.map((p, idx) => (
          <div key={p.n} className="flex items-center gap-2 flex-shrink-0">
            <div className={`
              flex flex-col items-center gap-1.5
            `}>
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors
                ${p.n === passoAtual
                  ? 'bg-sol text-noite border-sol'
                  : p.n < passoAtual
                  ? 'bg-verde/20 text-verde border-verde/40'
                  : 'bg-transparent text-white/40 border-white/20'
                }
              `}>
                {p.n < passoAtual ? '✓' : p.n}
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap
                ${p.n === passoAtual ? 'text-sol' : 'text-white/40'}
              `}>
                {p.label}
              </span>
            </div>
            {idx < passos.length - 1 && (
              <div className={`h-px w-8 ${p.n < passoAtual ? 'bg-verde/40' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
