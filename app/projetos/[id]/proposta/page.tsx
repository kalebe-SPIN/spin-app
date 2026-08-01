import { redirect } from 'next/navigation'

/**
 * /projetos/[id]/proposta é apenas um alias pra /orcamento.
 * A página real da proposta consolidada é /orcamento — ela detecta
 * "só serviços" vs "com FV" e renderiza o layout apropriado.
 * Existe historicamente porque o botão 'Ver proposta consolidada'
 * apontava aqui antes da rota existir (dava 404).
 */
export default function PropostaRedirect({ params }: { params: { id: string } }) {
  redirect(`/projetos/${params.id}/orcamento`)
}
