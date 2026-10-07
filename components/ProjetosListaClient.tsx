'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { TimelineProjeto } from '@/components/TimelineProjeto'
import { BotaoAbrirCanalCliente } from '@/components/BotaoAbrirCanalCliente'
import { formatarCpfCnpj, fmtNum } from '@/lib/formatters'
import { criarNovaPropostaMesmoClienteAction, encerrarProjetoAction, reabrirProjetoAction } from '@/app/projetos/actions'
import { MOTIVOS, ROTULO_ENCERRAMENTO, etiquetasDoProjeto, type CorEtiqueta, type TipoEncerramento } from '@/lib/projetos/negocio'
import { useRouter } from 'next/navigation'

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
  projeto_itens?: Array<{ tipo: string; status?: string | null }> | null
  encerrado_tipo?: TipoEncerramento | null
  encerrado_motivo?: string | null
  encerrado_detalhe?: string | null
  encerrado_em?: string | null
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

type Aba = 'andamento' | 'crm' | 'encerrados'

export function ProjetosListaClient({ grupos, aba = 'andamento' }: { grupos: Grupo[]; aba?: Aba }) {
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
            <ClienteBloco key={g.cliente_id || `sn-${i}`} grupo={g} aba={aba} />
          ))}
        </div>
      ) : filtrando ? (
        <div className="text-center py-12 px-8 bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
          <p className="text-sm text-white/60">Nenhum projeto bate com &ldquo;{busca}&rdquo;.</p>
          <button type="button" onClick={() => setBusca('')} className="mt-2 text-xs text-sol hover:underline">Limpar busca</button>
        </div>
      ) : aba === 'andamento' ? (
        <EmptyState />
      ) : (
        <p className="text-sm text-white/40 py-12 text-center">{aba === 'crm' ? 'Nenhum projeto com proposta enviada.' : 'Nenhum projeto perdido ou não elegível.'}</p>
      )}
    </>
  )
}

