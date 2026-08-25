import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { TimelineProjeto } from '@/components/TimelineProjeto'
import { formatarCpfCnpj, fmtNum } from '@/lib/formatters'

/**
 * Listagem de projetos — /projetos
 *
 * AGRUPA por cliente: se um mesmo cliente tem N projetos, aparece 1 card
 * com sub-lista dos projetos. Regra fixa da Spin: cliente é único, projetos
 * ficam sob o cadastro dele.
 *
 * Admin vê tudo. Vendedor de serviços/campo NÃO têm projetos — redirect.
 */
export default async function ProjetosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { modo } = await getModoVisualizacao()
  if (modo === 'vendedor_servicos') redirect('/crm/servicos')
  if (modo === 'profissional_campo') redirect('/agenda')

  const { data: projetos } = await supabase
    .from('projetos')
    .select(`
      id, codigo, status, tipo_projeto,
      cliente_id, cliente_razao_social, cliente_cpf_cnpj,
      uc_geradora, data_inicio,
      kit_selecionado,
      created_at, updated_at, status_atualizado_em
    `)
    .order('created_at', { ascending: false })

  // Agrupa por cliente_id (preferido) ou razão social (fallback pros
  // que ainda estão sem cliente_id no banco).
  const grupos = new Map<string, { cliente_id: string | null; nome: string; projetos: any[] }>()
  for (const p of projetos || []) {
    const chave = p.cliente_id || `sn:${(p.cliente_razao_social || 'sem_nome').toLowerCase().trim()}`
    const g = grupos.get(chave)
    if (g) {
      g.projetos.push(p)
    } else {
      grupos.set(chave, {
        cliente_id: p.cliente_id,
        nome: p.cliente_razao_social || 'Sem nome',
        projetos: [p],
      })
    }
  }

  const gruposArray = Array.from(grupos.values()).sort((a, b) => {
    const dataA = a.projetos[0]?.created_at || ''
    const dataB = b.projetos[0]?.created_at || ''
    return dataB.localeCompare(dataA)
  })

  const totalProjetos = projetos?.length || 0
  const totalClientes = gruposArray.length

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
              ← Dashboard
            </Link>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              Projetos
            </h1>
            <p className="text-white/60 mt-1 text-sm">
              {totalProjetos} projeto{totalProjetos !== 1 ? 's' : ''} · {totalClientes} cliente{totalClientes !== 1 ? 's' : ''}
            </p>
          </div>

          <Link
            href="/projetos/novo"
            className="px-6 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors"
          >
            + Novo projeto
          </Link>
        </header>

        {gruposArray.length > 0 ? (
          <div className="space-y-4">
            {gruposArray.map((g, i) => (
              <ClienteBloco key={g.cliente_id || `sn-${i}`} grupo={g} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  )
}

function ClienteBloco({ grupo }: {
  grupo: { cliente_id: string | null; nome: string; projetos: any[] }
}) {
  const qtd = grupo.projetos.length
  const dataMaisRecente = grupo.projetos[0]?.created_at
    ? new Date(grupo.projetos[0].created_at).toLocaleDateString('pt-BR')
    : '—'

  // Dados compartilhados vêm do projeto MAIS COMPLETO (o mais recente
  // ativo geralmente tem endereço/UC/consumo preenchidos). Cliente com
  // várias tentativas de proposta compartilha esses dados estruturais —
  // não faz sentido repetir em cada iteração.
  const proj0 = grupo.projetos[0]
  const cpf = proj0?.cliente_cpf_cnpj
  const uc = grupo.projetos.find(p => p.uc_geradora)?.uc_geradora
  const tipoProjeto = proj0?.tipo_projeto

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Cabeçalho do cliente + dados estruturais compartilhados */}
      <div className="p-5 pb-4 border-b border-white/5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-lg">👤</span>
              <h3 className="text-lg font-black text-white truncate">{grupo.nome}</h3>
              <span className="text-[10px] uppercase tracking-wider font-bold bg-sol/15 text-sol px-2 py-0.5 rounded-full">
                {qtd} {qtd === 1 ? 'proposta' : 'propostas'}
              </span>
            </div>
            {cpf && (
              <p className="text-[11px] text-white/40">CPF/CNPJ {formatarCpfCnpj(String(cpf))}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            {grupo.cliente_id && (
              <Link
                href={`/crm/clientes/${grupo.cliente_id}`}
                className="text-[10px] text-sol hover:underline"
              >
                Ver cadastro →
              </Link>
            )}
            <p className="text-[10px] text-white/30 mt-1">último: {dataMaisRecente}</p>
          </div>
        </div>

        {/* Dados compartilhados — só aparecem se ao menos um preenchido */}
        {(uc || tipoProjeto) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] pt-2 border-t border-white/5">
            {tipoProjeto && (
              <span className="text-white/60">
                <span className="text-white/40">Sistema:</span>{' '}
                {TIPO_PROJETO_LABEL[tipoProjeto as keyof typeof TIPO_PROJETO_LABEL] || tipoProjeto}
              </span>
            )}
            {uc && (
              <span className="text-white/60">
                <span className="text-white/40">UC:</span> {uc}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Iterações — cada projeto vira uma linha com dimensionamento + kit + proposta */}
      <div>
        <div className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-white/40">
          Iterações de proposta
        </div>
        <div className="divide-y divide-white/5">
          {grupo.projetos.map((p) => (
            <ProjetoLinha key={p.id} projeto={p} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjetoLinha({ projeto }: { projeto: any }) {
  const dataFmt = new Date(projeto.created_at).toLocaleDateString('pt-BR')
  const kit = projeto.kit_selecionado || {}
  const potCc = kit.potencia_cc_kwp
  const modeloPlaca = kit.placa?.modelo
  const modeloInv = kit.inversor?.modelo
  const qtdPlacas = kit.qtd_placas
  // Valor da proposta pode estar no kit ou vir do orçamento futuro
  const valor = kit.preco_total_kit_weg ? Number(kit.preco_total_kit_weg) : null

  return (
    <Link
      href={`/projetos/${projeto.id}`}
      className="block px-5 py-3 hover:bg-white/[0.03] transition-colors"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
          {potCc && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-xs font-bold text-sol tabular-nums">
                {fmtNum(Number(potCc), 2).replace('.', ',')} kWp
              </span>
            </>
          )}
          {(qtdPlacas || modeloPlaca) && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-xs text-white/70">
                {qtdPlacas ? `${qtdPlacas}× ` : ''}
                {modeloPlaca || 'placas'}
                {modeloInv ? ` + ${modeloInv}` : ''}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {valor && valor > 0 && (
            <span className="text-xs font-bold text-verde tabular-nums">
              R$ {valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </span>
          )}
          <span className="text-[10px] text-white/30">{dataFmt}</span>
        </div>
      </div>
      <TimelineProjeto status={projeto.status} />
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-8 bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
      <h3 className="text-xl font-bold text-white mb-2">Nenhum projeto ainda</h3>
      <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">
        Crie seu primeiro projeto e siga o workflow completo: fatura → telhado → dimensionamento → kit → orçamento.
      </p>
      <Link
        href="/projetos/novo"
        className="inline-block px-6 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors"
      >
        + Criar primeiro projeto
      </Link>
    </div>
  )
}

const TIPO_PROJETO_LABEL = {
  ongrid:           'On-grid',
  hibrido_bess:     'Híbrido c/ BESS',
  expansao_ongrid:  'Expansão on-grid',
  expansao_hibrido: 'Expansão híbrido',
}
