import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { GeradorDiagramaClient } from '@/components/GeradorDiagramaClient'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DiagramaPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Usa MESMA fonte que o header (getModoVisualizacao já lê profiles + pode_gerar)
  const { modo: modoAtivo, ehAdminReal, perfil } = await getModoVisualizacao()

  // Fallback: se getModoVisualizacao não achou, tenta ler direto de profiles
  let perfilDireto: any = perfil
  if (!perfilDireto) {
    const res = await supabase
      .from('profiles')
      .select('role, pode_gerar_diagramas, nome_completo')
      .eq('id', user.id)
      .maybeSingle()
    perfilDireto = res.data
  }

  const temPermissaoReal =
    ehAdminReal ||
    perfilDireto?.role === 'admin' ||
    perfilDireto?.pode_gerar_diagramas === true

  // Bloqueio SÓ se realmente não tem permissão no banco
  if (!temPermissaoReal) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral mb-2">🔒 Acesso restrito</h1>
          <p className="text-white/70 text-sm">
            O gerador de diagramas técnicos é restrito ao administrador ou usuários autorizados.
            Solicite acesso ao Kalebe.
          </p>
          <p className="text-[10px] text-white/40 mt-2 font-mono">
            role: {perfilDireto?.role || 'null'} · pode_gerar: {perfilDireto?.pode_gerar_diagramas ? 'true' : 'false'} · ehAdminReal: {String(ehAdminReal)} · user_id: {user.id.slice(0, 8)}...
          </p>
          <Link
            href={`/projetos/${params.id}`}
            className="mt-4 inline-block px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm"
          >
            ← Voltar ao projeto
          </Link>
        </div>
      </main>
    )
  }

  // Admin em modo consultor — mostra aviso mas deixa passar (é ele mesmo)
  const emModoConsultor = modoAtivo === 'consultor'

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Gate: só clientes que fecharam negócio (aceito, vendido, em_homologacao, em_execucao, instalado)
  const statusPosVenda = ['aceito', 'vendido', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda']
  const clienteFechou = statusPosVenda.includes(projeto.status)

  // Admin pode gerar prévia mesmo antes de fechar (via modoPrevia no GeradorDiagramaClient)
  if (!clienteFechou && !temPermissaoReal) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto">
          <Link href={`/projetos/${params.id}`} className="text-xs text-white/40 hover:text-white/60 mb-4 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="bg-sol/10 border border-sol/30 rounded-xl p-6">
            <h1 className="text-xl font-bold text-sol mb-2">⏳ Cliente ainda não fechou</h1>
            <p className="text-white/70 text-sm mb-2">
              O gerador de diagramas fica disponível <strong className="text-white">após o cliente
              aceitar a proposta</strong>. Status atual: <span className="text-white font-mono">{projeto.status}</span>
            </p>
            <p className="text-white/50 text-xs">
              Admin pode gerar prévias antes disso — ative o modo Admin no header.
            </p>
          </div>
        </div>
      </main>
    )
  }

  // Diagramas já gerados desse projeto
  const { data: diagramas } = await supabase
    .from('projetos_diagramas')
    .select('*')
    .eq('projeto_id', params.id)
    .order('created_at', { ascending: false })

  // Config empresa (pra validar antes de gerar)
  const { data: configEmpresa } = await supabase
    .from('configuracoes_empresa')
    .select('rt_nome, rt_crea, razao_social, logo_url')
    .eq('singleton', true)
    .single()

  const configOk = !!(configEmpresa?.rt_nome && configEmpresa?.rt_crea)

  // Itens do projeto — define quais diagramas fazem sentido gerar
  const { data: itens } = await supabase
    .from('projeto_itens')
    .select('tipo')
    .eq('projeto_id', params.id)
    .neq('status', 'removido')

  const tiposItem = new Set((itens || []).map((i: any) => i.tipo as string))
  // Fallback: se nao tem itens (workflow antigo), usa tipo_projeto do projeto
  if (tiposItem.size === 0 && projeto.tipo_projeto) {
    if (projeto.tipo_projeto === 'hibrido_bess' || projeto.tipo_projeto === 'expansao_hibrido') {
      tiposItem.add('fv_hibrido')
    } else {
      tiposItem.add('fv_ongrid')
    }
  }

  const temFvOngrid = tiposItem.has('fv_ongrid') || tiposItem.has('fv_zero_grid') || tiposItem.has('fv_offgrid')
  const temFvHibrido = tiposItem.has('fv_hibrido') || tiposItem.has('bess')

  // Monta lista de tipos disponiveis — sempre inclui padrao_entrada
  const tiposDisponiveis: Array<{
    id: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada'
    label: string
    desc: string
  }> = []

  if (temFvOngrid) {
    tiposDisponiveis.push({
      id: 'unifilar_ongrid',
      label: 'Unifilar on-grid',
      desc: 'Sistema conectado à rede sem armazenamento. Padrão CELESC para GD.',
    })
  }
  if (temFvHibrido) {
    tiposDisponiveis.push({
      id: 'unifilar_hibrido',
      label: 'Unifilar híbrido (BESS)',
      desc: 'Sistema com bateria + saída EPS. Inclui MMW03, EMBOX e cadeia de backup.',
    })
  }
  // Padrao de entrada — SEMPRE disponivel
  tiposDisponiveis.push({
    id: 'padrao_entrada',
    label: 'Padrão de entrada CELESC',
    desc: 'Prancha do padrão de entrada (Grupo A MT ou Grupo B BT) pra homologação.',
  })

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-verde/10 text-verde">
              Cliente fechou ✓
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Gerar diagrama técnico
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Para envio à CELESC
          </p>
        </header>

        {!configOk && (
          <div className="bg-coral/10 border border-coral/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-coral mb-2">
              ⚠️ <strong>Configuração incompleta.</strong> Falta cadastrar dados do responsável técnico.
            </p>
            <Link
              href="/admin/empresa"
              className="text-xs text-sol hover:underline"
            >
              → Ir para /admin/empresa
            </Link>
          </div>
        )}

        <GeradorDiagramaClient
          projeto={projeto}
          diagramasExistentes={diagramas || []}
          configOk={configOk}
          tiposDisponiveis={tiposDisponiveis}
        />
      </div>
    </main>
  )
}
