'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CHAVE_NAO_LIDAS, EVENTO_NAO_LIDAS } from '@/components/AlertaMensagensInbox'

/**
 * Kalebe 2026-09-29: cada área do portal abre na SUA própria aba do navegador.
 *
 * - Área = 1º trecho da rota (dashboard, crm, inbox, financeiro…); cada
 *   projeto/homologação (id na rota) e cada ferramenta do /admin têm a sua.
 * - Link pra outra área abre (ou reaproveita) a aba nomeada "spin:<área>";
 *   reaproveitada, ela navega pro link → recarrega com dados frescos.
 * - Dentro da mesma área (projeto → orçamento → kit) segue na mesma aba.
 * - Voltou pra aba depois de alguns segundos fora → atualiza os dados
 *   (router.refresh: não perde o que está digitado).
 * - Só no computador: no celular/app instalado, trocar de aba atrapalha.
 * - Ctrl/Shift/clique do meio e links com target próprio seguem o padrão do navegador.
 *   Link que precisa ficar na mesma aba: atributo data-mesma-aba.
 */

const PREFIXO = 'spin:'
const IGNORAR = ['/api/', '/login', '/logout', '/trocar-senha', '/definir-senha', '/vaga', '/cadastro', '/auth']
const ID_NA_ROTA = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|SPIN-\d{4}-\d+)$/i
const FORA_MS = 3000

export function areaDaRota(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)
  if (!seg.length) return 'inicio'
  if (seg[1] && (ID_NA_ROTA.test(seg[1]) || seg[0] === 'admin')) return `${seg[0]}:${seg[1]}`
  return seg[0]
}

// ─── Nome de cada aba (Kalebe 2026-09-30: "cada aba com seu nome") ───────────

const NOMES_AREA: Record<string, string> = {
  inicio: 'Dashboard', dashboard: 'Dashboard', projetos: 'Projetos', crm: 'CRM', agenda: 'Agenda',
  inbox: 'Inbox', grupos: 'Grupos', financeiro: 'Financeiro', admin: 'Admin', 'venda-direta': 'Venda direta',
  erp: 'ERP', conta: 'Minha conta', homologacoes: 'Homologações', operacoes: 'Operações', 'pos-venda': 'Pós-venda',
  fiscal: 'Fiscal', cliente: 'Portal do cliente', catalogo: 'Catálogo', parceiro: 'Parceiro',
}
const NOMES_ADMIN: Record<string, string> = {
  agentes: 'Agentes', arquivos: 'Arquivos', bianca: 'Bianca', campanhas: 'Campanhas', catalogo: 'Catálogo',
  compras: 'Compras', davi: 'Davi', empresa: 'Empresa', equipe: 'Equipe', precificacao: 'Precificação',
  representantes: 'Representantes', usuarios: 'Usuários', vagas: 'Vagas', vendas: 'Vendas manuais', whatsapp: 'WhatsApp',
}
const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ') : s)

/** Nome base da aba pela rota (a página pode refinar com data-titulo-aba). */
export function tituloDaRota(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)
  if (seg[0] === 'financeiro' && seg[1] === 'fluxo-caixa') return 'Fluxo de caixa'
  if (seg[0] === 'admin' && seg[1] === 'precificacao' && seg[2] === 'venda-direta') return 'Preço · venda direta'
  if (seg[0] === 'admin' && seg[1]) return NOMES_ADMIN[seg[1]] || capitalizar(seg[1])
  if (seg[0] === 'projetos' && seg[1] && ID_NA_ROTA.test(seg[1])) return 'Projeto'
  if (seg[0] === 'homologacoes' && seg[1] && ID_NA_ROTA.test(seg[1])) return 'Homologação'
  return NOMES_AREA[seg[0] || 'inicio'] || capitalizar(seg[0])
}

const SUFIXO = ' · Spin Solar'

function abasAtivas(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(min-width: 768px)').matches
    && !window.matchMedia('(display-mode: standalone)').matches
}

