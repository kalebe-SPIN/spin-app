'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { TimelineProjeto } from '@/components/TimelineProjeto'
import { formatarCpfCnpj, fmtNum } from '@/lib/formatters'
import { criarNovaPropostaMesmoClienteAction } from '@/app/projetos/actions'

type Projeto = {
  id: string
  codigo: string
  status: string
  tipo_projeto?: string | null
  cliente_id: string | null
  cliente_razao_social: string | null
  cliente_cpf_cnpj: string | null
  uc_geradora?: string | null
  data_inicio?: string | null
  kit_selecionado?: any
  created_at: string
  updated_at?: string
  status_atualizado_em?: string
}

type Grupo = {
  cliente_id: string | null
  nome: string
  projetos: Projeto[]
}

const TIPO_PROJETO_LABEL: Record<string, string> = {
  ongrid: 'On-grid',
  hibrido_bess: 'Híbrido c/ BESS',
  expansao_ongrid: 'Expansão on-grid',
  expansao_hibrido: 'Expansão híbrido',
}

/** Botão "+ Nova proposta" — cria projeto novo pro mesmo cliente com
 *  dados cadastrais (fatura/padrão/beneficiárias/telhado) já herdados;
 *  redireciona direto pra /kit pra escolher configuração nova.
 *  Kalebe pode acessar a etapa Fatura pra add/remover beneficiárias
 *  específicas dessa proposta sem mexer nas outras. */
