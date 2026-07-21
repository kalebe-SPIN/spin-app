import { redirect } from 'next/navigation'

/**
 * Rota admin antiga — mantida pra compat com URLs salvos/bookmarks.
 * Redireciona pra rota unificada /homologacoes/[id] que tem TODAS as
 * features (documentos obrigatórios, padrão novo, ação principal,
 * geração automática de arquivos, sócios PJ, etc).
 */
export default function HomologacaoAdminRedirect({ params }: { params: { id: string } }) {
  redirect(`/homologacoes/${params.id}`)
}
