import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { iniciarHomologacaoAction } from './actions'

async function iniciarWrap(projetoId: string, _formData: FormData) {
  'use server'
  await iniciarHomologacaoAction(projetoId)
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS_LABEL: Record<string, { label: string; classe: string }> = {
  iniciado:      { label: 'Iniciado',      classe: 'bg-white/10 text-white/60' },
  em_andamento:  { label: 'Em andamento',  classe: 'bg-sol/10 text-sol' },
  aprovada:      { label: 'Aprovada',      classe: 'bg-verde/10 text-verde' },
  rejeitada:     { label: 'Rejeitada',     classe: 'bg-coral/10 text-coral' },
  cancelada:     { label: 'Cancelada',     classe: 'bg-white/5 text-white/40' },
}

export default async function HomologacoesPage() {
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

  // Homologações existentes
  const { data: homologacoes } = await supabase
    .from('homologacoes')
    .select(`
      id, status_geral, etapa_atual, protocolo_celesc,
      data_solicitacao, data_aprovacao, created_at,
      projeto:projeto_id (id, codigo, cliente_razao_social, status)
    `)
    .order('created_at', { ascending: false })

  // Projetos aceitos que ainda não têm homologação
  const idsComHomologacao = (homologacoes || []).map((h: any) => h.projeto?.id).filter(Boolean)
  const { data: projetosSemHomologacao } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social, tipo_projeto, kit_selecionado')
    .eq('status', 'aceito')
    .not('id', 'in', `(${idsComHomologacao.length > 0 ? idsComHomologacao.join(',') : "''"})`)
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Homologações CELESC
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Pipeline de aprovação dos projetos junto à distribuidora — 6 etapas por projeto.
          </p>
        </header>

        {/* Projetos aceitos aguardando homologação */}
        {projetosSemHomologacao && projetosSemHomologacao.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm uppercase tracking-wider font-bold text-sol mb-3">
              Projetos aceitos aguardando iniciar homologação
            </h2>
            <div className="space-y-2">
              {projetosSemHomologacao.map((p: any) => (
                <form key={p.id} action={iniciarWrap.bind(null, p.id)}>
                  <button
                    type="submit"
                    className="w-full text-left bg-sol/5 border border-sol/30 hover:bg-sol/10 rounded-lg p-4 flex items-center justify-between transition"
                  >
                    <div>
                      <p className="text-sm font-bold text-white">{p.cliente_razao_social}</p>
                      <p className="text-xs text-white/50">{p.codigo} · {p.tipo_projeto}</p>
                    </div>
                    <span className="text-xs px-3 py-1.5 bg-sol text-noite font-bold rounded">
                      Iniciar homologação →
                    </span>
                  </button>
                </form>
              ))}
            </div>
          </section>
        )}

        {/* Homologações em andamento */}
        <section>
          <h2 className="text-sm uppercase tracking-wider font-bold text-white/70 mb-3">
            Homologações registradas ({homologacoes?.length || 0})
          </h2>
          {!homologacoes || homologacoes.length === 0 ? (
            <div className="p-6 bg-white/[0.02] border border-dashed border-white/10 rounded-lg text-center text-sm text-white/40">
              Nenhuma homologação iniciada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {homologacoes.map((h: any) => {
                const status = STATUS_LABEL[h.status_geral] || STATUS_LABEL.iniciado
                return (
                  <Link
                    key={h.id}
                    href={`/admin/homologacoes/${h.id}`}
                    className="block bg-white/[0.03] border border-white/10 hover:border-white/20 rounded-lg p-4 transition"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white">{h.projeto?.cliente_razao_social || 'Sem cliente'}</span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${status.classe}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="text-xs text-white/50">
                          {h.projeto?.codigo || '—'}
                          {h.protocolo_celesc && <> · Protocolo <strong className="text-white/70">{h.protocolo_celesc}</strong></>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-white/40">Etapa</p>
                        <p className="text-lg font-black text-sol">{h.etapa_atual}<span className="text-white/40 text-sm">/6</span></p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
