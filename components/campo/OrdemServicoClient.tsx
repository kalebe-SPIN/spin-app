'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getTituloTipo } from '@/lib/execucoes'
import { formatarCpfCnpj, formatarMoedaBRL } from '@/lib/formatters'
import { linhaEndereco, linkMapa, linkWhatsApp, rotuloOs, type EnderecoCampo, type ItemChecklist } from '@/lib/campo/comum'
import { fotoReduzida } from '@/lib/campo/imagem'
import { AssinaturaCanvas, type AssinaturaRef } from './AssinaturaCanvas'
import {
  concluirOsAction, custosDaOsAction, enviarFotoOsAction, iniciarOsAction,
  registrarCustoExtraAction, salvarOsAction,
} from '@/app/campo/actions'

export type Foto = { caminho: string; url: string }
export type Custo = { id: string; descricao: string; valor: number; pago_por: string }
export type OsTela = {
  id: string
  os_numero: number | null
  status: string
  tipo_servico: string
  titulo: string
  descricao: string | null
  projeto_codigo: string | null
  cliente_nome: string | null
  contato_nome: string | null
  contato_telefone: string | null
  endereco: EnderecoCampo | null
  data_agendada: string | null
  hora_agendada: string | null
  checklist: ItemChecklist[]
  observacoes: string
  problemas: string
  fotos_antes: Foto[]
  fotos_depois: Foto[]
  custos: Custo[]
  assinatura_url: string | null
  assinatura_nome: string | null
  assinatura_documento: string | null
  assinado_em: string | null
}

const FECHADOS = ['concluido', 'entregue', 'pos_venda', 'cancelado']
const STATUS_ROTULO: Record<string, string> = {
  agendando: 'Em aberto', aguardando_pre_requisitos: 'Aguardando liberação', agendado: 'Agendada',
  preparando_material: 'Preparando material', em_execucao: 'Em execução', concluido: 'Concluída',
  entregue: 'Entregue', pos_venda: 'Pós-venda', cancelado: 'Cancelada',
}
const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none'
const cardCls = 'rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3'
const dataBR = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

