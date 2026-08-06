/**
 * Texto-base do Contrato de Representação Comercial (Serviços de O&M).
 *
 * ⚠️ ATENÇÃO KALEBE: os campos entre {{ }} são placeholders. Antes de usar
 * como contrato DEFINITIVO registrado (Lei 4.886/65), preencha os dados de
 * CNPJ/endereço da Spin e revise as cláusulas com o jurídico. O aceite/assinatura
 * digital aqui vale como assinatura eletrônica simples (MP 2.200-2, Lei 14.063/20)
 * — uma trilha de auditoria (nome, CPF, IP, data/hora, hash do documento).
 *
 * Os valores comerciais vêm de lib/proposta-om.ts (fonte única) — não invente novos.
 */
import {
  FIXO_MENSAL, GARANTIA_ESCALONADA, MULTIPLICADOR_LABEL, COMISSAO_FAIXAS,
} from '@/lib/proposta-om'

export const CONTRATO_VERSAO = 'v1'

const brl2 = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const faixasContrato = COMISSAO_FAIXAS
  .map((f) => `     - ${f.faixa}: ${f.pct === '—' ? 'sem comissão' : f.pct};`)
  .join('\n')

const garantidoContrato = GARANTIA_ESCALONADA
  .map((g) => `${g.mes}º mês ${brl2(g.valor)}`)
  .join('; ')

export function montarContrato(dados: {
  nomeCandidato: string
  cargo: string
  zona?: string | null
  empresa?: {
    razao_social?: string | null
    cnpj?: string | null
    endereco?: string | null
  } | null
}): string {
  const zona = dados.zona || '{{ZONA_DE_ATUACAO}}'
  const razao = dados.empresa?.razao_social || '{{RAZAO_SOCIAL_SPIN}}'
  const cnpj = dados.empresa?.cnpj || '{{CNPJ_SPIN}}'
  const endereco = dados.empresa?.endereco || '{{ENDERECO_SPIN}}'
  return `CONTRATO DE REPRESENTAÇÃO COMERCIAL AUTÔNOMA
(Lei nº 4.886/1965)

PARTES

CONTRATANTE (REPRESENTADA): SPIN SOLAR — ${razao}, inscrita no CNPJ sob nº ${cnpj}, com sede em ${endereco}.

PARCEIRO COMERCIAL: ${dados.nomeCandidato}, doravante PARCEIRO COMERCIAL (representante comercial autônomo, nos termos da Lei 4.886/1965), que atuará mediante pessoa jurídica própria (CNPJ), conforme exigido para o exercício da representação.

CLÁUSULA 1 — OBJETO
O PARCEIRO COMERCIAL promoverá, em caráter autônomo, a venda de contratos de limpeza e manutenção (O&M) de sistemas fotovoltaicos comerciais e industriais da CONTRATANTE, identificando telhados, abordando decisores, negociando e acompanhando o fechamento e o recebimento.

CLÁUSULA 2 — ZONA DE ATUAÇÃO
A representação será exercida na zona: ${zona}. Cliente prospectado pelo PARCEIRO COMERCIAL fica vinculado a ele pelo prazo de 24 (vinte e quatro) meses (titularidade), gerando comissão sobre toda limpeza realizada nesse período, inclusive as recorrentes de contrato.

CLÁUSULA 3 — REMUNERAÇÃO
3.1. Fixo mensal de ${brl2(FIXO_MENSAL)}, devido pelo trabalho de base (manutenção e prospecção da carteira) conforme o cumprimento da meta de atividade do mês, independentemente de comissão.
3.2. Garantia de início (piso pelo trabalho de base) nos 3 (três) primeiros meses — período de experiência —, de forma crescente: ${garantidoContrato}. O piso é devido INTEGRALMENTE mediante o cumprimento da meta de atividade do mês; NÃO atingida a meta, o valor é ajustado PROPORCIONALMENTE ao efetivamente entregue. Após esse período, permanece devido o fixo mensal da cláusula 3.1, sob a mesma regra de proporcionalidade.
3.3. Comissão escalonada sobre o faturamento RECEBIDO no mês, incidindo cada faixa apenas sobre a parcela nela contida:
${faixasContrato}
3.4. Multiplicador de prospecção: cliente encontrado e trazido pelo PARCEIRO COMERCIAL gera comissão de ${MULTIPLICADOR_LABEL} a normal.
3.5. Extras: bônus por contrato recorrente assinado (R$ 150 residencial, R$ 500 comercial, R$ 1.200 usina), prêmio de upsell (15% a 30%), bônus de carteira própria ativa e 0,5% por indicação fechada ao time de solar.

CLÁUSULA 4 — METAS, DESEMPENHO E RENOVAÇÃO DA EXPERIÊNCIA
4.1. O PARCEIRO COMERCIAL compromete-se com metas de atividade mensais (mapeamento de telhados com no mínimo 50 módulos, conversas com decisores e propostas enviadas), com rampa de 60% no mês 1, 80% no mês 2 e 100% a partir do mês 3.
4.2. A renovação do período de experiência e a efetivação da contratação dependem, de forma CONJUNTA, do (a) cumprimento da meta de atividade e do (b) desempenho de vendas (resultado efetivamente realizado). O cumprimento isolado da atividade, sem o correspondente resultado de vendas, não assegura a renovação — a avaliação verifica se o perfil de vendas é compatível com a continuidade.

CLÁUSULA 5 — NATUREZA DO VÍNCULO (CONTRATAÇÃO PJ)
5.1. O PARCEIRO COMERCIAL é contratado como PESSOA JURÍDICA (PJ), atuando por meio de CNPJ próprio, em regime de representação comercial autônoma.
5.2. NÃO há, entre as partes, qualquer vínculo empregatício. A relação NÃO é regida pela CLT, inexistindo subordinação, habitualidade, pessoalidade, controle de jornada, FGTS, 13º salário, férias remuneradas ou quaisquer verbas trabalhistas.
5.3. O PARCEIRO COMERCIAL responde por seus próprios tributos e obrigações como pessoa jurídica.
5.4. A CONTRATANTE disponibiliza base de alvos, leads, aplicativo (CRM/propostas/painel de controle), equipe de campo e protocolo de trabalho, sem que isso caracterize subordinação.

CLÁUSULA 6 — PRAZO E RESCISÃO
Período inicial de experiência de 3 (três) meses. A continuidade e a efetivação observam a Cláusula 4 (metas de atividade + desempenho de vendas, avaliados em conjunto). Confirmada a efetivação, o contrato vigora por prazo determinado, renovável. A rescisão observará o aviso prévio e as verbas da Lei 4.886/1965.

CLÁUSULA 7 — CONFIDENCIALIDADE
As bases de dados, listas de alvos e informações de clientes são de propriedade da CONTRATANTE e não podem ser usadas fora do objeto deste contrato.

CLÁUSULA 8 — ASSINATURA ELETRÔNICA
As partes reconhecem a validade da assinatura eletrônica (MP 2.200-2/2001 e Lei 14.063/2020), com registro de data, hora, IP e integridade do documento por hash.

E, por estarem de acordo, firmam o presente instrumento.`
}
