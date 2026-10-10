/**
 * Textos fixos do roteiro da Laís pra lead novo (Kalebe 2026-10-10).
 * Regra da casa: texto que vai pro cliente só com aprovação do Kalebe — o
 * roteiro fica DESLIGADO (wa_config.lais_roteiro_ativo = false) até o OK.
 * Botões: até 20 caracteres; item de lista: até 24 (+ descrição até 72).
 */

export const SERVICOS_LAIS = [
  { id: 'srv_solar', titulo: 'Energia solar', descricao: 'Orçamento de sistema fotovoltaico', produto: 'fv_ongrid' },
  { id: 'srv_ve', titulo: 'Carregador de carro', descricao: 'Carregador para carro elétrico', produto: 've_recarga' },
  { id: 'srv_bess', titulo: 'Bateria (BESS)', descricao: 'Armazenamento de energia', produto: 'bess' },
  { id: 'srv_suporte', titulo: 'Suporte técnico', descricao: 'Ajuda com um sistema que você já tem', produto: 'srv_manutencao' },
  { id: 'srv_limpeza', titulo: 'Manutenção e limpeza', descricao: 'Limpeza e revisão de placas solares', produto: 'srv_limpeza' },
] as const
export type ServicoLais = (typeof SERVICOS_LAIS)[number]['id']

export const TEXTOS_LAIS = {
  /** 1ª mensagem: boas-vindas + o que a Spin faz + lista de atendimento */
  boasVindas: (nome: string) =>
    `Oi${nome ? `, ${nome}` : ''}! Aqui é a Laís, da Spin Solar 😊 Seja bem-vindo(a)!\n\n` +
    'A gente instala energia solar, carregadores de carro elétrico e sistemas de armazenamento de energia (BESS), ' +
    'e também faz suporte técnico, manutenção e limpeza.\n\nComo posso te ajudar hoje?',
  botaoListaServicos: 'Escolher atendimento',

  pedirEscolhaServico: 'Pra eu te direcionar certinho, escolhe uma opção 👇',

  pedirCidade: 'Perfeito! Pra eu já preparar seu atendimento: de qual cidade você fala?',

  /** Lead de energia solar: sugere a ligação */
  ofertaLigacao: (nome: string) =>
    `${nome ? `${nome}, o` : 'O'} jeito mais rápido é uma ligação curtinha com a nossa equipe comercial: ` +
    'o orçamento é montado e entregue na própria ligação — sai em uns 15 minutos. Posso agendar?',
  botaoAceitaLigacao: '📞 Pode ligar',
  botaoRecusaLigacao: 'Prefiro não',

  /** Duas opções de horário (+ "outro horário") */
  opcoesHorario: 'Tenho estes horários livres pra ligação. Qual fica melhor pra você?',
  botaoOutroHorario: 'Outro horário',

  /** Lead não quis as opções */
  perguntarMelhorMomento: 'Sem problema! Qual o melhor momento do dia pra gente te ligar? É bem rapidinho. ' +
    'Pode me dizer um horário (ex.: 15h) ou só se prefere manhã ou tarde.',

  /** Confirmação com botão de aceite */
  confirmarLigacao: (consultor: string, quando: string) =>
    `Combinado! ${consultor}, da nossa equipe comercial, vai te ligar ${quando} 📞\nToque em *Confirmar* pra garantir o horário.`,
  botaoConfirmar: '✅ Confirmar',

  ligacaoConfirmada: (consultor: string, quando: string) =>
    `Ligação confirmada ✅ ${consultor} te liga ${quando}. Uns minutinhos antes eu te lembro por aqui.`,

  horarioOcupou: 'Ops, esse horário acabou de ser ocupado 😅 Separei outras opções pra você:',
  horarioIndisponivel: 'Nesse horário não tenho consultor livre 😕 Consigo nestes:',
  semHorario: 'No momento não consegui um horário livre na agenda — já passei seu contato pra equipe comercial e um consultor te chama em instantes.',

  /** Mensagem fora do roteiro depois de agendado */
  lembrarAgendado: (consultor: string, quando: string) => `Tá tudo certo: ${consultor} te liga ${quando}. Qualquer coisa, é só me chamar por aqui!`,

  /** Lembrete 5 min antes (cliente) */
  lembreteCliente: (nome: string, consultor: string) =>
    `${nome ? `${nome}, d` : 'D'}aqui a 5 minutinhos ${consultor} te liga pra apresentar seu orçamento de energia solar 📞 Fica de olho no telefone!`,
}
