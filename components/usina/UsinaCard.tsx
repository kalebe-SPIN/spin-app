'use client'

import { useState } from 'react'
import { fmtKwp, fmtKw, fmtNum } from '@/lib/formatters'
import { TIPOS_EQUIPAMENTO_USINA, type DadosUsina, type EquipamentoUsina, type TipoEquipamentoUsina, type UsinaTela } from '@/lib/usinas/usina'

/**
 * Cartão da usina do cliente (Kalebe 2026-10-22): potências, equipamentos e
 * acesso ao monitoramento. A senha só aparece no "mostrar" (fica registrado
 * quem viu). Mesmo cartão no projeto e no perfil do Spinzap.
 */

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-sol/50'
const UNIDADE: Record<TipoEquipamentoUsina, string> = { placa: 'Wp', inversor: 'kW', bateria: 'kWh', outro: '' }

const numBr = (s: string) => {
  const t = s.trim()
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) && n > 0 ? n : null
}
const paraTexto = (n: number | null) => (n == null ? '' : String(n).replace('.', ','))

export function UsinaCard({ usina, onSalvar, onVerSenha }: {
  usina: UsinaTela
  onSalvar: (dados: DadosUsina, senha: string | null) => Promise<{ sucesso: true } | { erro: string }>
  onVerSenha: () => Promise<{ senha: string } | { erro: string }>
}) {
  const [editando, setEditando] = useState(false)
  const [d, setD] = useState<DadosUsina>(usina)
  const [cc, setCc] = useState(paraTexto(usina.potencia_cc_kwp))
  const [ca, setCa] = useState(paraTexto(usina.potencia_ca_kw))
  const [novaSenha, setNovaSenha] = useState('')
  const [senha, setSenha] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  async function salvar() {
    setErro(null); setOcupado(true)
    try {
      const r = await onSalvar({ ...d, potencia_cc_kwp: numBr(cc), potencia_ca_kw: numBr(ca) }, novaSenha.trim() ? novaSenha : null)
      if ('erro' in r) { setErro(r.erro); return }
      setEditando(false); setNovaSenha(''); setSenha(null)
    } finally { setOcupado(false) }
  }
  async function mostrarSenha() {
    if (senha) { setSenha(null); return }
    setErro(null)
    const r = await onVerSenha()
    if ('erro' in r) setErro(r.erro)
    else setSenha(r.senha)
  }
  async function copiar(rotulo: string, valor: string | null) {
    if (!valor) return
    try { await navigator.clipboard.writeText(valor); setCopiado(rotulo); setTimeout(() => setCopiado(null), 1500) } catch { /* sem permissão */ }
  }
  const mudarEq = (i: number, patch: Partial<EquipamentoUsina>) => setD((x) => ({ ...x, equipamentos: x.equipamentos.map((e, j) => (j === i ? { ...e, ...patch } : e)) }))

  return (
    <section className="mb-6 rounded-xl border border-white/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-white">☀️ Usina{usina.projeto_codigo ? ` · ${usina.projeto_codigo}` : ''}</h3>
          <p className="text-[11px] text-white/50">
            {usina.empresa ? `${usina.empresa} · ` : ''}
            {usina.salva ? `Atualizado${usina.atualizado_em ? ` em ${new Date(usina.atualizado_em).toLocaleDateString('pt-BR')}` : ''}${usina.atualizado_por ? ` por ${usina.atualizado_por}` : ''}` : 'Ainda sem cadastro — dados puxados do kit vendido'}
          </p>
        </div>
        {!editando && (
          <button type="button" onClick={() => { setD(usina); setCc(paraTexto(usina.potencia_cc_kwp)); setCa(paraTexto(usina.potencia_ca_kw)); setEditando(true) }}
            className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-xs font-bold text-start shrink-0">{usina.salva ? 'Editar' : 'Cadastrar'}</button>
        )}
      </div>

      {!editando ? (
        <div className="space-y-3 text-[13px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Info rotulo="Potência CC" valor={usina.potencia_cc_kwp ? fmtKwp(usina.potencia_cc_kwp) : '—'} />
            <Info rotulo="Potência CA" valor={usina.potencia_ca_kw ? fmtKw(usina.potencia_ca_kw) : '—'} />
            <Info rotulo="Conexão" valor={usina.data_conexao ? new Date(`${usina.data_conexao}T12:00:00`).toLocaleDateString('pt-BR') : '—'} />
            <Info rotulo="UC" valor={usina.uc || '—'} />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Equipamentos</p>
            {usina.equipamentos.length === 0 ? <p className="text-white/45 text-[12px]">Nenhum cadastrado.</p> : usina.equipamentos.map((e, i) => (
              <div key={i} className="rounded-lg border border-white/10 px-2.5 py-1.5">
                <p className="text-white/85">{e.qtd} × {e.modelo}
                  <span className="text-white/50"> · {TIPOS_EQUIPAMENTO_USINA.find((t) => t.tipo === e.tipo)?.rotulo}{e.potencia ? ` · ${fmtNum(e.potencia, e.potencia % 1 ? 2 : 0)} ${UNIDADE[e.tipo]}` : ''}</span>
                </p>
                {e.numeros_serie && <p className="text-[11px] text-white/55 break-words">Nº de série: {e.numeros_serie}</p>}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Monitoramento</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Info rotulo="Plataforma" valor={usina.monitoramento_plataforma || '—'} />
              <div className="rounded-lg border border-white/10 px-2.5 py-1.5">
                <p className="text-[10px] text-white/50">Link</p>
                {usina.monitoramento_link
                  ? <a href={usina.monitoramento_link} target="_blank" rel="noreferrer noopener" className="text-white/85 underline break-all">{usina.monitoramento_link}</a>
                  : <p className="text-white/45">—</p>}
              </div>
              <div className="rounded-lg border border-white/10 px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0"><p className="text-[10px] text-white/50">Login</p><p className="text-white/85 truncate">{usina.monitoramento_login || '—'}</p></div>
                {usina.monitoramento_login && <button type="button" onClick={() => copiar('login', usina.monitoramento_login)} className="text-[11px] font-bold text-white/70 hover:text-white shrink-0">{copiado === 'login' ? 'copiado ✓' : 'copiar'}</button>}
              </div>
              <div className="rounded-lg border border-white/10 px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0"><p className="text-[10px] text-white/50">Senha</p><p className="text-white/85 truncate font-mono">{usina.tem_senha ? (senha ?? '••••••••') : '—'}</p></div>
                {usina.tem_senha && (
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={mostrarSenha} className="text-[11px] font-bold text-white/70 hover:text-white">{senha ? 'esconder' : 'mostrar'}</button>
                    {senha && <button type="button" onClick={() => copiar('senha', senha)} className="text-[11px] font-bold text-white/70 hover:text-white">{copiado === 'senha' ? 'copiado ✓' : 'copiar'}</button>}
                  </div>
                )}
              </div>
            </div>
            {usina.tem_senha && <p className="text-[10px] text-white/40">Quem abre a senha fica registrado.</p>}
          </div>
          {usina.observacoes && <p className="text-[12px] text-white/70 whitespace-pre-wrap">📝 {usina.observacoes}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Campo rotulo="Potência CC (kWp)"><input value={cc} onChange={(e) => setCc(e.target.value)} inputMode="decimal" className={inputCls} /></Campo>
            <Campo rotulo="Potência CA (kW)"><input value={ca} onChange={(e) => setCa(e.target.value)} inputMode="decimal" className={inputCls} /></Campo>
            <Campo rotulo="Data de conexão"><input type="date" value={d.data_conexao || ''} onChange={(e) => setD({ ...d, data_conexao: e.target.value || null })} className={inputCls} /></Campo>
            <Campo rotulo="UC"><input value={d.uc || ''} onChange={(e) => setD({ ...d, uc: e.target.value })} className={inputCls} /></Campo>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Equipamentos</p>
            {d.equipamentos.map((e, i) => (
              <div key={i} className="rounded-lg border border-white/10 p-2 space-y-1.5">
                <div className="grid grid-cols-[110px_1fr_70px_90px_auto] gap-1.5 items-center">
                  <select value={e.tipo} onChange={(ev) => mudarEq(i, { tipo: ev.target.value as TipoEquipamentoUsina })} className={inputCls}>
                    {TIPOS_EQUIPAMENTO_USINA.map((t) => <option key={t.tipo} value={t.tipo} className="bg-noite">{t.rotulo}</option>)}
                  </select>
                  <input value={e.modelo} onChange={(ev) => mudarEq(i, { modelo: ev.target.value })} placeholder="Modelo" className={inputCls} />
                  <input value={String(e.qtd)} onChange={(ev) => mudarEq(i, { qtd: Math.max(1, Math.round(Number(ev.target.value) || 1)) })} inputMode="numeric" aria-label="Quantidade" className={`${inputCls} text-end`} />
                  <input value={paraTexto(e.potencia)} onChange={(ev) => mudarEq(i, { potencia: numBr(ev.target.value) })} inputMode="decimal" placeholder={UNIDADE[e.tipo] || 'potência'} aria-label="Potência" className={`${inputCls} text-end`} />
                  <button type="button" onClick={() => setD({ ...d, equipamentos: d.equipamentos.filter((_, j) => j !== i) })} aria-label="Tirar" className="w-7 h-7 rounded-full bg-white/[0.06] text-white/60 hover:text-white text-[11px]">✕</button>
                </div>
                <input value={e.numeros_serie || ''} onChange={(ev) => mudarEq(i, { numeros_serie: ev.target.value })} placeholder="Números de série (separados por vírgula)" className={inputCls} />
              </div>
            ))}
            <button type="button" onClick={() => setD({ ...d, equipamentos: [...d.equipamentos, { tipo: 'inversor', modelo: '', qtd: 1, potencia: null, numeros_serie: null }] })}
              className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold text-start">＋ Equipamento</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Campo rotulo="Plataforma de monitoramento"><input value={d.monitoramento_plataforma || ''} onChange={(e) => setD({ ...d, monitoramento_plataforma: e.target.value })} placeholder="Ex.: app do fabricante do inversor" className={inputCls} /></Campo>
            <Campo rotulo="Link"><input value={d.monitoramento_link || ''} onChange={(e) => setD({ ...d, monitoramento_link: e.target.value })} placeholder="https://…" className={inputCls} /></Campo>
            <Campo rotulo="Login"><input value={d.monitoramento_login || ''} onChange={(e) => setD({ ...d, monitoramento_login: e.target.value })} autoComplete="off" className={inputCls} /></Campo>
            <Campo rotulo={usina.tem_senha ? 'Senha (em branco mantém a atual)' : 'Senha'}>
              <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" className={inputCls} />
            </Campo>
          </div>
          <Campo rotulo="Observações"><textarea value={d.observacoes || ''} onChange={(e) => setD({ ...d, observacoes: e.target.value })} rows={2} className={`${inputCls} resize-y`} /></Campo>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setEditando(false); setErro(null) }} className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 text-xs font-bold">Cancelar</button>
            <button type="button" onClick={salvar} disabled={ocupado} className="px-3 py-1.5 rounded-lg bg-verde text-white text-xs font-bold disabled:opacity-40">{ocupado ? 'Salvando…' : 'Salvar usina'}</button>
          </div>
        </div>
      )}
      {erro && <p className="text-[12px] text-white/85 border border-coral/50 rounded-lg px-2.5 py-1.5">⚠ {erro}</p>}
    </section>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-white/10 px-2.5 py-1.5">
      <p className="text-[10px] text-white/50">{rotulo}</p>
      <p className="text-white/85">{valor}</p>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold text-white/55 mb-0.5">{rotulo}</span>
      {children}
    </label>
  )
}
