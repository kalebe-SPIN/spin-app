import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

/**
 * Floating Action Button (FAB) — botão flutuante no canto inferior direito.
 * Aparece em TODAS as páginas do projeto (via layout compartilhado).
 * Mostra qtd de itens já selecionados e link pro seletor.
 */
export async function AdicionarItemFAB({ projetoId }: { projetoId: string }) {
  const supabase = createClient()
  const { count } = await supabase
    .from('projeto_itens')
    .select('id', { count: 'exact', head: true })
    .eq('projeto_id', projetoId)
    .neq('status', 'removido')

  const qtd = count || 0

  return (
    <Link
      href={`/projetos/${projetoId}/tipos`}
      // Kalebe 2026-09-01: subido pra bottom-24 (era bottom-6). Ficava
      // por cima do botão 'Confirmar kit → Passo 7' e roubava o click.
      className="fixed bottom-24 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-sol text-noite font-bold text-sm rounded-full shadow-2xl hover:bg-sol/90 transition-all hover:scale-105 border-2 border-noite"
      title="Adicionar item na proposta (solar, BESS, VE, serviços)"
    >
      <span className="text-lg">🎁</span>
      <span className="hidden md:inline">
        {qtd === 0 ? 'Adicionar itens' : `${qtd} ${qtd === 1 ? 'item' : 'itens'} · editar`}
      </span>
      <span className="md:hidden">+</span>
      {qtd > 0 && (
        <span className="ml-1 w-6 h-6 flex items-center justify-center rounded-full bg-noite text-sol text-xs font-black">
          {qtd}
        </span>
      )}
    </Link>
  )
}
