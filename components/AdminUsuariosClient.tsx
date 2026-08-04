'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  convidarUsuarioAction, mudarRoleAction, toggleAtivoAction, reenviarConviteAction,
  type Role,
} from '@/app/admin/usuarios/actions'
import { formatarTelefone } from '@/lib/formatters'

type Usuario = {
  id: string
  nome_completo: string
  telefone: string | null
  role: Role
  avatar_url: string | null
  ativo: boolean
  created_at: string
  email: string | null
  email_confirmado: boolean
  ultimo_login: string | null
  convite_pendente: boolean
}

type RoleInfo = { label: string; emoji: string; cor: string; bg: string }

const ROLES_INFO: Record<Role, RoleInfo> = {
  admin:              { label: 'Admin',              emoji: '👑', cor: 'text-sol',      bg: 'bg-sol/10 border-sol/30' },
  representante:      { label: 'Representante',      emoji: '🤝', cor: 'text-weg-azul', bg: 'bg-weg-azul/10 border-weg-azul/30' },
  instalador:         { label: 'Instalador',         emoji: '🔧', cor: 'text-verde',    bg: 'bg-verde/10 border-verde/30' },
  colaborador:        { label: 'Colaborador',        emoji: '👤', cor: 'text-white/70', bg: 'bg-white/10 border-white/20' },
  vendedor_servicos:  { label: 'Vendedor Serviços',  emoji: '📞', cor: 'text-coral',    bg: 'bg-coral/10 border-coral/30' },
}

/** Fallback pra role desconhecido — evita crash "Cannot read 'bg' of undefined"
 *  se banco tiver algum role fora do enum previsto (ex: valor legacy, typo em UPDATE manual). */
const ROLE_FALLBACK: RoleInfo = { label: '(desconhecido)', emoji: '❓', cor: 'text-white/50', bg: 'bg-white/5 border-white/10' }
const infoDo = (r: string | null | undefined): RoleInfo => (r && (ROLES_INFO as Record<string, RoleInfo>)[r]) || ROLE_FALLBACK

