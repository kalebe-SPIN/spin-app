import { getTituloTipo } from '@/lib/execucoes'

/**
 * Card de projeto (Kalebe 2026-10-07): etiqueta do tipo de negócio e
 * encerramento como perdido / não elegível, com motivo. Sem imports de
 * servidor.
 */

export type CorEtiqueta = 'sol' | 'azul' | 'verde' | 'coral' | 'branco'

const ETIQUETA: Record<string, { rotulo: string; cor: CorEtiqueta }> = {
  fv_ongrid: { rotulo: 'Solar on-grid', cor: 'sol' },
  fv_hibrido: { rotulo: 'Solar híbrido', cor: 'sol' },
  fv_zero_grid: { rotulo: 'Solar zero-grid', cor: 'sol' },
  fv_offgrid: { rotulo: 'Solar off-grid', cor: 'sol' },
  bess: { rotulo: 'Baterias (BESS)', cor: 'azul' },
  ve_recarga: { rotulo: 'Carregador VE', cor: 'verde' },
  venda_equipamentos: { rotulo: 'Venda de equipamentos', cor: 'coral' },
  // tipo_projeto (projetos antigos, sem itens)
  ongrid: { rotulo: 'Solar on-grid', cor: 'sol' },
  hibrido_bess: { rotulo: 'Solar híbrido', cor: 'sol' },
  expansao_ongrid: { rotulo: 'Expansão on-grid', cor: 'sol' },
  expansao_hibrido: { rotulo: 'Expansão híbrido', cor: 'sol' },
}

export function etiquetaNegocio(tipo: string): { rotulo: string; cor: CorEtiqueta } {
  if (ETIQUETA[tipo]) return ETIQUETA[tipo]
  if (tipo.startsWith('srv_') || tipo.startsWith('aluguel_')) return { rotulo: getTituloTipo(tipo), cor: 'azul' }
  return { rotulo: getTituloTipo(tipo), cor: 'branco' }
}

/** Etiquetas do projeto: os itens (sem removidos); sem itens, o tipo do projeto. */
export function etiquetasDoProjeto(p: { tipo_projeto?: string | null; projeto_itens?: Array<{ tipo: string; status?: string | null }> | null }) {
  const tipos = Array.from(new Set((p.projeto_itens || []).filter((i) => i.status !== 'removido').map((i) => i.tipo)))
  const base = tipos.length ? tipos : p.tipo_projeto ? [p.tipo_projeto] : []
  return base.map(etiquetaNegocio)
}

// ─── Encerramento ────────────────────────────────────────────────────────────

export type TipoEncerramento = 'perdido' | 'nao_elegivel'

const aZ = (l: string[]) => [...l].sort((a, b) => a.localeCompare(b, 'pt-BR'))

/** Motivos (A→Z, "Outro" no fim). Ajustáveis aqui. */
export const MOTIVOS: Record<TipoEncerramento, string[]> = {
  perdido: [
    ...aZ([
      'Achou caro / preço',
      'Adiou o projeto',
      'Desistiu',
      'Fechou com concorrente',
      'Financiamento negado',
      'Sem retorno do cliente',
    ]),
    'Outro',
  ],
  nao_elegivel: [
    ...aZ([
      'Consumo baixo (não compensa)',
      'Contato inválido / não é lead',
      'Fora da área de atendimento',
      'Imóvel alugado / sem autorização do dono',
      'Padrão de entrada inadequado',
      'Telhado ou estrutura sem condição',
    ]),
    'Outro',
  ],
}

export const ROTULO_ENCERRAMENTO: Record<TipoEncerramento, string> = {
  perdido: 'Perdido',
  nao_elegivel: 'Não elegível',
}

/** Base de projetos = trabalho técnico; da proposta enviada em diante o card está no CRM. */
export const ETAPAS_BASE_PROJETOS = [
  'rascunho', 'fatura_analisada', 'telhado_preenchido', 'dimensionado', 'kit_selecionado',
  'lista_ca_confirmada', 'orcamento_gerado',
]
