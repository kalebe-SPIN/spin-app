import type { ItemChecklist } from './comum'

/**
 * Checklist da ordem de serviço por tipo (Kalebe 2026-10-05). RASCUNHO pra
 * revisão do Kalebe — procedimentos técnicos, editáveis aqui. Regras Spin já
 * aplicadas: strings direto no MPPT (sem stringbox CC); quadro CA com
 * disjuntor FV + DPS.
 */

const INICIO = [
  'Conferir endereço e identificar o cliente/responsável',
  'Avaliar segurança do local (acesso, telhado, EPI, condições do tempo)',
  'Fotos ANTES do serviço',
]
const FIM = [
  'Fotos DEPOIS do serviço',
  'Local limpo e organizado (sem sobras de material)',
  'Explicar ao cliente o que foi feito',
]

const POR_TIPO: Record<string, string[]> = {
  srv_limpeza: [
    'Desligar o sistema (disjuntor CA e chave CC do inversor)',
    'Limpeza dos módulos com água e escova macia — sem produto abrasivo',
    'Inspeção visual: trincas, manchas, hot spots, sujeira persistente',
    'Religar o sistema e conferir que o inversor voltou a gerar',
  ],
  srv_manutencao: [
    'Inspeção visual de módulos, estrutura e fixações',
    'Reaperto das conexões CA e conferência dos conectores MC4',
    'Medição de tensão das strings (Voc) — anotar nas observações',
    'Conferir aterramento e DPS',
    'Conferir inversor: alarmes, histórico e geração no app',
  ],
  srv_instalacao_placas: [
    'Conferir material recebido × lista do projeto',
    'Fixação da estrutura e dos módulos conforme o projeto',
    'Strings ligadas direto no MPPT do inversor (sem stringbox CC)',
    'Quadro de proteção CA (disjuntor FV + DPS) e aterramento',
    'Comissionamento: inversor ligado, gerando e conectado ao app',
    'Placas de advertência instaladas',
  ],
  srv_retirada_recolocacao: [
    'Desligar o sistema (CA e CC)',
    'Retirada dos módulos identificando a posição de cada um',
    'Armazenamento seguro dos módulos',
    'Recolocação conforme o layout original',
    'Religar e conferir geração',
  ],
  srv_padrao_entrada: [
    'Conferir projeto/orientação da concessionária',
    'Montagem do padrão conforme norma CELESC',
    'Aterramento e identificação do padrão',
    'Teste de funcionamento',
  ],
  srv_eletrica_predial: [
    'Desenergizar o circuito antes de intervir',
    'Executar o serviço descrito na demanda',
    'Teste de funcionamento e identificação dos circuitos',
  ],
  ve_recarga: [
    'Conferir circuito dedicado e proteção (disjuntor/DR) da estação',
    'Fixação da estação de recarga',
    'Teste de recarga com o veículo ou simulador',
    'Configurar app/estação com o cliente',
  ],
}
POR_TIPO.fv_ongrid = POR_TIPO.srv_instalacao_placas
POR_TIPO.fv_hibrido = [...POR_TIPO.srv_instalacao_placas, 'Baterias instaladas, ligadas e reconhecidas pelo inversor híbrido']

export function checklistPadrao(tipo: string): ItemChecklist[] {
  const meio = POR_TIPO[tipo] || ['Executar o serviço descrito na demanda']
  return [...INICIO, ...meio, ...FIM].map((item) => ({ item, feito: false, obs: null }))
}
