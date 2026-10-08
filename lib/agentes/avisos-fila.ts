import { createAdminClient } from '@/lib/supabase/admin'
import { enviarTextoPeloCanal } from '@/lib/whatsapp/enviar-canal'
import { upsertContato, findOrCreateConversaAtiva } from '@/lib/whatsapp/conversas'

/**
 * Fila dos avisos internos no WhatsApp (Kalebe 2026-10-08). A Meta trata o
 * modelo de aviso como MARKETING e barra o excesso por pessoa — então com a
 * janela de 24h fechada sai no máximo 1 modelo a cada 3h e o resto fica
 * 'aguardando_janela' (o sino do portal já tem tudo). Rodada de 5 em 5 min:
 *  - janela aberta (a pessoa respondeu) → um resumo em texto com os pendentes;
 *  - ainda fechada e passou 3h do último modelo → 1 modelo com o resumo.
 */
const HORAS_ENTRE_MODELOS = 3
const TITULO_CURTO = (t: string | null, m: string) => (t ? `*${t}*: ` : '') + m.replace(/\s+/g, ' ').slice(0, 280)

export async function entregarAvisosPendentes(): Promise<{ resumos: number; modelos: number }> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: pendentes, error } = await admin.from('avisos_internos')
    .select('id, destinatario_id, titulo, mensagem, urgente, criado_em')
    .eq('whatsapp_status', 'aguardando_janela').gte('criado_em', desde)
    .order('criado_em').limit(500)
  if (error || !pendentes?.length) return { resumos: 0, modelos: 0 }

  const porPessoa = new Map<string, any[]>()
  for (const a of pendentes as any[]) porPessoa.set(a.destinatario_id, [...(porPessoa.get(a.destinatario_id) || []), a])

  let resumos = 0, modelos = 0
  for (const [pessoa, lista] of Array.from(porPessoa.entries())) {
    try {
      const { data: perfil } = await admin.from('profiles').select('id, nome_completo, telefone, ativo').eq('id', pessoa).maybeSingle()
      let tel = String(perfil?.telefone || '').replace(/\D/g, '')
      if (tel && !tel.startsWith('55') && (tel.length === 10 || tel.length === 11)) tel = '55' + tel
      if (!perfil?.ativo || tel.length < 12) continue
      const contato = await upsertContato(admin, { telefone: tel, nome_exibicao: perfil.nome_completo, tipo_default: 'colaborador' })
      const conv = contato ? await findOrCreateConversaAtiva(admin, contato.id, { status_inicial: 'em_atendimento' }) : null
      if (!conv) continue
      const { data: j } = await admin.from('wa_conversas').select('janela_24h_expira_em').eq('id', conv.id).maybeSingle()
      const aberta = !!j?.janela_24h_expira_em && new Date(j.janela_24h_expira_em) > new Date()
      const ids = lista.map((a) => a.id)

      if (aberta) {
        // Resumo em texto (cabe ~4.000 caracteres numa mensagem)
        const linhas: string[] = []
        let tamanho = 0
        for (const a of lista) {
          const l = `• ${a.urgente ? '🔴 ' : ''}${TITULO_CURTO(a.titulo, a.mensagem)}`
          if (tamanho + l.length > 3300) { linhas.push(`… e mais ${lista.length - linhas.length} no portal.`); break }
          linhas.push(l); tamanho += l.length
        }
        const texto = `🔔 *Avisos enquanto a janela estava fechada (${lista.length})*\n\n${linhas.join('\n')}`
        const r: any = await enviarTextoPeloCanal({ conversa_id: conv.id, telefone: tel, texto, remetente_agente: 'bianca', origem_agente_nome: 'Bianca' })
        if (r?.sucesso) {
          await admin.from('avisos_internos').update({ whatsapp_status: 'enviado', whatsapp_erro: null }).in('id', ids)
          resumos++
        }
        continue
      }

      // Fechada: 1 modelo a cada 3h com o resumo
      const { count: recentes } = await admin.from('wa_mensagens').select('id', { count: 'exact', head: true })
        .eq('conversa_id', conv.id).eq('tipo', 'template').eq('direcao', 'outbound')
        .gte('criada_em', new Date(Date.now() - HORAS_ENTRE_MODELOS * 3600_000).toISOString())
      if (recentes) continue
      const titulos = Array.from(new Set(lista.map((a) => a.titulo || 'Aviso'))).slice(0, 6).join('; ')
      const { enviarTemplatePeloCanal, primeiroNome } = await import('@/lib/whatsapp/templates')
      const r: any = await enviarTemplatePeloCanal({
        conversa_id: conv.id,
        telefone: tel,
        template: 'aviso_interno',
        parametros: [
          primeiroNome(perfil.nome_completo) || 'equipe',
          'Bianca',
          `${lista.length} aviso(s) esperando no portal (${titulos}). Responda esta mensagem pra receber todos aqui direto.`.slice(0, 900),
        ],
        remetente_agente: 'bianca',
        origem_agente_nome: 'Bianca',
      })
      if (r?.sucesso) {
        await admin.from('avisos_internos').update({ whatsapp_status: 'enviado_modelo' }).in('id', ids)
        modelos++
      }
    } catch (e) {
      console.error('[avisos-fila]', e)
    }
  }
  return { resumos, modelos }
}
