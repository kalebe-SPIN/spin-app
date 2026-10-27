import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { BUCKET_LEVANTAMENTOS, STATUS_EDITAVEIS, faltaMigration } from '@/lib/levantamentos/comum'
import { completarRespostas, respostasIniciais } from '@/lib/levantamentos/servidor'
import type { ModeloChecklist, Pendencia, Respostas } from '@/lib/levantamentos/types'
import type { ArquivoTela, LevantamentoTela } from '@/lib/levantamentos/tela'
import type { EventoTela } from '@/components/levantamentos/ui'
import { FormularioLevantamento } from '@/components/levantamentos/FormularioLevantamento'
import { DetalheLevantamento } from '@/components/levantamentos/DetalheLevantamento'

export const dynamic = 'force-dynamic'

const PAPEL: Record<string, string> = { admin: 'admin', automacao: 'projetista Claude', profissional_campo: 'campo' }

/**
 * /levantamentos/[id] — formulário (autor em rascunho ou com pendência) ou
 * detalhe com pranchas, histórico e ações da equipe de projeto.
 * Leitura pelo cliente do usuário (RLS); service role só pra nomes e pro
 * pré-preenchimento depois de o RLS liberar o levantamento.
 */
export default async function LevantamentoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/levantamentos/${params.id}`)
  const { modo, ehAdminReal } = await getModoVisualizacao()
  const ehEquipe = ehAdminReal && modo === 'admin'

  const { data: lev, error } = await supabase.from('levantamentos').select('*').eq('id', params.id).maybeSingle()
  if (faltaMigration(error)) return <Aviso texto="O módulo de levantamentos ainda não foi ativado no banco (migrations 162 e 163)." />
  if (!lev) return <Aviso texto="Levantamento não encontrado ou você não tem acesso a ele." />

  const [{ data: modeloRow }, { data: arquivosRows }, { data: eventosRows }] = await Promise.all([
    supabase.from('checklist_modelos').select('definicao').eq('id', lev.modelo_id).maybeSingle(),
    supabase.from('levantamento_arquivos').select('id, tipo, slot, storage_path, mime, nome_original, versao_prancha, created_at')
      .eq('levantamento_id', lev.id).is('deleted_at', null).order('created_at', { ascending: true }),
    supabase.from('levantamento_eventos').select('id, tipo, de_status, para_status, mensagem, autor_id, autor_papel, created_at')
      .eq('levantamento_id', lev.id).order('created_at', { ascending: false }).limit(100),
  ])
  if (!modeloRow) return <Aviso texto="O modelo deste checklist não foi encontrado." />
  const modelo = modeloRow.definicao as ModeloChecklist

  const caminhos = (arquivosRows || []).map((a: any) => a.storage_path)
  const links: Record<string, string> = {}
  if (caminhos.length) {
    const { data } = await supabase.storage.from(BUCKET_LEVANTAMENTOS).createSignedUrls(caminhos, 3600)
    for (const x of data || []) if (x.path && x.signedUrl) links[x.path] = x.signedUrl
  }
  const arquivos: ArquivoTela[] = (arquivosRows || []).map((a: any) => ({
    id: a.id, tipo: a.tipo, slot: a.slot, mime: a.mime, nome: a.nome_original,
    url: links[a.storage_path] || '', versao_prancha: a.versao_prancha, created_at: a.created_at,
  }))

  const admin = createAdminClient()
  const pessoasIds = [...new Set([lev.consultor_id, ...(eventosRows || []).map((e: any) => e.autor_id)].filter(Boolean))]
  const [{ data: pessoas }, { data: projeto }] = await Promise.all([
    admin.from('profiles').select('id, nome_completo').in('id', pessoasIds),
    lev.projeto_id ? admin.from('projetos').select('codigo').eq('id', lev.projeto_id).maybeSingle() : Promise.resolve({ data: null as any }),
  ])
  const nome = new Map((pessoas || []).map((p: any) => [p.id, p.nome_completo || '']))
  const eventos: EventoTela[] = (eventosRows || []).map((e: any) => ({
    id: e.id, tipo: e.tipo, de_status: e.de_status, para_status: e.para_status, mensagem: e.mensagem, created_at: e.created_at,
    autor: nome.get(e.autor_id) || PAPEL[e.autor_papel] || 'sistema',
  }))

  const ehAutor = lev.consultor_id === user.id
  const editavel = STATUS_EDITAVEIS.includes(lev.status) && (ehAutor || ehAdminReal)

  // Kalebe 2026-10-27: ao abrir, o que já foi preenchido em etapas anteriores
  // (projeto, fatura, padrão, kit, telhado, outros levantamentos) entra nos
  // campos que ainda estão vazios — nada do que foi digitado é trocado.
  let respostas = (lev.respostas || {}) as Respostas
  let preenchidosAuto: string[] = []
  if (editavel) {
    const sugestoes = await respostasIniciais(admin, {
      modelo, nomeConsultor: nome.get(lev.consultor_id) || '', projetoId: lev.projeto_id, levantamentoId: lev.id,
    })
    ;({ respostas, preenchidos: preenchidosAuto } = completarRespostas(respostas, sugestoes))
  }

  const dados: LevantamentoTela = {
    id: lev.id,
    numero: lev.numero,
    finalidade: lev.finalidade,
    status: lev.status,
    projeto_id: lev.projeto_id,
    projeto_codigo: projeto?.codigo || null,
    consultor_nome: nome.get(lev.consultor_id) || '',
    ehAutor,
    respostas,
    preenchidosAuto,
    pendencias: (Array.isArray(lev.pendencias) ? lev.pendencias : []) as Pendencia[],
    observacao_projetista: lev.observacao_projetista,
    enviado_em: lev.enviado_em,
    processado_em: lev.processado_em,
    aprovado_em: lev.aprovado_em,
    updated_at: lev.updated_at,
    modelo,
  }

  return (
    <main className="min-h-screen p-3 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/levantamentos" className="text-white/60 hover:text-white">← Levantamentos</Link>
          {lev.projeto_id && dados.projeto_codigo && (
            <Link href={`/projetos/${lev.projeto_id}`} className="text-white/60 hover:text-white">Projeto {dados.projeto_codigo}</Link>
          )}
        </div>
        {editavel
          ? <FormularioLevantamento key={lev.status} lev={dados} arquivosIniciais={arquivos} eventos={eventos} />
          : <DetalheLevantamento lev={dados} arquivos={arquivos} eventos={eventos} ehEquipe={ehEquipe} />}
      </div>
    </main>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-xl mx-auto space-y-3">
        <Link href="/levantamentos" className="text-sm text-white/60 hover:text-white">← Levantamentos</Link>
        <div className="p-4 rounded-xl bg-sol/10 border border-sol/30 text-sm text-white/85">{texto}</div>
      </div>
    </main>
  )
}
