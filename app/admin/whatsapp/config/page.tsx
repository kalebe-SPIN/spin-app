import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buscarWaConfigAction } from './actions'
import ConfigCanalClient from '@/components/admin/ConfigCanalClient'

export const dynamic = 'force-dynamic'

/**
 * Kalebe 2026-09-15: sem acesso Vercel (2FA travado desde 14/ago).
 * Toda credential do canal WhatsApp é editada aqui. Só admin acessa.
 */
export default async function AdminWaConfigPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/whatsapp/config')
  const { data: perfil } = await supabase
    .from('profiles').select('role, nome_completo').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const resultado = await buscarWaConfigAction()
  const mascaras = 'erro' in resultado ? {} : resultado.mascaras

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <Link href="/admin/whatsapp/setup" className="text-sm text-neutral-500 hover:text-neutral-800">← voltar ao setup</Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">Config Canal WhatsApp</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Credenciais da integração Meta Cloud API. Guardadas em <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-xs">wa_config</code> (Supabase),
            fora do Vercel. Cache em memória de 30s — mudança propaga rápido.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Segurança:</strong> valores atuais são exibidos <em>mascarados</em>. Digite o valor completo pra sobrescrever;
          deixe em branco pra manter o atual. Só admin acessa esta tela (checagem no server).
        </div>

        <ConfigCanalClient mascarasIniciais={mascaras} />

        <div className="mt-10 border-t border-neutral-200 pt-6">
          <h2 className="text-sm font-semibold text-neutral-800 mb-2">Onde pegar cada valor</h2>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li><strong>WHATSAPP_ACCESS_TOKEN:</strong> Meta Business Manager → Configurações → Usuários do Sistema → Gerar Token (permanente).</li>
            <li><strong>WHATSAPP_PHONE_NUMBER_ID:</strong> Meta app → WhatsApp → API Setup → coluna "Phone number ID". <br/>
              <span className="text-neutral-500">Esperado: número Spin +55 48 3263-0182 (WABA "Spin Solar", ID 286157384591672).</span></li>
            <li><strong>WHATSAPP_VERIFY_TOKEN:</strong> qualquer string aleatória. Vai usar essa mesma string ao cadastrar o webhook na Meta.</li>
            <li><strong>CRON_SECRET:</strong> string aleatória. Autoriza chamadas manuais ao endpoint de cron.</li>
            <li><strong>ANTHROPIC_API_KEY:</strong> console.anthropic.com → API Keys. Usado pelo SDR IA.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
