/**
 * Definição dos 10 tipos de item que a Spin Solar oferece.
 * Usado no seletor visual, timeline e orçamento consolidado.
 */

export type TipoItem =
  | 'fv_ongrid' | 'fv_hibrido' | 'fv_zero_grid' | 'fv_offgrid'
  | 'bess' | 've_recarga'
  | 'srv_limpeza' | 'srv_manutencao' | 'srv_eletrica_predial' | 'srv_padrao_entrada'
  | 'srv_laudo_tecnico' | 'srv_analise_rede'
  | 'srv_retirada_recolocacao' | 'srv_instalacao_placas'
  | 'srv_alvenaria' | 'srv_serralheria' | 'srv_carpintaria'
  | 'aluguel_maquinas' | 'aluguel_equipamentos'
  | 'outros'

export type Grupo = 'fotovoltaico' | 'bateria' | 'mobilidade' | 'servico' | 'construcao' | 'aluguel' | 'outros'

export type InfoTipo = {
  chave: TipoItem
  emoji: string
  label: string
  grupo: Grupo
  descricao: string
  exemploUso: string
  disponivel: boolean          // false = em breve
  fluxoPassos: number          // qtd de passos que esse tipo tem
}

export const TIPOS_ITEM: InfoTipo[] = [
  // 🔌 FOTOVOLTAICO
  {
    chave: 'fv_ongrid', emoji: '☀️', label: 'Solar on-grid', grupo: 'fotovoltaico',
    descricao: 'Sistema conectado à rede — o padrão residencial e comercial.',
    exemploUso: '5 kWp residencial que compensa consumo mensal',
    disponivel: true,
    fluxoPassos: 8,
  },
  {
    chave: 'fv_hibrido', emoji: '🌗', label: 'Solar híbrido (com BESS)', grupo: 'fotovoltaico',
    descricao: 'Solar + baterias com backup em caso de queda de energia.',
    exemploUso: '8 kWp + BESS 10kWh pra manter geladeira e wifi ativos',
    disponivel: true,
    fluxoPassos: 9,
  },
  {
    chave: 'fv_zero_grid', emoji: '🚫🔌', label: 'Solar zero-grid', grupo: 'fotovoltaico',
    descricao: 'Injeção zero na rede (Smart Meter anti-injeção).',
    exemploUso: 'Comércio grande demanda, evita GD e taxa fio B',
    disponivel: true,
    fluxoPassos: 8,
  },
  {
    chave: 'fv_offgrid', emoji: '🏝️', label: 'Solar off-grid', grupo: 'fotovoltaico',
    descricao: 'Isolado da rede — solar + BESS obrigatório.',
    exemploUso: 'Chácara sem CELESC, sítio remoto',
    disponivel: true,
    fluxoPassos: 8,
  },

  // 🔋 BATERIA
  {
    chave: 'bess', emoji: '🔋', label: 'BESS standalone', grupo: 'bateria',
    descricao: 'Só bateria — para shift de tarifa branca / backup / peak shaving.',
    exemploUso: 'Cliente já tem solar, quer bateria pra tarifa branca',
    disponivel: true,
    fluxoPassos: 5,
  },

  // 🚗 MOBILIDADE
  {
    chave: 've_recarga', emoji: '⚡🚗', label: 'Estação recarga VE', grupo: 'mobilidade',
    descricao: 'Wallbox 7.4/11/22 kW pra carro elétrico.',
    exemploUso: 'Cliente comprou Kwid E-Tech, quer carregar em casa',
    disponivel: true,
    fluxoPassos: 4,
  },

  // 🛠️ SERVIÇOS
  {
    chave: 'srv_limpeza', emoji: '🧹', label: 'Limpeza fotovoltaica', grupo: 'servico',
    descricao: 'Limpeza técnica de módulos — pontual ou contrato.',
    exemploUso: '32 placas × 3 limpezas/ano',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'srv_manutencao', emoji: '🔧', label: 'Manutenção com revisão', grupo: 'servico',
    descricao: 'Diagnóstico + revisão + relatório técnico.',
    exemploUso: 'Sistema com problema de geração, chamado técnico',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'srv_eletrica_predial', emoji: '🏢⚡', label: 'Elétrica predial', grupo: 'servico',
    descricao: 'Instalação/reforma elétrica em imóveis (não fotovoltaica).',
    exemploUso: 'Reforma cozinha 12m² com nova iluminação',
    disponivel: true,
    fluxoPassos: 4,
  },
  {
    chave: 'srv_padrao_entrada', emoji: '📊⚡', label: 'Padrão de entrada CELESC', grupo: 'servico',
    descricao: 'Troca/upgrade do padrão pra suportar sistema maior.',
    exemploUso: 'Upgrade 40A → 63A pra habilitar 8kWp mono',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'srv_laudo_tecnico', emoji: '📋', label: 'Laudo técnico', grupo: 'servico',
    descricao: 'Emissão de laudo técnico assinado por engenheiro (FV/elétrico/estrutural).',
    exemploUso: 'Perícia sistema com problema, ART, adequação NBR',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'srv_analise_rede', emoji: '📊🔌', label: 'Análise de rede', grupo: 'servico',
    descricao: 'Medição qualidade de energia (harmônicos, tensão, THD) e diagnóstico da instalação.',
    exemploUso: 'Cliente com queima recorrente, análise antes de FV grande',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'srv_retirada_recolocacao', emoji: '🔄☀️', label: 'Retirada e recolocação de placas', grupo: 'servico',
    descricao: 'Desmontagem temporária das placas + estrutura pra obra no telhado, e remontagem depois.',
    exemploUso: 'Reforma/troca do telhado, mudança de imóvel, ampliação da laje',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'srv_instalacao_placas', emoji: '🔧☀️', label: 'Instalação de placas em projeto', grupo: 'servico',
    descricao: 'Só mão de obra: cliente já tem placas + inversor comprados (ou de terceiros). Spin instala.',
    exemploUso: 'Cliente comprou kit em outra loja e contratou Spin só pra montar',
    disponivel: true,
    fluxoPassos: 4,
  },

  // 🧱 CONSTRUÇÃO
  {
    chave: 'srv_alvenaria', emoji: '🧱', label: 'Alvenaria', grupo: 'construcao',
    descricao: 'Serviços de alvenaria — reforma, ampliação, reparo estrutural.',
    exemploUso: 'Base de concreto pra inversor, quiosque, muro de proteção',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'srv_serralheria', emoji: '⚙️', label: 'Serralheria', grupo: 'construcao',
    descricao: 'Portões, gradis, estruturas metálicas sob medida.',
    exemploUso: 'Cercamento da usina, portão de acesso, base metálica',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'srv_carpintaria', emoji: '🪵', label: 'Carpintaria', grupo: 'construcao',
    descricao: 'Trabalhos em madeira — deck, pergolado, móveis, estrutura.',
    exemploUso: 'Deck sob estrutura solar, pergolado, tesoura de telhado',
    disponivel: true,
    fluxoPassos: 3,
  },

  // 🚜 ALUGUEL
  {
    chave: 'aluguel_maquinas', emoji: '🚜', label: 'Aluguel de máquinas pesadas', grupo: 'aluguel',
    descricao: 'Locação de máquinas pesadas com operador (dia/hora).',
    exemploUso: 'Retroescavadeira · Munck · Guindaste · Escavadeira · Rolo compactador',
    disponivel: true,
    fluxoPassos: 3,
  },
  {
    chave: 'aluguel_equipamentos', emoji: '🛠️', label: 'Aluguel de equipamentos', grupo: 'aluguel',
    descricao: 'Locação de equipamentos leves (dia/diária).',
    exemploUso: 'Andaime · Plataforma elevatória · Gerador · Betoneira · Serra',
    disponivel: true,
    fluxoPassos: 3,
  },

  // 📦 OUTROS
  {
    chave: 'outros', emoji: '📦', label: 'Outros (personalizado)', grupo: 'outros',
    descricao: 'Item personalizado — descreve livremente o que a Spin vai fornecer.',
    exemploUso: 'Instalação de câmera, gerador diesel, aluguel de kit temporário',
    disponivel: true,
    fluxoPassos: 2,
  },
]