export function AdminUsuariosClient({ usuarios, meuId }: { usuarios: Usuario[]; meuId: string }) {
  const [busca, setBusca] = useState('')
  const [filtroRole, setFiltroRole] = useState<'todos' | Role>('todos')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativos' | 'inativos' | 'convite'>('todos')
  const [abrindoConvite, setAbrindoConvite] = useState(false)
  const [msgGlobal, setMsgGlobal] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const filtrados = useMemo(() => {
    return usuarios.filter(u => {
      if (filtroRole !== 'todos' && u.role !== filtroRole) return false
      if (filtroStatus === 'ativos' && !u.ativo) return false
      if (filtroStatus === 'inativos' && u.ativo) return false
      if (filtroStatus === 'convite' && !u.convite_pendente) return false
      if (busca) {
        const q = busca.toLowerCase()
        const alvo = `${u.nome_completo} ${u.email || ''} ${u.telefone || ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    })
  }, [usuarios, busca, filtroRole, filtroStatus])

  const stats = useMemo(() => ({
    total: usuarios.length,
    ativos: usuarios.filter(u => u.ativo).length,
    conviteAberto: usuarios.filter(u => u.convite_pendente).length,
    porRole: usuarios.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc }, {} as Record<Role, number>),
  }), [usuarios])

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatBadge label="Total" value={stats.total} />
        <StatBadge label="Ativos" value={stats.ativos} cor="text-verde" />
        <StatBadge label="Convite pendente" value={stats.conviteAberto} cor="text-sol" />
        <StatBadge label="Admins" value={stats.porRole.admin || 0} cor="text-sol" />
        <StatBadge label="Representantes" value={stats.porRole.representante || 0} cor="text-weg-azul" />
      </div>

      {/* Ações + filtros */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <button
          onClick={() => setAbrindoConvite(true)}
          className="px-4 py-2.5 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition text-sm shrink-0"
        >
          ➕ Convidar novo usuário
        </button>

        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="🔍 Buscar por nome, email ou telefone..."
          className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:border-sol focus:outline-none text-sm"
        />

        <select
          value={filtroRole}
          onChange={e => setFiltroRole(e.target.value as 'todos' | Role)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
        >
          <option value="todos" style={{ backgroundColor: '#050B16' }}>Todos os roles</option>
          {(Object.entries(ROLES_INFO) as [Role, typeof ROLES_INFO[Role]][]).map(([k, info]) => (
            <option key={k} value={k} style={{ backgroundColor: '#050B16' }}>{info.emoji} {info.label}</option>
          ))}
        </select>

        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value as 'todos' | 'ativos' | 'inativos' | 'convite')}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
        >
          <option value="todos" style={{ backgroundColor: '#050B16' }}>Todos status</option>
          <option value="ativos" style={{ backgroundColor: '#050B16' }}>✓ Só ativos</option>
          <option value="inativos" style={{ backgroundColor: '#050B16' }}>✕ Só inativos</option>
          <option value="convite" style={{ backgroundColor: '#050B16' }}>📮 Convite pendente</option>
        </select>
      </div>

      {msgGlobal && (
        <div className={`p-3 rounded-lg border text-sm ${
          msgGlobal.tipo === 'erro'
            ? 'bg-coral/10 border-coral/30 text-coral'
            : 'bg-verde/10 border-verde/30 text-verde'
        }`}>
          {msgGlobal.texto}
          <button onClick={() => setMsgGlobal(null)} className="float-right text-xs opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {filtrados.length === 0 ? (
          <p className="text-center text-white/40 py-12 text-sm">Nenhum usuário corresponde aos filtros.</p>
        ) : (
          filtrados.map(u => (
            <LinhaUsuario
              key={u.id}
              usuario={u}
              ehVoceMesmo={u.id === meuId}
              onMsg={setMsgGlobal}
            />
          ))
        )}
      </div>

      {/* Modal Convite */}
      {abrindoConvite && (
        <ModalConvite
          onFechar={() => setAbrindoConvite(false)}
          onMsg={setMsgGlobal}
        />
      )}
    </div>
  )
}

function StatBadge({ label, value, cor = 'text-white' }: { label: string; value: number; cor?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
      <p className={`text-2xl font-black ${cor}`}>{value}</p>
      <p className="text-[10px] uppercase text-white/50 tracking-wider mt-0.5">{label}</p>
    </div>
  )
}

function LinhaUsuario({
  usuario, ehVoceMesmo, onMsg,
}: {
  usuario: Usuario
  ehVoceMesmo: boolean
  onMsg: (m: { tipo: 'sucesso' | 'erro'; texto: string } | null) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [novoRole, setNovoRole] = useState<Role>(usuario.role)
  const info = infoDo(usuario.role)

  function handleSalvarRole() {
    if (novoRole === usuario.role) { setEditando(false); return }
    startTransition(async () => {
      const res = await mudarRoleAction(usuario.id, novoRole)
      if ('erro' in res) {
        onMsg({ tipo: 'erro', texto: res.erro })
      } else {
        onMsg({ tipo: 'sucesso', texto: `Role de ${usuario.nome_completo} atualizado pra ${infoDo(novoRole).label}` })
        setEditando(false)
        router.refresh()
      }
    })
  }

  function handleToggleAtivo() {
    startTransition(async () => {
      const res = await toggleAtivoAction(usuario.id, !usuario.ativo)
      if ('erro' in res) {
        onMsg({ tipo: 'erro', texto: res.erro })
      } else {
        onMsg({ tipo: 'sucesso', texto: `${usuario.nome_completo} ${usuario.ativo ? 'desativado' : 'reativado'}` })
        router.refresh()
      }
    })
  }

  function handleReenviarConvite() {
    startTransition(async () => {
      const res = await reenviarConviteAction(usuario.id)
      if ('erro' in res) {
        onMsg({ tipo: 'erro', texto: res.erro })
      } else {
        try { await navigator.clipboard.writeText(res.link) } catch {}
        onMsg({ tipo: 'sucesso', texto: `Link de acesso gerado e copiado pra área de transferência. Envie via WhatsApp pra ${usuario.nome_completo}.` })
      }
    })
  }

  return (
    <div className={`bg-white/[0.03] border rounded-xl p-4 transition ${
      usuario.ativo ? 'border-white/10' : 'border-white/5 opacity-60'
    }`}>
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Avatar + nome */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${info.bg} border ${info.cor}`}>
            {usuario.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={usuario.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              usuario.nome_completo.trim().charAt(0).toUpperCase() || '?'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-white truncate">
                {usuario.nome_completo || <span className="italic text-white/50">Sem nome</span>}
              </p>
              {ehVoceMesmo && (
                <span className="text-[9px] uppercase font-bold text-sol bg-sol/10 border border-sol/30 px-1.5 py-0.5 rounded">
                  Você
                </span>
              )}
              {usuario.convite_pendente && (
                <span className="text-[9px] uppercase font-bold text-sol bg-sol/10 border border-sol/30 px-1.5 py-0.5 rounded">
                  📮 Convite pendente
                </span>
              )}
              {!usuario.ativo && (
                <span className="text-[9px] uppercase font-bold text-coral bg-coral/10 border border-coral/30 px-1.5 py-0.5 rounded">
                  Desativado
                </span>
              )}
            </div>
            <div className="text-xs text-white/60 mt-0.5 flex items-center gap-3 flex-wrap">
              {usuario.email && <span className="truncate">✉️ {usuario.email}</span>}
              {usuario.telefone && <span>📱 {formatarTelefone(usuario.telefone)}</span>}
            </div>
            {usuario.ultimo_login ? (
              <p className="text-[10px] text-white/40 mt-1">
                Último acesso: {new Date(usuario.ultimo_login).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            ) : (
              <p className="text-[10px] text-white/40 mt-1">Nunca acessou</p>
            )}
          </div>
        </div>

        {/* Role */}
        <div className="flex items-center gap-2 shrink-0">
          {editando ? (
            <>
              <select
                value={novoRole}
                onChange={e => setNovoRole(e.target.value as Role)}
                className="px-2 py-1.5 bg-noite border border-white/20 rounded text-white text-xs focus:border-sol focus:outline-none"
              >
                {(Object.entries(ROLES_INFO) as [Role, typeof ROLES_INFO[Role]][]).map(([k, info]) => (
                  <option key={k} value={k} style={{ backgroundColor: '#050B16' }}>{info.emoji} {info.label}</option>
                ))}
              </select>
              <button onClick={handleSalvarRole} disabled={pending} className="px-2 py-1.5 bg-verde text-noite text-xs font-bold rounded hover:bg-verde/90 disabled:opacity-40">
                ✓
              </button>
              <button onClick={() => { setEditando(false); setNovoRole(usuario.role) }} className="px-2 py-1.5 bg-white/5 border border-white/10 text-white/70 text-xs rounded hover:bg-white/10">
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditando(true)}
              disabled={ehVoceMesmo}
              title={ehVoceMesmo ? 'Não pode mudar próprio role' : 'Clique pra editar'}
              className={`px-2.5 py-1 border rounded-full text-xs font-bold ${info.bg} ${info.cor} ${!ehVoceMesmo && 'hover:opacity-80 cursor-pointer'} ${ehVoceMesmo && 'cursor-not-allowed'}`}
            >
              {info.emoji} {info.label}
            </button>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 shrink-0">
          {usuario.convite_pendente && (
            <button
              onClick={handleReenviarConvite}
              disabled={pending}
              title="Gerar novo link e copiar pra área de transferência"
              className="px-2 py-1.5 text-xs text-sol bg-sol/10 border border-sol/30 rounded hover:bg-sol/20 disabled:opacity-40 transition"
            >
              🔗 Reenviar
            </button>
          )}
          <button
            onClick={handleToggleAtivo}
            disabled={pending || ehVoceMesmo}
            title={ehVoceMesmo ? 'Não pode desativar a si mesmo' : usuario.ativo ? 'Desativar acesso' : 'Reativar acesso'}
            className={`px-2 py-1.5 text-xs rounded border transition disabled:opacity-40 ${
              usuario.ativo
                ? 'text-coral bg-coral/10 border-coral/30 hover:bg-coral/20'
                : 'text-verde bg-verde/10 border-verde/30 hover:bg-verde/20'
            }`}
          >
            {usuario.ativo ? '🚫 Desativar' : '✓ Reativar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalConvite({
  onFechar, onMsg,
}: {
  onFechar: () => void
  onMsg: (m: { tipo: 'sucesso' | 'erro'; texto: string } | null) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [role, setRole] = useState<Role>('representante')
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [linkGerado, setLinkGerado] = useState<{ email: string; telefone: string; link: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  function handleConvidar() {
    setErroLocal(null)
    if (nome.trim().length < 3) { setErroLocal('Nome completo obrigatório'); return }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email.trim())) { setErroLocal('Email inválido'); return }

    startTransition(async () => {
      const res = await convidarUsuarioAction({
        email: email.trim(),
        nome_completo: nome.trim(),
        role,
        telefone: telefone.replace(/\D/g, '') || undefined,
      })
      if ('erro' in res) {
        setErroLocal(res.erro)
      } else {
        // Mostra o link gerado no próprio modal — email pode não chegar,
        // WhatsApp SEMPRE funciona (fallback à prova de SMTP)
        setLinkGerado({
          email: email.trim(),
          telefone: telefone.replace(/\D/g, ''),
          link: res.link_acesso,
        })
        router.refresh()
      }
    })
  }

  async function copiarLink() {
    if (!linkGerado) return
    try { await navigator.clipboard.writeText(linkGerado.link); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch {}
  }

  function abrirWhatsApp() {
    if (!linkGerado) return
    const tel = linkGerado.telefone
    if (!tel || tel.length < 10) {
      alert('Telefone não informado ou inválido. Copie o link e envie manualmente.')
      return
    }
    const msg = `Oi ${nome.split(' ')[0]}! Aqui é da Spin Solar 👋\n\nVocê foi convidado(a) pro portal como *${role.replace('_', ' ')}*. Clique no link abaixo pra definir sua senha:\n\n${linkGerado.link}\n\nO link é único e vale por 24h. Qualquer dúvida, me chama!`
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function encerrar() {
    onMsg({ tipo: 'sucesso', texto: `✓ Usuário ${nome} criado. Link disponível no card dele em /admin/usuarios (botão 🔗 Reenviar).` })
    onFechar()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-noite border border-white/20 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">➕ Convidar novo usuário</h3>
          <button onClick={onFechar} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>

        {linkGerado ? (
          <div className="space-y-4">
            <div className="p-4 bg-verde/10 border border-verde/30 rounded-lg text-center space-y-2">
              <p className="text-3xl">✅</p>
              <p className="text-sm font-bold text-verde">Usuário criado com sucesso</p>
              <p className="text-xs text-white/60">
                {nome} · {linkGerado.email} · {infoDo(role).label}
              </p>
            </div>

            <div className="p-3 bg-sol/10 border border-sol/30 rounded-lg space-y-2">
              <p className="text-xs font-bold text-sol">📮 Link de acesso gerado</p>
              <p className="text-[10px] text-white/60 leading-relaxed">
                O email <strong>pode não chegar</strong> se o SMTP não estiver configurado ou por spam.
                <strong className="text-sol"> Use o WhatsApp abaixo</strong> — sempre funciona.
              </p>
              <div className="bg-noite border border-white/10 rounded p-2 max-h-16 overflow-y-auto">
                <p className="text-[10px] text-white/50 font-mono break-all">{linkGerado.link}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copiarLink}
                className={`py-2.5 border rounded-lg text-xs font-bold transition ${
                  copiado
                    ? 'bg-verde/20 border-verde text-verde'
                    : 'bg-white/5 border-white/20 text-white hover:bg-white/10'
                }`}
              >
                {copiado ? '✓ Copiado' : '📋 Copiar link'}
              </button>
              <button
                onClick={abrirWhatsApp}
                disabled={!linkGerado.telefone || linkGerado.telefone.length < 10}
                className="py-2.5 bg-[#25D366] text-white font-bold text-xs rounded-lg hover:bg-[#25D366]/90 disabled:opacity-40 transition"
                title={!linkGerado.telefone ? 'Telefone não informado' : 'Abrir WhatsApp com mensagem pronta'}
              >
                📱 Enviar por WhatsApp
              </button>
            </div>

            <button
              onClick={encerrar}
              className="w-full py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg hover:bg-white/10 transition"
            >
              Fechar
            </button>
          </div>
        ) : (
        <>
        <p className="text-xs text-white/60 leading-relaxed">
          O usuário receberá um email com link pra definir a própria senha e entrar.
          <strong className="text-sol"> Se o email não chegar</strong>, um link pronto pra copiar/enviar
          por WhatsApp aparece logo após clicar em "Enviar convite".
        </p>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">Nome completo *</label>
          <input
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: João da Silva"
            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">Email *</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="joao@email.com"
            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">Telefone (opcional)</label>
          <input
            type="tel"
            value={telefone}
            onChange={e => setTelefone(formatarTelefone(e.target.value))}
            placeholder="(48) 99999-9999"
            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-2">Role *</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(ROLES_INFO) as [Role, typeof ROLES_INFO[Role]][]).map(([k, info]) => {
              const ativo = role === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRole(k)}
                  className={`p-2 rounded border text-left transition text-xs ${
                    ativo
                      ? `${info.bg} ${info.cor} border-current`
                      : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-white/30'
                  }`}
                >
                  <div className="font-bold">{info.emoji} {info.label}</div>
                </button>
              )
            })}
          </div>
        </div>

        {erroLocal && (
          <div className="p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
            ⚠️ {erroLocal}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onFechar}
            className="flex-1 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg hover:bg-white/10 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleConvidar}
            disabled={pending}
            className="flex-1 py-2 bg-sol text-noite text-sm font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40 transition"
          >
            {pending ? 'Enviando...' : '✉️ Enviar convite'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
