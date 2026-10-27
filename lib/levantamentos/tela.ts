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

/** Diagrama gerado pelo robô a partir do levantamento. Links e avisos só vão pro admin. */
export type DiagramaTela = {
  id: string
  tipo_desenho: string
  versao: number
  status: 'gerando' | 'pronto' | 'erro' | string
  created_at: string
  url_pdf: string | null
  url_dxf: string | null
  url_svg: string | null
  avisos: string[]
  erro: string | null
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
