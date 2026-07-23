import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SugestoesBiancaClient } from '@/components/SugestoesBiancaClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const GATILHO_LABEL: Record<string, { emoji: string; label: string; cor: string }> = {
  proposta_aceita:              { emoji: '🎉', label: 'Cliente aceitou proposta',      cor: 'verde' },
  proposta_followup_3d:         { emoji: '⏰', label: 'Follow-up 3 dias sem resposta', cor: 'sol' },
  homologacao_aprovada:         { emoji: '✅', label: 'Homologação CELESC aprovada',   cor: 'verde' },
  cliente_respondeu_whatsapp:   { emoji: '💬', label: 'Cliente respondeu WhatsApp',    cor: 'weg-azul' },
  modulo_pendente_7d:           { emoji: '📦', label: 'Módulo pendente há 7 dias',     cor: 'sol' },
  instalacao_amanha:            { emoji: '🔧', label: 'Instalação amanhã',             cor: 'coral' },
}

export default async function SugestoesBiancaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Sugestoes de comunicação (whatsapp/chat) do usuário logado
  const { data: sugestoes } = await supabase
    .from('bianca_comunicacoes')
    .select(`
      id, canal, mensagem, destinatario_nome, destinatario_telefone, link_wa,
      status, gatilho_chave, projeto_id, criado_em,
      projeto:projeto_id(codigo, cliente_razao_social)
    `)
    .eq('usuario_id', user.id)
    .eq('status', 'sugerida')
    .order('criado_em', { ascending: false })
    .limit(50)

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            💡 Sugestões da Bianca
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Mensagens e ações que a Bianca preparou automaticamente pra você aprovar antes de enviar.
          </p>
        </header>

        {(!sugestoes || sugestoes.length === 0) ? (
          <div className="p-12 bg-white/[0.02] border border-dashed border-white/10 rounded-xl text-center">
            <div className="text-5xl mb-3">🎯</div>
            <p className="text-lg font-bold text-white mb-1">Nada pendente!</p>
            <p className="text-sm text-white/50">
              Quando um evento acontecer (proposta aceita, cliente responder, etc), a Bianca vai preparar
              a mensagem aqui pra você revisar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sugestoes.map((s: any) => (
              <SugestoesBiancaClient
                key={s.id}
                sugestao={s}
                gatilhoInfo={GATILHO_LABEL[s.gatilho_chave] || { emoji: '💬', label: s.gatilho_chave || 'Bianca', cor: 'sol' }}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
