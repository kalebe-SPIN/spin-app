import { redirect } from 'next/navigation'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'

/**
 * Kalebe 2026-10-05: "o campo não acessa o CRM". Profissional de campo (e o
 * admin simulando o modo campo) vai pro painel dele em /campo.
 */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { modo } = await getModoVisualizacao()
  if (modo === 'profissional_campo') redirect('/campo')
  return <>{children}</>
}
