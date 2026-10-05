import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checklistPadrao } from '@/lib/campo/checklists'
import type { ItemChecklist } from '@/lib/campo/comum'
import { OrdemServicoClient, type OsTela } from '@/components/campo/OrdemServicoClient'

export const dynamic = 'force-dynamic'

/**
 * /campo/os/[id] — ordem de serviço no celular: iniciar, checklist, fotos
 * antes/depois, custos extras e assinatura do cliente no fim.
 * Service role depois de conferir: responsável pela OS ou admin.
 */
export default async function OrdemServicoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/campo/os/${params.id}`)
  const { data: perfil } = await supabase.from('profiles').select('role, ativo').eq('id', user.id).maybeSingle()
  const papel = String(perfil?.role || '')
  if (!perfil?.ativo || !['profissional_campo', 'instalador', 'admin'].includes(papel)) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: os, error } = await admin.from('execucoes_servicos')
    .select('*, projeto:projeto_id(codigo, cliente_razao_social, cliente_telefone)')
    .eq('id', params.id).maybeSingle()
  if (error && /column|does not exist/.test(error.message)) {
    return <Aviso texto="Falta rodar a migration 137 (painel do campo) no Supabase." />
  }
  if (!os) return <Aviso texto="Ordem de serviço não encontrada." />
  if (papel !== 'admin' && os.responsavel_tecnico !== user.id) {
    return <Aviso texto="Essa ordem de serviço está na agenda de outro profissional." />
  }

  // Links temporários das fotos e da assinatura (bucket privado). Fotos
  // antigas do bucket público vêm como URL completa.
  const antes: string[] = os.fotos_antes_urls || []
  const depois: string[] = os.fotos_depois_urls || []
  const privados = [...antes, ...depois, os.assinatura_path].filter((p): p is string => !!p && !/^https?:/.test(p))
  const urls: Record<string, string> = {}
  if (privados.length) {
    const { data } = await admin.storage.from('ordens-servico').createSignedUrls(privados, 3600)
    for (const x of data || []) if (x.path && x.signedUrl) urls[x.path] = x.signedUrl
  }
  const foto = (p: string) => ({ caminho: p, url: /^https?:/.test(p) ? p : urls[p] || '' })

  const { data: custos } = await admin.from('fluxo_lancamentos')
    .select('id, descricao, valor_previsto, detalhes').contains('detalhes', { execucao_id: os.id }).is('cancelado_em', null)

  const checklist: ItemChecklist[] = Array.isArray(os.checklist) && os.checklist.length ? os.checklist : checklistPadrao(os.tipo_servico)
  const dados: OsTela = {
    id: os.id,
    os_numero: os.os_numero,
    status: os.status,
    tipo_servico: os.tipo_servico,
    titulo: os.titulo,
    descricao: os.descricao,
    projeto_codigo: (os as any).projeto?.codigo || null,
    cliente_nome: os.cliente_nome || (os as any).projeto?.cliente_razao_social || null,
    contato_nome: os.contato_nome,
    contato_telefone: os.contato_telefone || (os as any).projeto?.cliente_telefone || null,
    endereco: os.endereco || (os.endereco_execucao ? { logradouro: os.endereco_execucao } : null),
    data_agendada: os.data_agendada,
    hora_agendada: os.hora_agendada ? String(os.hora_agendada).slice(0, 5) : null,
    checklist,
    observacoes: os.observacoes || '',
    problemas: os.problemas_encontrados || '',
    fotos_antes: antes.map(foto),
    fotos_depois: depois.map(foto),
    custos: ((custos || []) as any[]).map((l) => ({ id: l.id, descricao: l.descricao, valor: Number(l.valor_previsto), pago_por: l.detalhes?.pago_por || '' })),
    assinatura_url: os.assinatura_path ? urls[os.assinatura_path] || null : null,
    assinatura_nome: os.assinatura_nome,
    assinatura_documento: os.assinatura_documento,
    assinado_em: os.assinado_em,
  }

  return (
    <main className="min-h-screen p-3 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <Link href="/campo" className="text-sm text-white/60 hover:text-white">← Campo</Link>
        <OrdemServicoClient key={os.status} os={dados} />
      </div>
    </main>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-xl mx-auto space-y-3">
        <Link href="/campo" className="text-sm text-white/60 hover:text-white">← Campo</Link>
        <div className="p-4 rounded-xl bg-sol/10 border border-sol/30 text-sm text-sol">{texto}</div>
      </div>
    </main>
  )
}
