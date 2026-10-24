'use client'

import { useEffect, useState } from 'react'
import {
  dadosEmpresasAdminAction, salvarEmpresaAction, salvarFornecedorCatalogoAction, testarFornecedorAction,
  type CorEtiqueta, type EmpresaAdmin, type FornecedorCatalogoAdmin,
} from '@/app/admin/empresas/actions'
import { UploadImagem } from '@/components/UploadImagem'
import { COR_ETIQUETA_EMPRESA } from '@/lib/empresas/etiqueta'

/**
 * Cadastro de empresas e fornecedores de catálogo (Kalebe 2026-10-19).
 * Visual minimalista: botão cheio + texto branco, cor só nas bordas.
 */

const inputCls = 'w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sol/50 placeholder:text-white/30'
const VAZIA: Omit<EmpresaAdmin, 'id'> & { id: string | null } = {
  id: null, nome: '', razao_social: '', cnpj: '', catalogo_fornecedor_id: null, endereco: '', telefone: '', email: '', site: '',
  logo_url: '', papel_timbrado_url: '', rt_nome: '', rt_titulo: '', rt_crea: '', rt_art_padrao: '', rt_telefone: '', rt_email: '',
  rt_assinatura_url: '', cor: 'sol', padrao: false, ativo: true,
}
/** A→Z */
const CORES: Array<{ cor: CorEtiqueta; rotulo: string }> = [
  { cor: 'azul', rotulo: 'Azul' }, { cor: 'branco', rotulo: 'Branco' }, { cor: 'coral', rotulo: 'Coral' }, { cor: 'sol', rotulo: 'Sol' }, { cor: 'verde', rotulo: 'Verde' },
]

function Campo({ rotulo, valor, onChange, placeholder, className = '', tipo = 'text' }: {
  rotulo: string; valor: string; onChange: (v: string) => void; placeholder?: string; className?: string; tipo?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold text-white/60 mb-1">{rotulo}</span>
      <input type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} autoComplete="off" />
    </label>
  )
}

