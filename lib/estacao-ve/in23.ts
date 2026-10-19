/**
 * IN 23 do CBMSC — locais com Sistema de Alimentação para Veículos Elétricos
 * (SAVE), vigente desde 25/06/2026 (Kalebe 2026-10-17: "use essa instrução
 * para aperfeiçoar o orçamento, proposta, projeto e execução e padronize").
 *
 * Fonte única das regras: o orçamento (materiais e serviços), o PDF da
 * proposta, o memorial técnico e o checklist de campo leem daqui.
 *
 * Resumo do que a IN pede (artigos citados nos textos):
 *  - art. 7º  instalação conforme NBR 5410 e NBR 17019
 *  - art. 8º  carregador certificado (NBR IEC 61851); modo 1 proibido; modo 2
 *             só em área externa protegida; modos 3 e 4 livres
 *  - art. 9º  um ponto de desligamento manual de todas as estações por
 *             pavimento, a até 5 m da escada/acesso, entre 0,90 e 1,35 m do
 *             piso (preexistente: pode ser em cada estação, ou a até 5 m dela)
 *  - art. 10  placa fotoluminescente branca sobre vermelho, letras maiúsculas
 *             ≥ 10 mm, "VEÍCULOS ELÉTRICOS" + "EMERGÊNCIA" + "DESLIGUE OS
 *             CARREGADORES", base a 1,80 m (dispensada se o próprio carregador
 *             tem botão de emergência, no desligamento por estação)
 *  - art. 11  vagas com SAVE sinalizadas (forma definida pelo RT)
 *  - art. 12  seccionamento do SAVE junto ao quadro geral, identificado (IN 19)
 *  - art. 13  responsabilidade do RT/instaladora junto com o proprietário
 *  - art. 14  manutenção periódica da IN 19
 *  - art. 15  uma só rota de saída: vaga a ≥ 5 m de portas, elevadores e saídas
 *  - art. 16  afastamento de inflamáveis/GLP pelas INs de fontes de ignição
 *  - art. 17  local coberto sem dispensa do art. 6º: detecção automática
 *  - art. 6º  dispensa do Projeto Baseado em Desempenho (PBD) — senão, PBD
 *  - art. 38/39  regularização no e-SCI só depois da execução completa:
 *             Anexo B (dispensa) ou Anexo A (PBD) + DRT/ART + croqui; cada
 *             ponto novo, nova regularização
 *  - art. 40  preexistente com SAVE já instalado: 2 anos (até 25/06/2028)
 *
 * Residência unifamiliar não é fiscalizada pelo CBMSC (Lei 16.157/2013) —
 * a IN 23 não se aplica, mas a NBR 5410/NBR 17019 continuam valendo (DR).
 *
 * Módulo puro (sem banco).
 */

export const IN23_VIGENCIA = '25/06/2026'
export const IN23_PRAZO_PREEXISTENTES = '25/06/2028'

/** A→Z (rótulos) */
export type TipoLocalRecarga = 'comercial' | 'condominio' | 'residencia'
export const TIPOS_LOCAL: Array<{ tipo: TipoLocalRecarga; rotulo: string }> = [
  { tipo: 'comercial', rotulo: 'Comércio, empresa ou estacionamento' },
  { tipo: 'condominio', rotulo: 'Condomínio ou edifício (garagem coletiva)' },
  { tipo: 'residencia', rotulo: 'Residência unifamiliar (casa)' },
]

