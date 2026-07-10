const ETAPAS = [
  { chave: 'cliente',     label: 'Cliente',    statusApos: 'rascunho',            ordem: 0 },
  { chave: 'fatura',      label: 'Fatura',     statusApos: 'fatura_analisada',    ordem: 1 },
  { chave: 'telhado',     label: 'Telhado',    statusApos: 'telhado_preenchido',  ordem: 2 },
  { chave: 'padrao',      label: 'Padrão',     statusApos: 'dimensionado',        ordem: 3 },
  { chave: 'kit',         label: 'Kit',        statusApos: 'kit_selecionado',     ordem: 4 },
  { chave: 'lista_ca',    label: 'Lista CA',   statusApos: 'lista_ca_confirmada', ordem: 5 },
  { chave: 'orcamento',   label: 'Orçamento',  statusApos: 'orcamento_gerado',    ordem: 6 },
  { chave: 'proposta',    label: 'Proposta',   statusApos: 'proposta_enviada',    ordem: 7 },
  { chave: 'fechado',     label: 'Fechado',    statusApos: 'aceito',              ordem: 8 },
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
}: {
  status: string
  compacto?: boolean
}) {
  const ordemAtual = STATUS_ORDEM[status] ?? 0
  const encerrado = ['aceito', 'recusado', 'cancelado', 'expirado'].includes(status)

  const infoStatus = STATUS_INFO_LOCAL[status] || STATUS_INFO_LOCAL.rascunho
  const proxima = ETAPAS.find((e) => e.ordem === ordemAtual + 1)

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

      {/* Barra de progresso */}
      {!compacto && (
        <div className="flex items-center gap-1 mt-1">
          {ETAPAS.slice(0, 8).map((etapa) => {
            const concluida = etapa.ordem <= ordemAtual && ordemAtual >= 0
            const atual = etapa.ordem === ordemAtual + 1 && !encerrado
            const proxima = etapa.ordem > ordemAtual + 1
            return (
              <div
                key={etapa.chave}
                className="flex-1 flex flex-col items-center gap-1"
                title={etapa.label}
              >
                <div
                  className={`w-full h-1 rounded ${
                    concluida
                      ? 'bg-verde/60'
                      : atual
                      ? 'bg-sol animate-pulse'
                      : proxima
                      ? 'bg-white/10'
                      : 'bg-white/5'
                  }`}
                />
                <span
                  className={`text-[8px] uppercase font-bold truncate max-w-full ${
                    concluida
                      ? 'text-verde/70'
                      : atual
                      ? 'text-sol'
                      : 'text-white/30'
                  }`}
                >
                  {etapa.label}
                </span>
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
