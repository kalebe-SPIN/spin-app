import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Etiqueta da empresa na lista e no cabeçalho do Spinzap (Kalebe 2026-10-19):
 * "quando for definido, o cliente tem uma etiqueta da empresa que está sendo
 * atendido". Vem dos projetos do contato que já têm empresa (proposta gerada
 * por um CNPJ). Duas consultas pra lista inteira; sem a migration 158, vazio.
 */

type Admin = ReturnType<typeof createAdminClient>

export type EtiquetaEmpresa = { id: string; nome: string; cor: string | null }

export async function empresasDasConversas(
  admin: Admin,
  conversas: Array<{ id: string; contato?: { id?: string | null; cliente_id?: string | null; projeto_id?: string | null } | null }>,
): Promise<Map<string, EtiquetaEmpresa[]>> {
  const mapa = new Map<string, EtiquetaEmpresa[]>()
  if (!conversas.length) return mapa
  const [{ data: projetos, error }, { data: empresas }] = await Promise.all([
    admin.from('projetos').select('id, empresa_id, wa_contato_id, cliente_id').not('empresa_id', 'is', null).limit(5000),
    admin.from('empresas').select('id, nome, cor'),
  ])
  if (error || !projetos?.length) return mapa
  const empresa = new Map(((empresas || []) as any[]).map((e) => [e.id as string, { id: e.id as string, nome: String(e.nome || ''), cor: (e.cor as string) || null }]))
  const porProjeto = new Map<string, string>()
  const porContato = new Map<string, Set<string>>()
  const porCliente = new Map<string, Set<string>>()
  const juntar = (m: Map<string, Set<string>>, k: string | null, v: string) => {
    if (!k) return
    const s = m.get(k)
    if (s) s.add(v); else m.set(k, new Set([v]))
  }
  for (const p of projetos as any[]) {
    porProjeto.set(p.id, p.empresa_id)
    juntar(porContato, p.wa_contato_id || null, p.empresa_id)
    juntar(porCliente, p.cliente_id || null, p.empresa_id)
  }
  for (const c of conversas) {
    const ids = new Set<string>()
    const ct = c.contato || {}
    if (ct.projeto_id && porProjeto.has(ct.projeto_id)) ids.add(porProjeto.get(ct.projeto_id)!)
    for (const id of Array.from(porContato.get(ct.id || '') || [])) ids.add(id)
    for (const id of Array.from(porCliente.get(ct.cliente_id || '') || [])) ids.add(id)
    const lista = Array.from(ids).map((id) => empresa.get(id)).filter(Boolean) as EtiquetaEmpresa[]
    if (lista.length) mapa.set(c.id, lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
  }
  return mapa
}