/** Do mais aberto ao mais fechado (a ordem carrega sentido) */
export type AmbienteRecarga = 'externo_descoberto' | 'cobertura_leve' | 'coberto_aberto' | 'fechado' | 'subsolo'
export const AMBIENTES: Array<{ tipo: AmbienteRecarga; rotulo: string; detalhe: string }> = [
  { tipo: 'externo_descoberto', rotulo: 'Externo e descoberto', detalhe: 'ao ar livre, fora da projeção da edificação' },
  { tipo: 'cobertura_leve', rotulo: 'Externo com cobertura leve', detalhe: 'só telhado simples (fibrocimento, metálica), sem fechamento lateral' },
  { tipo: 'coberto_aberto', rotulo: 'Coberto, aberto nas laterais', detalhe: 'sob a edificação ou laje, com laterais abertas' },
  { tipo: 'fechado', rotulo: 'Garagem fechada', detalhe: 'acima do nível do solo' },
  { tipo: 'subsolo', rotulo: 'Subsolo', detalhe: 'abaixo do nível do solo' },
]

export type RespostasIN23 = {
  /** null = ainda não informado (o PDF não sai sem isso) */
  tipo_local: TipoLocalRecarga | null
  /** Residência: aplicar a IN 23 mesmo assim (ex.: casa dentro de condomínio com PPCI) */
  aplicar_mesmo_assim?: boolean
  ambiente: AmbienteRecarga
  /** Concluída ou com PPCI aprovado até 25/06/2026 (art. 3º, III) */
  preexistente: boolean
  /** Ocupação A-1, A-2, C-1, C-2, D ou H-4 (confira no PPCI) — dispensas III e IV do art. 6º */
  ocupacao_art6: boolean
  // Sistemas e medidas de segurança contra incêndio (SMSCI) que o local já tem
  deteccao: boolean
  sprinklers: boolean
  extracao_fumaca: boolean
  /** Aberturas permanentes em 2 lados: ≥ 20% da área das fachadas e ≥ 40% do perímetro (art. 6º § 1º) */
  ventilacao_natural: boolean
  compartimentacao: boolean
  /** Área da ocupação onde fica o SAVE (art. 6º § 3º) e do maior pavimento */
  area_total_m2: number
  area_pavimento_m2: number
  /** Pavimentos com recarga — um ponto de desligamento por pavimento (art. 9º) */
  pavimentos: number
  /** Preexistente: desligamento em cada estação, em vez do ponto único (art. 9º § 1º) */
  desligamento_por_estacao: boolean
  /** O carregador tem botão de emergência próprio (art. 10, parágrafo único, II) */
  botao_no_equipamento: boolean
  /** Metros do ponto de desligamento até o quadro da estação (cabo de comando) */
  distancia_desligamento_m: number
  /** A edificação tem uma só rota de saída (art. 15) */
  rota_unica: boolean
  /** Vaga a 5 m ou mais de portas, elevadores e saídas */
  afastamento_saida_ok: boolean
  /** Quem faz o PBD (quando exigido) e a regularização no e-SCI */
  pbd_pelo_cliente: boolean
  regularizacao_pelo_cliente: boolean
}

export function in23Padrao(): RespostasIN23 {
  return {
    tipo_local: null, ambiente: 'fechado', preexistente: true, ocupacao_art6: true,
    deteccao: false, sprinklers: false, extracao_fumaca: false, ventilacao_natural: false, compartimentacao: false,
    area_total_m2: 0, area_pavimento_m2: 0, pavimentos: 1,
    desligamento_por_estacao: false, botao_no_equipamento: false, distancia_desligamento_m: 0,
    rota_unica: false, afastamento_saida_ok: true,
    pbd_pelo_cliente: false, regularizacao_pelo_cliente: false,
  }
}

export type EnquadramentoIN23 = {
  /** IN 23 vale pra este local (fiscalizado pelo CBMSC) */
  aplica: boolean
  /** Por que aplica ou não (uma frase) */
  motivo: string
  dispensa_pbd: boolean
  /** Hipótese de dispensa do art. 6º — como no Anexo B */
  hipotese: string | null
  /** Relatório do e-SCI: B (dispensa do PBD) ou A (PBD) */
  anexo: 'A' | 'B' | null
  /** Pontos de desligamento manual e placas de sinalização a instalar */
  pontos_desligamento: number
  placas_desligamento: number
  vagas: number
  /** O que a Spin executa/entrega (PDF, memorial e checklist) */
  exigencias: string[]
  /** O que fica com o cliente/condomínio */
  cliente: string[]
  /** Atenção: impeditivos e o que conferir (tela) */
  alertas: string[]
}

