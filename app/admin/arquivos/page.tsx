import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fmtNum, fmtInt } from '@/lib/formatters'
import {
  BUCKETS_CLIENTE,
  RETENCAO_DIAS,
  ROTULO_BUCKET,
  listarVencidos,
  type ArquivoVencido,
} from '@/lib/retencao/arquivos'

export const dynamic = 'force-dynamic'

/**
 * /admin/arquivos — uso do Storage e regra de retenção de 180 dias.
 * Kalebe 2026-09-25: arquivo de cliente que não fechou negócio é apagado
 * 180 dias depois de criado. Aqui mostra o que ocupa espaço, o que vence
 * nos próximos 30 dias e o que já foi removido.
 */

const LIMITE_PLANO_MB = 1024 // Supabase Free: 1 GB de Storage

export default async function AdminArquivosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const em30dias = new Date(Date.now() + 30 * 24 * 3600 * 1000)

  const [usoRes, vencendo, expurgosRes] = await Promise.all([
    admin.rpc('arquivos_uso_por_bucket'),
    listarVencidos({ referencia: em30dias, limite: 2000 }).catch(() => null),
    admin.from('arquivos_expurgados')
      .select('bucket_id, nome, bytes, criado_em, expurgado_em')
      .order('expurgado_em', { ascending: false })
      .limit(20),
  ])

  const uso = (usoRes.data || []) as Array<{ bucket_id: string; arquivos: number; bytes: number; mais_antigo: string | null }>
  const semMigration = !!usoRes.error || vencendo === null
  const totalMb = uso.reduce((s, b) => s + Number(b.bytes || 0), 0) / 1048576
  const clienteMb = uso
    .filter((b) => BUCKETS_CLIENTE.includes(b.bucket_id))
    .reduce((s, b) => s + Number(b.bytes || 0), 0) / 1048576
  const vencendoMb = (vencendo || []).reduce((s, a) => s + Number(a.bytes || 0), 0) / 1048576
  const expurgos = expurgosRes.data || []

  const fmtData = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
  const venceEm = (a: ArquivoVencido) =>
    fmtData(new Date(new Date(a.criado_em).getTime() + RETENCAO_DIAS * 24 * 3600 * 1000).toISOString())

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-xl mx-auto">
        <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-1 inline-block">
          ← Administração
        </Link>
        <h1 className="text-3xl md:text-4xl font-black text-white">🗂 Arquivos e retenção</h1>
        <p className="text-white/60 mt-1 text-sm max-w-3xl">
          Arquivo de cliente fica no máximo <strong className="text-white">{RETENCAO_DIAS} dias</strong> a
          contar da criação. Depois disso é apagado automaticamente (todo dia às 3h),{' '}
          <strong className="text-white">exceto se o cliente fechou negócio</strong> — aí fica pra sempre.
          Só o arquivo sai: mensagens, projetos e histórico continuam. Arquivos da empresa (logo,
          assinatura, datasheets, catálogo, criativos) nunca são apagados.
        </p>

        {semMigration && (
          <div className="mt-6 p-4 bg-coral/10 border border-coral/30 rounded-xl text-sm text-coral">
            Migration 121 ainda não aplicada — rode no SQL Editor pra ativar a regra.
          </div>
        )}

        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <Card
            titulo="Espaço usado"
            valor={`${fmtNum(totalMb, 1)} MB`}
            detalhe={`${fmtNum((totalMb / LIMITE_PLANO_MB) * 100, 0)}% de 1 GB (plano Free)`}
          />
          <Card
            titulo="Arquivos de cliente"
            valor={`${fmtNum(clienteMb, 1)} MB`}
            detalhe="entram na regra de 180 dias"
          />
          <Card
            titulo="Vencem nos próximos 30 dias"
            valor={`${fmtInt((vencendo || []).length)} arquivos`}
            detalhe={`${fmtNum(vencendoMb, 1)} MB · clientes sem negócio fechado`}
            destaque={(vencendo || []).length > 0}
          />
        </div>

        {/* Uso por pasta */}
        <Secao titulo="Uso por pasta">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-white/10 text-[10px] uppercase text-white/50 font-bold">
                <th className="pb-2 pr-3">Pasta</th>
                <th className="pb-2 pr-3">Regra</th>
                <th className="pb-2 pr-3 text-right">Arquivos</th>
                <th className="pb-2 pr-3 text-right">MB</th>
                <th className="pb-2">Mais antigo</th>
              </tr>
            </thead>
            <tbody>
              {uso.map((b) => (
                <tr key={b.bucket_id} className="border-b border-white/5">
                  <td className="py-2 pr-3 text-white/80">
                    {ROTULO_BUCKET[b.bucket_id] || b.bucket_id}
                    <span className="block text-[10px] text-white/30 font-mono">{b.bucket_id}</span>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {BUCKETS_CLIENTE.includes(b.bucket_id)
                      ? <span className="text-sol">{RETENCAO_DIAS} dias</span>
                      : <span className="text-verde">permanente</span>}
                  </td>
                  <td className="py-2 pr-3 text-right text-white/80">{fmtInt(Number(b.arquivos))}</td>
                  <td className="py-2 pr-3 text-right text-white/80">{fmtNum(Number(b.bytes) / 1048576, 1)}</td>
                  <td className="py-2 text-white/60 text-xs">{fmtData(b.mais_antigo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>

        {/* Próximos a vencer */}
        <Secao titulo={`Vencem nos próximos 30 dias (${fmtInt((vencendo || []).length)})`}>
          {(vencendo || []).length === 0 ? (
            <p className="text-sm text-white/50">Nenhum arquivo vence nos próximos 30 dias.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10 text-[10px] uppercase text-white/50 font-bold">
                  <th className="pb-2 pr-3">Pasta</th>
                  <th className="pb-2 pr-3">Arquivo</th>
                  <th className="pb-2 pr-3 text-right">MB</th>
                  <th className="pb-2 pr-3">Criado</th>
                  <th className="pb-2">Apagado em</th>
                </tr>
              </thead>
              <tbody>
                {(vencendo || []).slice(0, 100).map((a) => (
                  <tr key={`${a.bucket_id}/${a.nome}`} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-white/70 text-xs">{ROTULO_BUCKET[a.bucket_id] || a.bucket_id}</td>
                    <td className="py-2 pr-3 text-white/60 text-xs font-mono break-all">{a.nome}</td>
                    <td className="py-2 pr-3 text-right text-white/70 text-xs">{fmtNum(Number(a.bytes || 0) / 1048576, 1)}</td>
                    <td className="py-2 pr-3 text-white/60 text-xs">{fmtData(a.criado_em)}</td>
                    <td className="py-2 text-sol text-xs">{venceEm(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>

        {/* Já removidos */}
        <Secao titulo="Últimos arquivos removidos">
          {expurgos.length === 0 ? (
            <p className="text-sm text-white/50">Nenhum arquivo removido ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10 text-[10px] uppercase text-white/50 font-bold">
                  <th className="pb-2 pr-3">Pasta</th>
                  <th className="pb-2 pr-3">Arquivo</th>
                  <th className="pb-2 pr-3 text-right">MB</th>
                  <th className="pb-2">Removido em</th>
                </tr>
              </thead>
              <tbody>
                {expurgos.map((e: any) => (
                  <tr key={`${e.bucket_id}/${e.nome}/${e.expurgado_em}`} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-white/70 text-xs">{ROTULO_BUCKET[e.bucket_id] || e.bucket_id}</td>
                    <td className="py-2 pr-3 text-white/60 text-xs font-mono break-all">{e.nome}</td>
                    <td className="py-2 pr-3 text-right text-white/70 text-xs">{fmtNum(Number(e.bytes || 0) / 1048576, 1)}</td>
                    <td className="py-2 text-white/60 text-xs">{fmtData(e.expurgado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>
      </div>
    </main>
  )
}

function Card({ titulo, valor, detalhe, destaque }: { titulo: string; valor: string; detalhe: string; destaque?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border ${destaque ? 'bg-sol/5 border-sol/40' : 'bg-white/[0.03] border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider font-bold text-white/50">{titulo}</p>
      <p className="text-2xl font-black text-white mt-1">{valor}</p>
      <p className="text-xs text-white/50 mt-0.5">{detalhe}</p>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 bg-white/[0.03] border border-white/10 rounded-xl p-5">
      <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">{titulo}</h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}
