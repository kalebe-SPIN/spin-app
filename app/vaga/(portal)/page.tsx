import { redirect } from 'next/navigation'
import { getConviteAtual } from '@/lib/convite'

/** /vaga — manda o candidato pra etapa onde ele parou. */
export default async function VagaHubPage() {
  const convite = await getConviteAtual()
  if (!convite) redirect('/vaga/login')

  switch (convite.status) {
    case 'proposta_aceita':
      redirect('/vaga/contrato')
    case 'contrato_assinado':
    case 'docs_enviados':
    case 'concluido':
      redirect('/vaga/documentos')
    default:
      redirect('/vaga/proposta')
  }
}
