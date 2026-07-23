import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Admin — CONFIGURAÇÃO E ESTRUTURA da empresa.
 *
 * Filosofia: o que raramente muda + estratégico.
 *   - Dados da empresa
 *   - Precificação e catálogo
 *   - Comportamento da IA (Bianca)
 *   - Usuários e permissões
 *
 * Operação diária vive no Dashboard (projetos ativos, homologações
 * em andamento, tarefas, alertas).
 */
export default async function AdminHomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">Área exclusiva do administrador.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white">
            ⚙️ Administração da empresa
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Configurações, estrutura e áreas estratégicas. Pra ver a operação diária,
            acesse o <Link href="/dashboard" className="text-sol hover:underline">Dashboard</Link>.
          </p>
        </header>

        {/* Grupo 1: Empresa e pessoas */}
        <Grupo titulo="🏢 Empresa e equipe">
          <AdminCard
            href="/admin/empresa"
            icon="🏢"
            titulo="Configurações da empresa"
            desc="Razão social, CNPJ, endereço, telefone. Dados do responsável técnico (RT/CREA/ART) usados nos diagramas e propostas."
          />
          <AdminCard
            href="/admin/usuarios"
            icon="👥"
            titulo="Usuários e permissões"
            desc="Convidar consultores, definir papéis, autorizar acesso a áreas específicas."
            emBreve
          />
        </Grupo>

        {/* Grupo 2: Precificação e catálogo — estratégico */}
        <Grupo titulo="💰 Precificação e catálogo">
          <AdminCard
            href="/admin/precificacao"
            icon="💰"
            titulo="Precificação centralizada"
            desc="Parâmetros de cálculo + faixas de referência de TODOS os serviços (13 tipos). Hub único editável a qualquer momento."
            destaque
          />
          <AdminCard
            href="/admin/catalogo"
            icon="📊"
            titulo="Catálogo WEG"
            desc="Upload de planilha de preços, PDF de estoque, datasheets e imagens dos produtos WEG."
          />
        </Grupo>

        {/* Grupo 3: Automação e IA */}
        <Grupo titulo="🤖 Automação e inteligência">
          <AdminCard
            href="/admin/bianca/gatilhos"
            icon="⚡"
            titulo="Gatilhos da Bianca"
            desc="Configurar como a Bianca reage a eventos (proposta aceita, cliente respondeu, follow-up 3 dias). Templates + modo automático/sugerido."
          />
          <AdminCard
            href="/admin/davi"
            icon="👔"
            titulo="Davi de Compras"
            desc="Agente auditor de preços — cotações WEG, alertas de variação, sugestões estratégicas."
          />
        </Grupo>

        {/* Rodapé com link pro dashboard */}
        <div className="mt-10 p-4 bg-weg-azul/5 border border-weg-azul/20 rounded-xl">
          <p className="text-xs text-white/70">
            📌 <strong className="text-weg-azul">Onde vejo a operação rodando?</strong>{' '}
            Acesse o <Link href="/dashboard" className="text-sol hover:underline">Dashboard</Link> pra
            ver projetos ativos, homologações em andamento, agenda do dia, respostas de clientes
            e alertas — a orquestra tocando em tempo real.
          </p>
        </div>
      </div>
    </main>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">{titulo}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children}
      </div>
    </section>
  )
}

function AdminCard({
  href, icon, titulo, desc, emBreve, destaque,
}: {
  href: string; icon: string; titulo: string; desc: string; emBreve?: boolean; destaque?: boolean
}) {
  const conteudo = (
    <div className={`p-6 rounded-xl transition h-full ${
      emBreve
        ? 'bg-white/[0.02] border border-white/5 opacity-40 cursor-not-allowed'
        : destaque
          ? 'bg-gradient-to-br from-sol/10 to-verde/5 border border-sol/40 hover:border-sol/70 hover:from-sol/15'
          : 'bg-white/[0.03] border border-white/10 hover:border-sol/40 hover:bg-white/[0.05]'
    }`}>
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="font-bold text-white mb-1 flex items-center gap-2 flex-wrap">
        {titulo}
        {emBreve && (
          <span className="text-[10px] uppercase font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded">
            em breve
          </span>
        )}
        {destaque && (
          <span className="text-[10px] uppercase font-bold text-sol bg-sol/10 px-2 py-0.5 rounded">
            novo
          </span>
        )}
      </h3>
      <p className="text-sm text-white/60 leading-relaxed">{desc}</p>
    </div>
  )

  return emBreve ? conteudo : <Link href={href}>{conteudo}</Link>
}
