'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { ModalProjetoConversa } from './ModalProjetoConversa'
import { ComposerWhatsApp } from '@/components/chat/ComposerWhatsApp'
import { AvatarContato } from '@/components/AvatarContato'
import { AvisosDoCliente } from '@/components/bianca/AvisosDoCliente'
import { BotaoNovaDemanda } from '@/components/campo/NovaDemandaModal'
import { rotuloNaTela } from '@/lib/equipe/rotulo'
import { cartoesDoTexto, telefonesNoTexto, formatarTelefoneExibicao } from '@/lib/whatsapp/contatos-projeto'
import { contatosDoProjetoDaConversaAction, salvarContatoDaConversaAction } from '@/app/inbox/contatos-actions'
import {
  listarConversasAction,
  listarMensagensAction,
  assumirConversaAction,
  encerrarConversaAction,
  abrirConversaManualAction,
  recuperarMidiaAction,
  statusModeloRetomadaAction,
  reabrirComModeloAction,
  marcarConversaLidaAction,
  listarAtendentesAction,
  transferirConversaAction,
  mudarEtapaConversaAction,
  salvarEtiquetasConversaAction,
  concluirAtendimentoAction,
} from '@/app/inbox/actions'
import { ETAPAS, INFO_ETAPA, PERFIS, PRODUTOS, TIPOS_FORNECEDOR, infoProduto, rotuloTiposFornecedor, type Etapa } from '@/lib/spinzap/comum'
import { cadastrarFornecedorDaConversaAction, desvincularFornecedorDaConversaAction, listarFornecedoresAction } from '@/app/inbox/fornecedor-actions'

type Conversa = {
  id: string
  status: string
  responsavel_id: string | null
  agente_ativo: string | null
  origem_campanha: string | null
  ultima_mensagem_em: string | null
  janela_24h_expira_em: string | null
  sla_prazo_em: string | null
  criada_em: string
  encerrada_em: string | null
  contato: {
    id: string
    telefone: string
    nome_exibicao: string | null
    tipo: string
    cliente_id: string | null
    projeto_id: string | null
    foto_url?: string | null                       // mig 131 (foto enviada à mão)
    criado_em?: string | null                      // entrada do lead no sistema
    // Kalebe 2026-10-09: contato também cadastrado como fornecedor (mig 146)
    fornecedor_id?: string | null
    fornecedor?: { id: string; razao_social: string; nome_fantasia: string | null; tipos: string[] | null } | null
    cliente?: { foto_url: string | null } | null
  } | null
  responsavel: { nome_completo: string | null } | null
  /** Mensagens do cliente ainda não lidas por este usuário (migration 131) */
  nao_lidas?: number
  // Kalebe 2026-10-09 — Spinzap (mig 145)
  etapa?: string | null
  etapa_em?: string | null
  cidade?: string | null
  uf?: string | null
  produto?: string | null
  dono_id?: string | null
  transferida_de?: string | null
  transferida_em?: string | null
  transferencia_recado?: string | null
  transferidor?: { nome_completo: string | null } | null
  setor?: string
}

type Mensagem = {
  id: string
  direcao: 'inbound' | 'outbound'
  tipo: string
  texto: string | null
  midia_url: string | null
  midia_meta_id: string | null
  midia_mime: string | null
  midia_duracao_seg: number | null
  midia_expirada_em: string | null
  remetente_id: string | null
  remetente_agente: string | null
  origem_agente_nome: string | null
  status_entrega: string
  erro: string | null
  criada_em: string
  entregue_em: string | null
  lida_em: string | null
  remetente: { nome_completo: string | null } | null
}

