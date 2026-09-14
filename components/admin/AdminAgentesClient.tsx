'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarAgenteAction,
  atualizarAgenteAction,
  excluirAgenteAction,
  type EntradaAgente,
} from '@/app/admin/agentes/actions'

type Agente = {
  id: string
  chave: string
  nome: string
  foto_url: string | null
  descricao_interna: string | null
  system_prompt: string
  modelo: string
  max_tokens: number
  temperatura: number | null
  condicao_ativacao: any
  ordem_prioridade: number
  acao_ao_concluir: any
  passar_para_agente_chave: string | null
  ativo: boolean
  criado_em: string
}

const CONDICOES = [
  { valor: 'primeira_msg_lead', rotulo: 'Primeira mensagem de lead novo' },
  { valor: 'apos_qualificacao', rotulo: 'Depois que qualificação virou projeto' },
  { valor: 'pos_venda', rotulo: 'Cliente com projeto vendido volta' },
  { valor: 'manual', rotulo: 'Só quando escolhido manualmente' },
  { valor: 'handoff', rotulo: 'Handoff de outro agente' },
]

const ACOES = [
  { valor: 'broadcast_leads', rotulo: 'Disparar broadcast pros representantes' },
  { valor: 'passar_pra_humano', rotulo: 'Passar pra humano (aguardando_representante)' },
  { valor: 'passar_pra_agente', rotulo: 'Passar pra outro agente' },
  { valor: 'encerrar', rotulo: 'Encerrar conversa' },
  { valor: 'nenhuma', rotulo: 'Nenhuma ação' },
]

