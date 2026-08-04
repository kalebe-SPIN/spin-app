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
  FIXO_MENSAL, GARANTIA_INICIO, MESES_GARANTIA, MULTIPLICADOR_LABEL, COMISSAO_FAIXAS,
} from '@/lib/proposta-om'

export const CONTRATO_VERSAO = 'v1'

const brl2 = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const faixasContrato = COMISSAO_FAIXAS
  .map((f) => `     - ${f.faixa}: ${f.pct === '—' ? 'sem comissão' : f.pct};`)
  .join('\n')

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

REPRESENTANTE: ${dados.nomeCandidato}, doravante REPRESENTANTE COMERCIAL AUTÔNOMO, que atuará mediante pessoa jurídica própria (CNPJ), conforme exigido para o exercício da representação.

CLÁUSULA 1 — OBJETO
O REPRESENTANTE promoverá, em caráter autônomo, a venda de contratos de limpeza e manutenção (O&M) de sistemas fotovoltaicos comerciais e industriais da CONTRATANTE, identificando telhados, abordando decisores, negociando e acompanhando o fechamento e o recebimento.

CLÁUSULA 2 — ZONA DE ATUAÇÃO
A representação será exercida na zona: ${zona}. Cliente prospectado pelo REPRESENTANTE fica vinculado a ele pelo prazo de 24 (vinte e quatro) meses (titularidade), gerando comissão sobre toda limpeza realizada nesse período, inclusive as recorrentes de contrato.

CLÁUSULA 3 — REMUNERAÇÃO
3.1. Fixo mensal de ${brl2(FIXO_MENSAL)}, vinculado ao cumprimento da meta de atividade do mês.
3.2. Garantia de início: ${brl2(GARANTIA_INICIO)}/mês nos ${MESES_GARANTIA} (três) primeiros meses, independentemente de resultado.
3.3. Comissão escalonada sobre o faturamento RECEBIDO no mês, incidindo cada faixa apenas sobre a parcela nela contida:
${faixasContrato}
3.4. Multiplicador de prospecção: cliente encontrado e trazido pelo REPRESENTANTE gera comissão de ${MULTIPLICADOR_LABEL} a normal.
3.5. Extras: bônus por contrato recorrente assinado (R$ 150 residencial, R$ 500 comercial, R$ 1.200 usina), prêmio de upsell (15% a 30%), bônus de carteira própria ativa e 0,5% por indicação fechada ao time de solar.

CLÁUSULA 4 — METAS DE ATIVIDADE
O REPRESENTANTE compromete-se com metas de atividade mensais (mapeamento de telhados, conversas com decisores e propostas enviadas), com rampa de 60% no mês 1, 80% no mês 2 e 100% a partir do mês 3.

CLÁUSULA 5 — NATUREZA DO VÍNCULO
Trata-se de representação comercial autônoma, sem vínculo empregatício, subordinação, FGTS, 13º ou férias remuneradas, exigindo-se CNPJ do REPRESENTANTE. A CONTRATANTE disponibiliza base de alvos, leads, aplicativo (CRM/propostas), equipe de campo e protocolo de trabalho.

CLÁUSULA 6 — PRAZO E RESCISÃO
Prazo inicial de 12 (doze) meses, renovável automaticamente. A rescisão observará o aviso prévio e as verbas da Lei 4.886/1965.

CLÁUSULA 7 — CONFIDENCIALIDADE
As bases de dados, listas de alvos e informações de clientes são de propriedade da CONTRATANTE e não podem ser usadas fora do objeto deste contrato.

CLÁUSULA 8 — ASSINATURA ELETRÔNICA
As partes reconhecem a validade da assinatura eletrônica (MP 2.200-2/2001 e Lei 14.063/2020), com registro de data, hora, IP e integridade do documento por hash.

E, por estarem de acordo, firmam o presente instrumento.`
}