export function InboxClient({
  usuarioId,
  usuarioNome,
  usuarioRole,
}: {
  usuarioId: string
  usuarioNome: string | null
  usuarioRole: string | null
}) {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Kalebe 2026-10-09 (Spinzap): filtros rápidos por SETOR (tempo real) +
  // filtros por data de cadastro, cidade, perfil de compra e produto/serviço
  const [setorSel, setSetorSel] = useState<string>('todos')
  const [setores, setSetores] = useState<Array<{ chave: string; nome: string; emoji: string | null }>>([])
  const [verFiltros, setVerFiltros] = useState(false)
  const [fPeriodo, setFPeriodo] = useState<'todos' | 'hoje' | '7d' | '30d' | 'mes' | 'mes_passado'>('todos')
  const [fCidade, setFCidade] = useState('')
  const [fPerfil, setFPerfil] = useState('')
  const [fProduto, setFProduto] = useState('')
  const [fContato, setFContato] = useState<'' | 'clientes' | 'equipe' | 'fornecedores' | 'forn_equipamento' | 'forn_produtos' | 'forn_servico'>('')
  const [modalFornecedor, setModalFornecedor] = useState(false)
  const [verEncerradas, setVerEncerradas] = useState(false)
  const [fechadas, setFechadas] = useState<Set<string>>(new Set(['perdido']))   // grupos recolhidos
  const [modalConcluir, setModalConcluir] = useState(false)
  // Kalebe 2026-09-30: pesquisa de contato (nome ou telefone)
  const [busca, setBusca] = useState('')
  // Celular estilo WhatsApp: conversa em tela cheia abaixo do cabeçalho do portal
  const [ehCelular, setEhCelular] = useState(false)
  const [topoHeader, setTopoHeader] = useState(56)
  const [menuAcoes, setMenuAcoes] = useState(false)
  const empurrouHistorico = useRef(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [modalProjeto, setModalProjeto] = useState(false)
  // Kalebe 2026-10-01: transferir atendimento (Laís avisa quem recebe)
  const [modalTransferir, setModalTransferir] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  // Kalebe 2026-09-29: contatos do projeto (decisor etc.) repassados na conversa
  const [contatosProj, setContatosProj] = useState<{ projeto_id: string | null; codigo: string | null; telefones: string[] }>({ projeto_id: null, codigo: null, telefones: [] })
  const [contatoPraSalvar, setContatoPraSalvar] = useState<null | { nome: string; telefone: string; origem: 'whatsapp_cartao' | 'whatsapp_texto'; wa_mensagem_id: string }>(null)

  async function carregarContatosProj(id: string | null) {
    if (!id) { setContatosProj({ projeto_id: null, codigo: null, telefones: [] }); return }
    const r = await contatosDoProjetoDaConversaAction(id)
    if (!('erro' in r)) setContatosProj(r)
  }
  const [novoTelefone, setNovoTelefone] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [isPending, startTransition] = useTransition()
  const timelineRef = useRef<HTMLDivElement>(null)

  // Kalebe 2026-09-25: no desktop o painel ocupa exatamente o espaço que
  // sobra na tela (abaixo dos cabeçalhos). Só a lista e as mensagens rolam;
  // a caixa de digitação fica sempre visível no rodapé. No celular (< lg)
  // mantém o fluxo normal da página.
  const painelRef = useRef<HTMLDivElement>(null)
  const [alturaPainel, setAlturaPainel] = useState<number | null>(null)
  useEffect(() => {
    function medir() {
      const el = painelRef.current
      if (!el) return
      if (window.innerWidth < 1024) { setAlturaPainel(null); return }
      const topoNaPagina = el.getBoundingClientRect().top + window.scrollY
      setAlturaPainel(Math.max(420, window.innerHeight - topoNaPagina))
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  async function refreshConversas() {
    const r = await listarConversasAction()
    if ('conversas' in r) { setConversas(r.conversas as any); setSetores(r.setores || []) }
  }
  async function refreshMensagens(id: string) {
    const r = await listarMensagensAction(id)
    if ('mensagens' in r) setMensagens(r.mensagens as any)
  }

  // Celular: mede o cabeçalho do portal pra conversa ocupar o resto da tela
  useEffect(() => {
    function medir() {
      setEhCelular(window.innerWidth < 1024)
      const h = document.querySelector('header.sticky') as HTMLElement | null
      setTopoHeader(h ? Math.round(h.getBoundingClientRect().bottom) : 56)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  // Botão "voltar" do celular fecha a conversa (volta pra lista), como no WhatsApp
  useEffect(() => {
    function aoVoltar() {
      const id = new URLSearchParams(window.location.search).get('c')
      empurrouHistorico.current = false
      setSelecionadaId(id || null)
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  // Conversa aberta no celular: trava a rolagem da página de trás
  useEffect(() => {
    if (!(ehCelular && selecionadaId)) return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [ehCelular, selecionadaId])

  function abrirConversa(id: string) {
    setMenuAcoes(false)
    if (id === selecionadaId) return
    setSelecionadaId(id)
    const url = `/spinzap?c=${id}`
    if (window.innerWidth < 1024 && !empurrouHistorico.current) {
      window.history.pushState(null, '', url)   // "voltar" do aparelho volta pra lista
      empurrouHistorico.current = true
    } else {
      window.history.replaceState(null, '', url)
    }
  }

  function voltarParaLista() {
    setMenuAcoes(false)
    if (empurrouHistorico.current) { window.history.back(); return }
    setSelecionadaId(null)
    window.history.replaceState(null, '', '/spinzap')
  }

  // Link direto /spinzap?c=<conversa_id> (caixa do projeto, envio de proposta)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const id = p.get('c') || p.get('conversa')
    if (id) setSelecionadaId(id)
  }, [])

  // Fetch inicial + Realtime
  useEffect(() => {
    refreshConversas()
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const canal = supabase
      .channel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' }, () => {
        refreshConversas()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_mensagens' }, async (payload) => {
        const nova = (payload.new as any)?.conversa_id
        // Conversa aberta e tela na frente: mensagem que chega já conta como lida
        if (nova && nova === selecionadaRef.current && document.visibilityState === 'visible') {
          await marcarConversaLidaAction(nova)
          refreshMensagens(nova)
        }
        refreshConversas()
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-fetch mensagens ao trocar conversa + marca como lida (zera a etiqueta)
  const selecionadaRef = useRef<string | null>(null)
  selecionadaRef.current = selecionadaId
  useEffect(() => {
    if (selecionadaId) {
      refreshMensagens(selecionadaId)
      setConversas((cs) => cs.map((c) => (c.id === selecionadaId ? { ...c, nao_lidas: 0 } : c)))
      marcarConversaLidaAction(selecionadaId).catch(() => {})
    } else setMensagens([])
    carregarContatosProj(selecionadaId)
  }, [selecionadaId])

  // Fallback refresh de 60s — cobre caso Realtime dropar.
  // Só bate quando aba está visível pra não gastar toa.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      refreshConversas()
      if (selecionadaId) refreshMensagens(selecionadaId)
    }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [selecionadaId])

  // Scroll ao chegar msg nova
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight
  }, [mensagens])

  // Filtros + pesquisa (nome sem acento/maiúscula, ou pedaço do telefone)
  const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const termo = semAcento(busca.trim())
  const termoDigitos = busca.replace(/\D/g, '')
  // Data de cadastro = entrada do lead no sistema (contato), senão a conversa
  const desdeAte = (() => {
    const agora = new Date()
    const ini = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
    if (fPeriodo === 'hoje') return [ini(agora), null] as const
    if (fPeriodo === '7d') return [new Date(ini(agora).getTime() - 6 * 864e5), null] as const
    if (fPeriodo === '30d') return [new Date(ini(agora).getTime() - 29 * 864e5), null] as const
    if (fPeriodo === 'mes') return [new Date(agora.getFullYear(), agora.getMonth(), 1), null] as const
    if (fPeriodo === 'mes_passado') return [new Date(agora.getFullYear(), agora.getMonth() - 1, 1), new Date(agora.getFullYear(), agora.getMonth(), 1)] as const
    return [null, null] as const
  })()
  const entradaDe = (c: Conversa) => c.contato?.criado_em || c.criada_em
  const selCls = 'w-full px-2 py-1.5 bg-white/[0.05] border border-white/10 focus:border-white/25 rounded text-[11px] text-white focus:outline-none'
  const ehEquipe = (c: Conversa) => c.contato?.tipo === 'colaborador' || c.contato?.tipo === 'representante'
  // Fornecedor "puro" (sem cliente/projeto) sai do funil e vai pro grupo próprio;
  // quem é cliente E fornecedor segue no funil com a etiqueta 🏭
  const ehFornecedor = (c: Conversa) => !!c.contato?.fornecedor_id
  const ehFornecedorPuro = (c: Conversa) => ehFornecedor(c) && !c.contato?.cliente_id && !c.contato?.projeto_id
  // Tudo menos o setor (as contagens dos chips de setor respeitam os demais filtros)
  const passaFiltros = (c: Conversa) => {
    if (termo) {
      const nome = semAcento(c.contato?.nome_exibicao || '')
      const tel = (c.contato?.telefone || '').replace(/\D/g, '')
      const achou = nome.includes(termo) || (termoDigitos.length >= 3 && tel.includes(termoDigitos))
      if (!achou) return false
    }
    if (desdeAte[0] || desdeAte[1]) {
      const t = new Date(entradaDe(c)).getTime()
      if (desdeAte[0] && t < desdeAte[0].getTime()) return false
      if (desdeAte[1] && t >= desdeAte[1].getTime()) return false
    }
    if (fContato === 'clientes' && (ehEquipe(c) || ehFornecedorPuro(c))) return false
    if (fContato === 'equipe' && !ehEquipe(c)) return false
    if (fContato === 'fornecedores' && !ehFornecedor(c)) return false
    if (fContato.startsWith('forn_') && !(c.contato?.fornecedor?.tipos || []).includes(fContato.slice(5))) return false
    if (fCidade && semAcento(c.cidade || '') !== semAcento(fCidade)) return false
    if (fProduto && c.produto !== fProduto) return false
    if (fPerfil && infoProduto(c.produto)?.grupo !== fPerfil) return false
    return true
  }
  const base = conversas.filter(passaFiltros)
  const abertas = base.filter((c) => !c.encerrada_em)
  const qtdSetor = (s: string) => abertas.filter((c) => c.setor === s).length
  const conversasFiltradas = base.filter((c) => {
    if (!verEncerradas && c.encerrada_em) return false
    if (setorSel !== 'todos' && c.setor !== setorSel) return false
    return true
  })
  const qtdEncerradas = base.filter((c) => c.encerrada_em && (setorSel === 'todos' || c.setor === setorSel)).length
  // Barra lateral como um CRM: grupos por etapa (cor própria); conversas da
  // equipe (avisos internos) num grupo à parte, no fim
  const grupos = [
    ...ETAPAS.map((e) => ({
      chave: e.chave as string, rotulo: `${e.emoji} ${e.rotulo}`, cls: e.cls,
      itens: conversasFiltradas.filter((c) => !ehEquipe(c) && !ehFornecedorPuro(c) && (c.etapa || 'atendimento_lais') === e.chave),
    })),
    { chave: 'fornecedores', rotulo: '🏭 Fornecedores', cls: 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]', itens: conversasFiltradas.filter((c) => !ehEquipe(c) && ehFornecedorPuro(c)) },
    { chave: 'equipe', rotulo: '👥 Equipe', cls: 'bg-white/5 border-white/15 text-white/60', itens: conversasFiltradas.filter(ehEquipe) },
  ].filter((g) => g.itens.length > 0)
  const cidadesDaLista = Array.from(new Set(conversas.map((c) => (c.cidade || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const produtosDoPerfil = fPerfil ? PRODUTOS.filter((p) => p.grupo === fPerfil) : PRODUTOS
  const filtrosAtivos = [fPeriodo !== 'todos', !!fCidade, !!fPerfil, !!fProduto, !!fContato].filter(Boolean).length
  const chipsSetor = [
    { chave: 'todos', rotulo: 'Todos', qtd: abertas.length },
    { chave: 'lais', rotulo: '🤖 Laís', qtd: qtdSetor('lais') },
    ...setores.map((s) => ({ chave: s.chave, rotulo: `${s.emoji ? s.emoji + ' ' : ''}${s.nome}`, qtd: qtdSetor(s.chave) })),
    { chave: 'sem_setor', rotulo: 'Sem setor', qtd: qtdSetor('sem_setor') },
    { chave: 'sem_responsavel', rotulo: 'Sem responsável', qtd: qtdSetor('sem_responsavel') },
  ].filter((s) => s.chave === 'todos' || s.chave === 'lais' || s.qtd > 0 || s.chave === setorSel)

  const selecionada = conversas.find((c) => c.id === selecionadaId) || null
  // Transferência temporária: quem recebeu devolve o cliente ao concluir
  const podeConcluir = !!selecionada?.transferida_de && !selecionada.encerrada_em
    && (selecionada.responsavel_id === usuarioId || usuarioRole === 'admin')

  function mudarEtapa(etapa: string) {
    if (!selecionada) return
    const id = selecionada.id
    setErro(null)
    setConversas((cs) => cs.map((c) => (c.id === id ? { ...c, etapa } : c)))
    startTransition(async () => {
      const r = await mudarEtapaConversaAction(id, etapa)
      if ('erro' in r) setErro(r.erro)
      refreshConversas()
    })
  }

  function salvarEtiquetas(e: { cidade?: string | null; uf?: string | null; produto?: string | null }) {
    if (!selecionada) return
    const id = selecionada.id
    setErro(null)
    setConversas((cs) => cs.map((c) => (c.id === id ? { ...c, ...e } : c)))
    startTransition(async () => {
      const r = await salvarEtiquetasConversaAction(id, e)
      if ('erro' in r) setErro(r.erro)
      refreshConversas()
    })
  }

  function assumir() {
    if (!selecionadaId) return
    setErro(null)
    startTransition(async () => {
      const r = await assumirConversaAction(selecionadaId)
      if ('erro' in r) { setErro(r.erro); return }
      refreshConversas()
    })
  }

  function encerrar() {
    if (!selecionadaId) return
    if (!confirm('Encerrar conversa?')) return
    setErro(null)
    startTransition(async () => {
      const r = await encerrarConversaAction(selecionadaId)
      if ('erro' in r) { setErro(r.erro); return }
      voltarParaLista()
      refreshConversas()
    })
  }

  function abrirManual() {
    if (!novoTelefone.trim()) return
    setErro(null)
    startTransition(async () => {
      const r = await abrirConversaManualAction({
        telefone: novoTelefone.replace(/\D/g, ''),
        nome_exibicao: novoNome || undefined,
      })
      if ('erro' in r) { setErro(r.erro); return }
      setNovoTelefone(''); setNovoNome(''); setModalAberto(false)
      abrirConversa(r.conversa_id)
      refreshConversas()
    })
  }

  return (
    <div
      ref={painelRef}
      style={alturaPainel ? { height: alturaPainel } : undefined}
      className="grid grid-cols-1 lg:grid-cols-[320px_1fr] lg:grid-rows-[minmax(0,1fr)] gap-0 min-h-[calc(100vh-96px)] lg:min-h-0"
    >
      {/* ─── Lista de conversas ─── */}
      <aside className="border-r border-white/10 flex flex-col min-h-0">
        <div className="p-3 border-b border-white/10 space-y-2">
          {/* Kalebe 2026-09-30: pesquisar contato por nome ou telefone */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar nome ou telefone"
              className="w-full pl-9 pr-3 py-2 bg-white/[0.05] border border-white/10 focus:border-white/25 rounded-full text-sm text-white placeholder-white/35 focus:outline-none"
            />
          </div>
          {/* Kalebe 2026-10-09 (Spinzap): filtro rápido por setor, com a
              contagem de conversas abertas em tempo real */}
          <div className="flex flex-wrap gap-1">
            {chipsSetor.map((s) => (
              <button
                key={s.chave}
                onClick={() => setSetorSel(s.chave)}
                className={`px-2 py-1 rounded-full text-[11px] font-bold border transition ${
                  setorSel === s.chave ? 'bg-sol/20 border-sol/50 text-sol' : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06]'
                }`}
              >
                {s.rotulo} <span className="opacity-70 font-mono">{s.qtd}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setVerFiltros((v) => !v)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${
              filtrosAtivos ? 'bg-weg-azul/15 border-weg-azul/40 text-weg-azul' : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06]'
            }`}
          >
            <span>⚙ Filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ''}</span>
            <span>{verFiltros ? '▴' : '▾'}</span>
          </button>
          {verFiltros && (
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block">
                <span className="block text-[10px] font-bold text-white/50 mb-0.5">Cadastro</span>
                <select value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value as typeof fPeriodo)} className={selCls}>
                  <option value="todos" className="bg-noite">Qualquer data</option>
                  <option value="hoje" className="bg-noite">Hoje</option>
                  <option value="7d" className="bg-noite">Últimos 7 dias</option>
                  <option value="30d" className="bg-noite">Últimos 30 dias</option>
                  <option value="mes" className="bg-noite">Este mês</option>
                  <option value="mes_passado" className="bg-noite">Mês passado</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-white/50 mb-0.5">Cidade</span>
                <select value={fCidade} onChange={(e) => setFCidade(e.target.value)} className={selCls}>
                  <option value="" className="bg-noite">Todas</option>
                  {cidadesDaLista.map((c) => <option key={c} value={c} className="bg-noite">{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-white/50 mb-0.5">Perfil de compra</span>
                <select value={fPerfil} onChange={(e) => { setFPerfil(e.target.value); setFProduto('') }} className={selCls}>
                  <option value="" className="bg-noite">Todos</option>
                  {PERFIS.map((p) => <option key={p.valor} value={p.valor} className="bg-noite">{p.rotulo}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-white/50 mb-0.5">Produto/serviço</span>
                <select value={fProduto} onChange={(e) => setFProduto(e.target.value)} className={selCls}>
                  <option value="" className="bg-noite">Todos</option>
                  {produtosDoPerfil.map((p) => <option key={p.valor} value={p.valor} className="bg-noite">{p.rotulo}</option>)}
                </select>
              </label>
              <label className="block col-span-2">
                <span className="block text-[10px] font-bold text-white/50 mb-0.5">Contato</span>
                <select value={fContato} onChange={(e) => setFContato(e.target.value as typeof fContato)} className={selCls}>
                  <option value="" className="bg-noite">Todos</option>
                  <option value="clientes" className="bg-noite">Clientes e leads</option>
                  <option value="equipe" className="bg-noite">Equipe</option>
                  <option value="fornecedores" className="bg-noite">Fornecedores (todos)</option>
                  {TIPOS_FORNECEDOR.map((t) => (
                    <option key={t.chave} value={`forn_${t.chave}`} className="bg-noite">Fornecedores de {t.rotulo.toLowerCase()}</option>
                  ))}
                </select>
              </label>
              {filtrosAtivos > 0 && (
                <button
                  onClick={() => { setFPeriodo('todos'); setFCidade(''); setFPerfil(''); setFProduto(''); setFContato('') }}
                  className="col-span-2 text-[11px] text-coral/80 hover:text-coral font-bold py-1"
                >
                  ✕ Limpar filtros
                </button>
              )}
            </div>
          )}
          {usuarioRole === 'admin' && (
            <button
              onClick={() => setModalAberto(true)}
              className="w-full px-3 py-1.5 rounded bg-verde/20 border border-verde/40 text-verde text-xs font-bold hover:bg-verde/30"
            >
              + Abrir conversa manual
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversasFiltradas.length === 0 ? (
            <p className="p-4 text-xs text-white/40 italic text-center">
              {termo ? `Nenhum contato encontrado com “${busca.trim()}”.` : 'Nenhuma conversa nesse filtro.'}
            </p>
          ) : (
            grupos.map((g) => {
              const fechado = fechadas.has(g.chave)
              return (
                <div key={g.chave}>
                  <button
                    onClick={() => setFechadas((s) => { const n = new Set(s); if (n.has(g.chave)) n.delete(g.chave); else n.add(g.chave); return n })}
                    className="sticky top-0 z-[1] w-full flex items-center justify-between gap-2 px-3 py-1.5 bg-noite/95 backdrop-blur border-b border-white/10"
                  >
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${g.cls}`}>
                      {g.rotulo}
                    </span>
                    <span className="text-[11px] text-white/45 font-mono">{g.itens.length} {fechado ? '▸' : '▾'}</span>
                  </button>
                  {!fechado && g.itens.map((c) => (
                    <ItemConversa
                      key={c.id}
                      c={c}
                      selecionada={c.id === selecionadaId}
                      onClick={() => abrirConversa(c.id)}
                    />
                  ))}
                </div>
              )
            })
          )}
          {qtdEncerradas > 0 && (
            <button
              onClick={() => setVerEncerradas((v) => !v)}
              className="w-full px-3 py-2.5 text-[11px] text-white/45 hover:text-white/70 font-bold"
            >
              {verEncerradas ? 'Esconder conversas encerradas' : `Mostrar ${qtdEncerradas} conversa(s) encerrada(s)`}
            </button>
          )}
        </div>
      </aside>

      {/* ─── Detalhe da conversa ───
          Kalebe 2026-09-30: no celular abre em tela cheia (abaixo do cabeçalho
          do portal) e a lista sai de cena, como no WhatsApp. */}
      <section
        style={ehCelular && selecionada ? { top: topoHeader } : undefined}
        className={`flex-col min-h-0 ${selecionada ? 'flex' : 'hidden lg:flex'} ${
          ehCelular && selecionada ? 'fixed inset-x-0 bottom-0 z-30 bg-noite' : ''
        }`}
      >
        {!selecionada ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/40 text-sm p-4">
            {/* Ex.: concluiu o atendimento transferido — a conversa saiu da lista */}
            {okMsg && (
              <p className="max-w-md text-xs text-verde bg-verde/10 border border-verde/30 rounded p-2 flex items-start gap-2">
                <span>{okMsg}</span>
                <button onClick={() => setOkMsg(null)} className="text-white/50 hover:text-white shrink-0">✕</button>
              </p>
            )}
            Selecione uma conversa à esquerda.
          </div>
        ) : (
          <>
            <div className="shrink-0 px-2 py-2 lg:p-4 border-b border-white/10 flex items-center justify-between gap-2 lg:gap-3 relative">
              <button
                onClick={voltarParaLista}
                className="lg:hidden p-2 -ml-1 text-white/80 hover:text-white shrink-0"
                aria-label="Voltar pras conversas"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              {selecionada.contato && (
                <AvatarContato
                  nome={selecionada.contato.nome_exibicao || selecionada.contato.telefone || ''}
                  semente={selecionada.contato.telefone}
                  foto={fotoDoContato(selecionada)}
                  tamanho={38}
                  alvo={{ contato_id: selecionada.contato.id }}
                  onFotoAlterada={(url) => {
                    const contatoId = selecionada.contato?.id
                    setConversas((cs) => cs.map((c) => c.contato?.id === contatoId
                      ? { ...c, contato: { ...c.contato!, foto_url: url, cliente: url ? c.contato!.cliente : null } }
                      : c))
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">
                  {selecionada.contato?.nome_exibicao || selecionada.contato?.telefone || 'Contato'}
                </p>
                <p className="text-[11px] text-white/50 font-mono truncate">
                  {selecionada.contato?.telefone}
                  <span className="ml-2 text-white/40">· {selecionada.status.replace(/_/g, ' ')}</span>
                  {selecionada.responsavel?.nome_completo && (
                    <span className="ml-2 text-white/60">👤 {selecionada.responsavel.nome_completo}</span>
                  )}
                </p>
              </div>
              {/* Celular: ações num menu ⋮ */}
              <button
                onClick={() => setMenuAcoes((v) => !v)}
                className="lg:hidden p-2 text-white/70 hover:text-white shrink-0"
                aria-label="Ações da conversa"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              <div
                onClick={() => setMenuAcoes(false)}
                className={`${menuAcoes ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row items-stretch lg:items-center gap-2 shrink-0
                  absolute lg:static right-2 top-full mt-1 lg:mt-0 z-20 w-60 lg:w-auto p-2 lg:p-0
                  bg-noite lg:bg-transparent border border-white/15 lg:border-0 rounded-xl lg:rounded-none shadow-2xl lg:shadow-none`}
              >
                {/* Kalebe 2026-09-29: conversa → projeto, já associados e pré-preenchidos */}
                {selecionada.contato?.projeto_id && (
                  <a
                    href={`/projetos/${selecionada.contato.projeto_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded bg-white/5 border border-white/15 text-white/80 text-xs font-bold hover:bg-white/10"
                  >
                    📁 Abrir projeto
                  </a>
                )}
                {/* Kalebe 2026-10-07: abrir demanda pro time de campo daqui da conversa */}
                {selecionada.contato && usuarioRole !== 'profissional_campo' && (
                  <BotaoNovaDemanda key={`demanda-${selecionada.id}`} conversaId={selecionada.id} variante="compacto" />
                )}
                {(selecionada.responsavel_id === usuarioId || usuarioRole === 'admin') && (
                  <button
                    onClick={() => setModalProjeto(true)}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded bg-verde/15 border border-verde/40 text-verde text-xs font-bold hover:bg-verde/25 disabled:opacity-40"
                    title="Cria o projeto com os dados da conversa e da fatura, já ligado a este atendimento"
                  >
                    {selecionada.contato?.projeto_id ? '＋ Projeto' : '📁 Transformar em projeto'}
                  </button>
                )}
                {!selecionada.encerrada_em && (usuarioRole === 'admin' || !selecionada.responsavel_id || selecionada.responsavel_id === usuarioId) && (
                  <button
                    onClick={() => { setOkMsg(null); setModalTransferir(true) }}
                    disabled={isPending}
                    title="Passa o atendimento pra outro usuário — a Laís avisa no WhatsApp com resumo e link"
                    className="px-3 py-1.5 rounded bg-weg-azul/15 border border-weg-azul/40 text-weg-azul text-xs font-bold hover:bg-weg-azul/25 disabled:opacity-40"
                  >
                    ↪ Transferir
                  </button>
                )}
                {(!selecionada.responsavel_id || selecionada.responsavel_id !== usuarioId) && (
                  <button
                    onClick={assumir}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded bg-sol/20 border border-sol/40 text-sol text-xs font-bold hover:bg-sol/30 disabled:opacity-40"
                  >
                    Assumir
                  </button>
                )}
                {!selecionada.encerrada_em && (
                  <button
                    onClick={encerrar}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded bg-coral/10 border border-coral/30 text-coral text-xs font-bold hover:bg-coral/20 disabled:opacity-40"
                  >
                    Encerrar
                  </button>
                )}
              </div>
            </div>

            {/* Kalebe 2026-10-09 (Spinzap): etiquetas do cliente no cabeçalho —
                etapa, produto/serviço, perfil, cidade e data de entrada */}
            <EtiquetasConversa
              key={`etq-${selecionada.id}`}
              c={selecionada}
              pendente={isPending}
              ehEquipe={ehEquipe(selecionada)}
              fornecedorPuro={ehFornecedorPuro(selecionada)}
              onEtapa={mudarEtapa}
              onEtiquetas={salvarEtiquetas}
              onFornecedor={() => { setErro(null); setModalFornecedor(true) }}
            />

            {/* Transferência temporária: aviso + devolução ao concluir */}
            {selecionada.transferida_de && !selecionada.encerrada_em && (
              <div className="shrink-0 mx-2 lg:mx-4 mt-2 px-3 py-2 bg-weg-azul/10 border border-weg-azul/30 rounded-lg flex flex-wrap items-center gap-2 justify-between">
                <p className="text-[11px] text-white/75 min-w-0">
                  ↪ Transferido por <strong className="text-white">{selecionada.transferidor?.nome_completo?.split(' ')[0] || 'colega'}</strong>
                  {selecionada.transferida_em && <> em {new Date(selecionada.transferida_em).toLocaleDateString('pt-BR')}</>}
                  {selecionada.transferencia_recado && <span className="text-white/55"> — “{selecionada.transferencia_recado}”</span>}
                  {selecionada.transferida_de === usuarioId && selecionada.responsavel_id !== usuarioId && (
                    <span className="text-white/55"> · volta pra você quando {selecionada.responsavel?.nome_completo?.split(' ')[0] || 'o colega'} concluir</span>
                  )}
                </p>
                {podeConcluir && (
                  <button
                    onClick={() => { setErro(null); setModalConcluir(true) }}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded bg-verde text-noite text-xs font-black hover:bg-verde/90 disabled:opacity-40 shrink-0"
                  >
                    ✔ Concluir atendimento
                  </button>
                )}
              </div>
            )}

            {/* Kalebe 2026-10-06: recados da Bianca deste cliente (saíram do sino) */}
            <AvisosDoCliente key={`avisos-${selecionada.id}`} conversaId={selecionada.id} compacto />

            {/* Kalebe 2026-09-29: janela de 24h fechada — o que sai do sistema não
                chega (Meta devolve "Re-engagement message"). Explica o caminho. */}
            {(!selecionada.janela_24h_expira_em || new Date(selecionada.janela_24h_expira_em) < new Date()) && (
              <BannerJanelaFechada
                key={selecionada.id}
                conversaId={selecionada.id}
                nuncaEscreveu={!selecionada.janela_24h_expira_em}
                nomeCliente={(selecionada.contato?.nome_exibicao || '').trim().split(/\s+/)[0] || ''}
                telefone={selecionada.contato?.telefone || null}
                temProjeto={!!selecionada.contato?.projeto_id}
                onEnviado={() => { refreshMensagens(selecionada.id); refreshConversas() }}
              />
            )}

            {/* Kalebe 2026-09-22: banner de alerta quando agente está no comando.
                Evita cenário em que você abre a conversa e responde por fora
                (WhatsApp Business no celular) sem saber que o agente segue
                respondendo em paralelo. */}
            {(selecionada.agente_ativo ||
              ['nova', 'em_qualificacao', 'aguardando_representante'].includes(selecionada.status)) &&
              (!selecionada.responsavel_id || selecionada.responsavel_id !== usuarioId) && (
              <div className="shrink-0 mx-2 lg:mx-4 mt-2 lg:mt-3 p-2 lg:p-3 bg-sol/15 border border-sol/40 rounded-lg flex items-center gap-2 lg:gap-3">
                <span className="text-xl lg:text-2xl">🤖</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs lg:text-sm font-bold text-sol">
                    Agente está respondendo automaticamente
                  </p>
                  <p className="hidden sm:block text-[11px] text-white/70 mt-0.5">
                    Se você vai responder por fora (WhatsApp no celular), clique
                    em <strong>Silenciar</strong> antes — senão o agente pode responder junto.
                  </p>
                </div>
                <button
                  onClick={assumir}
                  disabled={isPending}
                  className="px-3 lg:px-4 py-2 rounded bg-sol text-noite text-xs font-black hover:bg-sol/90 disabled:opacity-40 shrink-0"
                >
                  🔇 Silenciar<span className="hidden sm:inline"> agente</span>
                </button>
              </div>
            )}

            {/* Timeline */}
            <div ref={timelineRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 bg-noite/60">
              {mensagens.length === 0 ? (
                <p className="text-xs text-white/40 italic text-center py-8">Sem mensagens ainda.</p>
              ) : (
                mensagens.map((m) => (
                  <BolhaMensagem
                    key={m.id}
                    m={m}
                    contatos={{
                      temProjeto: !!contatosProj.projeto_id,
                      telefonesSalvos: contatosProj.telefones,
                      telefoneDaConversa: selecionada?.contato?.telefone || null,
                      onSalvar: (c) => setContatoPraSalvar(c),
                    }}
                  />
                ))
              )}
            </div>

            {/* Composição — Kalebe 2026-09-14: botões arquivo + chamada + vídeo */}
            {/* shrink-0: nunca é empurrada pra fora da tela. No celular (lista e
                conversa empilhadas) fica sticky no rodapé enquanto rola. */}
            <div className="shrink-0 sticky bottom-0 z-10 bg-noite p-3 border-t border-white/10 space-y-2">
              {erro && <p className="text-xs text-coral bg-coral/10 border border-coral/30 rounded p-2">{erro}</p>}
              {okMsg && (
                <p className="text-xs text-verde bg-verde/10 border border-verde/30 rounded p-2 flex items-start justify-between gap-2">
                  <span>{okMsg}</span>
                  <button onClick={() => setOkMsg(null)} className="text-white/50 hover:text-white shrink-0">✕</button>
                </p>
              )}
              {/* Kalebe 2026-09-29: caixa estilo WhatsApp — clipe, agenda da
                  Bianca, áudio gravado, ícones brancos minimalistas */}
              <ComposerWhatsApp
                key={selecionadaId}
                obterConversaId={async () => selecionadaId}
                placeholder={`Mensagem como ${usuarioNome || 'você'}`}
                onEnviado={() => { if (selecionadaId) refreshMensagens(selecionadaId); refreshConversas() }}
                onErro={setErro}
              />
            </div>
          </>
        )}
      </section>

      {/* Modal — transformar a conversa em projeto */}
      {modalTransferir && selecionada && (
        <ModalTransferir
          conversaId={selecionada.id}
          nomeCliente={selecionada.contato?.nome_exibicao || selecionada.contato?.telefone || 'cliente'}
          responsavelAtualId={selecionada.responsavel_id}
          onFechar={() => setModalTransferir(false)}
          onTransferido={(texto) => { setModalTransferir(false); setOkMsg(texto); refreshConversas() }}
        />
      )}

      {modalFornecedor && selecionada && (
        <ModalFornecedor
          conversaId={selecionada.id}
          nomeContato={selecionada.contato?.nome_exibicao || ''}
          cidade={selecionada.cidade || ''}
          uf={selecionada.uf || ''}
          atual={selecionada.contato?.fornecedor || null}
          onFechar={() => setModalFornecedor(false)}
          onSalvo={(texto) => { setModalFornecedor(false); setOkMsg(texto); refreshConversas(); refreshMensagens(selecionada.id) }}
        />
      )}

      {modalConcluir && selecionada && (
        <ModalConcluir
          conversaId={selecionada.id}
          nomeCliente={selecionada.contato?.nome_exibicao || selecionada.contato?.telefone || 'cliente'}
          devolverPara={selecionada.transferidor?.nome_completo || null}
          onFechar={() => setModalConcluir(false)}
          onConcluido={(nome) => {
            setModalConcluir(false)
            setOkMsg(`✔ Atendimento concluído. ${nome} recebeu o cliente de volta e foi avisado.`)
            refreshConversas()
            if (selecionada.transferida_de !== usuarioId && usuarioRole !== 'admin') voltarParaLista()
          }}
        />
      )}

      {modalProjeto && selecionadaId && (
        <ModalProjetoConversa
          conversaId={selecionadaId}
          onFechar={() => setModalProjeto(false)}
          onCriado={() => { refreshConversas(); carregarContatosProj(selecionadaId) }}
        />
      )}

      {/* Modal — salvar contato repassado pelo cliente (ex.: decisor) no projeto */}
      {contatoPraSalvar && selecionadaId && (
        <ModalSalvarContato
          conversaId={selecionadaId}
          contato={contatoPraSalvar}
          codigoProjeto={contatosProj.codigo}
          temProjeto={!!contatosProj.projeto_id}
          onFechar={() => setContatoPraSalvar(null)}
          onSalvo={() => { setContatoPraSalvar(null); carregarContatosProj(selecionadaId) }}
          onCriarProjeto={() => { setContatoPraSalvar(null); setModalProjeto(true) }}
        />
      )}

      {/* Modal — abrir conversa manual */}
      {modalAberto && (
        <div className="fixed inset-0 bg-noite/80 flex items-center justify-center p-4 z-50" onClick={() => setModalAberto(false)}>
          <div className="bg-noite border border-white/10 rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Abrir conversa manual</h3>
            <div className="space-y-2">
              <input
                value={novoTelefone}
                onChange={(e) => setNovoTelefone(e.target.value)}
                placeholder="Telefone (só números, ex 5548999998888)"
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white font-mono"
              />
              <input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome exibição (opcional)"
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white"
              />
            </div>
            {erro && <p className="text-xs text-coral mt-2">{erro}</p>}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setModalAberto(false)} className="text-xs text-white/60">Cancelar</button>
              <button
                onClick={abrirManual}
                disabled={isPending || !novoTelefone.trim()}
                className="px-4 py-2 rounded bg-verde text-noite text-xs font-bold disabled:opacity-40"
              >
                Abrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Kalebe 2026-09-30: janela de 24h fechada (ou cliente nunca escreveu) → envia
 * o modelo aprovado spin_retomar_atendimento. Quando o cliente responde, a
 * janela reabre e a conversa segue normal.
 */
function BannerJanelaFechada({ conversaId, nuncaEscreveu, nomeCliente, telefone, temProjeto, onEnviado }: {
  conversaId: string
  nuncaEscreveu: boolean
  nomeCliente: string
  telefone: string | null
  temProjeto: boolean
  onEnviado: () => void
}) {
  // App WhatsApp Business do número Spin: sem a trava de 24h da API; o envio volta pro inbox pelo eco
  function abrirNoApp() {
    if (!telefone) return
    let tel = telefone.replace(/\D/g, '')
    if (tel.length === 10 || tel.length === 11) tel = '55' + tel
    const celular = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    window.location.href = celular ? `https://wa.me/${tel}` : `whatsapp://send?phone=${tel}`
  }
  const [status, setStatus] = useState<{ status: string; rotulo: string; livre: string } | null>(null)
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(nomeCliente)
  const [assunto, setAssunto] = useState(temProjeto ? 'o seu projeto de energia solar' : 'energia solar')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => { statusModeloRetomadaAction().then(setStatus).catch(() => {}) }, [])
  const aprovado = status?.status === 'APPROVED'

  async function enviar() {
    setEnviando(true); setMsg(null)
    try {
      const r = await reabrirComModeloAction({ conversa_id: conversaId, nome_cliente: nome, assunto })
      if ('erro' in r) setMsg({ ok: false, texto: r.erro })
      else { setMsg({ ok: true, texto: 'Modelo enviado. Quando o cliente responder, a conversa reabre por 24h.' }); setAberto(false); onEnviado() }
    } finally { setEnviando(false) }
  }

  return (
    <div className="shrink-0 px-3 lg:px-4 py-2.5 bg-sol/10 border-b border-sol/30 text-xs text-white/80 space-y-2">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="min-w-0">
          🔒 <strong className="text-sol">Janela de 24h fechada</strong> —{' '}
          {nuncaEscreveu ? 'o cliente ainda não escreveu pro número da Spin.' : 'o cliente não fala com o número da Spin há mais de 24h.'}{' '}
          <span className="text-white/60">
            {status?.livre === 'APPROVED'
              ? 'Pode escrever normalmente: sua mensagem vai pelo modelo de atendimento (cobrado pela Meta) até o cliente responder.'
              : 'Texto livre não chega; o primeiro contato é pelo modelo aprovado.'}
          </span>
        </p>
        <div className="flex flex-wrap gap-2 shrink-0">
          {telefone && (
            <button onClick={abrirNoApp} title="Abre esta conversa no WhatsApp Business do número Spin"
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white font-bold hover:bg-white/15">
              📱 Abrir no WhatsApp Business
            </button>
          )}
          {!aberto && (
            <button onClick={() => setAberto(true)} disabled={!aprovado}
              title={aprovado ? '' : `Modelo ${status?.rotulo || '…'}`}
              className="px-3 py-1.5 rounded-lg bg-verde text-noite font-bold disabled:opacity-40">
              📨 Enviar modelo de retomada
            </button>
          )}
        </div>
      </div>
      {status && !aprovado && (
        <p className="text-[11px] text-white/55">
          Modelo <strong>{status.rotulo}</strong>. Enquanto isso, mande a primeira mensagem pelo WhatsApp Business do celular — ela aparece aqui.
        </p>
      )}
      {aberto && (
        <div className="rounded-lg bg-noite/60 border border-white/10 p-2.5 space-y-2">
          <p className="text-white/70">
            “Olá, <strong className="text-white">{nome || '…'}</strong>! Aqui é <em>você</em>, da Spin Solar. Estou dando continuidade ao seu atendimento sobre{' '}
            <strong className="text-white">{assunto || '…'}</strong>. Podemos continuar a conversa por aqui?” <span className="text-white/40">[Sim, pode falar]</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto_auto] gap-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente"
              className="px-2.5 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white focus:outline-none focus:border-sol" />
            <input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto"
              className="px-2.5 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white focus:outline-none focus:border-sol" />
            <button onClick={enviar} disabled={enviando || !nome.trim() || !assunto.trim()}
              className="px-3 py-1.5 rounded bg-verde text-noite font-bold disabled:opacity-40">
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
            <button onClick={() => setAberto(false)} className="px-3 py-1.5 rounded bg-white/5 text-white/60">Cancelar</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? 'text-verde' : 'text-coral'}>{msg.ok ? '✓' : '⚠'} {msg.texto}</p>}
    </div>
  )
}

/**
 * Kalebe 2026-10-01: transferir o atendimento — escolhe o usuário (A→Z), deixa
 * um recado opcional; a Laís avisa quem recebe no WhatsApp e no sino.
 */
function ModalTransferir({ conversaId, nomeCliente, responsavelAtualId, onFechar, onTransferido }: {
  conversaId: string
  nomeCliente: string
  responsavelAtualId: string | null
  onFechar: () => void
  onTransferido: (texto: string) => void
}) {
  type Setor = { chave: string; nome: string; emoji: string; usuarios: Array<{ id: string; nome: string; papel: string }> }
  const [setores, setSetores] = useState<Setor[] | null>(null)
  const [setorChave, setSetorChave] = useState('')
  const [paraId, setParaId] = useState('')
  const [recado, setRecado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Kalebe 2026-10-01: primeiro o setor, depois a pessoa do setor
  useEffect(() => {
    listarAtendentesAction().then((r) => {
      if ('erro' in r) { setErro(r.erro); return }
      setSetores(r.setores
        .map((s) => ({ ...s, usuarios: s.usuarios.filter((u) => u.id !== responsavelAtualId) }))
        .filter((s) => s.usuarios.length > 0))
    })
  }, [responsavelAtualId])
  const usuariosDoSetor = setores?.find((s) => s.chave === setorChave)?.usuarios || []

  async function transferir() {
    if (!paraId) return
    setEnviando(true); setErro(null)
    try {
      const r = await transferirConversaAction({ conversa_id: conversaId, para_id: paraId, recado })
      if ('erro' in r) { setErro(r.erro); return }
      const primeiro = r.nome.split(' ')[0] || 'o colega'
      onTransferido(r.whatsapp
        ? `↪ Transferido pra ${r.nome}. A Laís avisou ${primeiro} no WhatsApp com o resumo e o link.`
        : `↪ Transferido pra ${r.nome}. Aviso no sino do portal${r.motivo ? ` — WhatsApp não foi (${r.motivo})` : ''}.`)
    } finally { setEnviando(false) }
  }

  const papel: Record<string, string> = {
    admin: 'admin', representante: 'representante', vendedor_servicos: 'vendedor de serviços',
    colaborador: 'colaborador', instalador: 'instalador', profissional_campo: 'profissional de campo',
  }
  const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="w-full max-w-md bg-noite border border-white/15 rounded-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white">↪ Transferir atendimento</h2>
        <p className="text-xs text-white/60">
          Conversa com <strong className="text-white">{nomeCliente}</strong>. Quem receber vira o responsável e a Laís
          avisa no WhatsApp com um resumo da conversa e o link.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[11px] font-bold text-white/60 mb-1">Setor</span>
            <select value={setorChave} onChange={(e) => { setSetorChave(e.target.value); setParaId('') }}
              className={inputCls} disabled={!setores}>
              <option value="" className="bg-noite">{setores ? 'Escolha o setor…' : 'Carregando…'}</option>
              {(setores || []).map((s) => (
                <option key={s.chave} value={s.chave} className="bg-noite">{s.emoji} {s.nome} ({s.usuarios.length})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-bold text-white/60 mb-1">Usuário</span>
            <select value={paraId} onChange={(e) => setParaId(e.target.value)} className={inputCls} disabled={!setorChave}>
              <option value="" className="bg-noite">{setorChave ? 'Escolha quem recebe…' : 'Escolha o setor antes'}</option>
              {usuariosDoSetor.map((a) => (
                <option key={a.id} value={a.id} className="bg-noite">{a.nome} · {papel[a.papel] || a.papel}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="block text-[11px] font-bold text-white/60 mb-1">Recado (opcional)</span>
          <textarea value={recado} onChange={(e) => setRecado(e.target.value)} rows={3} maxLength={500}
            placeholder="Ex.: cliente quer visita técnica essa semana; já mandei a proposta v2."
            className={`${inputCls} resize-none`} />
        </label>
        {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Cancelar</button>
          <button onClick={transferir} disabled={enviando || !paraId}
            className="px-4 py-2 bg-weg-azul text-white font-bold text-sm rounded-lg disabled:opacity-50">
            {enviando ? 'Transferindo e avisando…' : 'Transferir e avisar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Kalebe 2026-10-09 (Spinzap): etiquetas do cliente no cabeçalho da conversa —
 * etapa do atendimento (cor da barra lateral), produto/serviço, perfil de
 * compra, cidade/UF e data de entrada do lead. A Laís preenche; aqui corrige.
 */
function EtiquetasConversa({ c, pendente, ehEquipe, fornecedorPuro, onEtapa, onEtiquetas, onFornecedor }: {
  c: Conversa
  pendente: boolean
  ehEquipe: boolean
  /** Só fornecedor (sem cliente/projeto): fora do funil — sem etapa e produto */
  fornecedorPuro: boolean
  onEtapa: (etapa: string) => void
  onEtiquetas: (e: { cidade?: string | null; uf?: string | null; produto?: string | null }) => void
  onFornecedor: () => void
}) {
  const [editando, setEditando] = useState<null | 'produto' | 'cidade'>(null)
  const [cidade, setCidade] = useState(c.cidade || '')
  const [uf, setUf] = useState(c.uf || '')
  const etapa = (c.etapa || 'atendimento_lais') as Etapa
  const info = INFO_ETAPA[etapa] || ETAPAS[0]
  const produto = infoProduto(c.produto)
  const entrada = c.contato?.criado_em || c.criada_em
  const fornec = c.contato?.fornecedor || null
  const chip = 'px-2 py-0.5 rounded-full border text-[11px] font-bold'

  if (ehEquipe) return null
  return (
    <div className="shrink-0 px-2 lg:px-4 py-1.5 border-b border-white/10 flex flex-wrap items-center gap-1.5">
      {/* Kalebe 2026-10-09: contato também pode ser fornecedor (equipamento, produtos, serviço) */}
      {fornec ? (
        <button onClick={onFornecedor} title={`Fornecedor: ${fornec.nome_fantasia || fornec.razao_social} — clique pra ver ou ajustar`}
          className={`${chip} bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b] hover:brightness-125`}>
          🏭 Fornecedor{fornec.tipos?.length ? ` · ${rotuloTiposFornecedor(fornec.tipos)}` : ''}
        </button>
      ) : null}

      {!fornecedorPuro && (<>
      {/* Etapa: a ordem segue o funil (exceção ao A→Z) */}
      <select
        value={etapa}
        disabled={pendente}
        onChange={(e) => onEtapa(e.target.value)}
        title="Etapa do atendimento"
        className={`${chip} ${info.cls} cursor-pointer focus:outline-none appearance-none pr-2`}
      >
        {ETAPAS.map((e) => <option key={e.chave} value={e.chave} className="bg-noite text-white">{e.emoji} {e.rotulo}</option>)}
      </select>

      {editando === 'produto' ? (
        <select
          autoFocus
          value={c.produto || ''}
          onChange={(e) => { onEtiquetas({ produto: e.target.value || null }); setEditando(null) }}
          onBlur={() => setEditando(null)}
          className={`${chip} bg-white/5 border-white/25 text-white focus:outline-none`}
        >
          <option value="" className="bg-noite">— sem produto —</option>
          {PRODUTOS.map((p) => <option key={p.valor} value={p.valor} className="bg-noite">{p.rotulo}</option>)}
        </select>
      ) : (
        <button onClick={() => setEditando('produto')} title="Produto/serviço — clique pra trocar"
          className={`${chip} ${produto ? 'bg-sol/10 border-sol/35 text-sol' : 'bg-white/[0.03] border-dashed border-white/20 text-white/45'} hover:brightness-125`}>
          {produto ? `${produto.emoji} ${produto.rotulo}` : '＋ Produto'}
        </button>
      )}
      {produto?.perfil && (
        <span className={`${chip} bg-white/[0.04] border-white/15 text-white/60`} title="Perfil de compra">{produto.perfil}</span>
      )}
      </>)}

      {editando === 'cidade' ? (
        <form
          onSubmit={(e) => { e.preventDefault(); onEtiquetas({ cidade, uf }); setEditando(null) }}
          className="flex items-center gap-1"
        >
          <input autoFocus value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade"
            className="w-32 px-2 py-0.5 rounded-full bg-white/5 border border-white/25 text-[11px] text-white focus:outline-none" />
          <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="UF"
            className="w-10 px-2 py-0.5 rounded-full bg-white/5 border border-white/25 text-[11px] text-white uppercase focus:outline-none" />
          <button type="submit" className="px-2 py-0.5 rounded-full bg-verde/20 border border-verde/40 text-verde text-[11px] font-bold">OK</button>
          <button type="button" onClick={() => { setCidade(c.cidade || ''); setUf(c.uf || ''); setEditando(null) }}
            className="px-1.5 text-white/50 text-[11px]">✕</button>
        </form>
      ) : (
        <button onClick={() => setEditando('cidade')} title="Cidade — clique pra trocar"
          className={`${chip} ${c.cidade ? 'bg-white/[0.04] border-white/15 text-white/75' : 'bg-white/[0.03] border-dashed border-white/20 text-white/45'} hover:brightness-125`}>
          📍 {c.cidade ? `${c.cidade}${c.uf ? '/' + c.uf : ''}` : 'Cidade'}
        </button>
      )}

      <span className={`${chip} bg-white/[0.03] border-white/10 text-white/50 font-mono`} title="Entrada do lead no sistema">
        📥 {new Date(entrada).toLocaleDateString('pt-BR')}
      </span>

      {!fornec && (
        <button onClick={onFornecedor} title="Cadastrar este contato também como fornecedor (equipamento, produtos ou serviço)"
          className={`${chip} bg-white/[0.03] border-dashed border-white/20 text-white/45 hover:text-[#f59e0b] hover:border-[#f59e0b]/40`}>
          ＋ Fornecedor
        </button>
      )}
    </div>
  )
}

/**
 * Kalebe 2026-10-09 (Spinzap): "o lead pode ser também cadastrado como
 * fornecedor de equipamento, de produtos e de serviço". Cria no cadastro de
 * fornecedores (o mesmo do Financeiro) ou liga a um que já existe.
 */
function ModalFornecedor({ conversaId, nomeContato, cidade: cidadeIni, uf: ufIni, atual, onFechar, onSalvo }: {
  conversaId: string
  nomeContato: string
  cidade: string
  uf: string
  atual: { id: string; razao_social: string; nome_fantasia: string | null; tipos: string[] | null } | null
  onFechar: () => void
  onSalvo: (texto: string) => void
}) {
  const [existentes, setExistentes] = useState<Array<{ id: string; nome: string; cnpj: string | null; tipos: string[] }> | null>(null)
  const [vincularId, setVincularId] = useState('')
  const [tipos, setTipos] = useState<string[]>(atual?.tipos || [])
  const [razao, setRazao] = useState(nomeContato)
  const [fantasia, setFantasia] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [cidade, setCidade] = useState(cidadeIni)
  const [uf, setUf] = useState(ufIni)
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (atual) return
    listarFornecedoresAction().then((r) => { if ('fornecedores' in r) setExistentes(r.fornecedores); else setExistentes([]) })
  }, [atual])

  function alternar(t: string) {
    setTipos((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))
  }

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await cadastrarFornecedorDaConversaAction({
        conversa_id: conversaId,
        fornecedor_id: atual?.id || vincularId || null,
        substituir_tipos: !!atual,
        razao_social: razao, nome_fantasia: fantasia, cnpj, tipos, cidade, uf, observacoes: obs,
      })
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo(atual ? `🏭 Fornecedor atualizado: ${r.nome}.` : `🏭 Cadastrado como fornecedor: ${r.nome}. Já aparece no cadastro do Financeiro.`)
    } finally { setSalvando(false) }
  }

  async function desvincular() {
    if (!confirm('Tirar a marcação de fornecedor deste contato? O cadastro continua no Financeiro.')) return
    setSalvando(true); setErro(null)
    try {
      const r = await desvincularFornecedorDaConversaAction(conversaId)
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo('Marcação de fornecedor removida deste contato.')
    } finally { setSalvando(false) }
  }

  const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'
  const novo = !atual && !vincularId
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-noite border border-white/15 rounded-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white">🏭 {atual ? 'Fornecedor' : 'Cadastrar como fornecedor'}</h2>
        {atual ? (
          <p className="text-xs text-white/60">
            Este contato é o fornecedor <strong className="text-white">{atual.nome_fantasia || atual.razao_social}</strong>.
            Os dados completos ficam no cadastro de fornecedores do Financeiro.
          </p>
        ) : (
          <p className="text-xs text-white/60">
            O contato continua como lead/cliente; passa a ser também fornecedor. Se não tiver cliente nem projeto,
            sai do funil e a Laís não atende mais.
          </p>
        )}

        <div>
          <span className="block text-[11px] font-bold text-white/60 mb-1">Fornece</span>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_FORNECEDOR.map((t) => (
              <button key={t.chave} type="button" onClick={() => alternar(t.chave)}
                className={`px-3 py-1.5 rounded-full border text-xs font-bold ${
                  tipos.includes(t.chave) ? 'bg-[#f59e0b]/15 border-[#f59e0b]/50 text-[#f59e0b]' : 'bg-white/[0.03] border-white/15 text-white/60 hover:bg-white/[0.06]'
                }`}>
                {tipos.includes(t.chave) ? '✓ ' : ''}{t.emoji} {t.rotulo}
              </button>
            ))}
          </div>
        </div>

        {!atual && (existentes?.length || 0) > 0 && (
          <label className="block">
            <span className="block text-[11px] font-bold text-white/60 mb-1">Já está no cadastro?</span>
            <select value={vincularId} onChange={(e) => setVincularId(e.target.value)} className={inputCls}>
              <option value="" className="bg-noite">Não — cadastrar novo</option>
              {existentes!.map((f) => (
                <option key={f.id} value={f.id} className="bg-noite">{f.nome}{f.cnpj ? ` · ${f.cnpj}` : ''}</option>
              ))}
            </select>
          </label>
        )}

        {novo && (
          <>
            <label className="block">
              <span className="block text-[11px] font-bold text-white/60 mb-1">Nome / razão social</span>
              <input value={razao} onChange={(e) => setRazao(e.target.value)} className={inputCls} />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">Nome fantasia (opcional)</span>
                <input value={fantasia} onChange={(e) => setFantasia(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">CNPJ/CPF (opcional)</span>
                <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} inputMode="numeric" className={inputCls} />
              </label>
            </div>
            <div className="grid grid-cols-[1fr_70px] gap-2">
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">Cidade</span>
                <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">UF</span>
                <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} className={`${inputCls} uppercase`} />
              </label>
            </div>
            <label className="block">
              <span className="block text-[11px] font-bold text-white/60 mb-1">O que fornece (opcional)</span>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={500}
                placeholder="Ex.: distribuidor de cabos e proteção CA; instalação de estrutura em solo."
                className={`${inputCls} resize-none`} />
            </label>
          </>
        )}

        {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {atual ? (
            <button onClick={desvincular} disabled={salvando} className="px-3 py-2 text-xs text-coral/80 hover:text-coral font-bold disabled:opacity-40">
              Tirar marcação
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Cancelar</button>
            <button onClick={salvar} disabled={salvando || tipos.length === 0 || (novo && razao.trim().length < 2)}
              className="px-4 py-2 bg-[#f59e0b] text-noite font-bold text-sm rounded-lg disabled:opacity-50">
              {salvando ? 'Salvando…' : atual ? 'Salvar' : 'Cadastrar fornecedor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Kalebe 2026-10-09 (Spinzap): "Concluir atendimento" — quem recebeu a
 * transferência conta o que foi feito e devolve o cliente.
 */
function ModalConcluir({ conversaId, nomeCliente, devolverPara, onFechar, onConcluido }: {
  conversaId: string
  nomeCliente: string
  devolverPara: string | null
  onFechar: () => void
  onConcluido: (nome: string) => void
}) {
  const [resumo, setResumo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function concluir() {
    setEnviando(true); setErro(null)
    try {
      const r = await concluirAtendimentoAction(conversaId, resumo)
      if ('erro' in r) { setErro(r.erro); return }
      onConcluido((r.devolvido_para || devolverPara || 'Quem transferiu').split(' ')[0])
    } finally { setEnviando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="w-full max-w-md bg-noite border border-white/15 rounded-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white">✔ Concluir atendimento</h2>
        <p className="text-xs text-white/60">
          <strong className="text-white">{nomeCliente}</strong> volta pra{' '}
          <strong className="text-white">{devolverPara?.split(' ')[0] || 'quem transferiu'}</strong>, que recebe o seu resumo
          no WhatsApp. Depois disso a conversa sai da sua lista.
        </p>
        <label className="block">
          <span className="block text-[11px] font-bold text-white/60 mb-1">O que foi feito</span>
          <textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={4} maxLength={1000} autoFocus
            placeholder="Ex.: visita técnica feita, telhado ok; cliente quer a proposta com bateria."
            className="w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none" />
        </label>
        {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Cancelar</button>
          <button onClick={concluir} disabled={enviando || resumo.trim().length < 5}
            className="px-4 py-2 bg-verde text-noite font-bold text-sm rounded-lg disabled:opacity-50">
            {enviando ? 'Devolvendo…' : 'Concluir e devolver'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Foto enviada à mão (contato ou cliente vinculado) — a Meta não entrega a do WhatsApp. */
function fotoDoContato(c: Conversa): string | null {
  return c.contato?.foto_url || c.contato?.cliente?.foto_url || null
}

function ItemConversa({ c, selecionada, onClick }: {
  c: Conversa; selecionada: boolean; onClick: () => void
}) {
  const nome = c.contato?.nome_exibicao || c.contato?.telefone || 'Sem nome'
  const encerrada = !!c.encerrada_em
  const status = c.status.replace(/_/g, ' ')
  const dt = c.ultima_mensagem_em ? new Date(c.ultima_mensagem_em) : null
  const hora = dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  // Kalebe 2026-09-30: etiqueta de não lidas, como no WhatsApp
  const naoLidas = !selecionada ? c.nao_lidas || 0 : 0
  const produto = infoProduto(c.produto)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-white/5 transition ${
        selecionada ? 'bg-sol/[0.06] border-l-2 border-l-sol' : 'hover:bg-white/[0.02]'
      } ${encerrada ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2.5">
      <AvatarContato nome={c.contato?.nome_exibicao || c.contato?.telefone || ''} semente={c.contato?.telefone} foto={fotoDoContato(c)} tamanho={40} />
      <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm truncate flex-1 ${naoLidas > 0 ? 'font-black text-white' : 'font-semibold text-white'}`}>{nome}</p>
        <span className={`text-[10px] font-mono shrink-0 ${naoLidas > 0 ? 'text-verde font-bold' : 'text-white/40'}`}>{hora}</span>
        {naoLidas > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-verde text-noite text-[11px] font-black flex items-center justify-center shrink-0"
            title={`${naoLidas} mensagem(ns) não lida(s)`}>
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
        <span className={`text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded shrink-0 ${
          c.status === 'aguardando_representante' ? 'bg-sol/20 text-sol'
            : c.status === 'em_atendimento' ? 'bg-verde/20 text-verde'
            : c.status === 'encerrada' ? 'bg-white/10 text-white/50'
            : 'bg-weg-azul/20 text-weg-azul'
        }`}>
          {status}
        </span>
        {/* Spinzap: produto/serviço e cidade como etiquetas */}
        {produto && (
          <span className="text-[10px] text-white/70 truncate shrink-0 max-w-[45%]" title={produto.rotulo}>
            {produto.emoji} {produto.rotulo}
          </span>
        )}
        {c.cidade && (
          <span className="text-[10px] text-white/45 truncate" title={`${c.cidade}${c.uf ? '/' + c.uf : ''}`}>
            📍 {c.cidade}
          </span>
        )}
        {c.transferida_de && !encerrada && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-weg-azul/15 text-weg-azul shrink-0" title="Atendimento transferido — volta ao concluir">
            ↪
          </span>
        )}
        {/* Kalebe 2026-09-29: conversa com alguém da equipe (avisos internos) ≠ cliente */}
        {(c.contato?.tipo === 'colaborador' || c.contato?.tipo === 'representante') && (
          <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-weg-azul/15 text-weg-azul">
            👥 Equipe
          </span>
        )}
        {c.contato?.fornecedor && (
          <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] shrink-0"
            title={`Fornecedor: ${rotuloTiposFornecedor(c.contato.fornecedor.tipos) || '—'}`}>
            🏭 Fornec.
          </span>
        )}
        {c.responsavel && (
          <span className="text-[10px] text-white/50 truncate">
            👤 {c.responsavel.nome_completo?.split(' ')[0]}
          </span>
        )}
      </div>
      </div>
      </div>
    </button>
  )
}

function ModalSalvarContato({
  conversaId, contato, codigoProjeto, temProjeto, onFechar, onSalvo, onCriarProjeto,
}: {
  conversaId: string
  contato: { nome: string; telefone: string; origem: 'whatsapp_cartao' | 'whatsapp_texto'; wa_mensagem_id: string }
  codigoProjeto: string | null
  temProjeto: boolean
  onFechar: () => void
  onSalvo: () => void
  onCriarProjeto: () => void
}) {
  const [nome, setNome] = useState(contato.nome)
  const [papel, setPapel] = useState<'decisor' | 'financeiro' | 'tecnico' | 'outro'>('decisor')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await salvarContatoDaConversaAction({
        conversa_id: conversaId, nome, telefone: contato.telefone, papel,
        origem: contato.origem, wa_mensagem_id: contato.wa_mensagem_id,
      })
      if ('erro' in r) setErro(r.erro)
      else onSalvo()
    } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="w-full max-w-sm bg-noite border border-white/15 rounded-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white">📇 Salvar contato no projeto</h2>
        {!temProjeto ? (
          <>
            <p className="text-sm text-white/70">Esta conversa ainda não tem projeto. Transforme em projeto primeiro — os cartões de contato que o cliente mandou entram junto.</p>
            <div className="flex justify-end gap-2">
              <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Fechar</button>
              <button onClick={onCriarProjeto} className="px-4 py-2 bg-verde text-noite font-bold text-sm rounded-lg">Transformar em projeto</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-white/50">
              {formatarTelefoneExibicao(contato.telefone)} vai pros contatos do projeto {codigoProjeto || ''}.
            </p>
            <label className="block">
              <span className="block text-[11px] font-bold text-white/60 mb-1">Nome</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} placeholder="Ex.: Marcos (sócio)" />
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold text-white/60 mb-1">Papel</span>
              <select value={papel} onChange={(e) => setPapel(e.target.value as any)} className={inputCls}>
                <option value="decisor" className="bg-noite">Decisor</option>
                <option value="financeiro" className="bg-noite">Financeiro</option>
                <option value="tecnico" className="bg-noite">Técnico</option>
                <option value="outro" className="bg-noite">Outro</option>
              </select>
            </label>
            {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Cancelar</button>
              <button onClick={salvar} disabled={salvando || !nome.trim()} className="px-4 py-2 bg-verde text-noite font-bold text-sm rounded-lg disabled:opacity-50">
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

type ContextoContatos = {
  temProjeto: boolean
  telefonesSalvos: string[]
  telefoneDaConversa: string | null
  onSalvar: (c: { nome: string; telefone: string; origem: 'whatsapp_cartao' | 'whatsapp_texto'; wa_mensagem_id: string }) => void
}

/**
 * Kalebe 2026-09-29: cliente repassa o contato do decisor (cartão de contato
 * ou número digitado) → botão pra salvar nos contatos do projeto.
 */
function SalvarContatosDaMensagem({ m, contatos }: { m: Mensagem; contatos: ContextoContatos }) {
  const candidatos = m.tipo === 'contacts'
    ? cartoesDoTexto(m.texto).filter((c) => c.telefone).map((c) => ({ ...c, origem: 'whatsapp_cartao' as const }))
    : m.tipo === 'text'
      ? telefonesNoTexto(m.texto).map((t) => ({ nome: '', telefone: t, email: null, origem: 'whatsapp_texto' as const }))
      : []
  const lista = candidatos.filter((c) => c.telefone && c.telefone !== contatos.telefoneDaConversa)
  if (lista.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {lista.map((c) => contatos.telefonesSalvos.includes(c.telefone!) ? (
        <span key={c.telefone} className="text-[10px] text-verde">✓ {formatarTelefoneExibicao(c.telefone!)} nos contatos do projeto</span>
      ) : (
        <button
          key={c.telefone}
          type="button"
          onClick={() => contatos.onSalvar({ nome: c.nome, telefone: c.telefone!, origem: c.origem, wa_mensagem_id: m.id })}
          className="text-[10px] px-2 py-1 rounded-full bg-white/[0.06] border border-white/15 text-white/80 hover:bg-white/10"
          title={contatos.temProjeto ? 'Salvar nos contatos do projeto' : 'Transforme a conversa em projeto primeiro'}
        >
          📇 Salvar {formatarTelefoneExibicao(c.telefone!)} no projeto
        </button>
      ))}
    </div>
  )
}

function BolhaMensagem({ m, contatos }: { m: Mensagem; contatos?: ContextoContatos }) {
  const isInbound = m.direcao === 'inbound'
  // Kalebe 2026-09-25: mídia que não foi salva no Storage (grande demais,
  // tipo recusado, falha) pode ser baixada de novo da Meta por ~30 dias.
  const [urlRecuperada, setUrlRecuperada] = useState<string | null>(null)
  const [recuperando, setRecuperando] = useState(false)
  const [erroRecuperar, setErroRecuperar] = useState<string | null>(null)
  const midiaUrl = m.midia_url || urlRecuperada
  async function recuperar() {
    setRecuperando(true); setErroRecuperar(null)
    try {
      const r = await recuperarMidiaAction(m.id)
      if ('erro' in r) setErroRecuperar(r.erro)
      else setUrlRecuperada(r.midia_url)
    } finally { setRecuperando(false) }
  }
  const semArquivo = (rotulo: string) => m.midia_expirada_em ? (
    <div>
      <p className="text-sm text-white italic">{rotulo}</p>
      <p className="text-[10px] text-white/40 mt-0.5">🗑 Arquivo removido (regra de 180 dias)</p>
    </div>
  ) : (
    <div>
      <p className="text-sm text-white italic">{rotulo}</p>
      {m.midia_meta_id && (
        <button
          type="button"
          onClick={recuperar}
          disabled={recuperando}
          className="mt-1 text-[11px] text-sol hover:underline disabled:opacity-50"
        >
          {recuperando ? 'Baixando…' : '🔄 Carregar arquivo'}
        </button>
      )}
      {erroRecuperar && <p className="text-[10px] text-coral mt-0.5">{erroRecuperar}</p>}
    </div>
  )
  // Kalebe 2026-10-01: pessoa da equipe por "primeiro nome · setor" (agentes
  // e "WhatsApp (celular)" ficam como estão)
  const nomeRemetente = rotuloNaTela(m)
  const hora = new Date(m.criada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const statusIcon = m.status_entrega === 'lida' ? '✓✓' :
    m.status_entrega === 'entregue' ? '✓✓' :
    m.status_entrega === 'enviada' ? '✓' :
    m.status_entrega === 'falhou' ? '⚠' : '⋯'
  const statusCor = m.status_entrega === 'lida' ? 'text-weg-azul'
    : m.status_entrega === 'falhou' ? 'text-coral'
    : 'text-white/40'

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[70%] rounded-lg px-3 py-2 ${
        isInbound ? 'bg-white/[0.05] border border-white/10' : 'bg-verde/15 border border-verde/30'
      }`}>
        {!isInbound && nomeRemetente && (
          <p className="text-[10px] font-bold text-verde mb-0.5">{nomeRemetente}</p>
        )}
        {m.tipo === 'text' ? (
          <p className="text-sm text-white whitespace-pre-wrap break-words">{m.texto || ''}</p>
        ) : m.tipo === 'audio' ? (
          midiaUrl ? (
            <audio controls src={midiaUrl} className="max-w-full h-8" />
          ) : (
            semArquivo(`🎙 áudio ${m.midia_duracao_seg ? `(${m.midia_duracao_seg}s)` : ''}`)
          )
        ) : m.tipo === 'image' ? (
          midiaUrl ? (
            <a href={midiaUrl} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={midiaUrl}
                alt="imagem enviada"
                className="max-w-[220px] max-h-[220px] rounded object-cover hover:opacity-90 transition"
                loading="lazy"
              />
            </a>
          ) : (
            semArquivo('🖼 imagem')
          )
        ) : m.tipo === 'document' ? (
          midiaUrl ? (
            <a
              href={midiaUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="flex items-center gap-2 text-sm text-white hover:text-sol transition"
            >
              <span className="text-lg">📄</span>
              <span className="underline break-all">{m.texto || 'documento.pdf'}</span>
            </a>
          ) : (
            semArquivo(`📎 ${m.texto || 'documento'}`)
          )
        ) : m.tipo === 'video' ? (
          midiaUrl ? (
            <video controls src={midiaUrl} className="max-w-[260px] max-h-[260px] rounded" />
          ) : (
            semArquivo('🎬 vídeo')
          )
        ) : m.tipo === 'contacts' ? (
          <div className="space-y-1.5">
            {cartoesDoTexto(m.texto).map((c, i) => (
              <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.05] border border-white/10">
                <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-white/80 shrink-0">
                  {(c.nome[0] || '?').toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{c.nome}</span>
                  {c.telefone && <span className="block text-[11px] text-white/60 font-mono">{formatarTelefoneExibicao(c.telefone)}</span>}
                </span>
              </div>
            ))}
          </div>
        ) : m.tipo === 'sticker' && midiaUrl ? (
          <img src={midiaUrl} alt="figurinha" className="w-28 h-28 object-contain" loading="lazy" />
        ) : m.texto ? (
          <p className="text-sm text-white whitespace-pre-wrap break-words">{m.texto}</p>
        ) : (
          <p className="text-sm text-white italic">[{m.tipo}]</p>
        )}
        {isInbound && contatos && <SalvarContatosDaMensagem m={m} contatos={contatos} />}
        <p className={`text-[10px] mt-1 flex items-center gap-1 ${isInbound ? 'text-white/40' : 'text-white/50 justify-end'}`}>
          <span>{hora}</span>
          {!isInbound && <span className={statusCor}>{statusIcon}</span>}
          {m.erro && <span className="text-coral">· {m.erro}</span>}
        </p>
      </div>
    </div>
  )
}
