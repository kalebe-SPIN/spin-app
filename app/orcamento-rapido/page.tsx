import { redirect } from 'next/navigation'

/**
 * Kalebe 2026-09-09: rota antiga /orcamento-rapido foi ABSORVIDA pelo novo
 * fluxo "campo de busca no catálogo" no dashboard.
 *
 * O motor R$/kWp por faixa saiu (era simplificado demais); o único motor
 * de precificação usado agora é o do /projetos/[id]/orcamento (v1 legado
 * ou v2 quando flag precificacao_v2=1).
 *
 * Redirect preserva compat com links antigos (bookmarks, links no
 * WhatsApp, mensagens de e-mail). O código do orçamento rápido (actions.ts
 * e a pasta lib/orcamento-rapido) fica no repo — pode ser reaproveitado
 * se decidirmos revisitar depois.
 */
export default function OrcamentoRapidoPage() {
  redirect('/catalogo')
}
