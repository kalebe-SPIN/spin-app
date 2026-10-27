// Tipos do módulo Levantamentos (checklists de campo) — Kalebe 2026-10-26.
// Os modelos vêm da tabela public.checklist_modelos (coluna `definicao`),
// no mesmo formato dos arquivos em ./modelos/*.json.

export type Finalidade = "fv" | "padrao_novo" | "aumento_carga";

export type StatusLevantamento =
  | "rascunho"
  | "enviado"
  | "em_projeto"
  | "com_pendencia"
  | "aguardando_aprovacao"
  | "aprovado"
  | "cancelado";

export type TipoCampo = "text" | "tel" | "date" | "number" | "select" | "radio" | "checks" | "textarea";

export interface CampoModelo {
  id: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio: boolean;
  opcoes?: string[];
  unidade?: string;
  ajuda?: string;
  largura?: "inteira";
}

export interface SecaoModelo {
  id: string;
  titulo: string;
  campos: CampoModelo[];
}

export interface FotoModelo {
  id: string;          // slot: 'fatura', 'poste', 'qd'...
  titulo: string;
  instrucao: string;   // texto exibido ao consultor
  obrigatorio: boolean;
  aceita: string[];    // ['image/*', 'application/pdf']
}

export interface ModeloChecklist {
  codigo: Finalidade;
  finalidade: string;
  nome: string;
  descricao: string;
  versao: number;
  secoes: SecaoModelo[];
  fotos: FotoModelo[];
}

export type Respostas = Record<string, string | number | string[] | null>;

export interface Pendencia {
  campo: string;        // id do campo ou 'foto:<slot>'
  mensagem: string;
  origem: "app" | "projetista";
}

export interface Levantamento {
  id: string;
  numero: number;
  finalidade: Finalidade;
  modelo_id: string;
  modelo_versao: number;
  projeto_id: string | null;   // no handoff era pedido_id; no spin-app o "pedido" é o projeto
  cliente_nome: string;
  cidade: string;
  status: StatusLevantamento;
  respostas: Respostas;
  progresso: number;
  pendencias: Pendencia[];
  observacao_projetista: string | null;
  consultor_id: string;
  enviado_em: string | null;
  processado_em: string | null;
  aprovado_em: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoArquivo = "foto" | "documento" | "prancha_pdf" | "prancha_dxf" | "prancha_svg" | "preview";

export interface ArquivoLevantamento {
  id: string;
  levantamento_id: string;
  tipo: TipoArquivo;
  slot: string | null;
  storage_path: string;
  nome_original: string | null;
  mime: string;
  tamanho_bytes: number | null;
  versao_prancha: number | null;
  created_at: string;
}

export const ROTULO_STATUS: Record<StatusLevantamento, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado ao projeto",
  em_projeto: "Em projeto",
  com_pendencia: "Com pendência",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
};

export const numeroLevantamento = (n: number) => `LEV-${String(n).padStart(6, "0")}`;
