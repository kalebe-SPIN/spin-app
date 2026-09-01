'use server'

/**
 * Server actions pros registros do telhado (Batch 2).
 * Kalebe 2026-09-01: 'no próximo passo esses prints ficam salvos no
 * perfil do cliente automaticamente'.
 *
 * Fluxo:
 *  1. NovoProjetoForm captura prints/polígono/Solar em memória
 *  2. Ao criar o projeto → chama salvarRegistroTelhadoAction pra cada um
 *  3. Prints (blob) vão pro bucket telhado-registros; metadata vai pro
 *     clientes.telhado_registros jsonb
 *  4. Ficha do cliente exibe galeria + botão WhatsApp
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient as createServiceClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type TipoRegistro = 'aerea' | 'rua' | 'poligono' | 'solar'

export type RegistroTelhado = {
  tipo: TipoRegistro
  url?: string
  lat: number
  lng: number
  area_m2?: number
  poligono?: Array<{ lat: number; lng: number }>
  solar?: any                // SolarInsights serializado
  criado_em: string
}

/** Salva um print (blob) no bucket + registro no clientes.telhado_registros. */
export async function salvarPrintTelhadoAction(
  fd: FormData,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, erro: 'Não autenticado' }

    const clienteId = fd.get('cliente_id') as string
    const tipo = fd.get('tipo') as TipoRegistro
    const lat = Number(fd.get('lat'))
    const lng = Number(fd.get('lng'))
    const arquivo = fd.get('arquivo') as File
    if (!clienteId || !tipo || !arquivo) return { ok: false, erro: 'faltam campos' }

    const svc = createServiceClient()
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const nome = `${clienteId}/${tipo}-${ts}.png`

    const buf = Buffer.from(await arquivo.arrayBuffer())
    const up = await svc.storage.from('telhado-registros').upload(nome, buf, {
      contentType: arquivo.type || 'image/png',
      upsert: false,
    })
    if (up.error) return { ok: false, erro: up.error.message }

    const { data: pub } = svc.storage.from('telhado-registros').getPublicUrl(nome)
    const url = pub.publicUrl

    const registro: RegistroTelhado = {
      tipo, url, lat, lng,
      criado_em: new Date().toISOString(),
    }

    // Push atômico via update (lê array atual, appenda, salva)
    const { data: cli } = await svc.from('clientes')
      .select('telhado_registros').eq('id', clienteId).single()
    const atuais: RegistroTelhado[] = (cli?.telhado_registros as any[]) || []
    await svc.from('clientes')
      .update({ telhado_registros: [...atuais, registro] })
      .eq('id', clienteId)

    revalidatePath(`/crm/clientes/${clienteId}`)
    return { ok: true, url }
  } catch (e: any) {
    return { ok: false, erro: e?.message || 'falha ao salvar' }
  }
}

/** Salva um registro sem arquivo (polígono medido ou dados Solar). */
export async function salvarMetadadosTelhadoAction(
  clienteId: string,
  registro: Omit<RegistroTelhado, 'criado_em'>,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, erro: 'Não autenticado' }
    if (!clienteId) return { ok: false, erro: 'cliente_id obrigatório' }

    const svc = createServiceClient()
    const { data: cli } = await svc.from('clientes')
      .select('telhado_registros').eq('id', clienteId).single()
    const atuais: RegistroTelhado[] = (cli?.telhado_registros as any[]) || []
    const novo: RegistroTelhado = { ...registro, criado_em: new Date().toISOString() }
    await svc.from('clientes')
      .update({ telhado_registros: [...atuais, novo] })
      .eq('id', clienteId)

    revalidatePath(`/crm/clientes/${clienteId}`)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: e?.message || 'falha' }
  }
}

/** Remove um registro específico (por criado_em como id). */
export async function excluirRegistroTelhadoAction(
  clienteId: string,
  criadoEm: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, erro: 'Não autenticado' }

    const svc = createServiceClient()
    const { data: cli } = await svc.from('clientes')
      .select('telhado_registros').eq('id', clienteId).single()
    const atuais: RegistroTelhado[] = (cli?.telhado_registros as any[]) || []
    const alvo = atuais.find((r) => r.criado_em === criadoEm)
    const novos = atuais.filter((r) => r.criado_em !== criadoEm)

    // Se tinha arquivo no bucket, remove também
    if (alvo?.url) {
      try {
        const path = alvo.url.split('/telhado-registros/')[1]
        if (path) await svc.storage.from('telhado-registros').remove([path])
      } catch { /* silencioso */ }
    }

    await svc.from('clientes')
      .update({ telhado_registros: novos })
      .eq('id', clienteId)

    revalidatePath(`/crm/clientes/${clienteId}`)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: e?.message || 'falha' }
  }
}
