import Link from 'next/link'

// path = sub-rota relativa ao /projetos/[id]/. String vazia = fica na tela do projeto.
const ETAPAS_FV = [
  { chave: 'cliente',   label: 'Cliente',   statusApos: 'rascunho',            ordem: 0, path: 'editar'    },
  { chave: 'fatura',    label: 'Fatura',    statusApos: 'fatura_analisada',    ordem: 1, path: 'fatura'    },
  { chave: 'telhado',   label: 'Telhado',   statusApos: 'telhado_preenchido',  ordem: 2, path: 'telhado'   },
  { chave: 'padrao',    label: 'Padrão',    statusApos: 'dimensionado',        ordem: 3, path: 'padrao'    },
  { chave: 'kit',       label: 'Kit',       statusApos: 'kit_selecionado',     ordem: 4, path: 'kit'       },
  { chave: 'lista_ca',  label: 'Lista CA',  statusApos: 'lista_ca_confirmada', ordem: 5, path: 'lista-ca'  },
  { chave: 'orcamento', label: 'Orçamento', statusApos: 'orcamento_gerado',    ordem: 6, path: 'orcamento' },
  { chave: 'proposta',  label: 'Proposta',  statusApos: 'proposta_enviada',    ordem: 7, path: 'orcamento' },
  { chave: 'fechado',   label: 'Fechado',   statusApos: 'aceito',              ordem: 8, path: ''          },
] as const

// Timeline simplificada pra projetos SÓ serviço (sem fatura/telhado/padrao/kit)
const ETAPAS_SERVICO = [
  { chave: 'cliente',  label: 'Cliente',  statusApos: 'rascunho',         ordem: 0, path: 'editar'    },
  { chave: 'escopo',   label: 'Escopo',   statusApos: 'orcamento_gerado', ordem: 1, path: 'tipos'     },
  { chave: 'proposta', label: 'Proposta', statusApos: 'proposta_enviada', ordem: 2, path: 'orcamento' },
  { chave: 'fechado',  label: 'Fechado',  statusApos: 'aceito',           ordem: 3, path: ''          },
] as const

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
  recusado: -1,
  cancelado: -1,
  expirado: -1,
}

// Mapeamento de status para ORDEM na timeline reduzida de serviço
const STATUS_ORDEM_SERVICO: Record<string, number> = {
  rascunho: 0,
  // Todos esses status intermediarios FV nao existem em servico — mapeia direto pra orcamento
  fatura_analisada: 1,
  telhado_preenchido: 1,
  dimensionado: 1,
  kit_selecionado: 1,
  lista_ca_confirmada: 1,
  orcamento_gerado: 1,
  proposta_enviada: 2,
  aceito: 3,
  recusado: -1,
  cancelado: -1,
  expirado: -1,
}

const STATUS_INFO_LOCAL: Record<string, { label: string; cor: string; bg: string; borda: string }> = {
  rascunho:            { label: 'Rascunho',           cor: 'text-white/70',    bg: 'bg-white/10',     borda: 'border-white/20' },
  fatura_analisada:    { label: 'Fatura OK',          cor: 'text-weg-azul',    bg: 'bg-weg-azul/10',  borda: 'border-weg-azul/30' },
  telhado_preenchido:  { label: 'Telhado OK',         cor: 'text-weg-azul',    bg: 'bg-weg-azul/10',  borda: 'border-weg-azul/30' },
  dimensionado:        { label: 'Dimensionado',       cor: 'text-weg-azul',    bg: 'bg-weg-azul/10',  borda: 'border-weg-azul/30' },
  kit_selecionado:     { label: 'Kit escolhido',      cor: 'text-weg-azul',    bg: 'bg-weg-azul/10',  borda: 'border-weg-azul/30' },
  lista_ca_confirmada: { label: 'Lista CA OK',        cor: 'text-weg-azul',    bg: 'bg-weg-azul/10',  borda: 'border-weg-azul/30' },
  orcamento_gerado:    { label: 'Orçamento pronto',   cor: 'text-sol',         bg: 'bg-sol/10',       borda: 'border-sol/40' },
  proposta_enviada:    { label: 'Proposta enviada',   cor: 'text-sol',         bg: 'bg-sol/10',       borda: 'border-sol/40' },
  aceito:              { label: 'Aceito ✓',           cor: 'text-verde',       bg: 'bg-verde/10',     borda: 'border-verde/40' },
  recusado:            { label: 'Recusado',           cor: 'text-coral',       bg: 'bg-coral/10',     borda: 'border-coral/40' },
  cancelado:           { label: 'Cancelado',          cor: 'text-white/40',    bg: 'bg-white/5',      borda: 'border-white/10' },
  expirado:            { label: 'Expirado',           cor: 'text-coral',       bg: 'bg-coral/10',     borda: 'border-coral/40' },
}

