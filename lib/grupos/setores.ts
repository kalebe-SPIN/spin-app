/**
 * Setores = grupos internos (Kalebe 2026-09-29). Sem import de servidor:
 * usado também no formulário de cadastro de usuário.
 * Espelha public.setores_padrao() da migration 126.
 */

export type SetorResumo = { id: string; chave: string; nome: string; emoji: string }

export const TODOS_SETORES = ['comercial', 'projetos_homologacao', 'instalacao_campo', 'administrativo_financeiro']

/** Sugestão de setor pela atuação — o admin confirma/ajusta no cadastro. */
export function setoresPadraoDoRole(role: string): string[] {
  if (role === 'admin') return [...TODOS_SETORES]
  if (role === 'representante' || role === 'vendedor_servicos') return ['comercial']
  if (role === 'profissional_campo' || role === 'instalador') return ['instalacao_campo']
  return []
}