export function AbasPorArea() {
  const pathname = usePathname()
  const router = useRouter()

  // Esta aba "é" a aba da área atual — outra aba que pedir esta área cai aqui
  useEffect(() => {
    if (pathname) window.name = PREFIXO + areaDaRota(pathname)
  }, [pathname])

  // ─── Título da aba: "(n) Nome · Spin Solar" ────────────────────────────────
  // Nome: data-titulo-aba da página (ex.: projeto → código · cliente) ou o da
  // rota; dentro da mesma área (projeto → orçamento → kit) mantém o nome.
  const titulo = useRef({ base: '', area: '', naoLidas: 0 })
  useEffect(() => {
    const desejado = () => `${titulo.current.naoLidas > 0 ? `(${titulo.current.naoLidas}) ` : ''}${titulo.current.base}${SUFIXO}`
    const aplicar = () => { if (titulo.current.base && document.title !== desejado()) document.title = desejado() }
    try { titulo.current.naoLidas = Number(localStorage.getItem(CHAVE_NAO_LIDAS)) || 0 } catch {}
    const aoContar = (e: Event) => { titulo.current.naoLidas = Number((e as CustomEvent).detail) || 0; aplicar() }
    window.addEventListener(EVENTO_NAO_LIDAS, aoContar)
    // O Next reescreve o <title> ao navegar — volta pro nome da aba
    const obs = new MutationObserver(aplicar)
    obs.observe(document.head, { childList: true, subtree: true, characterData: true })
    ;(window as any).__spinAplicarTitulo = aplicar
    return () => { window.removeEventListener(EVENTO_NAO_LIDAS, aoContar); obs.disconnect() }
  }, [])

  useEffect(() => {
    if (!pathname) return
    const area = areaDaRota(pathname)
    const doRota = tituloDaRota(pathname)
    const lerPagina = () => {
      const el = document.querySelector('[data-titulo-aba]')
      const daPagina = el?.getAttribute('data-titulo-aba')?.trim()
      const mesmaArea = titulo.current.area === area && titulo.current.base
      titulo.current.base = daPagina || (mesmaArea && doRota === 'Projeto' ? titulo.current.base : doRota)
      titulo.current.area = area
      ;(window as any).__spinAplicarTitulo?.()
    }
    lerPagina()
    const t1 = setTimeout(lerPagina, 150)   // página com streaming termina de montar depois
    const t2 = setTimeout(lerPagina, 800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [pathname])

  // Clique em link pra OUTRA área → aba própria (captura antes do <Link> do Next)
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (!abasAtivas()) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.hasAttribute('download') || a.hasAttribute('data-mesma-aba')) return
      if (a.target && a.target !== '_self') return
      let url: URL
      try { url = new URL(a.href, window.location.href) } catch { return }
      if (url.origin !== window.location.origin) return
      if (IGNORAR.some((p) => url.pathname.startsWith(p))) return
      if (url.pathname === window.location.pathname && url.hash) return
      const destino = areaDaRota(url.pathname)
      if (destino === areaDaRota(window.location.pathname)) return   // mesma área: navega aqui

      e.preventDefault()   // o <Link> do Next respeita e não navega nesta aba
      const aba = window.open(url.href, PREFIXO + destino)
      aba?.focus()
    }
    document.addEventListener('click', aoClicar, true)
    return () => document.removeEventListener('click', aoClicar, true)
  }, [])

  // Voltou pra aba → atualiza os dados da página
  useEffect(() => {
    let saiuEm = 0
    function aoMudar() {
      if (document.visibilityState === 'hidden') { saiuEm = Date.now(); return }
      if (saiuEm && Date.now() - saiuEm > FORA_MS) {
        router.refresh()
        window.dispatchEvent(new Event('spin:aba-ativa'))   // telas com dados próprios podem ouvir
      }
      saiuEm = 0
    }
    document.addEventListener('visibilitychange', aoMudar)
    return () => document.removeEventListener('visibilitychange', aoMudar)
  }, [router])

  return null
}