export const GRUPOS_INFO: Record<Grupo, { label: string; cor: string; bgClass: string }> = {
  fotovoltaico: { label: '☀️ Fotovoltaico',            cor: 'sol',      bgClass: 'bg-sol/10 border-sol/30' },
  bateria:      { label: '🔋 Bateria',                 cor: 'verde',    bgClass: 'bg-verde/10 border-verde/30' },
  mobilidade:   { label: '🚗 Mobilidade',              cor: 'weg-azul', bgClass: 'bg-weg-azul/10 border-weg-azul/30' },
  servico:      { label: '🛠️ Serviços técnicos',      cor: 'coral',    bgClass: 'bg-coral/10 border-coral/30' },
  construcao:   { label: '🧱 Construção',              cor: 'sol',      bgClass: 'bg-sol/5 border-sol/20' },
  aluguel:      { label: '🚜 Aluguel de equipamentos', cor: 'verde',    bgClass: 'bg-verde/5 border-verde/20' },
  outros:       { label: '📦 Outros',                  cor: 'white',    bgClass: 'bg-white/5 border-white/20' },
}

export function getInfoTipo(chave: TipoItem): InfoTipo | undefined {
  return TIPOS_ITEM.find((t) => t.chave === chave)
}

export function tiposPorGrupo(): Record<Grupo, InfoTipo[]> {
  const r: Record<Grupo, InfoTipo[]> = {
    fotovoltaico: [], bateria: [], mobilidade: [], servico: [],
    construcao: [], aluguel: [], outros: [],
  }
  for (const t of TIPOS_ITEM) r[t.grupo].push(t)
  return r
}

