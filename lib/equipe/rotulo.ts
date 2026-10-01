/**
 * Identificação do usuário nas mensagens (Kalebe 2026-10-01): "primeiro
 * nome · setor" — ex.: "Luciane · Financeiro". Sem import de servidor: usado
 * no servidor (prefixo que o cliente vê) e na tela (etiqueta das mensagens).
 */

export const SETOR_CURTO: Record<string, string> = {
  comercial: 'Comercial',
  projetos_homologacao: 'Projetos',
  instalacao_campo: 'Instalação',
  administrativo_financeiro: 'Financeiro',
}

export function primeiroNome(nome: string | null | undefined): string {
  return String(nome || '').trim().split(/\s+/)[0] || ''
}

export function montarRotulo(nomeCompleto: string | null | undefined, setorChave: string | null | undefined): string {
  const nome = primeiroNome(nomeCompleto)
  const setor = setorChave ? (SETOR_CURTO[setorChave] || setorChave) : ''
  return nome && setor ? `${nome} · ${setor}` : nome
}

/**
 * Etiqueta na tela. Mensagem nova já vem gravada como "Nome · Setor";
 * antiga tinha o nome completo → mostra só o primeiro nome. Agentes ("Laís",
 * "Bianca", "WhatsApp (celular)", "Central Spin") ficam como estão.
 */
export function rotuloNaTela(m: { origem_agente_nome?: string | null; remetente_agente?: string | null; remetente?: { nome_completo?: string | null } | null }): string | null {
  const gravado = String(m.origem_agente_nome || '').trim()
  if (m.remetente?.nome_completo || (!m.remetente_agente && gravado && !gravado.startsWith('WhatsApp'))) {
    if (gravado.includes(' · ')) return gravado
    return primeiroNome(m.remetente?.nome_completo || gravado) || null
  }
  return gravado || m.remetente_agente || null
}
