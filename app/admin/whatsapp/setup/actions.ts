'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Kalebe 2026-09-15: checagens de saúde do canal WhatsApp.
 * Retorna estado de cada dependência do cutover TROIA→Spin.
 */

export type StatusCheckItem = {
  chave: string
  rotulo: string
  status: 'ok' | 'aviso' | 'erro' | 'desconhecido'
  detalhe: string
  acao?: { texto: string; href?: string }
}

async function verificarAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' as const }
  return { ok: true as const }
}

export async function verificarStatusSetupAction(): Promise<
  { itens: StatusCheckItem[]; resumo: { ok: number; total: number } } | { erro: string }
> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro as string }
  const supabase = createClient()

  const itens: StatusCheckItem[] = []

  // ─── 1) Envs Meta Cloud API ─────────────────────────────────────────────
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  const cronSecret = process.env.CRON_SECRET
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  itens.push({
    chave: 'env_wa_token',
    rotulo: 'Env WHATSAPP_ACCESS_TOKEN',
    status: token ? 'ok' : 'erro',
    detalhe: token
      ? `Setada (${token.length} chars, começa com ${token.slice(0, 6)}…)`
      : 'Não setada. Pegue no Meta Business Manager → System Users → Generate Token.',
    acao: token ? undefined : { texto: 'Vercel Env Variables', href: 'https://vercel.com/dashboard' },
  })

  itens.push({
    chave: 'env_wa_phone',
    rotulo: 'Env WHATSAPP_PHONE_NUMBER_ID',
    status: phoneNumberId ? 'ok' : 'erro',
    detalhe: phoneNumberId
      ? `Setada: ${phoneNumberId}`
      : 'Não setada. Pegue no Meta app → WhatsApp → API Setup.',
    acao: phoneNumberId ? undefined : { texto: 'Vercel Env Variables' },
  })

  itens.push({
    chave: 'env_wa_verify',
    rotulo: 'Env WHATSAPP_VERIFY_TOKEN',
    status: verifyToken ? 'ok' : 'aviso',
    detalhe: verifyToken
      ? `Setada (${verifyToken.length} chars)`
      : 'Não setada. Precisa pra Meta validar a URL do webhook.',
  })

  itens.push({
    chave: 'env_cron',
    rotulo: 'Env CRON_SECRET',
    status: cronSecret ? 'ok' : 'aviso',
    detalhe: cronSecret
      ? 'Setada. Cron autoriza chamadas manuais também.'
      : 'Não setada. Vercel Cron ainda funciona (via user-agent), mas teste manual bloqueia.',
  })

  itens.push({
    chave: 'env_anthropic',
    rotulo: 'Env ANTHROPIC_API_KEY',
    status: anthropicKey ? 'ok' : 'erro',
    detalhe: anthropicKey
      ? 'Setada. Agente de qualificação IA opera.'
      : 'Não setada. Agente IA não responde leads.',
  })

  // ─── 2) Meta conectado — chama API pra confirmar phone_number_id ────────
  if (token && phoneNumberId) {
    try {
      const url = `https://graph.facebook.com/v20.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const j = await r.json()
      if (r.ok) {
        const display = j?.display_phone_number || ''
        const soDig = display.replace(/\D/g, '')
        const bateSpin = soDig === '554832630182'
        itens.push({
          chave: 'meta_conexao',
          rotulo: 'Meta Cloud API responde',
          status: bateSpin ? 'ok' : 'aviso',
          detalhe: bateSpin
            ? `✅ Conectado no número Spin: ${display} · ${j.verified_name || 'sem nome verificado'} · qualidade ${j.quality_rating || 'N/A'}`
            : `⚠️ Conectado, mas número é ${display} (não é o canal Spin +554832630182). Provável número teste antigo.`,
        })
      } else {
        itens.push({
          chave: 'meta_conexao',
          rotulo: 'Meta Cloud API responde',
          status: 'erro',
          detalhe: `❌ Meta retornou erro: ${j?.error?.message || 'sem detalhe'}. Token expirado ou phone_number_id inválido.`,
        })
      }
    } catch (e: any) {
      itens.push({
        chave: 'meta_conexao',
        rotulo: 'Meta Cloud API responde',
        status: 'erro',
        detalhe: `❌ Falha ao chamar Meta: ${e?.message || 'desconhecido'}`,
      })
    }
  } else {
    itens.push({
      chave: 'meta_conexao',
      rotulo: 'Meta Cloud API responde',
      status: 'desconhecido',
      detalhe: 'Espera envs serem setadas.',
    })
  }

  // ─── 3) Migrations 108 + 109 rodadas ────────────────────────────────────
  const [t108, t109a, t109b] = await Promise.all([
    supabase.from('wa_conversas').select('id', { count: 'exact', head: true }),
    supabase.from('wa_agentes').select('id', { count: 'exact', head: true }),
    supabase.from('lead_broadcasts').select('id', { count: 'exact', head: true }),
  ])

  itens.push({
    chave: 'schema_108',
    rotulo: 'Migration 108 (wa_contatos + wa_conversas + wa_mensagens)',
    status: t108.error ? 'erro' : 'ok',
    detalhe: t108.error
      ? `❌ ${t108.error.message}. Rode 108_wa_conversas.sql no SQL Editor.`
      : `✅ Tabelas existem. ${t108.count ?? 0} conversas registradas.`,
  })
  itens.push({
    chave: 'schema_109',
    rotulo: 'Migration 109 (wa_agentes + lead_broadcasts + lead_aceites)',
    status: (t109a.error || t109b.error) ? 'erro' : 'ok',
    detalhe: t109a.error
      ? `❌ ${t109a.error.message}. Rode 109_wa_agentes_broadcasts.sql.`
      : `✅ Tabelas existem. ${t109a.count ?? 0} agentes cadastrados, ${t109b.count ?? 0} broadcasts.`,
  })

  // ─── 4) Agente qualificação_padrao ativo ────────────────────────────────
  const { data: agenteQualif } = await supabase
    .from('wa_agentes')
    .select('id, nome, ativo')
    .eq('chave', 'qualificacao_padrao')
    .maybeSingle()
  itens.push({
    chave: 'agente_qualificacao',
    rotulo: 'Agente qualificação_padrao ativo',
    status: agenteQualif?.ativo ? 'ok' : agenteQualif ? 'aviso' : 'erro',
    detalhe: !agenteQualif
      ? '❌ Não encontrado. Seed da migration 109 falhou.'
      : agenteQualif.ativo
        ? `✅ ${agenteQualif.nome} está ativo — atende leads novos.`
        : `⚠️ ${agenteQualif.nome} está DESATIVADO. Ative em /admin/agentes.`,
    acao: agenteQualif ? { texto: 'Editar agente', href: '/admin/agentes' } : undefined,
  })

  // ─── 5) Telefones dos representantes ────────────────────────────────────
  const { data: reps } = await supabase
    .from('profiles')
    .select('id, nome_completo, telefone, role')
    .in('role', ['admin', 'representante', 'consultor'])
    .eq('ativo', true)
  const repsSemTel = (reps || []).filter((r) => !r.telefone || String(r.telefone).replace(/\D/g, '').length < 10)
  const totalReps = (reps || []).length
  itens.push({
    chave: 'telefones_reps',
    rotulo: 'Telefones dos representantes',
    status: totalReps === 0 ? 'erro'
      : repsSemTel.length === 0 ? 'ok'
      : repsSemTel.length < totalReps ? 'aviso'
      : 'erro',
    detalhe: totalReps === 0
      ? '❌ Nenhum usuário ativo. Sem quem atender.'
      : repsSemTel.length === 0
        ? `✅ Todos os ${totalReps} usuários com telefone cadastrado.`
        : `⚠️ ${repsSemTel.length} de ${totalReps} sem telefone: ${repsSemTel.slice(0, 3).map((r) => r.nome_completo?.split(' ')[0]).join(', ')}${repsSemTel.length > 3 ? '…' : ''}`,
    acao: { texto: 'Editar telefones', href: '/admin/whatsapp' },
  })

  // ─── 6) Cron SLA acessível ──────────────────────────────────────────────
  // Não conseguimos "verificar" se o Vercel Cron está agendado sem chamar
  // a API do Vercel — mas checamos se o endpoint existe respondendo.
  // Por enquanto: só valida presença dos secrets.
  itens.push({
    chave: 'cron_sla',
    rotulo: 'Cron SLA agendado no Vercel',
    status: cronSecret ? 'aviso' : 'aviso',
    detalhe: 'Config no vercel.json aponta pra /api/cron/lead-sla a cada minuto. Plano Vercel Hobby só permite crons diários — se rejeitou o deploy, precisa upgrade Pro OU cron externo (cron-job.org batendo com CRON_SECRET).',
  })

  const ok = itens.filter((i) => i.status === 'ok').length

  return {
    itens,
    resumo: { ok, total: itens.length },
  }
}