// ============================================================================
// PASSOS NECESSÁRIOS POR TIPO DE ITEM
// ============================================================================
// Mapa que define quais passos do workflow são relevantes pra cada tipo.
// Se projeto tem múltiplos tipos, união dos passos de todos.

export type PassoWorkflow =
  | 'cliente' | 'fatura' | 'telhado' | 'padrao' | 'dimensionar'
  | 'kit' | 'lista_ca' | 'bess_config' | 've_config' | 'servico_config'
  | 'orcamento'

export const PASSOS_POR_TIPO: Record<TipoItem, PassoWorkflow[]> = {
  // ☀️ Fotovoltaico
  fv_ongrid:     ['cliente', 'fatura', 'telhado', 'padrao', 'dimensionar', 'kit', 'lista_ca', 'orcamento'],
  fv_hibrido:    ['cliente', 'fatura', 'telhado', 'padrao', 'dimensionar', 'kit', 'lista_ca', 'bess_config', 'orcamento'],
  fv_zero_grid:  ['cliente', 'fatura', 'telhado', 'padrao', 'dimensionar', 'kit', 'lista_ca', 'orcamento'],
  fv_offgrid:    ['cliente', 'telhado', 'dimensionar', 'kit', 'bess_config', 'lista_ca', 'orcamento'],

  // 🔋 BESS
  bess:          ['cliente', 'fatura', 'padrao', 'bess_config', 'orcamento'],

  // 🚗 Mobilidade
  ve_recarga:    ['cliente', 'padrao', 've_config', 'orcamento'],

  // 🛠️ Serviços
  srv_limpeza:            ['cliente', 'servico_config', 'orcamento'],
  srv_manutencao:         ['cliente', 'servico_config', 'orcamento'],
  srv_eletrica_predial:   ['cliente', 'servico_config', 'orcamento'],
  srv_padrao_entrada:     ['cliente', 'fatura', 'padrao', 'orcamento'],
  srv_laudo_tecnico:      ['cliente', 'servico_config', 'orcamento'],
  srv_analise_rede:       ['cliente', 'servico_config', 'orcamento'],
  srv_retirada_recolocacao: ['cliente', 'telhado', 'servico_config', 'orcamento'],
  srv_instalacao_placas:    ['cliente', 'telhado', 'padrao', 'servico_config', 'orcamento'],

  // 🧱 Construção
  srv_alvenaria:          ['cliente', 'servico_config', 'orcamento'],
  srv_serralheria:        ['cliente', 'servico_config', 'orcamento'],
  srv_carpintaria:        ['cliente', 'servico_config', 'orcamento'],

  // 🚜 Aluguel
  aluguel_maquinas:       ['cliente', 'servico_config', 'orcamento'],
  aluguel_equipamentos:   ['cliente', 'servico_config', 'orcamento'],

  // 📦 Outros
  outros:        ['cliente', 'servico_config', 'orcamento'],
}

