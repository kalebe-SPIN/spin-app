import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { GatilhosBiancaClient } from '@/components/GatilhosBiancaClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PUBLICO_LABEL: Record<string, string> = {
  cliente: '👤 Cliente',
  consultor: '💼 Consultor',
  admin: '⚙️ Admin',
  time_completo: '👥 Time',
}

const CANAL_LABEL: Record<string, string> = {
  whatsapp: '📱 WhatsApp',
  email: '✉️ Email',
  tarefa_agenda: '📋 Tarefa',
  chat_bianca: '💬 Chat Bianca',
}

export default async function GatilhosBiancaPage() {
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
          <p className="text-white/60 text-sm mt-2">Só admin edita gatilhos da Bianca.</p>
        </div>
      </main>
    )
  }

  const { data: gatilhos } = await supabase
    .from('bianca_gatilhos')
    .select('*')
    .order('publico_alvo')
    .order('nome')

  // Estatisticas: quantos disparos nos ultimos 7 dias por gatilho
  const seteDiasAtras = new Date()
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7)
  const { data: eventos } = await supabase
    .from('bianca_eventos_disparados')
    .select('gatilho_chave, status')
    .gte('disparado_em', seteDiasAtras.toISOString())

  const contagem: Record<string, { total: number; sugeridas: number; enviadas: number; falhas: number }> = {}
  for (const e of eventos || []) {
    const c = contagem[e.gatilho_chave] || { total: 0, sugeridas: 0, enviadas: 0, falhas: 0 }
    c.total++
    if (e.status === 'sugerida') c.sugeridas++
    if (e.status === 'enviada_auto') c.enviadas++
    if (e.status === 'falhou') c.falhas++
    contagem[e.gatilho_chave] = c
  }

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Gatilhos da Bianca
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Configure como a Bianca reage a eventos do sistema (proposta aceita, cliente respondeu, etc).
          </p>
        </header>

        <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-xl p-4 mb-6">
          <p className="text-xs text-white/80">
            💡 <strong>Modos:</strong>{' '}
            <span className="text-verde font-bold">automático</span> = executa direto,{' '}
            <span className="text-sol font-bold">sugerido</span> = cria pra você confirmar,{' '}
            <span className="text-white/50 font-bold">desligado</span> = ignora eventos.
          </p>
        </div>

        <div className="space-y-3">
          {(gatilhos || []).map((g: any) => (
            <GatilhosBiancaClient
              key={g.id}
              gatilho={g}
              publicoLabel={PUBLICO_LABEL[g.publico_alvo] || g.publico_alvo}
              canalLabel={CANAL_LABEL[g.canal] || g.canal}
              stats={contagem[g.chave]}
            />
          ))}
        </div>

        {(!gatilhos || gatilhos.length === 0) && (
          <div className="p-8 bg-white/[0.02] border border-dashed border-white/10 rounded-lg text-center">
            <p className="text-white/40 text-sm">
              Nenhum gatilho configurado. Rode a Migration 048 no Supabase.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
