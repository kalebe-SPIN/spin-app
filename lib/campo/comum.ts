import { getTituloTipo } from '@/lib/execucoes'

/**
 * Painel do profissional de campo (Kalebe 2026-10-05) — tipos e regras
 * comuns (sem import de servidor: usado nas telas e nas server actions).
 *
 * Ciclo de uma demanda (execucoes_servicos):
 *   DEMANDA  status 'agendando' (pronta) ou 'aguardando_pre_requisitos'
 *            (esperando liberação do admin — aparece, mas não dá pra agendar)
 *   AGENDA   'agendado' / 'preparando_material' com data → sai das demandas
 *   OS       'em_execucao' → checklist, fotos, custos extras
 *   FIM      'concluido' com assinatura do cliente
 *   Passou a data sem execução → a Bianca devolve pra 'agendando'.
 */

export type EnderecoCampo = {
  cep?: string | null
  logradouro?: string | null
  rua?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
}

export type ItemChecklist = { item: string; feito: boolean; obs?: string | null }

export type Demanda = {
  id: string
  os_numero: number | null
  status: string
  origem: 'projeto' | 'manual'
  tipo_servico: string
  titulo: string
  descricao: string | null
  projeto_id: string | null
  projeto_codigo: string | null
  cliente_nome: string | null
  contato_nome: string | null
  contato_telefone: string | null
  endereco: EnderecoCampo | null
  cidade: string | null
  bairro: string | null
  data_agendada: string | null
  hora_agendada: string | null
  responsavel_tecnico: string | null
  responsavel_nome: string | null
  vezes_reaberta: number
  data_conclusao: string | null
}

export const STATUS_DEMANDA = ['agendando', 'aguardando_pre_requisitos']
export const STATUS_AGENDA = ['agendado', 'preparando_material', 'em_execucao']
export const STATUS_FEITO = ['concluido', 'entregue', 'pos_venda']

/** Tipos de serviço que o campo cadastra (A→Z). */
export const TIPOS_SERVICO_CAMPO = [
  'srv_alvenaria', 'srv_analise_rede', 'srv_carpintaria', 'srv_eletrica_predial', 'srv_instalacao_placas',
  'srv_laudo_tecnico', 'srv_limpeza', 'srv_manutencao', 'srv_padrao_entrada', 'srv_retirada_recolocacao',
  'srv_serralheria', 'fv_ongrid', 'fv_hibrido', 've_recarga', 'outros',
].map((t) => ({ valor: t, rotulo: getTituloTipo(t) }))
  .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

export function linhaEndereco(e: EnderecoCampo | null | undefined): string {
  if (!e) return ''
  const rua = [e.logradouro || e.rua, e.numero].filter(Boolean).join(', ')
  return [rua, e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')
}

export function linkMapa(e: EnderecoCampo | null | undefined): string | null {
  const q = linhaEndereco(e)
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.replace(/ · /g, ', '))}` : null
}

export function linkWhatsApp(tel: string | null | undefined): string | null {
  let d = String(tel || '').replace(/\D/g, '')
  if (!d) return null
  if (d.length === 10 || d.length === 11) d = '55' + d
  return `https://wa.me/${d}`
}

export const rotuloOs = (n: number | null | undefined) => (n ? `OS ${String(n).padStart(4, '0')}` : 'OS')

/** Agrupador de região: cidade (e bairro, se houver). */
export const chaveRegiao = (d: Pick<Demanda, 'cidade' | 'bairro'>) =>
  [d.cidade?.trim() || 'Sem cidade', d.bairro?.trim()].filter(Boolean).join(' · ')
