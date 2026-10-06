import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CentralBiancaClient } from '@/components/bianca/CentralBiancaClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Central da Bianca (Kalebe 2026-10-06). Antes só listava as sugestões de
 * mensagem — por isso "Ver página completa" aparecia vazia mesmo com o sino
 * cheio de avisos. Agora: avisos dos agentes + sugestões, com ações em lote.
 * O sino ficou só com os atendimentos (cliente esperando resposta / standby).
 */
export default async function CentralBiancaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: avisos }, { data: sugestoes }] = await Promise.all([
    supabase
      .from('avisos_internos')
      .select('id, remetente_agente, titulo, mensagem, urgente, projeto_id, conversa_id, criado_em, projeto:projeto_id(codigo, cliente_razao_social)')
      .eq('destinatario_id', user.id)
      .is('lido_em', null)
      .order('criado_em', { ascending: false })
      .limit(200),
    supabase
      .from('bianca_comunicacoes')
      .select(`
        id, canal, mensagem, destinatario_nome, destinatario_telefone, link_wa,
        status, gatilho_chave, projeto_id, criado_em,
        projeto:projeto_id(codigo, cliente_razao_social)
      `)
      .eq('usuario_id', user.id)
      .eq('status', 'sugerida')
      .order('criado_em', { ascending: false })
      .limit(100),
  ])

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-xl mx-auto">
        <header className="mb-8">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">🔔 Central da Bianca</h1>
          <p className="text-white/60 mt-1 text-sm">
            Recados dos agentes e mensagens que a Bianca preparou. Cada recado também aparece no card do cliente
            quando você abre. Clientes esperando resposta ficam no sino.
          </p>
        </header>
        <CentralBiancaClient avisos={avisos || []} sugestoes={sugestoes || []} />
      </div>
    </main>
  )
}
