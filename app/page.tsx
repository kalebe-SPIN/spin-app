import { redirect } from 'next/navigation'

/**
 * Página raiz "/" — sempre redireciona pra /login.
 *
 * No futuro, quando tivermos middleware de auth:
 * - Se usuário logado: redireciona pra /dashboard
 * - Se não logado: redireciona pra /login
 */
export default function Home() {
  redirect('/login')
}
