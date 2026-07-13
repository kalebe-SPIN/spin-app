import { AdicionarItemFAB } from '@/components/AdicionarItemFAB'

/**
 * Layout compartilhado por TODAS as subrotas /projetos/[id]/*
 * Adiciona o FAB de "Adicionar item na proposta" flutuante no canto.
 *
 * Não renderiza no seletor de tipos em si (evita loop visual).
 */
export default function ProjetoLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  return (
    <>
      {children}
      <AdicionarItemFAB projetoId={params.id} />
    </>
  )
}
