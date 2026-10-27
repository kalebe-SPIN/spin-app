// Tipos do módulo Levantamentos (checklists de campo) — Kalebe 2026-10-26.
// Os modelos vêm da tabela public.checklist_modelos (coluna `definicao`),
// no mesmo formato dos arquivos em ./modelos/*.json.
import type { MedicaoColetiva } from "./n3210003";

export type Finalidade = "fv" | "padrao_novo" | "aumento_carga";

export type StatusLevantamento =
  | "rascunho"
  | "enviado"
  | "em_projeto"
  | "com_pendencia"
  | "aguardando_aprovacao"
  | "aprovado"
  | "cancelado";

// "cargas" (Kalebe 2026-10-27, modelos v2): lista de equipamentos com
// quantidade e potência — do catálogo do sistema ou digitados à mão.
// "coletiva" (modelos v3): unidades, cargas comuns e disjuntor geral calculado
// pela CELESC N-321.0003 (lib/levantamentos/n3210003.ts).
export type TipoCampo = "text" | "tel" | "date" | "number" | "select" | "radio" | "checks" | "textarea" | "cargas" | "coletiva";

export interface CampoModelo {
  id: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio: boolean;
  opcoes?: string[];
  unidade?: string;
  ajuda?: string;
  largura?: "inteira";
  /** só aparece (e só conta como obrigatório) quando outro campo tem este valor */
  mostrar_se?: { campo: string; igual: string };
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

/** Item de um campo "cargas". equipamento_id = id em lib/hibrido/catalogo-equipamentos (vazio = digitado). */
export interface ItemCarga {
  item: string;
  qtd: number;
  potencia_w: number | null;   // potência de cada unidade, em W
  equipamento_id?: string;
}

export type Respostas = Record<string, string | number | string[] | ItemCarga[] | MedicaoColetiva | null>;

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
