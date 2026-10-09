'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Foto de perfil do contato/cliente (Kalebe 2026-10-01). A API oficial do
 * WhatsApp não entrega a foto do cliente → é enviada à mão. Vai pro bucket
 * 'fotos-perfil' (mig 131) e vale pro contato do WhatsApp e pro cliente
 * vinculado a ele. Permissão: o usuário precisa enxergar o registro (RLS);
 * a gravação é pelo service role.
 */

export type AlvoFoto = { contato_id?: string | null; cliente_id?: string | null }

const BUCKET = 'fotos-perfil'
const MSG_MIGRATION = 'Falta rodar a migration 131 (fotos de perfil) no Supabase'

async function resolverAlvo(alvo: AlvoFoto): Promise<
  { erro: string } | { contatoIds: string[]; clienteId: string | null; chave: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  if (alvo.cliente_id) {
    const { data: cli } = await supabase.from('clientes').select('id').eq('id', alvo.cliente_id).maybeSingle()
    if (!cli) return { erro: 'Cliente não encontrado' }
    const { data: contatos } = await createAdminClient()
      .from('wa_contatos').select('id').eq('cliente_id', cli.id)
    const ids = new Set((contatos || []).map((c: any) => c.id as string))
    // Conversa do projeto cujo contato ainda não foi vinculado ao cliente
    if (alvo.contato_id) {
      const { data: ct } = await supabase.from('wa_contatos').select('id').eq('id', alvo.contato_id).maybeSingle()
      if (ct) ids.add(ct.id)
    }
    return { contatoIds: Array.from(ids), clienteId: cli.id, chave: `cliente/${cli.id}` }
  }
  if (alvo.contato_id) {
    const { data: ct } = await supabase.from('wa_contatos').select('id, cliente_id').eq('id', alvo.contato_id).maybeSingle()
    if (!ct) return { erro: 'Contato não encontrado' }
    return { contatoIds: [ct.id], clienteId: ct.cliente_id || null, chave: `contato/${ct.id}` }
  }
  return { erro: 'Informe o contato ou o cliente' }
}

async function gravarFoto(contatoIds: string[], clienteId: string | null, url: string | null): Promise<string | null> {
  const admin = createAdminClient()
  if (contatoIds.length) {
    const { error } = await admin.from('wa_contatos').update({ foto_url: url }).in('id', contatoIds)
    if (error) return /foto_url/.test(error.message) ? MSG_MIGRATION : error.message
  }
  if (clienteId) {
    const { error } = await admin.from('clientes').update({ foto_url: url }).eq('id', clienteId)
    if (error) return /foto_url/.test(error.message) ? MSG_MIGRATION : error.message
  }
  return null
}

function revalidar(clienteId: string | null) {
  revalidatePath('/spinzap')
  if (clienteId) revalidatePath(`/crm/clientes/${clienteId}`)
}

export async function salvarFotoPerfilAction(fd: FormData): Promise<{ foto_url: string } | { erro: string }> {
  const arquivo = fd.get('arquivo')
  if (!(arquivo instanceof Blob) || arquivo.size === 0) return { erro: 'Escolha uma imagem' }
  if (arquivo.size > 2 * 1024 * 1024) return { erro: 'Imagem acima de 2 MB' }
  const tipo = arquivo.type || 'image/jpeg'
  if (!/^image\/(jpeg|png|webp)$/.test(tipo)) return { erro: 'Use JPG, PNG ou WebP' }

  const r = await resolverAlvo({
    contato_id: (fd.get('contato_id') as string) || null,
    cliente_id: (fd.get('cliente_id') as string) || null,
  })
  if ('erro' in r) return r

  const admin = createAdminClient()
  const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `${r.chave}-${Date.now()}.${ext}`   // nome novo = sem cache velho
  const { error: eUp } = await admin.storage.from(BUCKET).upload(caminho, Buffer.from(await arquivo.arrayBuffer()), {
    contentType: tipo, upsert: false,
  })
  if (eUp) return { erro: /bucket/i.test(eUp.message) ? MSG_MIGRATION : `Falha no envio: ${eUp.message}` }
  const url = admin.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl

  const erro = await gravarFoto(r.contatoIds, r.clienteId, url)
  if (erro) return { erro }
  revalidar(r.clienteId)
  return { foto_url: url }
}

export async function removerFotoPerfilAction(alvo: AlvoFoto): Promise<{ sucesso: true } | { erro: string }> {
  const r = await resolverAlvo(alvo)
  if ('erro' in r) return r
  const erro = await gravarFoto(r.contatoIds, r.clienteId, null)
  if (erro) return { erro }
  revalidar(r.clienteId)
  return { sucesso: true }
}
