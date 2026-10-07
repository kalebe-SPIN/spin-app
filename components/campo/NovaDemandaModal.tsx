'use client'

import { useEffect, useState } from 'react'
import { TIPOS_SERVICO_CAMPO, type ContatoDemanda, type EnderecoCampo } from '@/lib/campo/comum'
import { formatarTelefone } from '@/lib/formatters'
import { criarDemandaAction, dadosNovaDemandaAction } from '@/app/campo/actions'

/**
 * Nova demanda pro time de campo (Kalebe 2026-10-07): qualquer usuário abre,
 * do /campo, do projeto, da conversa do Inbox ou do Dashboard. Com projeto
 * ou conversa, já vem cliente, endereço e o contato é escolhido entre os do
 * projeto. Nasce com o responsável do campo (Felipe) e a Bianca avisa.
 */
const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'
const ENDERECO_VAZIO: EnderecoCampo = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SC' }
const PAPEL: Record<string, string> = { cliente: 'cliente', decisor: 'decisor', financeiro: 'financeiro', tecnico: 'técnico', whatsapp: 'WhatsApp', outro: 'outro' }

export function NovaDemandaModal({ projetoId, conversaId, onFechar, onSalva }: {
  projetoId?: string | null
  conversaId?: string | null
  onFechar: () => void
  onSalva: (mensagem: string) => void
}) {
  const comContexto = !!(projetoId || conversaId)
  const [carregando, setCarregando] = useState(comContexto)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [tipo, setTipo] = useState('')
  const [cliente, setCliente] = useState('')
  const [contatos, setContatos] = useState<ContatoDemanda[]>([])
  const [contatoSel, setContatoSel] = useState('')   // índice em contatos | 'outro'
  const [contatoNome, setContatoNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [end, setEnd] = useState<EnderecoCampo>(ENDERECO_VAZIO)
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const campo = (k: keyof EnderecoCampo) => (e: React.ChangeEvent<HTMLInputElement>) => setEnd((x) => ({ ...x, [k]: e.target.value }))

  useEffect(() => {
    if (!comContexto) return
    dadosNovaDemandaAction({ projetoId, conversaId }).then((r) => {
      if ('erro' in r) { setErro(r.erro); return }
      setCodigo(r.projeto_codigo)
      setCliente(r.cliente_nome || '')
      if (r.endereco) setEnd({ ...ENDERECO_VAZIO, ...r.endereco })
      if (r.tipo_sugerido) setTipo(r.tipo_sugerido)
      setContatos(r.contatos)
      if (r.contatos.length) escolherContato('0', r.contatos)
      else setContatoSel('outro')
    }).finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId, conversaId])

  function escolherContato(v: string, lista = contatos) {
    setContatoSel(v)
    if (v === 'outro') { setContatoNome(''); setTelefone(''); return }
    const c = lista[Number(v)]
    if (c) { setContatoNome(c.nome); setTelefone(c.telefone) }
  }

  async function buscarCep(cep: string) {
    const d = cep.replace(/\D/g, '')
    if (d.length !== 8) return
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const j = await r.json()
      if (j?.erro) return
      setEnd((x) => ({ ...x, logradouro: x.logradouro || j.logradouro || '', bairro: x.bairro || j.bairro || '', cidade: j.localidade || x.cidade, uf: j.uf || x.uf }))
    } catch {}
  }

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await criarDemandaAction({
        tipo_servico: tipo, cliente_nome: cliente, contato_nome: contatoNome, contato_telefone: telefone,
        endereco: end, descricao, projeto_id: projetoId || null, conversa_id: conversaId || null,
      })
      if ('erro' in r) { setErro(r.erro); return }
      onSalva(r.responsavel ? 'Demanda enviada ao time de campo — a Bianca já avisou o responsável.' : 'Demanda cadastrada no quadro do campo.')
    } finally { setSalvando(false) }
  }

  const contatoLivre = contatoSel === 'outro' || !contatos.length

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onFechar}>
      <div className="w-full max-w-lg bg-noite border border-white/15 rounded-xl p-5 space-y-3 my-4 text-left" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white">🔧 Nova demanda pro time de campo{codigo ? <span className="text-white/45 font-normal text-sm"> · {codigo}</span> : null}</h2>
        <p className="text-xs text-white/55">Vai pro quadro do campo já com o responsável (Felipe), que é avisado pela Bianca. O checklist do tipo de serviço entra junto.</p>
        {carregando ? (
          <p className="text-sm text-white/50 py-6 text-center">Carregando dados do cliente…</p>
        ) : (
          <>
            <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Tipo de serviço *</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
                <option value="" className="bg-noite">Escolha…</option>
                {TIPOS_SERVICO_CAMPO.map((t) => <option key={t.valor} value={t.valor} className="bg-noite">{t.rotulo}</option>)}
              </select></label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Cliente *</span>
                <input value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputCls} placeholder="Nome do cliente" /></label>

              {contatos.length > 0 && (
                <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Contato responsável *</span>
                  <select value={contatoSel} onChange={(e) => escolherContato(e.target.value)} className={inputCls}>
                    {contatos.map((c, i) => (
                      <option key={i} value={String(i)} className="bg-noite">
                        {c.nome} · {formatarTelefone(c.telefone.replace(/^55(?=\d{10,11}$)/, ''))} ({PAPEL[c.papel] || c.papel})
                      </option>
                    ))}
                    <option value="outro" className="bg-noite">Outro contato (digitar)</option>
                  </select></label>
              )}
              {contatoLivre && (
                <>
                  <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Contato no local</span>
                    <input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} className={inputCls} placeholder="Quem recebe" /></label>
                  <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Telefone *</span>
                    <input value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} className={inputCls} placeholder="(48) 99999-9999" inputMode="tel" /></label>
                </>
              )}

              <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">CEP</span>
                <input value={end.cep || ''} onChange={campo('cep')} onBlur={(e) => buscarCep(e.target.value)} className={inputCls} placeholder="88200-000" inputMode="numeric" /></label>
              <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Cidade *</span>
                <input value={end.cidade || ''} onChange={campo('cidade')} className={inputCls} /></label>
              <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Rua</span>
                <input value={end.logradouro || end.rua || ''} onChange={campo('logradouro')} className={inputCls} /></label>
              <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Número</span>
                <input value={end.numero || ''} onChange={campo('numero')} className={inputCls} /></label>
              <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Bairro</span>
                <input value={end.bairro || ''} onChange={campo('bairro')} className={inputCls} /></label>
              <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Complemento / referência</span>
                <input value={end.complemento || ''} onChange={campo('complemento')} className={inputCls} /></label>
              <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">O que precisa ser feito</span>
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className={`${inputCls} resize-none`} /></label>
            </div>
          </>
        )}
        {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Cancelar</button>
          <button onClick={salvar} disabled={salvando || carregando} className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-50">
            {salvando ? 'Enviando…' : 'Enviar demanda'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Botão + formulário (projeto, conversa do Inbox, Dashboard). */
export function BotaoNovaDemanda({ projetoId, conversaId, variante = 'botao' }: {
  projetoId?: string | null
  conversaId?: string | null
  variante?: 'botao' | 'compacto' | 'card'
}) {
  const [aberto, setAberto] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  useEffect(() => { if (!ok) return; const t = setTimeout(() => setOk(null), 6000); return () => clearTimeout(t) }, [ok])

  const botao = variante === 'card' ? (
    <button onClick={() => setAberto(true)} className="w-full text-left p-5 rounded-xl border bg-white/5 border-white/10 hover:border-sol/40 hover:bg-white/[0.07] transition">
      <h3 className="text-base font-bold text-white mb-1.5">🔧 Pedir serviço de campo</h3>
      <p className="text-xs text-white/60 leading-relaxed">Limpeza, manutenção, instalação, visita técnica… vai direto pro time de campo, com aviso da Bianca.</p>
    </button>
  ) : (
    <button onClick={() => setAberto(true)}
      className={variante === 'compacto'
        ? 'px-3 py-1.5 rounded bg-weg-azul/10 border border-weg-azul/30 text-weg-azul text-xs font-bold hover:bg-weg-azul/20'
        : 'px-4 py-2 rounded-lg bg-weg-azul/10 border border-weg-azul/30 text-weg-azul text-sm font-bold hover:bg-weg-azul/20'}
      title="Abrir demanda pro time de campo">
      🔧 Demanda de campo
    </button>
  )

  return (
    <div className={variante === 'card' ? '' : 'relative inline-block'}>
      {botao}
      {ok && <p className="mt-1 text-[11px] text-verde">✓ {ok}</p>}
      {aberto && (
        <NovaDemandaModal
          projetoId={projetoId}
          conversaId={conversaId}
          onFechar={() => setAberto(false)}
          onSalva={(m) => { setAberto(false); setOk(m) }}
        />
      )}
    </div>
  )
}
