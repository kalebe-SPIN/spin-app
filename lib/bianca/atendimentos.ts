/**
 * Sino da Bianca (Kalebe 2026-10-06): só atendimentos com cliente.
 *  - esperando:       última mensagem é do cliente (responsável = você)
 *  - sem_responsavel: cliente escreveu e ninguém assumiu (só admin vê)
 *  - standby:         a última foi nossa e o cliente sumiu há mais de HORAS_STANDBY
 * Os demais recados ficam no card do cliente/projeto/conversa e na Central.
 */
export const HORAS_STANDBY = 48

export type Atendimento = {
  conversa_id: string
  situacao: 'esperando' | 'sem_responsavel' | 'standby'
  desde: string
  responsavel_id: string | null
  contato_nome: string | null
  telefone: string | null
  projeto_id: string | null
  cliente_id: string | null
  previa: string | null
}
