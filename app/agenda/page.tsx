import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AgendaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('nome')
    .eq('id', user.id)
    .single()

  const primeiroNome = (perfil?.nome || 'Kalebe').split(' ')[0]

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              Agenda com <span className="text-sol">Bianca</span>
            </h1>
            <p className="text-white/60 mt-1 text-sm">
              Sua secretária executiva IA — WhatsApp, email e chat integrado
            </p>
          </div>
          <div className="text-6xl">👩‍💼</div>
        </header>

        {/* Preview do que a Bianca vai fazer */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-6">
          <h2 className="text-sm uppercase tracking-wider font-bold text-sol mb-3">🚧 Em construção</h2>
          <p className="text-white/80 mb-4">
            Olá {primeiroNome}! A Bianca está em treinamento. Quando ficar pronta, ela vai:
          </p>
          <ul className="space-y-2 text-sm text-white/70">
            <li className="flex gap-2"><span>📅</span> Gerenciar eventos, tarefas e alarmes seus e do time</li>
            <li className="flex gap-2"><span>💬</span> Aceitar comandos em linguagem natural via chat, WhatsApp e email</li>
            <li className="flex gap-2"><span>🌅</span> Enviar todo dia de manhã um resumo do seu WhatsApp com agenda e pendências</li>
            <li className="flex gap-2"><span>🔔</span> Alertar sobre reuniões, ligações, prazos e visitas técnicas</li>
            <li className="flex gap-2"><span>🔗</span> Ler emails de fornecedores/clientes e criar tarefas automaticamente</li>
            <li className="flex gap-2"><span>📊</span> Enviar relatórios semanais de produtividade</li>
          </ul>
        </section>

        {/* Roadmap */}
        <section className="bg-white/[0.02] border border-white/10 rounded-xl p-6 mb-6">
          <h2 className="text-sm uppercase tracking-wider font-bold text-white/70 mb-3">Roadmap</h2>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="text-verde">✓</span>
              <div>
                <p className="text-white font-bold">Schema criado</p>
                <p className="text-xs text-white/50">Tabelas de eventos, tarefas e conversas com Bianca já modeladas.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-sol">🚧</span>
              <div>
                <p className="text-white font-bold">Sprint 1 — MVP conversacional</p>
                <p className="text-xs text-white/50">Chat na tela + Bianca respondendo com Claude API + calendário funcional.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-white/30">⏳</span>
              <div>
                <p className="text-white/70 font-bold">Sprint 2 — WhatsApp</p>
                <p className="text-xs text-white/50">Bianca envia resumo matinal e aceita comandos por WhatsApp (via Twilio).</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-white/30">⏳</span>
              <div>
                <p className="text-white/70 font-bold">Sprint 3 — Email</p>
                <p className="text-xs text-white/50">Bianca lê emails inbound e cria tarefas automaticamente.</p>
              </div>
            </div>
          </div>
        </section>

        <Link
          href="/projetos"
          className="inline-block px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
        >
          ← Voltar aos projetos
        </Link>
      </div>
    </main>
  )
}
