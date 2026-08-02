import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Histórico completo de uploads do catálogo WEG.
 * Foi separado da /admin/catalogo pra não inchar a tela principal —
 * agora vive aqui como página dedicada, acessível pelo botão de acesso.
 */
export default async function HistoricoCatalogoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
        </div>
      </main>
    )
  }

  const { data: historico } = await supabase
    .from('catalogo_uploads_historico')
    .select('id, tipo, arquivo_nome_original, status, produtos_atualizados, produtos_criados, erro_mensagem, created_at, processado_em')
    .order('created_at', { ascending: false })
    .limit(200)

  const lista = historico || []

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <Link href="/admin/catalogo" className="text-white/60 text-sm hover:text-white transition">
            ← Voltar ao catálogo WEG
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white">
            📜 Histórico de <span className="text-sol">uploads</span>
          </h1>
          <p className="text-white/60 mt-2 text-sm leading-relaxed">
            Registro cronológico de todas as planilhas e PDFs enviados pro catálogo WEG.
            Últimos {Math.min(lista.length, 200)} uploads.
          </p>
        </header>

        {lista.length === 0 ? (
          <p className="text-center text-white/40 py-16 text-sm">
            Nenhum upload registrado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {lista.map(h => (
              <LinhaHistorico key={h.id} item={h} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

type Item = {
  id: string
  tipo: string
  arquivo_nome_original: string
  status: string
  produtos_atualizados: number | null
  produtos_criados: number | null
  erro_mensagem: string | null
  created_at: string
  processado_em: string | null
}

function LinhaHistorico({ item }: { item: Item }) {
  const data = new Date(item.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const tipoLabel = item.tipo === 'planilha_precos' ? '📊 Planilha'
                  : item.tipo === 'pdf_estoque'     ? '📦 Estoque'
                  : '📄 Datasheet'
  const statusCor = item.status === 'concluido'    ? 'text-verde bg-verde/10 border-verde/30'
                  : item.status === 'processando'  ? 'text-sol bg-sol/10 border-sol/30'
                  : 'text-coral bg-coral/10 border-coral/30'
  const criados = item.produtos_criados || 0
  const atualizados = item.produtos_atualizados || 0

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3 text-xs">
      <span className="text-white/50 font-mono md:w-32 shrink-0">{data}</span>
      <span className="text-white/60 md:w-24 shrink-0">{tipoLabel}</span>
      <span className="text-white/80 flex-1 truncate">{item.arquivo_nome_original}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${statusCor}`}>
          {item.status}
        </span>
        {item.status === 'concluido' && (criados + atualizados > 0) && (
          <span className="text-[10px] text-white/60">
            {criados > 0 && <>+{criados} novos </>}
            {atualizados > 0 && <>✎ {atualizados}</>}
          </span>
        )}
      </div>
      {item.erro_mensagem && (
        <span className="text-[10px] text-coral md:max-w-xs md:truncate" title={item.erro_mensagem}>
          {item.erro_mensagem}
        </span>
      )}
    </div>
  )
}
