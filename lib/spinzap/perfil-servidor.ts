import type { createAdminClient } from '@/lib/supabase/admin'
import type { Pendencia, SecaoDados } from './perfil'

/**
 * A Laís grava no perfil do lead (Kalebe 2026-10-10): mescla os campos na
 * sessão (não apaga o que a equipe já preencheu com valor vazio) e cria
 * pendências. Sem a migration 148, não faz nada.
 */
type Admin = ReturnType<typeof createAdminClient>

export async function mesclarPerfil(admin: Admin, contatoId: string, secao: SecaoDados, patch: Record<string, any>): Promise<void> {
  try {
    const { data } = await admin.from('spinzap_perfis').select(secao).eq('contato_id', contatoId).maybeSingle()
    const atual = ((data as any)?.[secao] || {}) as Record<string, any>
    const limpo = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== undefined && v !== ''))
    const novo = secao === 'contato' && limpo.endereco
      ? { ...atual, ...limpo, endereco: { ...(atual.endereco || {}), ...Object.fromEntries(Object.entries(limpo.endereco).filter(([, v]) => v)) } }
      : { ...atual, ...limpo }
    await admin.from('spinzap_perfis').upsert({ contato_id: contatoId, [secao]: novo, atualizado_em: new Date().toISOString() }, { onConflict: 'contato_id' })
  } catch (e) {
    console.error('[spinzap/perfil-servidor] mesclar', e)
  }
}

export async function criarPendencia(admin: Admin, contatoId: string, texto: string, origem = 'Laís'): Promise<void> {
  try {
    const { data } = await admin.from('spinzap_perfis').select('pendencias').eq('contato_id', contatoId).maybeSingle()
    const lista = (((data as any)?.pendencias || []) as Pendencia[])
    if (lista.some((p) => !p.resolvida_em && p.texto === texto)) return
    lista.push({ id: crypto.randomUUID(), texto, criada_em: new Date().toISOString(), origem })
    await admin.from('spinzap_perfis').upsert({ contato_id: contatoId, pendencias: lista, atualizado_em: new Date().toISOString() }, { onConflict: 'contato_id' })
  } catch (e) {
    console.error('[spinzap/perfil-servidor] pendência', e)
  }
}

export async function anexarArquivoPerfil(admin: Admin, a: {
  contato_id: string; categoria: string; url: string; nome?: string | null; mime?: string | null
  origem: 'cliente' | 'gerado' | 'equipe'; wa_mensagem_id?: string | null; projeto_id?: string | null
}): Promise<void> {
  try {
    const { data: ja } = await admin.from('spinzap_arquivos').select('id').eq('contato_id', a.contato_id).eq('url', a.url).limit(1)
    if (ja?.length) return
    await admin.from('spinzap_arquivos').insert({ ...a, nome: a.nome || null, mime: a.mime || null, wa_mensagem_id: a.wa_mensagem_id || null, projeto_id: a.projeto_id || null })
  } catch (e) {
    console.error('[spinzap/perfil-servidor] arquivo', e)
  }
}