export function EmpresasAdminClient() {
  const [empresas, setEmpresas] = useState<EmpresaAdmin[] | null>(null)
  const [fornecedores, setFornecedores] = useState<FornecedorCatalogoAdmin[]>([])
  const [editEmpresa, setEditEmpresa] = useState<typeof VAZIA | null>(null)
  const [editForn, setEditForn] = useState<null | { id: string | null; nome: string; tipo: 'planilha' | 'api'; api_base_url: string; ativo: boolean; api_chave: string; chave_atual: string; fator: string; proxy_url: string; proxy_atual: string }>(null)
  // Kalebe 2026-10-23: teste da integração (IP de saída + resposta da API)
  const [teste, setTeste] = useState<Record<string, { carregando: boolean; texto: string | null; erro: boolean }>>({})
  async function testar(id: string) {
    setTeste((t) => ({ ...t, [id]: { carregando: true, texto: null, erro: false } }))
    const r = await testarFornecedorAction(id)
    setTeste((t) => ({ ...t, [id]: 'erro' in r
      ? { carregando: false, texto: r.erro, erro: true }
      : { carregando: false, texto: `IP de saída: ${r.ip_saida}${r.via_proxy ? ' (servidor intermediário — é este IP que o fornecedor libera)' : ' (sem servidor intermediário: esse IP muda)'} · API: ${r.api}`, erro: false } }))
  }
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    const r = await dadosEmpresasAdminAction()
    if ('erro' in r) { setErro(r.erro); setEmpresas([]); return }
    setEmpresas(r.empresas); setFornecedores(r.fornecedores)
  }
  useEffect(() => { carregar() }, [])

  async function salvarEmpresa() {
    if (!editEmpresa) return
    setErro(null); setOk(null); setSalvando(true)
    try {
      const r = await salvarEmpresaAction(editEmpresa)
      if ('erro' in r) { setErro(r.erro); return }
      setOk(`Empresa ${editEmpresa.nome} salva.`); setEditEmpresa(null); await carregar()
    } finally { setSalvando(false) }
  }
  async function salvarFornecedor() {
    if (!editForn) return
    setErro(null); setOk(null); setSalvando(true)
    try {
      // "0,85" (vírgula decimal) ou "0.85"
      const bruto = String(editForn.fator).trim()
      const fator = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto)
      const r = await salvarFornecedorCatalogoAction({ ...editForn, fator_preco: editForn.fator.trim() && fator > 0 ? fator : null })
      if ('erro' in r) { setErro(r.erro); return }
      setOk(`Fornecedor ${editForn.nome} salvo${editForn.api_chave.trim() ? ' com a chave nova' : ''}.`); setEditForn(null); await carregar()
    } finally { setSalvando(false) }
  }

  if (!empresas) return <p className="text-sm text-white/50">Carregando…</p>
  const nomeForn = (id: string | null) => fornecedores.find((f) => f.id === id)?.nome || '—'
  const fornOrdenados = [...fornecedores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="space-y-6">
      {erro && <p className="text-sm text-white/85 border border-coral/50 rounded-lg p-3">⚠ {erro}</p>}
      {ok && <p className="text-sm text-white/85 border border-verde/50 rounded-lg p-3">✓ {ok}</p>}

      {/* Empresas */}
      <section className="rounded-2xl border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-black text-white">🏢 Empresas (CNPJ e marca)</h2>
          {!editEmpresa && (
            <button type="button" onClick={() => setEditEmpresa({ ...VAZIA, catalogo_fornecedor_id: fornOrdenados.find((f) => f.tipo === 'api')?.id || null })}
              className="px-3 py-2 rounded-lg bg-weg-azul text-white text-xs font-bold text-start">＋ Nova empresa</button>
          )}
        </div>
        {!editEmpresa && empresas.map((e) => (
          <div key={e.id} className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 ${COR_ETIQUETA_EMPRESA[e.cor || 'sol']}`}>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {e.nome}{e.padrao && <span data-etiqueta className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border border-white/30 text-white/70">padrão</span>}
                {!e.ativo && <span data-etiqueta className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border border-white/30 text-white/50">inativa</span>}
              </p>
              <p className="text-[12px] text-white/60 truncate">{e.razao_social} · CNPJ {e.cnpj} · fornecedor {nomeForn(e.catalogo_fornecedor_id)}</p>
            </div>
            <button type="button" onClick={() => setEditEmpresa({ ...e })} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-xs font-bold text-start shrink-0">Editar</button>
          </div>
        ))}
        {editEmpresa && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Campo rotulo="Marca (etiqueta no Spinzap)" valor={editEmpresa.nome} onChange={(v) => setEditEmpresa({ ...editEmpresa, nome: v })} />
              <Campo rotulo="Razão social" valor={editEmpresa.razao_social} onChange={(v) => setEditEmpresa({ ...editEmpresa, razao_social: v })} />
              <Campo rotulo="CNPJ" valor={editEmpresa.cnpj} onChange={(v) => setEditEmpresa({ ...editEmpresa, cnpj: v })} placeholder="00.000.000/0001-00" />
              <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Fornecedor (catálogo e kit)</span>
                <select value={editEmpresa.catalogo_fornecedor_id || ''} onChange={(ev) => setEditEmpresa({ ...editEmpresa, catalogo_fornecedor_id: ev.target.value || null })} className={inputCls}>
                  <option value="" className="bg-noite">Escolha…</option>
                  {fornOrdenados.map((f) => <option key={f.id} value={f.id} className="bg-noite">{f.nome} ({f.tipo === 'api' ? 'API' : 'planilha'})</option>)}
                </select></label>
              <Campo rotulo="Endereço" valor={editEmpresa.endereco} onChange={(v) => setEditEmpresa({ ...editEmpresa, endereco: v })} className="md:col-span-2" />
              <Campo rotulo="Telefone" valor={editEmpresa.telefone} onChange={(v) => setEditEmpresa({ ...editEmpresa, telefone: v })} />
              <Campo rotulo="E-mail" valor={editEmpresa.email} onChange={(v) => setEditEmpresa({ ...editEmpresa, email: v })} />
              <Campo rotulo="Site" valor={editEmpresa.site} onChange={(v) => setEditEmpresa({ ...editEmpresa, site: v })} />
              <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Cor da etiqueta</span>
                <select value={editEmpresa.cor || 'sol'} onChange={(ev) => setEditEmpresa({ ...editEmpresa, cor: ev.target.value as CorEtiqueta })} className={inputCls}>
                  {CORES.map((c) => <option key={c.cor} value={c.cor} className="bg-noite">{c.rotulo}</option>)}
                </select></label>
              <div className="md:col-span-2">
                <UploadImagem label="Logo da empresa (PDF da proposta)" valorAtual={editEmpresa.logo_url} onChange={(url) => setEditEmpresa({ ...editEmpresa, logo_url: url })}
                  pasta="empresas/logo" accept="image/png,image/jpeg" ajuda="PNG (fundo transparente) ou JPG, mín. 300 px." />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider mb-2">Responsável técnico e assinatura da proposta</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Campo rotulo="Nome" valor={editEmpresa.rt_nome} onChange={(v) => setEditEmpresa({ ...editEmpresa, rt_nome: v })} />
                <Campo rotulo="Título" valor={editEmpresa.rt_titulo} onChange={(v) => setEditEmpresa({ ...editEmpresa, rt_titulo: v })} placeholder="Engenheiro eletricista / Diretor comercial" />
                <Campo rotulo="Registro (CREA/CFT)" valor={editEmpresa.rt_crea} onChange={(v) => setEditEmpresa({ ...editEmpresa, rt_crea: v })} />
                <Campo rotulo="Telefone" valor={editEmpresa.rt_telefone} onChange={(v) => setEditEmpresa({ ...editEmpresa, rt_telefone: v })} />
                <div className="md:col-span-2">
                  <UploadImagem label="Assinatura" valorAtual={editEmpresa.rt_assinatura_url} onChange={(url) => setEditEmpresa({ ...editEmpresa, rt_assinatura_url: url })}
                    pasta="empresas/assinatura" accept="image/png,image/jpeg" ajuda="PNG da assinatura (fundo transparente ou branco)." />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditEmpresa({ ...editEmpresa, padrao: !editEmpresa.padrao })} aria-pressed={editEmpresa.padrao}
                className={`px-3 py-2 rounded-xl text-xs font-bold text-start border ${editEmpresa.padrao ? 'bg-weg-azul border-weg-azul text-white' : 'border-white/15 text-white/70'}`}>
                {editEmpresa.padrao ? '✓ ' : ''}Empresa padrão (vale quando ninguém escolhe)
              </button>
              <button type="button" onClick={() => setEditEmpresa({ ...editEmpresa, ativo: !editEmpresa.ativo })} aria-pressed={editEmpresa.ativo}
                className={`px-3 py-2 rounded-xl text-xs font-bold text-start border ${editEmpresa.ativo ? 'bg-weg-azul border-weg-azul text-white' : 'border-white/15 text-white/70'}`}>
                {editEmpresa.ativo ? '✓ ' : ''}Ativa
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditEmpresa(null)} className="px-4 py-2 rounded-lg border border-white/15 text-white/70 text-sm font-bold">Cancelar</button>
              <button type="button" onClick={salvarEmpresa} disabled={salvando} className="px-4 py-2 rounded-lg bg-verde text-white text-sm font-bold disabled:opacity-40">
                {salvando ? 'Salvando…' : 'Salvar empresa'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Fornecedores de catálogo */}
      <section className="rounded-2xl border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-black text-white">🔌 Fornecedores (catálogo e kit)</h2>
          {!editForn && (
            <button type="button" onClick={() => setEditForn({ id: null, nome: '', tipo: 'api', api_base_url: '', ativo: true, api_chave: '', chave_atual: 'não cadastrada', fator: '', proxy_url: '', proxy_atual: 'não cadastrado' })}
              className="px-3 py-2 rounded-lg bg-weg-azul text-white text-xs font-bold text-start">＋ Novo fornecedor</button>
          )}
        </div>
        {!editForn && fornOrdenados.map((f) => (
          <div key={f.id} className="rounded-xl border border-white/10 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{f.nome} <span className="text-white/50 font-normal">· {f.tipo === 'api' ? 'API' : 'planilha'}</span></p>
              <p className="text-[12px] text-white/60 truncate">
                {f.tipo === 'api' ? `${f.api_base_url || 'sem endereço'} · chave ${f.chave} · IP fixo ${f.tem_proxy ? f.proxy : 'não cadastrado'} · fator ${f.fator_preco != null ? f.fator_preco.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : 'não definido'}` : 'Importação pela planilha (Catálogo)'}
                {f.ultima_sincronizacao_em ? ` · sincronizado em ${new Date(f.ultima_sincronizacao_em).toLocaleString('pt-BR')}` : ''}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {f.tipo === 'api' && (
                <button type="button" onClick={() => testar(f.id)} disabled={teste[f.id]?.carregando}
                  className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-xs font-bold text-start disabled:opacity-40">{teste[f.id]?.carregando ? 'Testando…' : '🔌 Testar conexão'}</button>
              )}
              <button type="button" onClick={() => setEditForn({ id: f.id, nome: f.nome, tipo: f.tipo, api_base_url: f.api_base_url, ativo: f.ativo, api_chave: '', chave_atual: f.chave, fator: f.fator_preco != null ? String(f.fator_preco).replace('.', ',') : '', proxy_url: '', proxy_atual: f.proxy })}
                className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-xs font-bold text-start">Editar</button>
            </div>
          </div>
        ))}
        {editForn && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Campo rotulo="Nome" valor={editForn.nome} onChange={(v) => setEditForn({ ...editForn, nome: v })} />
              <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Tipo</span>
                <select value={editForn.tipo} onChange={(ev) => setEditForn({ ...editForn, tipo: ev.target.value as 'planilha' | 'api' })} className={inputCls}>
                  <option value="api" className="bg-noite">API (chave de acesso)</option>
                  <option value="planilha" className="bg-noite">Planilha</option>
                </select></label>
              {editForn.tipo === 'api' && (
                <>
                  <Campo rotulo="Endereço da API" valor={editForn.api_base_url} onChange={(v) => setEditForn({ ...editForn, api_base_url: v })} placeholder="https://api.fornecedor.com.br" className="md:col-span-2" />
                  <label className="block md:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Chave da API — atual: {editForn.chave_atual}</span>
                    <input type="password" value={editForn.api_chave} onChange={(ev) => setEditForn({ ...editForn, api_chave: ev.target.value })} className={inputCls}
                      placeholder="Cole a chave nova aqui (em branco mantém a atual)" autoComplete="new-password" />
                    <span className="block text-[10px] text-white/45 mt-1">Fica guardada só no servidor; depois de salvar ela não aparece mais, só mascarada.</span>
                  </label>
                  <label className="block md:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Servidor intermediário (IP fixo) — atual: {editForn.proxy_atual}</span>
                    <input type="password" value={editForn.proxy_url} onChange={(ev) => setEditForn({ ...editForn, proxy_url: ev.target.value })} className={inputCls}
                      placeholder="http://usuario:senha@IP:3128 (em branco mantém o atual)" autoComplete="new-password" />
                    <span className="block text-[10px] text-white/45 mt-1">As chamadas ao fornecedor saem por ele; o IP dele é o que o fornecedor libera. Fica só no servidor.</span>
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-bold text-white/60 mb-1">Fator sobre o preço da API</span>
                    <input value={editForn.fator} onChange={(ev) => setEditForn({ ...editForn, fator: ev.target.value })} inputMode="decimal" className={inputCls} placeholder="ex.: 1 se já é o custo" />
                    <span className="block text-[10px] text-white/45 mt-1">Vazio = ainda não definido: a proposta dessa empresa não calcula até você preencher.</span>
                  </label>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditForn(null)} className="px-4 py-2 rounded-lg border border-white/15 text-white/70 text-sm font-bold">Cancelar</button>
              <button type="button" onClick={salvarFornecedor} disabled={salvando} className="px-4 py-2 rounded-lg bg-verde text-white text-sm font-bold disabled:opacity-40">
                {salvando ? 'Salvando…' : 'Salvar fornecedor'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