export const INFO_PASSO: Record<PassoWorkflow, { titulo: string; path: string; ordem: number }> = {
  cliente:        { titulo: 'Cliente',        path: 'editar',       ordem: 1 },
  fatura:         { titulo: 'Fatura',         path: 'fatura',       ordem: 2 },
  telhado:        { titulo: 'Telhado',        path: 'telhado',      ordem: 3 },
  padrao:         { titulo: 'Padrão',         path: 'padrao',       ordem: 4 },
  dimensionar:    { titulo: 'Dimensionar',    path: 'dimensionar',  ordem: 5 },
  kit:            { titulo: 'Kit',            path: 'kit',          ordem: 6 },
  lista_ca:       { titulo: 'Lista CA',       path: 'lista-ca',     ordem: 7 },
  bess_config:    { titulo: 'BESS híbrido',   path: 'hibrido',      ordem: 6.5 },
  ve_config:      { titulo: 'Estação VE',     path: 've',           ordem: 5.5 },
  servico_config: { titulo: 'Escopo serviço', path: 'servico',      ordem: 5.5 },
  orcamento:      { titulo: 'Orçamento',      path: 'orcamento',    ordem: 8 },
}

/**
 * Overrides do path do 'servico_config' por tipo especifico.
 * Cada tipo de servico pode ter rota propria com form dedicado
 * (calcula preco automatico com parametros da tabela admin).
 * Se o tipo nao tiver override aqui, cai no path generico 'servico'.
 */
export const PATH_SERVICO_ESPECIFICO: Partial<Record<TipoItem, string>> = {
  srv_retirada_recolocacao: 'servico-retirada',
  // Futuro:
  // srv_instalacao_placas: 'servico-instalacao',
  // srv_readequacao_planta: 'servico-readequacao',
}

/** Retorna o path correto do 'servico_config' considerando overrides por tipo. */
export function getPathPasso(chave: PassoWorkflow, tipoItem?: TipoItem): string {
  if (chave === 'servico_config' && tipoItem && PATH_SERVICO_ESPECIFICO[tipoItem]) {
    return PATH_SERVICO_ESPECIFICO[tipoItem]!
  }
  return INFO_PASSO[chave].path
}

/**
 * Retorna união dos passos necessários pros tipos selecionados.
 * Se nenhum tipo escolhido, retorna todos os 8 passos legado (on-grid puro).
 */
export function getPassosRelevantes(tipos: TipoItem[]): PassoWorkflow[] {
  if (tipos.length === 0) return PASSOS_POR_TIPO.fv_ongrid

  const unido = new Set<PassoWorkflow>()
  for (const t of tipos) {
    const passos = PASSOS_POR_TIPO[t] || []
    for (const p of passos) unido.add(p)
  }

  // Ordena por INFO_PASSO.ordem
  return Array.from(unido).sort((a, b) => INFO_PASSO[a].ordem - INFO_PASSO[b].ordem)
}