export function TimelineProjeto({
  status,
  compacto = false,
  soServicos = false,
  projetoId,
}: {
  status: string
  compacto?: boolean
  soServicos?: boolean
  /** Se passado, cada etapa vira Link pra sua rota (acesso rápido). Omitir = timeline visual só. */
  projetoId?: string
}) {
  const ETAPAS = soServicos ? ETAPAS_SERVICO : ETAPAS_FV
  const mapaOrdem = soServicos ? STATUS_ORDEM_SERVICO : STATUS_ORDEM
  const ordemAtual = mapaOrdem[status] ?? 0
  const encerrado = ['aceito', 'recusado', 'cancelado', 'expirado'].includes(status)

  const infoStatus = STATUS_INFO_LOCAL[status] || STATUS_INFO_LOCAL.rascunho
  const proxima = ETAPAS.find((e) => e.ordem === ordemAtual + 1)

  function hrefEtapa(path: string): string | null {
    if (!projetoId) return null
    const base = `/projetos/${projetoId}`
    return path ? `${base}/${path}` : base
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${infoStatus.cor} ${infoStatus.bg} ${infoStatus.borda}`}
        >
          {infoStatus.label}
        </span>
        {!encerrado && proxima && (
          <span className="text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-1">
            <span>→ próximo:</span>
            <span className="text-sol font-bold">{proxima.label}</span>
          </span>
        )}
        {status === 'aceito' && (
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            → Homologação CELESC
          </span>
        )}
      </div>

      {/* Barra de progresso — clicável quando projetoId passado */}
      {!compacto && (
        <div className="flex items-center gap-1 mt-1">
          {ETAPAS.slice(0, soServicos ? 4 : 8).map((etapa) => {
            const concluida = etapa.ordem <= ordemAtual && ordemAtual >= 0
            const atual = etapa.ordem === ordemAtual + 1 && !encerrado
            const posterior = etapa.ordem > ordemAtual + 1
            const href = hrefEtapa(etapa.path)

            const Conteudo = (
              <>
                <div
                  className={`w-full h-1 rounded transition ${
                    concluida
                      ? 'bg-verde/60 group-hover:bg-verde'
                      : atual
                      ? 'bg-sol animate-pulse'
                      : posterior
                      ? 'bg-white/10 group-hover:bg-white/25'
                      : 'bg-white/5'
                  }`}
                />
                <span
                  className={`text-[8px] uppercase font-bold truncate max-w-full transition ${
                    concluida
                      ? 'text-verde/70 group-hover:text-verde'
                      : atual
                      ? 'text-sol'
                      : 'text-white/30 group-hover:text-white/70'
                  }`}
                >
                  {etapa.label}
                </span>
              </>
            )

            if (href) {
              return (
                <Link
                  key={etapa.chave}
                  href={href}
                  className="group flex-1 flex flex-col items-center gap-1 cursor-pointer"
                  title={`Ir para ${etapa.label}`}
                >
                  {Conteudo}
                </Link>
              )
            }
            return (
              <div key={etapa.chave} className="flex-1 flex flex-col items-center gap-1" title={etapa.label}>
                {Conteudo}
              </div>
            )
          })}
        </div>
      )}

      {compacto && (
        <div className="flex items-center gap-0.5">
          {ETAPAS.slice(0, 8).map((etapa) => {
            const concluida = etapa.ordem <= ordemAtual && ordemAtual >= 0
            const atual = etapa.ordem === ordemAtual + 1 && !encerrado
            return (
              <div
                key={etapa.chave}
                className={`h-1 flex-1 rounded ${
                  concluida
                    ? 'bg-verde/60'
                    : atual
                    ? 'bg-sol animate-pulse'
                    : 'bg-white/10'
                }`}
                title={etapa.label}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
