import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { AgendaDoProjeto } from '@/components/AgendaDoProjeto'
import { TimelineProjeto } from '@/components/TimelineProjeto'
import { MudarEtapaCard } from '@/components/MudarEtapaCard'
import { ItensPropostaCard } from '@/components/ItensPropostaCard'
import { AcoesRapidasCard } from '@/components/AcoesRapidasCard'
import { getPassosRelevantes, INFO_PASSO, apenasServicos, type TipoItem } from '@/lib/tipos-projeto'

// Sempre buscar dados frescos do banco (sem cache stale após edição)
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Visualização de um projeto específico — /projetos/[id]
 *
 * Mostra o status atual + qual o próximo passo do workflow.
 */
export default async function ProjetoDetalhePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Passos do workflow adaptativos: união dos passos de todos os tipos escolhidos
  const { data: itensProjeto } = await supabase
    .from('projeto_itens')
    .select('id, tipo, titulo, valor_estimado, status')
    .eq('projeto_id', projeto.id)
    .neq('status', 'removido')
  const tiposEscolhidos = (itensProjeto || []).map((i: any) => i.tipo as TipoItem)
  const passosRelevantes = getPassosRelevantes(tiposEscolhidos)

  // Se todos os itens sao servicos puros (nao FV), suprime o CTA generico
  // "Proximo passo" que sugeriria passos FV irrelevantes.
  const soServicos = apenasServicos(tiposEscolhidos)
  const proximoPasso = soServicos ? null : getProximoPasso(projeto.status)

  // Total consolidado de todos os itens (proposta com multiplos modulos)
  const totalConsolidado = (itensProjeto || []).reduce(
    (soma: number, it: any) => soma + (parseFloat(it.valor_estimado) || 0),
    0,
  )
  const itensComValor = (itensProjeto || []).filter((it: any) => it.valor_estimado)
  const itensPendentes = (itensProjeto || []).filter((it: any) => !it.valor_estimado)

  // Permissão pra gerador de diagramas — admin OU flag explícita
  // MAS respeita o modo de visualização: se admin está em modo consultor, esconde
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, pode_gerar_diagramas')
    .eq('id', user.id)
    .single()

  const { modo: modoAtivo } = await getModoVisualizacao()

  const temPermissaoReal = perfil?.role === 'admin' || perfil?.pode_gerar_diagramas === true
  const podeGerarDiagramas = temPermissaoReal && modoAtivo === 'admin'
  const clienteFechou = projeto.status === 'aceito' || projeto.status === 'vendido'

  // Homologação (se já criada — automação dispara ao fechar venda)
  const { data: homologacao } = await supabase
    .from('homologacoes')
    .select('id, status_geral, etapa_atual')
    .eq('projeto_id', projeto.id)
    .maybeSingle()

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <Link href="/projetos" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Projetos
          </Link>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white">
                {projeto.cliente_razao_social}
              </h1>
              <p className="text-white/60 mt-1 text-sm">
                UC {projeto.uc_geradora} · {projeto.tipo_projeto}
              </p>
            </div>
          </div>
          <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
            <TimelineProjeto status={projeto.status} soServicos={soServicos} />
          </div>
        </header>

        {/* Ações rápidas contextuais ao status atual */}
        <AcoesRapidasCard
          projetoId={projeto.id}
          status={projeto.status}
          homologacaoId={homologacao?.id ?? null}
          clienteNome={projeto.cliente_razao_social}
        />

        {/* Card CRM — mudar etapa (adaptativo: se só serviço, pula passos FV) */}
        <div className="mb-6">
          <MudarEtapaCard projetoId={projeto.id} statusAtual={projeto.status} soServicos={soServicos} />
        </div>

        {/* Itens da proposta (múltiplos tipos) */}
        <ItensPropostaCard projetoId={projeto.id} />

        {/* Cliente fechou → Gerador de diagramas (só admin/autorizado) */}
        {clienteFechou && podeGerarDiagramas && (
          <div className="mb-6 p-6 bg-verde/10 border border-verde/40 rounded-xl">
            <div className="flex items-start gap-4">
              <div className="text-2xl">🖨️</div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white mb-1">
                  Cliente fechou · Gerar diagramas técnicos para CELESC
                </h2>
                <p className="text-sm text-white/70 mb-3">
                  Unifilar em PDF/DXF com selo da Spin e dados do responsável técnico.
                </p>
                <Link
                  href={`/projetos/${projeto.id}/diagrama`}
                  className="inline-block px-4 py-2 bg-verde text-noite font-bold text-sm rounded-lg hover:bg-verde/90 transition-colors"
                >
                  Abrir gerador →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Próximo passo CTA */}
        {proximoPasso && (
          <div className="mb-6 p-6 bg-sol/10 border border-sol/30 rounded-xl">
            <div className="flex items-start gap-4">
              <div className="text-2xl">⏭️</div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white mb-1">
                  Próximo passo: {proximoPasso.titulo}
                </h2>
                <p className="text-sm text-white/70 mb-3">{proximoPasso.descricao}</p>
                <Link
                  href={`/projetos/${projeto.id}/${proximoPasso.path}`}
                  className="inline-block px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg hover:bg-sol/90 transition-colors"
                >
                  {proximoPasso.cta} →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Workflow legado — SÓ mostra se não tem itens selecionados (fluxo tradicional on-grid) */}
        {tiposEscolhidos.length === 0 && (
          <section className="mb-8 p-6 bg-white/[0.03] border border-white/10 rounded-xl">
            <h2 className="text-xs font-bold uppercase tracking-wider text-sol mb-4">
              Workflow do projeto (on-grid padrão)
            </h2>
            <p className="text-xs text-white/40 mb-4">
              Escolha os itens da proposta acima pra ter fluxos específicos por tipo.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {PASSOS_WORKFLOW.map((p) => (
                <PassoCard
                  key={p.path}
                  numero={p.numero}
                  titulo={p.titulo}
                  href={`/projetos/${projeto.id}/${p.path}`}
                  statusProjeto={projeto.status}
                  statusRequerido={p.statusAposCompleto}
                />
              ))}
            </div>
          </section>
        )}

        {/* Dados do cliente */}
        <Section title="Cliente">
          <Info label="Razão social" value={projeto.cliente_razao_social} />
          <Info label="CPF/CNPJ" value={projeto.cliente_cpf_cnpj} />
          <Info label="WhatsApp" value={projeto.cliente_telefone} />
          {projeto.cliente_email && <Info label="Email" value={projeto.cliente_email} />}
          {projeto.cliente_endereco?.cidade && (
            <Info label="Cidade" value={`${projeto.cliente_endereco.cidade}/${projeto.cliente_endereco.uf || 'SC'}`} />
          )}
        </Section>

        {/* Titular do projeto (se diferente do cliente) */}
        {!projeto.titular_igual_cliente && projeto.titular_cliente_id && (
          <Section title="Titular do projeto (UC CELESC)">
            <TitularInfo titularId={projeto.titular_cliente_id} />
          </Section>
        )}

        {/* Endereço da instalação (se diferente) */}
        {!projeto.endereco_igual_titular && projeto.endereco_instalacao && (
          <Section title="Endereço da instalação">
            <Info label="Rua" value={`${projeto.endereco_instalacao.rua || '—'}, ${projeto.endereco_instalacao.numero || 's/n'}`} />
            {projeto.endereco_instalacao.complemento && <Info label="Complemento" value={projeto.endereco_instalacao.complemento} />}
            {projeto.endereco_instalacao.bairro && <Info label="Bairro" value={projeto.endereco_instalacao.bairro} />}
            <Info label="Cidade" value={`${projeto.endereco_instalacao.cidade || '—'}/${projeto.endereco_instalacao.uf || 'SC'}`} />
            {projeto.endereco_instalacao.cep && <Info label="CEP" value={projeto.endereco_instalacao.cep} />}
          </Section>
        )}

        {/* UCs */}
        <Section title="Unidades Consumidoras">
          <Info label="UC geradora" value={projeto.uc_geradora} />
          {projeto.ucs_beneficiarias && projeto.ucs_beneficiarias.length > 0 && (
            <Info label="Beneficiárias" value={projeto.ucs_beneficiarias.join(', ')} />
          )}
        </Section>

        {/* Tipo */}
        <Section title="Tipo de projeto">
          <Info label="Modalidade" value={TIPO_PROJETO_LABEL[projeto.tipo_projeto] || projeto.tipo_projeto} />
        </Section>

        {projeto.observacoes_consultor && (
          <Section title="Observações">
            <p className="text-sm text-white/70">{projeto.observacoes_consultor}</p>
          </Section>
        )}

        {/* Proposta consolidada — soma de todos os itens + acao pra gerar */}
        {itensProjeto && itensProjeto.length > 0 && (
          <section className="mb-6 p-6 bg-gradient-to-br from-verde/10 to-sol/5 border border-verde/30 rounded-xl">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-bold text-verde mb-1">
                  📦 Proposta consolidada
                </p>
                <p className="text-sm text-white/70">
                  {itensProjeto.length} {itensProjeto.length === 1 ? 'módulo' : 'módulos'} nesta proposta
                  {itensPendentes.length > 0 && (
                    <> · <span className="text-sol">{itensPendentes.length} pendente(s) de precificação</span></>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-white/50">Total</p>
                <p className="text-3xl font-black text-verde">
                  {totalConsolidado > 0
                    ? totalConsolidado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : <span className="text-white/40 text-lg">a definir</span>}
                </p>
              </div>
            </div>

            {/* Lista dos modulos com valor */}
            {itensComValor.length > 0 && (
              <div className="space-y-1.5 mb-4 pb-4 border-b border-white/10">
                {itensComValor.map((it: any) => (
                  <div key={it.id} className="flex items-baseline justify-between text-sm">
                    <span className="text-white/70 truncate">{it.titulo || it.tipo}</span>
                    <span className="text-white font-mono">
                      {parseFloat(it.valor_estimado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {itensPendentes.length > 0 && (
              <div className="mb-4 p-3 bg-sol/10 border border-sol/30 rounded-lg">
                <p className="text-xs text-sol font-bold mb-1">⚠️ Módulos pendentes de preço:</p>
                <ul className="text-xs text-white/70 space-y-0.5">
                  {itensPendentes.map((it: any) => (
                    <li key={it.id}>· {it.titulo || it.tipo}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/projetos/${projeto.id}/orcamento`}
                className={`inline-flex items-center gap-2 px-4 py-2 font-bold text-sm rounded-lg transition ${
                  itensPendentes.length === 0
                    ? 'bg-verde text-noite hover:bg-verde/90'
                    : 'bg-white/10 text-white/60 border border-white/20 cursor-not-allowed'
                }`}
                aria-disabled={itensPendentes.length > 0}
              >
                💰 Fechar orçamento + condições de pagamento
              </Link>
              <Link
                href={`/projetos/${projeto.id}/proposta`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition"
              >
                📄 Ver proposta consolidada
              </Link>
            </div>
          </section>
        )}

        {/* Agenda vinculada (Bianca) */}
        <AgendaDoProjeto projetoId={projeto.id} />

        {/* Footer ações */}
        <div className="mt-8 flex flex-col md:flex-row gap-3 pt-6 border-t border-white/10">
          <Link
            href={`/projetos/${projeto.id}/editar`}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-white hover:bg-white/10 transition-colors text-center"
          >
            ✏️ Editar dados básicos
          </Link>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 p-6 bg-white/[0.03] border border-white/10 rounded-xl">
      <h2 className="text-xs font-bold uppercase tracking-wider text-sol mb-4">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

async function TitularInfo({ titularId }: { titularId: string }) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = createClient()
  const { data: titular } = await supabase
    .from('clientes')
    .select('razao_social, cpf_cnpj, tipo')
    .eq('id', titularId)
    .single()

  if (!titular) return <p className="text-sm text-white/40">Titular não encontrado.</p>
  return (
    <>
      <Info label="Nome/Razão" value={titular.razao_social} />
      <Info label={titular.tipo === 'pj' ? 'CNPJ' : 'CPF'} value={titular.cpf_cnpj || '—'} />
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <span className="text-white/40">{label}</span>
      <span className="col-span-2 text-white font-medium">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_INFO[status as keyof typeof STATUS_INFO] || STATUS_INFO.rascunho
  return (
    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${info.classe}`}>
      {info.label}
    </span>
  )
}

const STATUS_INFO = {
  rascunho:            { label: 'Rascunho',           classe: 'bg-white/10 text-white/60' },
  fatura_analisada:    { label: 'Fatura OK',          classe: 'bg-weg-azul/10 text-weg-azul' },
  telhado_preenchido:  { label: 'Telhado OK',         classe: 'bg-weg-azul/10 text-weg-azul' },
  dimensionado:        { label: 'Dimensionado',       classe: 'bg-weg-azul/10 text-weg-azul' },
  kit_selecionado:     { label: 'Kit escolhido',      classe: 'bg-weg-azul/10 text-weg-azul' },
  lista_ca_confirmada: { label: 'Lista CA OK',        classe: 'bg-weg-azul/10 text-weg-azul' },
  orcamento_gerado:    { label: 'Orçamento pronto',   classe: 'bg-sol/10 text-sol' },
  proposta_enviada:    { label: 'Proposta enviada',   classe: 'bg-sol/10 text-sol' },
  aceito:              { label: 'Aceito ✓',           classe: 'bg-verde/10 text-verde' },
  recusado:            { label: 'Recusado',           classe: 'bg-coral/10 text-coral' },
  cancelado:           { label: 'Cancelado',          classe: 'bg-white/10 text-white/40' },
  expirado:            { label: 'Expirado',           classe: 'bg-coral/10 text-coral' },
}

const TIPO_PROJETO_LABEL: Record<string, string> = {
  ongrid:           'On-grid puro',
  hibrido_bess:     'Híbrido com BESS',
  expansao_ongrid:  'Expansão on-grid',
  expansao_hibrido: 'Expansão híbrida',
}

const PASSOS_WORKFLOW = [
  { numero: 1, titulo: 'Cliente',       path: 'editar',       statusAposCompleto: 'rascunho' },
  { numero: 2, titulo: 'Fatura',        path: 'fatura',       statusAposCompleto: 'fatura_analisada' },
  { numero: 3, titulo: 'Telhado',       path: 'telhado',      statusAposCompleto: 'telhado_preenchido' },
  { numero: 4, titulo: 'Padrão',        path: 'padrao',       statusAposCompleto: 'dimensionado' },
  { numero: 5, titulo: 'Dimensionar',   path: 'dimensionar',  statusAposCompleto: 'dimensionado' },
  { numero: 6, titulo: 'Kit',           path: 'kit',          statusAposCompleto: 'kit_selecionado' },
  { numero: 7, titulo: 'Lista CA',      path: 'lista-ca',     statusAposCompleto: 'lista_ca_confirmada' },
  { numero: 8, titulo: 'Orçamento',     path: 'orcamento',    statusAposCompleto: 'orcamento_gerado' },
]

// Ordem dos status (índice define quão "avançado" está)
const STATUS_ORDEM: Record<string, number> = {
  rascunho: 0,
  fatura_analisada: 1,
  telhado_preenchido: 2,
  dimensionado: 3,
  kit_selecionado: 4,
  lista_ca_confirmada: 5,
  orcamento_gerado: 6,
  proposta_enviada: 7,
  aceito: 8,
  recusado: 8,
  cancelado: 8,
  expirado: 8,
}

function PassoCard({
  numero,
  titulo,
  href,
  statusProjeto,
  statusRequerido,
}: {
  numero: number
  titulo: string
  href: string
  statusProjeto: string
  statusRequerido: string
}) {
  const ordemAtual = STATUS_ORDEM[statusProjeto] ?? 0
  const ordemRequerida = STATUS_ORDEM[statusRequerido] ?? 0
  const concluido = ordemAtual >= ordemRequerida && ordemRequerida > 0

  return (
    <Link
      href={href}
      className={`
        p-3 rounded-lg border text-center transition-all
        ${concluido
          ? 'bg-verde/10 border-verde/30 hover:border-verde/60'
          : 'bg-white/[0.02] border-white/10 hover:border-sol/40 hover:bg-white/[0.05]'
        }
      `}
    >
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-1.5 border-2
        ${concluido
          ? 'bg-verde/20 text-verde border-verde/40'
          : 'bg-transparent text-white/60 border-white/20'
        }
      `}>
        {concluido ? '✓' : numero}
      </div>
      <div className="text-xs font-semibold text-white">{titulo}</div>
    </Link>
  )
}

function getProximoPasso(status: string) {
  switch (status) {
    case 'rascunho':
      return {
        titulo: 'Anexar fatura(s) CELESC',
        descricao: 'Faça upload das faturas pra análise automática do consumo, demanda e geração existente.',
        cta: 'Anexar fatura',
        path: 'fatura',
      }
    case 'fatura_analisada':
      return {
        titulo: 'Preencher dados do telhado',
        descricao: 'Tipo de cobertura, orientação, área, sombreamento. Múltiplas seções se aplicável.',
        cta: 'Preencher telhado',
        path: 'telhado',
      }
    case 'telhado_preenchido':
      return {
        titulo: 'Padrão de entrada CELESC',
        descricao: 'Foto do quadro, padrão de entrada, aterramento, distância até o ponto da string.',
        cta: 'Preencher padrão',
        path: 'padrao',
      }
    case 'dimensionado':
      return {
        titulo: 'Escolher kit (placa + inversor)',
        descricao: 'Sistema apresenta candidatos compatíveis. Você escolhe baseado em estoque, preço, preferência do cliente.',
        cta: 'Escolher kit',
        path: 'kit',
      }
    case 'kit_selecionado':
      return {
        titulo: 'Revisar Lista CA',
        descricao: 'Confira lista de materiais CA com preços cotados. Edite quantidades/itens se necessário.',
        cta: 'Revisar Lista CA',
        path: 'lista-ca',
      }
    case 'lista_ca_confirmada':
      return {
        titulo: 'Gerar orçamento final',
        descricao: 'Calcula PV total com kit WEG + serviços Spin. Gera PDF da proposta.',
        cta: 'Gerar orçamento',
        path: 'orcamento',
      }
    case 'orcamento_gerado':
      return {
        titulo: 'Enviar proposta ao cliente',
        descricao: 'PDF pronto. Envie por WhatsApp/Email pro cliente.',
        cta: 'Ver e enviar',
        path: 'proposta',
      }
    default:
      return null
  }
}