export function OrdemServicoClient({ os }: { os: OsTela }) {
  const router = useRouter()
  const emExecucao = os.status === 'em_execucao'
  const fechada = FECHADOS.includes(os.status)
  const [checklist, setChecklist] = useState<ItemChecklist[]>(os.checklist)
  const [obsAberta, setObsAberta] = useState<number | null>(null)
  const [observacoes, setObservacoes] = useState(os.observacoes)
  const [problemas, setProblemas] = useState(os.problemas)
  const [fotos, setFotos] = useState({ antes: os.fotos_antes, depois: os.fotos_depois })
  const [enviandoFoto, setEnviandoFoto] = useState<null | 'antes' | 'depois'>(null)
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | string>('')
  const [erro, setErro] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(false)

  async function salvar(d: Parameters<typeof salvarOsAction>[1]) {
    setEstado('salvando')
    const r = await salvarOsAction(os.id, d)
    setEstado('erro' in r ? `⚠ ${r.erro}` : 'salvo')
  }

  function mudarItem(i: number, patch: Partial<ItemChecklist>, gravar = true) {
    const nova = checklist.map((x, k) => (k === i ? { ...x, ...patch } : x))
    setChecklist(nova)
    if (gravar) salvar({ checklist: nova })
    return nova
  }

  async function enviarFoto(momento: 'antes' | 'depois', arquivos: FileList | null) {
    if (!arquivos?.length) return
    setEnviandoFoto(momento); setErro(null)
    try {
      for (const f of Array.from(arquivos)) {
        const blob = await fotoReduzida(f)
        const fd = new FormData()
        fd.set('id', os.id); fd.set('momento', momento); fd.set('arquivo', blob, 'foto.jpg')
        const r = await enviarFotoOsAction(fd)
        if ('erro' in r) { setErro(r.erro); break }
        setFotos((x) => ({ ...x, [momento]: [...x[momento], { caminho: r.caminho, url: URL.createObjectURL(blob) }] }))
      }
      // Marca sozinho o item "Fotos ANTES/DEPOIS" do checklist
      const alvo = momento === 'antes' ? /fotos antes/i : /fotos depois/i
      const i = checklist.findIndex((x) => alvo.test(x.item) && !x.feito)
      if (i >= 0) mudarItem(i, { feito: true })
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar a foto')
    } finally {
      setEnviandoFoto(null)
    }
  }

  const feitos = checklist.filter((x) => x.feito).length

  return (
    <div className="space-y-4 pb-10">
      {/* Cabeçalho */}
      <section className={cardCls}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-black text-sol">{rotuloOs(os.os_numero)}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-weg-azul/15 text-weg-azul">{getTituloTipo(os.tipo_servico)}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fechada ? 'bg-verde/15 text-verde' : emExecucao ? 'bg-coral/15 text-coral' : 'bg-white/10 text-white/70'}`}>
            {STATUS_ROTULO[os.status] || os.status}
          </span>
          {os.projeto_codigo && <span className="text-[10px] text-white/45">{os.projeto_codigo}</span>}
        </div>
        <div>
          <p className="text-base font-bold text-white">{os.cliente_nome || os.titulo}</p>
          <p className="text-sm text-white/65">{linhaEndereco(os.endereco) || 'Sem endereço cadastrado'}</p>
          {os.data_agendada && <p className="text-xs text-white/50 mt-1">📅 {dataBR(os.data_agendada)}{os.hora_agendada ? ` às ${os.hora_agendada}` : ''}</p>}
        </div>
        {os.descricao && <p className="text-sm text-white/70 whitespace-pre-wrap border-l-2 border-sol/40 pl-3">{os.descricao}</p>}
        <div className="grid grid-cols-3 gap-2">
          {linkMapa(os.endereco) ? <a href={linkMapa(os.endereco)!} target="_blank" rel="noreferrer" className="py-2.5 text-center text-xs font-bold rounded-lg bg-white/5 border border-white/15 text-white">🗺 Mapa</a> : <span />}
          {os.contato_telefone ? <a href={`tel:${os.contato_telefone.replace(/\D/g, '')}`} className="py-2.5 text-center text-xs font-bold rounded-lg bg-white/5 border border-white/15 text-white">📞 Ligar</a> : <span />}
          {linkWhatsApp(os.contato_telefone) ? <a href={linkWhatsApp(os.contato_telefone)!} target="_blank" rel="noreferrer" className="py-2.5 text-center text-xs font-bold rounded-lg bg-verde/10 border border-verde/30 text-verde">💬 WhatsApp</a> : <span />}
        </div>
        {os.contato_nome && <p className="text-xs text-white/50">Contato no local: {os.contato_nome}{os.contato_telefone ? ` · ${os.contato_telefone}` : ''}</p>}
      </section>

      {erro && <div className="p-3 rounded-lg bg-coral/10 border border-coral/30 text-sm text-coral">⚠ {erro}<button onClick={() => setErro(null)} className="float-right text-xs">✕</button></div>}

      {/* Iniciar */}
      {!emExecucao && !fechada && (
        <section className={cardCls}>
          <p className="text-sm text-white/70">Chegou no local? Inicie a OS pra liberar o checklist, as fotos e a assinatura do cliente.</p>
          <button
            disabled={iniciando}
            onClick={async () => {
              setIniciando(true); setErro(null)
              const r = await iniciarOsAction(os.id)
              if ('erro' in r) { setErro(r.erro); setIniciando(false); return }
              router.refresh()
            }}
            className="w-full py-3.5 bg-sol text-noite font-black rounded-xl text-base disabled:opacity-50"
          >
            {iniciando ? 'Iniciando…' : '▶ Iniciar serviço'}
          </button>
        </section>
      )}

      {/* Fotos ANTES */}
      {(emExecucao || fotos.antes.length > 0) && (
        <BlocoFotos titulo="📷 Fotos antes" fotos={fotos.antes} podeEnviar={emExecucao}
          enviando={enviandoFoto === 'antes'} onArquivos={(f) => enviarFoto('antes', f)} />
      )}

      {/* Checklist */}
      <section className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">✔ Checklist <span className="text-white/45 font-normal">({feitos}/{checklist.length})</span></h2>
          {emExecucao && estado && <span className={`text-[11px] ${estado.startsWith('⚠') ? 'text-coral' : 'text-white/40'}`}>{estado === 'salvando' ? 'salvando…' : estado === 'salvo' ? '✓ salvo' : estado}</span>}
        </div>
        <ul className="space-y-1.5">
          {checklist.map((x, i) => (
            <li key={i} className={`rounded-lg border ${x.feito ? 'border-verde/30 bg-verde/5' : 'border-white/10'}`}>
              <div className="flex items-start gap-3 p-2.5">
                <input type="checkbox" checked={x.feito} disabled={!emExecucao}
                  onChange={(e) => mudarItem(i, { feito: e.target.checked })}
                  className="mt-0.5 w-6 h-6 shrink-0 accent-[#22C55E]" />
                <button type="button" disabled={!emExecucao} onClick={() => emExecucao && mudarItem(i, { feito: !x.feito })}
                  className={`flex-1 text-left text-sm ${x.feito ? 'text-white/60 line-through' : 'text-white'}`}>
                  {x.item}
                </button>
                {emExecucao && (
                  <button type="button" onClick={() => setObsAberta(obsAberta === i ? null : i)} className="text-xs text-white/50 px-1" aria-label="Observação do item">
                    📝
                  </button>
                )}
              </div>
              {(obsAberta === i || (x.obs && !emExecucao)) && (
                <div className="px-2.5 pb-2.5">
                  {emExecucao ? (
                    <input autoFocus value={x.obs || ''} placeholder="Observação deste item (ex.: não se aplica, motivo…)"
                      onChange={(e) => mudarItem(i, { obs: e.target.value }, false)}
                      onBlur={() => salvar({ checklist })}
                      className={inputCls} />
                  ) : <p className="text-xs text-white/55">📝 {x.obs}</p>}
                </div>
              )}
              {x.obs && obsAberta !== i && emExecucao && <p className="px-2.5 pb-2 text-xs text-white/50">📝 {x.obs}</p>}
            </li>
          ))}
        </ul>
        {!emExecucao && !fechada && <p className="text-xs text-white/40">O checklist libera quando o serviço é iniciado.</p>}
      </section>

      {/* Fotos DEPOIS */}
      {(emExecucao || fotos.depois.length > 0) && (
        <BlocoFotos titulo="📷 Fotos depois" fotos={fotos.depois} podeEnviar={emExecucao}
          enviando={enviandoFoto === 'depois'} onArquivos={(f) => enviarFoto('depois', f)} />
      )}

      {/* Observações */}
      {(emExecucao || observacoes || problemas) && (
        <section className={cardCls}>
          <h2 className="text-sm font-bold text-white">🗒 Observações</h2>
          {emExecucao ? (
            <>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} onBlur={() => salvar({ observacoes })}
                rows={3} placeholder="Como foi o serviço, combinados com o cliente…" className={`${inputCls} resize-none`} />
              <textarea value={problemas} onChange={(e) => setProblemas(e.target.value)} onBlur={() => salvar({ problemas })}
                rows={2} placeholder="Problemas encontrados (se houver) — vira aviso pro escritório" className={`${inputCls} resize-none`} />
            </>
          ) : (
            <>
              {observacoes && <p className="text-sm text-white/70 whitespace-pre-wrap">{observacoes}</p>}
              {problemas && <p className="text-sm text-coral whitespace-pre-wrap">⚠ {problemas}</p>}
            </>
          )}
        </section>
      )}

      {/* Custos extras */}
      <CustosExtras osId={os.id} inicial={os.custos} podeLancar={!fechada} />

      {/* Conclusão */}
      {emExecucao && <Concluir osId={os.id} pendentes={checklist.length - feitos} onConcluida={() => router.refresh()} />}
      {fechada && os.assinatura_url && (
        <section className={cardCls}>
          <h2 className="text-sm font-bold text-white">✍ Assinatura do cliente</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={os.assinatura_url} alt="Assinatura do cliente" className="tema-fixo w-full max-w-sm rounded-lg bg-white" />
          <p className="text-xs text-white/60">
            {os.assinatura_nome}{os.assinatura_documento ? ` · ${formatarCpfCnpj(os.assinatura_documento)}` : ''}
            {os.assinado_em ? ` · ${new Date(os.assinado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
          </p>
        </section>
      )}
    </div>
  )
}

