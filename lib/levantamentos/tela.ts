// Formato que a página do levantamento passa para o formulário e o detalhe.
import type { Finalidade, ModeloChecklist, Pendencia, Respostas, StatusLevantamento, TipoArquivo } from './types'

export type LevantamentoTela = {
  id: string
  numero: number
  finalidade: Finalidade
  status: StatusLevantamento
  projeto_id: string | null
  projeto_codigo: string | null
  consultor_nome: string
  ehAutor: boolean
  respostas: Respostas
  /** campos que vieram de etapas anteriores ao abrir (ainda não salvos) */
  preenchidosAuto: string[]
  pendencias: Pendencia[]
  observacao_projetista: string | null
  enviado_em: string | null
  processado_em: string | null
  aprovado_em: string | null
  updated_at: string
  modelo: ModeloChecklist
}

export type ArquivoTela = {
  id: string
  tipo: TipoArquivo
  slot: string | null
  mime: string
  nome: string | null
  url: string
  versao_prancha: number | null
  created_at: string
}
