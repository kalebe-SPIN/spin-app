/**
 * Widget "tem espaço / não tem espaço" pro mês e pro dia atuais.
 *
 * Regra:
 *   • Dia = soma das horas ocupadas hoje (agenda_eventos com data_hora_fim -
 *     data_hora_inicio). Se >= limite_horas_agenda → vermelho, senão verde.
 *   • Mês = média das últimas 30 dias (ou dias com pelo menos 1 evento).
 *     Se média >= limite_horas_agenda → vermelho, senão verde.
 *
 * Server component — recebe eventos já filtrados do dia/mês.
 */
export function OcupacaoBadges({
  horasHoje,
  mediaHorasMes,
  limite,
}: {
  horasHoje: number
  mediaHorasMes: number
  limite: number
}) {
  const cheioDia = horasHoje >= limite
  const cheioMes = mediaHorasMes >= limite

  return (
    <div className="flex items-center gap-2">
      <Badge
        titulo="Dia"
        detalhe={`${horasHoje.toFixed(1)}h / ${limite}h`}
        cheio={cheioDia}
      />
      <Badge
        titulo="Mês"
        detalhe={`~${mediaHorasMes.toFixed(1)}h/dia`}
        cheio={cheioMes}
      />
    </div>
  )
}

function Badge({ titulo, detalhe, cheio }: { titulo: string; detalhe: string; cheio: boolean }) {
  const classe = cheio
    ? 'bg-coral/15 border-coral/40 text-coral'
    : 'bg-verde/15 border-verde/40 text-verde'
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${classe}`}>
      <span className="text-xs uppercase tracking-wider font-bold opacity-70">{titulo}</span>
      <span className="text-xs font-mono">{detalhe}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider">
        {cheio ? 'sem espaço' : 'tem espaço'}
      </span>
    </div>
  )
}

/**
 * Helper server-side pra calcular horas ocupadas somando eventos.
 * Recebe eventos e um range temporal; retorna soma em horas (float).
 */
export function calcularHorasOcupadas(
  eventos: Array<{ data_hora_inicio: string; data_hora_fim: string | null }>,
  de: Date,
  ate: Date,
): number {
  let ms = 0
  for (const e of eventos) {
    const ini = new Date(e.data_hora_inicio)
    const fim = e.data_hora_fim ? new Date(e.data_hora_fim) : new Date(ini.getTime() + 60 * 60 * 1000) // default 1h
    const a = Math.max(ini.getTime(), de.getTime())
    const b = Math.min(fim.getTime(), ate.getTime())
    if (b > a) ms += b - a
  }
  return ms / (1000 * 60 * 60)
}
