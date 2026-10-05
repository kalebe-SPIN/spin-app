import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { createClient } from '@/lib/supabase/server'
import { PortalHeaderView } from '@/components/PortalHeaderView'

/**
 * Header global do portal.
 * Só renderiza se o usuário está autenticado.
 * Mostra:
 *   - Nome do usuário
 *   - Links de navegação
 *   - Botão de alternar modo (só admin)
 *   - Sair
 */
export async function PortalHeader() {
  const { modo, ehAdminReal, perfil } = await getModoVisualizacao()

  if (!perfil) return null // não logado — sem header
  if (perfil.role === 'candidato') return null // candidato tem layout próprio em /vaga

  const modoAtivo = modo

  // Contador de sugestoes pendentes da Bianca + logo da empresa (silencioso em falha)
  let sugestoesPendentes = 0
  let logoUrl: string | null = null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { count } = await supabase
        .from('bianca_comunicacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', user.id)
        .eq('status', 'sugerida')
      // Kalebe 2026-09-23: avisos internos dos agentes também contam no sino
      const { count: avisosNaoLidos } = await supabase
        .from('avisos_internos')
        .select('id', { count: 'exact', head: true })
        .eq('destinatario_id', user.id)
        .is('lido_em', null)
      sugestoesPendentes = (count || 0) + (avisosNaoLidos || 0)
    }
    const { data: emp } = await supabase
      .from('configuracoes_empresa')
      .select('logo_url')
      .eq('singleton', true)
      .maybeSingle()
    logoUrl = emp?.logo_url || null
  } catch {}

  // Monta links pra passar tanto pro desktop quanto pro drawer mobile
  // Kalebe 2026-09-09: representante = navegação idêntica ao consultor.
  // O portal só diverge de verdade pra profissional_campo (foco execução) e admin.
  // Kalebe 2026-09-30: itens só com texto (sem ícones) — cabem na tela
  // Kalebe 2026-10-05: profissional de campo entra pelo painel /campo
  // (demandas, agenda e ordens de serviço); admin e instalador também veem.
  const ehCampo = modoAtivo === 'profissional_campo'
  const veCampo = ehCampo || modoAtivo === 'admin' || perfil.role === 'instalador'
  const linksNav = [
    ehCampo ? { href: '/campo', label: 'Campo' } : { href: '/dashboard', label: 'Dashboard' },
    ...(!ehCampo
      ? [{ href: '/projetos', label: 'Projetos' }] : []),
    // Kalebe 2026-10-05: o campo não acessa o CRM
    ...(!ehCampo ? [{
      href:
        modoAtivo === 'admin' ? '/crm/pipeline'
        : '/crm',
      label: 'CRM',
    }] : []),
    { href: '/agenda', label: 'Agenda' },
    ...(veCampo && !ehCampo ? [{ href: '/campo', label: 'Campo' }] : []),
    // Kalebe 2026-09-30: Grupos saiu do menu — fica dentro do Inbox
    { href: '/inbox', label: 'Inbox' },
    // Kalebe 2026-09-30: Admin já tem botão "Administração" no dashboard → aqui vira Financeiro
    ...(modoAtivo === 'admin' && ehAdminReal
      ? [{ href: '/financeiro', label: 'Financeiro' }] : []),
  ]

  return (
    <PortalHeaderView
      linksNav={linksNav}
      logoUrl={logoUrl}
      sugestoesPendentes={sugestoesPendentes}
      ehAdminReal={ehAdminReal}
      modoAtivo={modoAtivo}
      nome={(perfil as { nome_completo?: string }).nome_completo || ''}
      avatarUrl={(perfil as { avatar_url?: string | null }).avatar_url || null}
    />
  )
}