function ClienteBloco({ grupo, aba }: { grupo: Grupo; aba: Aba }) {
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
            <ProjetoLinha key={p.id} projeto={p} aba={aba} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjetoLinha({ projeto, aba }: { projeto: Projeto; aba: Aba }) {
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
            {/* Kalebe 2026-10-07: etiqueta do tipo de negócio */}
            {etiquetasDoProjeto(projeto).map((e) => (
              <span key={e.rotulo} className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${COR_ETIQUETA[e.cor]}`}>{e.rotulo}</span>
            ))}
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
        {aba === 'encerrados' && (
          <p className="mt-2 text-[11px] text-white/60">
            <span className={projeto.encerrado_tipo === 'nao_elegivel' ? 'text-white/70 font-bold' : 'text-coral font-bold'}>
              {projeto.encerrado_tipo ? ROTULO_ENCERRAMENTO[projeto.encerrado_tipo] : 'Encerrado'}
            </span>
            {projeto.encerrado_motivo ? ` · ${projeto.encerrado_motivo}` : ''}
            {projeto.encerrado_detalhe ? ` — ${projeto.encerrado_detalhe}` : ''}
            {projeto.encerrado_em ? ` · ${new Date(projeto.encerrado_em).toLocaleDateString('pt-BR')}` : ''}
          </p>
        )}
      </Link>
      {/* Ações rápidas — canto sup direito. Kalebe 2026-09-14: botão canal WhatsApp */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {aba === 'encerrados' ? (
          <BotaoReabrir projetoId={projeto.id} />
        ) : (
          <>
            <BotaoAbrirCanalCliente projetoId={projeto.id} variante="icone" />
            <BotaoEncerrar projeto={projeto} tipo="nao_elegivel" />
            <BotaoEncerrar projeto={projeto} tipo="perdido" />
            <BotaoExcluirProposta projetoId={projeto.id} codigo={projeto.codigo} />
          </>
        )}
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

const COR_ETIQUETA: Record<CorEtiqueta, string> = {
  sol: 'bg-sol/10 border-sol/30 text-sol',
  azul: 'bg-weg-azul/10 border-weg-azul/30 text-weg-azul',
  verde: 'bg-verde/10 border-verde/30 text-verde',
  coral: 'bg-coral/10 border-coral/30 text-coral',
  branco: 'bg-white/5 border-white/20 text-white/70',
}

/**
 * Kalebe 2026-10-07: "excluir como perdido e os motivos, assim como
 * classificar como não elegível e os motivos" — o card sai da base (aba
 * "Perdidos e não elegíveis", dá pra reabrir).
 */
function BotaoEncerrar({ projeto, tipo }: { projeto: Projeto; tipo: TipoEncerramento }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [detalhe, setDetalhe] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const perdido = tipo === 'perdido'

  function confirmar() {
    setErro(null)
    startTransition(async () => {
      const r = await encerrarProjetoAction({ projeto_id: projeto.id, tipo, motivo, detalhe })
      if ('erro' in r) { setErro(r.erro); return }
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMotivo(''); setDetalhe(''); setErro(null); setAberto(true) }}
        title={perdido ? 'Marcar como perdido (sai da base)' : 'Classificar como não elegível (sai da base)'}
        className={`text-[10px] font-bold px-1.5 py-1 rounded border ${perdido ? 'text-coral border-coral/30 hover:bg-coral/10' : 'text-white/60 border-white/20 hover:bg-white/10'}`}
      >
        {perdido ? '✕ Perdido' : '⊘ Não elegível'}
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAberto(false)}>
          <div className="w-full max-w-md bg-noite border border-white/15 rounded-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white">
              {perdido ? '✕ Marcar como perdido' : '⊘ Classificar como não elegível'} · <span className="font-mono text-white/60">{projeto.codigo}</span>
            </h2>
            <p className="text-xs text-white/55">
              {perdido
                ? 'O card sai da base de projetos e vai pra coluna "Perdido" do CRM. Conta nos perdidos do mês.'
                : 'O card sai da base de projetos e do CRM. Lead fora do perfil — não conta como perdido.'}{' '}
              Dá pra reabrir na aba "Perdidos e não elegíveis".
            </p>
            <label className="block">
              <span className="block text-[11px] font-bold text-white/60 mb-1">Motivo *</span>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sol/50">
                <option value="" className="bg-noite">Escolha…</option>
                {MOTIVOS[tipo].map((m) => <option key={m} value={m} className="bg-noite">{m}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold text-white/60 mb-1">Detalhe {motivo === 'Outro' ? '*' : '(opcional)'}</span>
              <textarea value={detalhe} onChange={(e) => setDetalhe(e.target.value)} rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sol/50 resize-none" />
            </label>
            {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setAberto(false)} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Cancelar</button>
              <button onClick={confirmar} disabled={isPending || !motivo}
                className={`px-4 py-2 font-bold text-sm rounded-lg disabled:opacity-40 ${perdido ? 'bg-coral text-white' : 'bg-white/80 text-noite'}`}>
                {isPending ? 'Salvando…' : perdido ? 'Marcar como perdido' : 'Classificar como não elegível'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BotaoReabrir({ projetoId }: { projetoId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={(e) => {
          e.preventDefault(); e.stopPropagation(); setErro(null)
          startTransition(async () => {
            const r = await reabrirProjetoAction(projetoId)
            if ('erro' in r) setErro(r.erro)
            else router.refresh()
          })
        }}
        className="text-[10px] font-bold px-2 py-1 rounded border border-verde/40 text-verde hover:bg-verde/10 disabled:opacity-40"
        title="Volta pra base, na etapa em que estava"
      >
        {isPending ? '⏳' : '↩ Reabrir'}
      </button>
      {erro && <span className="text-[10px] text-coral">⚠ {erro}</span>}
    </>
  )
}