function BotaoNovaProposta({ clienteId }: { clienteId: string }) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function criar() {
    setErro(null)
    startTransition(async () => {
      const r = await criarNovaPropostaMesmoClienteAction(clienteId)
      if (r && 'erro' in r && r.erro) setErro(r.erro)
      // Sucesso: server redirect leva pra /kit automaticamente
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={criar}
        disabled={isPending}
        className="text-[10px] font-bold text-verde hover:text-verde/80 disabled:opacity-40"
        title="Cria proposta nova herdando fatura + padrão + telhado + beneficiárias. Vai direto pra escolha do kit."
      >
        {isPending ? '⏳ Criando...' : '+ Nova proposta'}
      </button>
      {erro && <p className="text-[9px] text-coral mt-1">⚠ {erro}</p>}
    </>
  )
}

/** Normaliza pra busca — tira acento, lowercase, tira não-alfanumérico do doc */
function norm(s: string | null | undefined): string {
  if (!s) return ''
  return s.toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function docLimpo(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace(/\D/g, '')
}

export function ProjetosListaClient({ grupos }: { grupos: Grupo[] }) {
  const [busca, setBusca] = useState('')

  const gruposFiltrados = useMemo(() => {
    const q = busca.trim()
    if (!q) return grupos
    const qNorm = norm(q)
    const qDoc = docLimpo(q)

    return grupos
      .map(g => {
        // Match no cliente (nome, CPF/CNPJ) → mostra o grupo inteiro
        const clienteMatch =
          norm(g.nome).includes(qNorm) ||
          (qDoc.length >= 3 && docLimpo(g.projetos[0]?.cliente_cpf_cnpj).includes(qDoc))

        if (clienteMatch) return g

        // Senão, filtra os projetos internos
        const projetosFiltrados = g.projetos.filter(p =>
          norm(p.codigo).includes(qNorm) ||
          norm(p.status).includes(qNorm) ||
          norm(p.uc_geradora).includes(qNorm) ||
          norm(TIPO_PROJETO_LABEL[p.tipo_projeto || ''] || p.tipo_projeto).includes(qNorm) ||
          norm(p.kit_selecionado?.placa?.modelo).includes(qNorm) ||
          norm(p.kit_selecionado?.inversor?.modelo).includes(qNorm)
        )
        if (projetosFiltrados.length === 0) return null
        return { ...g, projetos: projetosFiltrados }
      })
      .filter((g): g is Grupo => g !== null)
  }, [grupos, busca])

  const totalProjetos = gruposFiltrados.reduce((s, g) => s + g.projetos.length, 0)
  const totalClientes = gruposFiltrados.length
  const totalGeralProjetos = grupos.reduce((s, g) => s + g.projetos.length, 0)
  const filtrando = busca.trim().length > 0

  return (
    <>
      <div className="mb-4 flex flex-col sm:flex-row gap-2 items-stretch">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">🔍</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, cliente, CPF/CNPJ, UC, status, placa, inversor…"
            className="w-full h-12 pl-10 pr-10 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:border-sol/40 focus:outline-none"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs px-2 py-1"
              aria-label="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>
        <Link
          href="/projetos/novo"
          className="h-12 inline-flex items-center justify-center gap-1 px-6 bg-sol text-noite font-black text-sm rounded-lg hover:bg-sol/90 shadow-lg shadow-sol/20 whitespace-nowrap"
        >
          + Novo projeto
        </Link>
      </div>
      <p className="text-xs text-white/50 mb-3">
        {filtrando
          ? <><strong className="text-white">{totalProjetos}</strong> de {totalGeralProjetos} projeto{totalGeralProjetos !== 1 ? 's' : ''} · {totalClientes} cliente{totalClientes !== 1 ? 's' : ''}</>
          : <><strong className="text-white">{totalGeralProjetos}</strong> projeto{totalGeralProjetos !== 1 ? 's' : ''} · {totalClientes} cliente{totalClientes !== 1 ? 's' : ''}</>}
      </p>

      {gruposFiltrados.length > 0 ? (
        <div className="space-y-4">
          {gruposFiltrados.map((g, i) => (
            <ClienteBloco key={g.cliente_id || `sn-${i}`} grupo={g} />
          ))}
        </div>
      ) : filtrando ? (
        <div className="text-center py-12 px-8 bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
          <p className="text-sm text-white/60">Nenhum projeto bate com &ldquo;{busca}&rdquo;.</p>
          <button type="button" onClick={() => setBusca('')} className="mt-2 text-xs text-sol hover:underline">Limpar busca</button>
        </div>
      ) : (
        <EmptyState />
      )}
    </>
  )
}

function ClienteBloco({ grupo }: { grupo: Grupo }) {
  const qtd = grupo.projetos.length
  const dataMaisRecente = grupo.projetos[0]?.created_at
    ? new Date(grupo.projetos[0].created_at).toLocaleDateString('pt-BR')
    : '—'

  const proj0 = grupo.projetos[0]
  const cpf = proj0?.cliente_cpf_cnpj
  const uc = grupo.projetos.find(p => p.uc_geradora)?.uc_geradora
  const tipoProjeto = proj0?.tipo_projeto

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
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
          <div className="text-right shrink-0 space-y-1">
            {grupo.cliente_id && (
              <>
                <BotaoNovaProposta clienteId={grupo.cliente_id} />
                <Link
                  href={`/crm/clientes/${grupo.cliente_id}`}
                  className="block text-[10px] text-sol hover:underline"
                >
                  Ver cadastro →
                </Link>
              </>
            )}
            <p className="text-[10px] text-white/30">último: {dataMaisRecente}</p>
          </div>
        </div>

        {(uc || tipoProjeto) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] pt-2 border-t border-white/5">
            {tipoProjeto && (
              <span className="text-white/60">
                <span className="text-white/40">Sistema:</span>{' '}
                {TIPO_PROJETO_LABEL[tipoProjeto] || tipoProjeto}
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

function ProjetoLinha({ projeto }: { projeto: Projeto }) {
  const dataFmt = new Date(projeto.created_at).toLocaleDateString('pt-BR')
  const kit = projeto.kit_selecionado || {}
  const potCc = kit.potencia_cc_kwp
  const modeloPlaca = kit.placa?.modelo
  const modeloInv = kit.inversor?.modelo
  const qtdPlacas = kit.qtd_placas
  const valor = kit.preco_total_kit_weg ? Number(kit.preco_total_kit_weg) : null

  return (
    <div className="relative group">
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
              // Kalebe 2026-09-01: é o soma bruta do KIT WEG (preço tabela sem
              // fator/margem/impostos/MO/frete). NÃO é o preço final ao cliente.
              // Rotulado explicitamente pra não confundir com valor de proposta.
              <span className="text-xs font-mono tabular-nums text-white/60"
                title="Total do kit WEG (bruto, sem fator/margem/impostos/mão de obra). Preço final ao cliente é maior.">
                <span className="text-white/40 text-[10px] uppercase tracking-wider mr-1">Kit WEG</span>
                R$ {valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            )}
            <span className="text-[10px] text-white/30">{dataFmt}</span>
          </div>
        </div>
        <TimelineProjeto status={projeto.status} />
      </Link>
      {/* Botão excluir — aparece só no hover, canto sup direito */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <BotaoExcluirProposta projetoId={projeto.id} codigo={projeto.codigo} />
      </div>
    </div>
  )
}

/** Botão discreto de excluir (soft-delete). Confirma antes de disparar. */
function BotaoExcluirProposta({ projetoId, codigo }: { projetoId: string; codigo: string }) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function excluir(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`Excluir a proposta ${codigo}? Ela some das listas mas fica no banco pra auditoria.`)) return
    setErro(null)
    startTransition(async () => {
      const { excluirPropostaAction } = await import('@/app/projetos/actions')
      const r = await excluirPropostaAction(projetoId, 'manual')
      if (r && 'erro' in r && r.erro) setErro(r.erro)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={excluir}
        disabled={isPending}
        title="Excluir proposta"
        className="text-xs text-coral/60 hover:text-coral hover:bg-coral/10 rounded p-1 disabled:opacity-40"
      >
        {isPending ? '⏳' : '🗑'}
      </button>
      {erro && (
        <div className="absolute top-full right-0 mt-1 text-[10px] text-coral bg-noite border border-coral/30 rounded p-1 whitespace-nowrap">
          ⚠ {erro}
        </div>
      )}
    </>
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
