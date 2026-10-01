import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRAZO_CONTATO_MIN } from '@/lib/whatsapp/broadcast'
import { BotaoAceitarLead } from './BotaoAceitarLead'

export const dynamic = 'force-dynamic'

/**
 * /leads/aceitar/[id] — link do aviso "🎯 Novo lead disponível" (Kalebe
 * 2026-10-01). Mostra o resumo do lead e o botão pra aceitar pelo portal.
 */
export default async function AceitarLeadPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { ok?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/leads/aceitar/${params.id}`)
  const { data: perfil } = await supabase.from('profiles').select('role, ativo').eq('id', user.id).maybeSingle()
  const podeAceitar = !!perfil?.ativo && ['representante', 'admin'].includes(String(perfil?.role))

  // Broadcast e aceites lidos pelo servidor (o lead ainda não é de ninguém)
  const admin = createAdminClient()
  const { data: bc } = await admin
    .from('lead_broadcasts')
    .select('id, status, resumo, criado_em, conversa_id, projeto_id')
    .eq('id', params.id)
    .maybeSingle()
  const { data: meuAceite } = bc
    ? await admin.from('lead_aceites').select('posicao, status, prazo_expira_em')
        .eq('broadcast_id', bc.id).eq('representante_id', user.id).maybeSingle()
    : { data: null as any }

  const aberto = !!bc && ['aguardando_aceites', 'atribuido'].includes(bc.status)
  const ok = searchParams?.ok
  const cartao = 'max-w-lg mx-auto bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-4'

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-10">
      <div className={cartao}>
        <p className="text-[10px] uppercase tracking-wider font-bold text-sol">🎯 Novo lead</p>
        {!bc ? (
          <p className="text-white">Lead não encontrado.</p>
        ) : (
          <>
            <h1 className="text-xl font-black text-white">{bc.resumo || 'Lead do WhatsApp'}</h1>
            <p className="text-xs text-white/50">
              Chegou em {new Date(bc.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>

            {meuAceite ? (
              <div className="p-3 rounded-lg bg-verde/10 border border-verde/30 text-sm text-white/85">
                {meuAceite.status === 'no_volante' ? (
                  <>✅ <strong>O lead é seu.</strong> Você tem até{' '}
                    {meuAceite.prazo_expira_em
                      ? new Date(meuAceite.prazo_expira_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      : `${PRAZO_CONTATO_MIN} min`}{' '}
                    pra contatar o cliente (áudio ou chamada) pelo canal Spin.</>
                ) : meuAceite.status === 'pendente' ? (
                  <>📋 Você está na <strong>posição {meuAceite.posicao}</strong> da fila. Se quem está na frente não contatar no prazo, o lead vem pra você.</>
                ) : (
                  <>Seu aceite: {String(meuAceite.status).replace(/_/g, ' ')}.</>
                )}
              </div>
            ) : !aberto ? (
              <p className="text-sm text-white/60">Este lead já foi encerrado ({String(bc.status).replace(/_/g, ' ')}).</p>
            ) : podeAceitar ? (
              <>
                <p className="text-sm text-white/70">
                  Quem aceitar primeiro fica com o lead e tem <strong>{PRAZO_CONTATO_MIN} min</strong> pra contatar o
                  cliente pelo canal Spin. Os demais entram na fila por ordem de aceite.
                </p>
                <BotaoAceitarLead broadcastId={bc.id} />
              </>
            ) : (
              <p className="text-sm text-white/60">Só representantes e admins aceitam leads.</p>
            )}

            {ok && <p className="text-xs text-verde">Aceite registrado.</p>}

            {meuAceite?.status === 'no_volante' && bc.conversa_id && (
              <Link href={`/inbox?c=${bc.conversa_id}`}
                className="inline-block px-4 py-2 bg-verde text-noite font-bold text-sm rounded-lg">
                💬 Abrir conversa com o cliente
              </Link>
            )}
          </>
        )}
      </div>
    </main>
  )
}