function BlocoFotos({ titulo, fotos, podeEnviar, enviando, onArquivos }: {
  titulo: string; fotos: Foto[]; podeEnviar: boolean; enviando: boolean; onArquivos: (f: FileList | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <section className={cardCls}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">{titulo} <span className="text-white/45 font-normal">({fotos.length})</span></h2>
        {podeEnviar && (
          <>
            <button onClick={() => ref.current?.click()} disabled={enviando} className="px-3 py-2 bg-sol text-noite text-xs font-bold rounded-lg disabled:opacity-50">
              {enviando ? 'Enviando…' : '+ Foto'}
            </button>
            <input ref={ref} type="file" accept="image/*" capture="environment" multiple hidden
              onChange={(e) => { onArquivos(e.target.files); e.target.value = '' }} />
          </>
        )}
      </div>
      {fotos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {fotos.map((f) => f.url ? (
            <a key={f.caminho} href={f.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" className="w-full aspect-square object-cover rounded-lg border border-white/10" />
            </a>
          ) : <div key={f.caminho} className="aspect-square rounded-lg bg-white/5" />)}
        </div>
      ) : podeEnviar ? <p className="text-xs text-white/40">Nenhuma foto ainda.</p> : null}
    </section>
  )
}

function CustosExtras({ osId, inicial, podeLancar }: { osId: string; inicial: Custo[]; podeLancar: boolean }) {
  const [custos, setCustos] = useState(inicial)
  const [aberto, setAberto] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [pagoPor, setPagoPor] = useState<'profissional' | 'empresa'>('profissional')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  if (!podeLancar && !custos.length) return null
  const total = custos.reduce((s, c) => s + c.valor, 0)

  async function lancar() {
    setSalvando(true); setErro(null)
    try {
      const fd = new FormData()
      fd.set('id', osId); fd.set('descricao', descricao); fd.set('valor', valor); fd.set('pago_por', pagoPor)
      if (arquivo) fd.set('arquivo', await fotoReduzida(arquivo), 'comprovante.jpg')
      const r = await registrarCustoExtraAction(fd)
      if ('erro' in r) { setErro(r.erro); return }
      const l = await custosDaOsAction(osId)
      if (!('erro' in l)) setCustos(l.custos)
      setDescricao(''); setValor(''); setArquivo(null); setAberto(false)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao lançar')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className={cardCls}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">💸 Custos extras {custos.length > 0 && <span className="text-white/45 font-normal">· {formatarMoedaBRL(total)}</span>}</h2>
        {podeLancar && !aberto && <button onClick={() => setAberto(true)} className="px-3 py-2 bg-white/5 border border-white/15 text-white text-xs font-bold rounded-lg">+ Lançar custo</button>}
      </div>
      {custos.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-white/75 truncate">{c.descricao.replace(/^Custo extra OS \d+ — /, '')}{c.pago_por === 'profissional' ? ' · reembolsar' : ''}</span>
          <span className="text-white font-bold shrink-0">{formatarMoedaBRL(c.valor)}</span>
        </div>
      ))}
      {aberto && (
        <div className="space-y-2 pt-1">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que foi? (ex.: parafusos extras, pedágio)" className={inputCls} />
          <input value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="Valor (R$)" inputMode="decimal" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            {(['profissional', 'empresa'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPagoPor(p)}
                className={`py-2 text-xs font-bold rounded-lg border ${pagoPor === p ? 'border-sol bg-sol/10 text-sol' : 'border-white/15 text-white/60'}`}>
                {p === 'profissional' ? 'Eu paguei (reembolso)' : 'A empresa pagou'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-white/60">
            <span className="px-3 py-2 bg-white/5 border border-white/15 rounded-lg cursor-pointer">📎 {arquivo ? 'Comprovante ✓' : 'Foto do comprovante'}</span>
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
          </label>
          {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAberto(false); setErro(null) }} className="px-4 py-2 text-white/60 text-sm">Cancelar</button>
            <button onClick={lancar} disabled={salvando} className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-50">
              {salvando ? 'Lançando…' : 'Lançar no projeto'}
            </button>
          </div>
          <p className="text-[11px] text-white/40">Vai pro fluxo de caixa como custo do projeto; o escritório confere e efetiva.</p>
        </div>
      )}
    </section>
  )
}

function Concluir({ osId, pendentes, onConcluida }: { osId: string; pendentes: number; onConcluida: () => void }) {
  const assinatura = useRef<AssinaturaRef>(null)
  const [vazia, setVazia] = useState(true)
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function concluir() {
    setErro(null)
    if (pendentes > 0) { setErro(`Faltam ${pendentes} item(ns) do checklist. Se algum não se aplica, marque e explique no 📝.`); return }
    if (!nome.trim()) { setErro('Nome de quem assina'); return }
    const blob = await assinatura.current?.paraBlob()
    if (!blob) { setErro('Peça pro cliente assinar no quadro'); return }
    setSalvando(true)
    const fd = new FormData()
    fd.set('id', osId); fd.set('nome', nome); fd.set('documento', documento); fd.set('assinatura', blob, 'assinatura.png')
    const r = await concluirOsAction(fd)
    setSalvando(false)
    if ('erro' in r) { setErro(r.erro); return }
    onConcluida()
  }

  return (
    <section className="rounded-xl border border-sol/40 bg-sol/5 p-4 space-y-3">
      <h2 className="text-sm font-bold text-white">✍ Conclusão — assinatura do cliente</h2>
      <p className="text-xs text-white/60">Ao assinar, o cliente confirma que o serviço foi executado.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem assina *" className={inputCls} />
        <input value={documento} onChange={(e) => setDocumento(formatarCpfCnpj(e.target.value))} placeholder="CPF/CNPJ (opcional)" inputMode="numeric" className={inputCls} />
      </div>
      <AssinaturaCanvas ref={assinatura} onMudou={setVazia} />
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => assinatura.current?.limpar()} className="text-xs text-white/60 underline">limpar assinatura</button>
        {vazia && <span className="text-[11px] text-white/40">assine com o dedo no quadro</span>}
      </div>
      {erro && <p className="text-sm text-coral">⚠ {erro}</p>}
      <button onClick={concluir} disabled={salvando} className="w-full py-3.5 bg-verde text-noite font-black rounded-xl text-base disabled:opacity-50">
        {salvando ? 'Concluindo…' : '✅ Concluir OS'}
      </button>
    </section>
  )
}