export function AdminAgentesClient({ agentesIniciais }: { agentesIniciais: Agente[] }) {
  const router = useRouter()
  const [agentes, setAgentes] = useState<Agente[]>(agentesIniciais)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(agentesIniciais[0]?.id || null)
  const [modoNovo, setModoNovo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selecionado = agentes.find((a) => a.id === selecionadoId) || null

  // Estado do form
  const [form, setForm] = useState<EntradaAgente>(agenteVazio())

  function agenteVazio(): EntradaAgente {
    return {
      chave: '',
      nome: '',
      foto_url: '',
      descricao_interna: '',
      system_prompt: '',
      modelo: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      temperatura: undefined,
      condicao_ativacao: 'manual',
      ordem_prioridade: 100,
      acao_ao_concluir: 'passar_pra_humano',
      passar_para_agente_chave: '',
      ativo: true,
    }
  }

  function carregarNoForm(a: Agente) {
    setForm({
      chave: a.chave,
      nome: a.nome,
      foto_url: a.foto_url || '',
      descricao_interna: a.descricao_interna || '',
      system_prompt: a.system_prompt,
      modelo: a.modelo,
      max_tokens: a.max_tokens,
      temperatura: a.temperatura ?? undefined,
      condicao_ativacao: a.condicao_ativacao,
      ordem_prioridade: a.ordem_prioridade,
      acao_ao_concluir: a.acao_ao_concluir,
      passar_para_agente_chave: a.passar_para_agente_chave || '',
      ativo: a.ativo,
    })
    setModoNovo(false)
    setSelecionadoId(a.id)
    setErro(null); setSucesso(null)
  }

  function novoAgente() {
    setForm(agenteVazio())
    setModoNovo(true)
    setSelecionadoId(null)
    setErro(null); setSucesso(null)
  }

  function salvar() {
    setErro(null); setSucesso(null)
    startTransition(async () => {
      if (modoNovo) {
        const r = await criarAgenteAction(form)
        if ('erro' in r) { setErro(r.erro); return }
        setSucesso('Agente criado.')
        router.refresh()
        setModoNovo(false)
        setSelecionadoId(r.id)
      } else if (selecionadoId) {
        const r = await atualizarAgenteAction(selecionadoId, form)
        if ('erro' in r) { setErro(r.erro); return }
        setSucesso('Agente atualizado.')
        router.refresh()
      }
    })
  }

  function excluir() {
    if (!selecionadoId) return
    if (!confirm('Excluir esse agente? Conversas ativas ficam sem agente até serem reatribuídas.')) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirAgenteAction(selecionadoId)
      if ('erro' in r) { setErro(r.erro); return }
      router.refresh()
      setSelecionadoId(null)
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* ─── Sidebar: lista ─── */}
      <aside className="space-y-2">
        <button
          onClick={novoAgente}
          className="w-full px-3 py-2.5 rounded bg-verde/20 border border-verde/40 text-verde text-xs font-bold hover:bg-verde/30"
        >
          + Novo agente
        </button>
        <div className="space-y-1 mt-3">
          {agentes.length === 0 ? (
            <p className="text-xs text-white/40 italic p-3">Nenhum agente cadastrado.</p>
          ) : (
            agentes.map((a) => (
              <button
                key={a.id}
                onClick={() => carregarNoForm(a)}
                className={`w-full text-left px-3 py-2 rounded transition ${
                  selecionadoId === a.id
                    ? 'bg-sol/[0.08] border border-sol/30'
                    : 'bg-white/[0.02] border border-white/10 hover:bg-white/5'
                } ${!a.ativo ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{a.foto_url ? '🤖' : '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{a.nome}</p>
                    <p className="text-[10px] text-white/40 font-mono truncate">{a.chave}</p>
                  </div>
                  {!a.ativo && <span className="text-[9px] uppercase font-bold text-coral">off</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ─── Form ─── */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5 md:p-6">
        {!modoNovo && !selecionado ? (
          <p className="text-sm text-white/40 italic py-10 text-center">
            Selecione um agente à esquerda ou clique em "+ Novo agente".
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                {modoNovo ? '➕ Novo agente' : `✏ Editar: ${selecionado?.nome}`}
              </h2>
              <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ativo ?? true}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  className="w-4 h-4 accent-sol"
                />
                Ativo
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Chave (única, lowercase_underscore)">
                <input
                  value={form.chave}
                  onChange={(e) => setForm({ ...form, chave: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  disabled={!modoNovo}
                  placeholder="ex: agendamento_visitas"
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white font-mono disabled:opacity-50"
                />
              </Field>
              <Field label="Nome (aparece pro cliente)">
                <input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="ex: Ana da Agenda"
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
                />
              </Field>
              <Field label="Foto (URL, opcional)">
                <input
                  value={form.foto_url || ''}
                  onChange={(e) => setForm({ ...form, foto_url: e.target.value })}
                  placeholder="https://…"
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
                />
              </Field>
              <Field label="Ordem de prioridade (menor = entra antes)">
                <input
                  type="number"
                  value={form.ordem_prioridade ?? 100}
                  onChange={(e) => setForm({ ...form, ordem_prioridade: parseInt(e.target.value) || 100 })}
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
                />
              </Field>
            </div>

            <Field label="Descrição interna (só admin vê — pra lembrar pra que serve)">
              <textarea
                value={form.descricao_interna || ''}
                onChange={(e) => setForm({ ...form, descricao_interna: e.target.value })}
                rows={2}
                placeholder="ex: Marca visitas técnicas depois que o lead virou projeto qualificado"
                className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Quando ativa">
                <select
                  value={form.condicao_ativacao}
                  onChange={(e) => setForm({ ...form, condicao_ativacao: e.target.value as any })}
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
                >
                  {CONDICOES.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </select>
              </Field>
              <Field label="Ao concluir a tarefa">
                <select
                  value={form.acao_ao_concluir}
                  onChange={(e) => setForm({ ...form, acao_ao_concluir: e.target.value as any })}
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
                >
                  {ACOES.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </select>
              </Field>
            </div>

            {form.acao_ao_concluir === 'passar_pra_agente' && (
              <Field label="Chave do agente destino">
                <input
                  value={form.passar_para_agente_chave || ''}
                  onChange={(e) => setForm({ ...form, passar_para_agente_chave: e.target.value })}
                  placeholder="ex: qualificacao_padrao"
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white font-mono"
                />
              </Field>
            )}

            <Field label="System prompt (regras de comportamento)" destaque>
              <textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                rows={16}
                placeholder="Você é o Assistente da Spin Solar..."
                className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white font-mono leading-relaxed"
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Modelo Anthropic">
                <select
                  value={form.modelo || 'claude-haiku-4-5-20251001'}
                  onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white font-mono"
                >
                  <option value="claude-haiku-4-5-20251001">Haiku 4.5 (rápido, barato)</option>
                  <option value="claude-sonnet-5">Sonnet 5 (melhor raciocínio)</option>
                  <option value="claude-opus-5">Opus 5 (máxima qualidade)</option>
                </select>
              </Field>
              <Field label="Max tokens (100-4000)">
                <input
                  type="number"
                  min={100}
                  max={4000}
                  value={form.max_tokens ?? 800}
                  onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 800 })}
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
                />
              </Field>
              <Field label="Temperatura (0-1, opcional)">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={form.temperatura ?? ''}
                  onChange={(e) => setForm({ ...form, temperatura: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="default"
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
                />
              </Field>
            </div>

            {erro && <p className="text-sm text-coral bg-coral/10 border border-coral/30 rounded p-3">❌ {erro}</p>}
            {sucesso && <p className="text-sm text-verde bg-verde/10 border border-verde/30 rounded p-3">✅ {sucesso}</p>}

            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              {!modoNovo && selecionado ? (
                <button
                  onClick={excluir}
                  disabled={isPending}
                  className="text-xs text-coral hover:text-coral/80 font-semibold uppercase tracking-wider"
                >
                  Excluir agente
                </button>
              ) : <span />}
              <button
                onClick={salvar}
                disabled={isPending}
                className="px-6 py-2.5 bg-sol text-noite font-bold text-sm rounded disabled:opacity-40"
              >
                {isPending ? 'Salvando...' : modoNovo ? 'Criar agente' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, children, destaque }: { label: string; children: React.ReactNode; destaque?: boolean }) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-wider font-bold mb-1 ${destaque ? 'text-sol' : 'text-white/50'}`}>
        {label}
      </label>
      {children}
    </div>
  )
}
