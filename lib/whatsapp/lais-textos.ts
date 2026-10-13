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

/**
 * Perguntas com opções (o lead toca na certa). Ordem do roteiro. Lista até 10
 * opções (título até 24); botões até 3 (título até 20).
 */
export const PERGUNTAS_LAIS: Array<{
  chave: 'tipo_telhado' | 'area' | 'aguas' | 'material_estrutura' | 'sombreamento' | 'tipo_rede' | 'disjuntor'
  texto: string
  botao_lista?: string
  opcoes: Array<{ id: string; titulo: string }>
}> = [
  { chave: 'tipo_telhado', texto: 'Qual o tipo de telhado?', botao_lista: 'Ver tipos', opcoes: [
    { id: 'ceramica_colonial', titulo: 'Cerâmica colonial' }, { id: 'ceramica_francesa', titulo: 'Cerâmica francesa' },
    { id: 'fibrocimento', titulo: 'Fibrocimento' }, { id: 'metalico_trapezoidal', titulo: 'Metálico trapezoidal' },
    { id: 'metalico_onda', titulo: 'Metálico ondulado' }, { id: 'laje_impermeabilizada', titulo: 'Laje' },
    { id: 'solo', titulo: 'No chão (solo)' }, { id: 'carport', titulo: 'Garagem (carport)' } ] },
  { chave: 'area', texto: 'Qual a área total do imóvel, mais ou menos?', botao_lista: 'Ver opções', opcoes: [
    { id: 'ate_100', titulo: 'Até 100 m²' }, { id: '100_200', titulo: 'De 100 a 200 m²' },
    { id: '200_400', titulo: 'De 200 a 400 m²' }, { id: 'acima_400', titulo: 'Acima de 400 m²' } ] },
  { chave: 'aguas', texto: 'Quantas águas tem o telhado?', botao_lista: 'Ver opções', opcoes: [
    { id: '1', titulo: '1 água' }, { id: '2', titulo: '2 águas' }, { id: '3', titulo: '3 águas' },
    { id: '4', titulo: '4 águas' }, { id: '5', titulo: '5 ou mais' } ] },
  { chave: 'material_estrutura', texto: 'A estrutura do telhado é de qual material?', opcoes: [
    { id: 'madeira', titulo: 'Madeira' }, { id: 'metalica', titulo: 'Metálica' }, { id: 'concreto', titulo: 'Concreto' } ] },
  { chave: 'sombreamento', texto: 'Tem alguma sombra que bate no telhado (árvore, prédio, caixa d’água)?', opcoes: [
    { id: 'sim', titulo: 'Sim, tem sombra' }, { id: 'nao', titulo: 'Não tem' } ] },
  { chave: 'tipo_rede', texto: 'Qual o tipo de rede da sua casa? (está na fatura ou no padrão)', opcoes: [
    { id: 'monofasico', titulo: 'Monofásica' }, { id: 'bifasico', titulo: 'Bifásica' }, { id: 'trifasico', titulo: 'Trifásica' } ] },
  { chave: 'disjuntor', texto: 'Qual a corrente do disjuntor do relógio, na rua? (vem escrito no disjuntor, ex.: 50 A)', botao_lista: 'Ver opções', opcoes: [
    { id: '40', titulo: '40 A' }, { id: '50', titulo: '50 A' }, { id: '63', titulo: '63 A' }, { id: '70', titulo: '70 A' },
    { id: '80', titulo: '80 A' }, { id: '100', titulo: '100 A' }, { id: '125', titulo: '125 A' }, { id: 'nao_sei', titulo: 'Não sei' } ] },
]
/** Faixa de área → valor guardado no perfil (meio da faixa) */
export const AREA_DA_FAIXA: Record<string, number> = { ate_100: 80, '100_200': 150, '200_400': 300, acima_400: 500 }

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

  // ── Lead que não quer ligação ──
  semLigacao: 'Sem problema! Monto seu orçamento por aqui mesmo. O que fica melhor pra você?',
  botaoEnviarFatura: '📄 Enviar a fatura',
  botaoResponderPerguntas: '💬 Responder perguntas',
  pedirFatura: 'Pode me mandar a sua fatura de energia em PDF (ou uma foto bem nítida) 📄',
  faturaNaoLida: 'Não consegui ler essa fatura 😕 Pode me mandar de novo, de preferência em PDF?',
  confirmarEnderecoFatura: (endereco: string) =>
    `Recebi sua fatura, obrigada! Fiquei com uma dúvida no endereço da instalação — na fatura está assim:\n*${endereco}*\nPode me confirmar o que falta (rua, número, bairro)?`,
  pedirEmail: 'Pra eu colocar na proposta: qual o seu e-mail?',
  emailInvalido: 'Acho que esse e-mail ficou incompleto 😅 Pode me mandar de novo?',
  introPerguntas: 'Agora umas perguntinhas rápidas sobre o imóvel — é só tocar na opção certa 👇',
  modoEquipamentos: 'Como você prefere que a gente escolha os equipamentos?',
  botaoJaSeiConfiguracao: 'Já sei o que quero',
  botaoPeloValorConta: 'Pelo valor da conta',
  pedirConfiguracao: 'Me conta: quantas placas e qual inversor você tem em mente? Pode escrever do seu jeito (ex.: 10 placas e inversor de 5 kW).',
  pedirContaInverno: 'Quanto vem a sua conta de luz no inverno, mais ou menos? (em R$)',
  pedirContaVerao: 'E no verão, quanto costuma vir? (em R$)',
  naoEntendiValor: 'Não entendi o valor 😅 Pode me mandar só o número? (ex.: 450)',
  preparandoOrcamento: 'Perfeito, já tenho tudo! Vou montar seu orçamento e te envio em instantes 😊',
  orcamentoEmPreparo: 'Seu orçamento está sendo finalizado — já te envio por aqui 😊',
  falhaOrcamento: 'Tive um probleminha pra montar o orçamento por aqui — já passei pra nossa equipe comercial, que te chama em instantes.',

  /** Legenda do PDF do orçamento (vai junto com o arquivo, depois da aprovação do admin) */
  legendaOrcamento: (nome: string) =>
    `${nome ? `${nome}, aqui` : 'Aqui'} está o seu orçamento de energia solar ☀️ Qualquer dúvida, é só me chamar por aqui!`,

  /** Lembrete 5 min antes (cliente) */
  lembreteCliente: (nome: string, consultor: string) =>
    `${nome ? `${nome}, d` : 'D'}aqui a 5 minutinhos ${consultor} te liga pra apresentar seu orçamento de energia solar 📞 Fica de olho no telefone!`,
}
