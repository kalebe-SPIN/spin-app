/**
 * Modelos de mensagem (templates) da Spin na Meta — fonte única do texto
 * (Kalebe 2026-09-27; aprovados pra envio em 2026-09-30).
 *
 * Fora da janela de 24h — ou quando o cliente nunca escreveu — a Meta só
 * entrega mensagem por modelo aprovado. Quando o cliente responde (ou toca no
 * botão), a janela reabre por 24h e o inbox volta a mandar texto livre.
 *
 * Sem imports: usado pelo envio (lib/whatsapp/templates.ts) e pelo script de
 * criação na Meta (scripts/criar-templates-meta.ts).
 */

export const WABA_ID_SPIN = '286157384591672'

export type ChaveTemplate = 'retomar_atendimento' | 'aviso_interno' | 'etapa_concluida' | 'lead_novo' | 'proposta_pronta' | 'mensagem_atendimento'

export type DefinicaoTemplate = {
  nome: string
  idioma: string
  categoria: 'UTILITY'
  corpo: string
  exemplo: string[]
  botoes_resposta?: string[]
  /** Botão de link com final variável ({{1}} = sufixo mandado em cada envio) */
  botao_url?: { texto: string; url: string; exemplo: string }
}

export const URL_PROPOSTA = 'https://app.spinsolar.com.br/proposta/'

export const DEFINICOES_TEMPLATES: Record<ChaveTemplate, DefinicaoTemplate> = {
  // Follow-up da Bianca, 1º contato e botão "reabrir" do inbox
  retomar_atendimento: {
    nome: 'spin_retomar_atendimento',
    idioma: 'pt_BR',
    categoria: 'UTILITY',
    corpo: 'Olá, {{1}}! Aqui é {{2}}, da Spin Solar. Estou dando continuidade ao seu atendimento sobre {{3}}. Podemos continuar a conversa por aqui?',
    exemplo: ['Luciane', 'Kalebe', 'o seu projeto de energia solar'],
    botoes_resposta: ['Sim, pode falar'],
  },
  // Aviso dos agentes pra equipe quando a janela está fechada
  aviso_interno: {
    nome: 'spin_aviso_interno',
    idioma: 'pt_BR',
    categoria: 'UTILITY',
    corpo: 'Olá, {{1}}! Você tem um novo aviso de {{2}} no portal Spin Solar:\n\n{{3}}\n\nAbra o portal para ver os detalhes.',
    exemplo: ['Kalebe', 'Bianca', 'A proposta do projeto SPIN-2026-0021 está há 5 dias sem retorno do cliente.'],
  },
  // Aviso ao cliente de etapa do serviço concluída
  etapa_concluida: {
    nome: 'spin_etapa_concluida',
    idioma: 'pt_BR',
    categoria: 'UTILITY',
    corpo: 'Olá, {{1}}! Temos uma novidade sobre o seu projeto de energia solar com a Spin Solar: a etapa *{{2}}* foi concluída.\n\n{{3}}\n\nQualquer dúvida, é só responder esta mensagem.',
    exemplo: ['Maria', 'aprovação do projeto pela CELESC', 'O próximo passo é a instalação — nossa equipe vai combinar a data com você.'],
  },
  // Anúncio de lead pros representantes, com botão de aceite
  lead_novo: {
    nome: 'spin_lead_novo',
    idioma: 'pt_BR',
    categoria: 'UTILITY',
    corpo: '🎯 Novo lead disponível na Spin Solar!\n\n{{1}}\n\nQuem aceitar primeiro tem {{2}} minutos de preferência para entrar em contato pelo canal Spin.',
    exemplo: ['Maria Souza · Palhoça · fatura anexada', '8'],
    botoes_resposta: ['Aceitar lead'],
  },
  // Proposta com botão que abre o PDF — sai mesmo com a janela de 24h fechada
  // (aprovado pelo Kalebe em 2026-09-30)
  proposta_pronta: {
    nome: 'spin_proposta_pronta',
    idioma: 'pt_BR',
    categoria: 'UTILITY',
    corpo: 'Olá, {{1}}! Aqui é {{2}}, da Spin Solar.\nA sua proposta de {{3}} está pronta.\n\nToque no botão abaixo para abrir o PDF. Qualquer dúvida, é só responder esta mensagem.',
    exemplo: ['Paulo', 'Kalebe', 'energia solar'],
    botao_url: { texto: 'Ver proposta', url: `${URL_PROPOSTA}{{1}}`, exemplo: `${URL_PROPOSTA}exemplo/proposta.pdf` },
  },
  // Kalebe 2026-10-06: "falar sem barreiras" — com a janela de 24h fechada, o
  // texto digitado no inbox vai dentro deste modelo ({{3}} = a mensagem).
  // RASCUNHO: só criar na Meta depois do OK do Kalebe no texto.
  mensagem_atendimento: {
    nome: 'spin_mensagem_atendimento',
    idioma: 'pt_BR',
    categoria: 'UTILITY',
    corpo: 'Olá, {{1}}! Aqui é {{2}}, da Spin Solar, sobre o seu atendimento:\n\n{{3}}\n\nÉ só responder por aqui.',
    exemplo: ['Luciane', 'Kalebe', 'A CELESC aprovou o seu projeto e a instalação já pode ser agendada. Qual dia da próxima semana fica melhor para você?'],
  },
}

/** Corpo do POST /{WABA}/message_templates pra criar o modelo na Meta. */
export function payloadCriacao(def: DefinicaoTemplate) {
  const components: any[] = [
    { type: 'BODY', text: def.corpo, example: { body_text: [def.exemplo] } },
  ]
  if (def.botoes_resposta?.length) {
    components.push({ type: 'BUTTONS', buttons: def.botoes_resposta.map((text) => ({ type: 'QUICK_REPLY', text })) })
  }
  if (def.botao_url) {
    components.push({ type: 'BUTTONS', buttons: [{ type: 'URL', text: def.botao_url.texto, url: def.botao_url.url, example: [def.botao_url.exemplo] }] })
  }
  return { name: def.nome, language: def.idioma, category: def.categoria, components }
}

export function renderizarTemplate(corpo: string, params: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}
