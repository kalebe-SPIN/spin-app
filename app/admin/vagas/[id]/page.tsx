import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RevisarDocsClient } from '@/components/admin/RevisarDocsClient'

export const dynamic = 'force-dynamic'

/** Detalhe do candidato — assinatura + documentos com download (bucket privado). */
export default async function AdminVagaDetalhePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()

  const { data: convite } = await admin.from('convites_trabalho').select('*').eq('id', params.id).maybeSingle()
  if (!convite) notFound()

  const { data: assinatura } = await admin
    .from('assinaturas_contrato')
    .select('*')
    .eq('convite_id', convite.id)
    .order('assinado_em', { ascending: false })
    .maybeSingle()

  const { data: docsRaw } = await admin
    .from('documentos_candidato')
    .select('*')
    .eq('convite_id', convite.id)
    .order('enviado_em', { ascending: false })

  // Links assinados (1h) pra baixar do bucket privado
  const docs = await Promise.all(
    (docsRaw || []).map(async (d) => {
      const { data: signed } = await admin.storage
        .from('documentos-candidatos')
        .createSignedUrl(d.arquivo_path, 3600)
      return { ...d, signedUrl: signed?.signedUrl || null }
    })
  )

  const dataFmt = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR') : '—')

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-3xl mx-auto">
        <nav className="mb-6">
          <Link href="/admin/vagas" className="text-sm text-white/50 hover:text-sol transition-colors">← Voltar aos convites</Link>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl font-black text-white">{convite.nome_candidato}</h1>
          <p className="text-white/60 text-sm mt-1">
            {convite.email_candidato}{convite.telefone ? ` · ${convite.telefone}` : ''}{convite.zona ? ` · ${convite.zona}` : ''}
          </p>
          <p className="text-white/40 text-xs mt-1">{convite.cargo}</p>
        </header>

        {/* Linha do tempo */}
        <section className="mb-8 grid sm:grid-cols-2 gap-3">
          <Info label="Status" valor={convite.status} />
          <Info label="Acessos usados" valor={`${convite.entradas_usadas}/${convite.max_entradas}${convite.bloqueado ? ' (expirado)' : ''}`} />
          <Info label="Proposta aceita em" valor={dataFmt(convite.proposta_aceita_em)} />
          <Info label="Contrato assinado em" valor={dataFmt(convite.contrato_assinado_em)} />
        </section>

        {/* Assinatura */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-white mb-3">Assinatura do contrato</h2>
          {assinatura ? (
            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl text-sm space-y-1">
              <p className="text-white/80"><span className="text-white/40">Assinante:</span> {assinatura.nome_assinante} · CPF {assinatura.cpf}</p>
              <p className="text-white/60"><span className="text-white/40">Data/hora:</span> {dataFmt(assinatura.assinado_em)} · <span className="text-white/40">IP:</span> {assinatura.ip || '—'}</p>
              <p className="text-white/40 text-xs break-all"><span className="text-white/40">Hash SHA-256:</span> {assinatura.documento_hash || '—'}</p>
            </div>
          ) : (
            <p className="text-white/40 text-sm">Contrato ainda não assinado.</p>
          )}
        </section>

        {/* Documentos */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3">Documentos</h2>
          <RevisarDocsClient docs={docs} />
        </section>
      </div>
    </main>
  )
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-lg">
      <p className="text-xs uppercase tracking-wider text-white/40 font-semibold">{label}</p>
      <p className="text-white text-sm mt-0.5">{valor}</p>
    </div>
  )
}