const m2 = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} m²`

/** Hipótese de dispensa do PBD (art. 6º), na ordem do artigo; null = exige PBD. */
function hipoteseDispensa(r: RespostasIN23): string | null {
  if (r.ambiente === 'externo_descoberto' || r.ambiente === 'cobertura_leve') {
    return 'Art. 6º, I — local externo e descoberto ou com cobertura leve'
  }
  if (r.deteccao && r.sprinklers && (r.extracao_fumaca || r.ventilacao_natural)) {
    return `Art. 6º, II — detecção automática, ${r.extracao_fumaca ? 'extração mecânica de fumaça' : 'ventilação natural'} e chuveiros automáticos`
  }
  if (!r.ocupacao_art6) return null
  if (r.preexistente && r.compartimentacao && r.deteccao) {
    return 'Art. 6º, III — edificação preexistente com compartimentação em relação às rotas de fuga e detecção automática'
  }
  const area = Number(r.area_total_m2) || 0
  const pav = Number(r.area_pavimento_m2) || 0
  if (area > 0 && area <= 1500) {
    if (r.ventilacao_natural && r.deteccao) {
      return `Art. 6º, IV, a — área de até 1.500 m² (${m2(area)}) com ventilação natural e detecção automática`
    }
    if (pav > 0 && pav <= 500) {
      if (r.ventilacao_natural) return `Art. 6º, IV, b — até 1.500 m² e pavimentos de até 500 m² (${m2(pav)}) com ventilação natural`
      if (r.compartimentacao && r.deteccao) {
        return `Art. 6º, IV, b — até 1.500 m² e pavimentos de até 500 m² (${m2(pav)}) com compartimentação das saídas e detecção automática`
      }
    }
  }
  return null
}

export function enquadrarIN23(r: RespostasIN23 | null | undefined, qtdCarregadores: number): EnquadramentoIN23 {
  const vagas = Math.max(0, Math.round(qtdCarregadores))
  const base: EnquadramentoIN23 = {
    aplica: false, motivo: '', dispensa_pbd: true, hipotese: null, anexo: null,
    pontos_desligamento: 0, placas_desligamento: 0, vagas, exigencias: [], cliente: [], alertas: [],
  }
  const nbr = 'Circuito dedicado por carregador, com disjuntor, DR 30 mA e DPS, conforme NBR 5410 e NBR 17019'
  const certificado = 'Carregador modo 3 (wallbox) com certificado de conformidade, conforme NBR IEC 61851'
  if (!r || !r.tipo_local) return { ...base, motivo: 'Tipo de local não informado' }

  if (r.tipo_local === 'residencia' && !r.aplicar_mesmo_assim) {
    return {
      ...base,
      motivo: 'Residência unifamiliar: fora da fiscalização do CBMSC (Lei 16.157/2013) — a IN 23 não se aplica',
      exigencias: [nbr, certificado],
    }
  }

  const hipotese = hipoteseDispensa(r)
  const dispensa = !!hipotese
  const porEstacao = r.desligamento_por_estacao && r.preexistente
  const pontos = porEstacao ? (r.botao_no_equipamento ? 0 : vagas) : Math.max(1, Math.round(Number(r.pavimentos) || 1))
  const placas = pontos
  const coberto = r.ambiente === 'coberto_aberto' || r.ambiente === 'fechado' || r.ambiente === 'subsolo'
  const alertas: string[] = []
  const exigencias: string[] = [nbr, certificado]

  if (porEstacao) {
    exigencias.push(r.botao_no_equipamento
      ? 'Desligamento de emergência pelo botão do próprio carregador, em cada estação (art. 9º § 1º; sinalização dispensada — art. 10, parágrafo único, II)'
      : `Dispositivo de desligamento manual em cada estação ou a até 5,00 m dela — ${pontos} ponto${pontos === 1 ? '' : 's'}, entre 0,90 m e 1,35 m do piso (art. 9º § 1º e § 2º)`)
  } else {
    exigencias.push(`Ponto único de desligamento manual de todas as estações por pavimento, a até 5,00 m da escada ou do acesso da garagem, entre 0,90 m e 1,35 m do piso — ${pontos} ponto${pontos === 1 ? '' : 's'} (art. 9º)`)
  }
  if (placas > 0) {
    exigencias.push(`Placa fotoluminescente no ponto de desligamento: branco sobre vermelho, letras maiúsculas de 10 mm ou mais, "VEÍCULOS ELÉTRICOS — EMERGÊNCIA — DESLIGUE OS CARREGADORES", com a base a 1,80 m do piso${porEstacao ? ', indicando qual carregador cada dispositivo desliga' : ''} (art. 10)`)
  }
  if (vagas > 0) exigencias.push(`Sinalização da${vagas === 1 ? '' : 's'} ${vagas} vaga${vagas === 1 ? '' : 's'} com recarga (art. 11)`)
  exigencias.push('Seccionamento da alimentação das estações junto ao quadro geral da edificação, identificado, sem desligar os sistemas de segurança contra incêndio (art. 12 e IN 19)')
  if (r.rota_unica) exigencias.push('Vaga a 5,00 m ou mais de portas, elevadores e saídas — medido pelo perímetro da vaga (art. 15)')
  exigencias.push('Afastamento das áreas com líquidos inflamáveis e GLP conforme as INs de fontes de ignição (art. 16)')
  if (!r.regularizacao_pelo_cliente) {
    exigencias.push(`Regularização no e-SCI do CBMSC após a execução completa: relatório do Anexo ${dispensa ? 'B (dispensa do PBD)' : 'A (PBD)'}, croqui de localização das estações e ART (art. 38)`)
  }
  if (!dispensa && !r.pbd_pelo_cliente) {
    exigencias.push('Projeto Baseado em Desempenho (PBD) assinado por responsável técnico, conforme os arts. 19 a 37 da IN 23')
  }

  const cliente: string[] = [
    'Manter e conservar os sistemas de segurança contra incêndio da edificação (PPCI) — detecção, chuveiros automáticos, extração de fumaça e compartimentação não fazem parte deste escopo',
    'Manutenção periódica das instalações das estações igual à das instalações elétricas de baixa tensão (art. 14 e IN 19)',
    'Responsabilidade pela instalação e pelo uso dividida entre a empresa instaladora/RT e o proprietário ou responsável pelo uso (art. 13)',
    'Cada novo ponto de recarga instalado depois exige nova regularização no CBMSC (art. 39)',
  ]
  if (!dispensa && r.pbd_pelo_cliente) cliente.unshift('Projeto Baseado em Desempenho (PBD), por responsável técnico contratado pelo cliente')
  if (r.regularizacao_pelo_cliente) cliente.unshift('Regularização no e-SCI do CBMSC (Anexo A ou B, croqui e ART)')

  if (r.desligamento_por_estacao && !r.preexistente) {
    alertas.push('Desligamento em cada estação só vale pra edificação preexistente (art. 9º § 1º) — considerado o ponto único por pavimento')
  }
  if (!dispensa) {
    alertas.push(`O local não se enquadra nas dispensas do art. 6º: exige PBD (Anexo A)${r.pbd_pelo_cliente ? ' — por conta do cliente' : ''}`)
    if (coberto && !r.deteccao) {
      alertas.push(r.ambiente === 'coberto_aberto'
        ? 'Local coberto sem detecção automática: a IN 23 exige detecção (art. 17), salvo se o PBD comprovar a dissipação de gases e calor (§ 1º — não vale pra grupo F acima de 200 pessoas e shopping)'
        : 'Local coberto sem detecção automática: a IN 23 exige detecção (art. 17) — sistema da edificação, fora do escopo da Spin')
    }
    if (r.ambiente === 'subsolo') alertas.push('Subsolo: o PBD usa fator de segurança de 1,3 no tempo de evacuação (art. 31)')
  }
  if (r.rota_unica && !r.afastamento_saida_ok) {
    alertas.push(r.preexistente
      ? 'Vaga a menos de 5 m da única saída: o RT precisa avaliar e prever barreira física contra chamas e calor (art. 15 § 2º) — orce a barreira em "Adicionar item"'
      : 'Vaga a menos de 5 m da única saída: em edificação nova a IN 23 não admite (art. 15) — mude a vaga')
  }
  if (!dispensa && (r.ambiente === 'fechado' || r.ambiente === 'subsolo') && r.ocupacao_art6 && !(Number(r.area_total_m2) > 0)) {
    alertas.push('Informe a área do local: até 1.500 m² pode dispensar o PBD (art. 6º, IV)')
  }

  return {
    aplica: true,
    motivo: r.tipo_local === 'residencia' ? 'Residência com a IN 23 aplicada a pedido' : 'Edificação fiscalizada pelo CBMSC — IN 23 obrigatória',
    dispensa_pbd: dispensa,
    hipotese,
    anexo: dispensa ? 'B' : 'A',
    pontos_desligamento: pontos,
    placas_desligamento: placas,
    vagas,
    exigencias,
    cliente,
    alertas,
  }
}

/**
 * Itens do checklist de campo da estação de recarga (execução). Sem as
 * respostas (proposta antiga): o básico da NBR 17019.
 */
export function checklistRecargaIN23(r: RespostasIN23 | null | undefined, qtdCarregadores: number): string[] {
  const itens = [
    'Conferir o carregador: modo 3, certificado de conformidade (NBR IEC 61851) — foto da etiqueta',
    'Circuito dedicado por carregador com disjuntor, DR 30 mA e DPS — testar o DR no botão de teste',
    'Fixação da estação de recarga',
    'Teste de recarga com o veículo ou simulador',
  ]
  const e = enquadrarIN23(r, qtdCarregadores)
  if (e.aplica) {
    if (e.pontos_desligamento > 0) {
      itens.push(r?.desligamento_por_estacao && r?.preexistente
        ? 'Desligamento manual em cada estação (ou a até 5 m dela), entre 0,90 m e 1,35 m do piso — IN 23 art. 9º'
        : 'Ponto único de desligamento por pavimento a até 5 m da escada/acesso, entre 0,90 m e 1,35 m do piso — IN 23 art. 9º')
      itens.push('Testar o desligamento de emergência: todas as estações ligadas a ele desligam')
    }
    if (e.placas_desligamento > 0) itens.push('Placa fotoluminescente (branco sobre vermelho, letras de 10 mm ou mais) com a base a 1,80 m do piso — art. 10')
    itens.push('Vagas com recarga sinalizadas — art. 11')
    itens.push('Seccionamento das estações identificado junto ao quadro geral, sem cortar os sistemas de incêndio — art. 12')
    if (r?.rota_unica) itens.push('Vaga a 5 m ou mais de portas, elevadores e saídas (ou barreira física prevista pelo RT) — art. 15')
    itens.push('Afastamento de inflamáveis e GLP conferido — art. 16')
    itens.push('Fotos e medidas pro croqui do e-SCI: vagas, ponto de desligamento, quadro e acessos')
    itens.push(`Depois de concluir: regularizar no e-SCI (Anexo ${e.anexo}, croqui e ART) — art. 38`)
  }
  itens.push('Configurar app/estação com o cliente')
  return itens
}
