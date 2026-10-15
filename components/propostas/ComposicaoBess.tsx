'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatarMoedaBRL, fmtNum } from '@/lib/formatters'
import { MIN_PLACAS_BESS, type ItemKitBess, type KitBess } from '@/lib/propostas/bess'
import type { FaixaSecao, SecaoProposta } from '@/lib/propostas/secoes'
import type { CatalogoBess, EntradaBess, ProdutoBessCat, ResultadoBess } from '@/lib/propostas/categorias-servidor'
import { CampoNumero, inputCls } from './CampoNumero'
import { SecoesProposta } from './SecoesProposta'
import { RodapeProposta } from './RodapeProposta'
import { Bloco } from './ui'
import { CadastroDatasheetModal } from '@/components/CadastroDatasheetModal'
import type { CategoriaProduto } from '@/app/admin/catalogo/actions'

/**
 * Proposta de BESS (sistema de armazenamento) dentro do Spinzap
 * (Kalebe 2026-10-14) — mesma composição e fórmula do kit BESS puro do
 * projeto: baterias, controladora/inversor híbrido, medidor e placas
 * (mínimo 2 por tributação) obrigatórios; caixas e opcionais extras.
 */

export type ApiBess = {
  carregar: () => Promise<{ catalogo: CatalogoBess; kit: KitBess | null; secoes: SecaoProposta[]; faixas: FaixaSecao[]; eh_admin: boolean; margem_padrao_pct: number | null; comissao_padrao_pct: number | null } | { erro: string }>
  calcular: (e: EntradaBess) => Promise<{ r: ResultadoBess } | { erro: string }>
  gerar: (e: EntradaBess) => Promise<{ url_pdf: string; projeto_id: string } | { erro: string }>
  enviar: (projeto_id: string, url: string, legenda: string) => Promise<{ sucesso: true } | { erro: string }>
}

const KIT_VAZIO: KitBess = { placas: [], baterias: [], controladoras: [], medidores: [], caixas_juncao: [], opcionais: [], lista_ca: [] }
const reais = formatarMoedaBRL

const SEGMENTOS: Array<{ chave: keyof CatalogoBess & keyof KitBess; rotulo: string; obrigatorio?: boolean; qtdInicial?: number }> = [
  { chave: 'controladoras', rotulo: 'Controladora / inversor híbrido', obrigatorio: true },
  { chave: 'baterias', rotulo: 'Baterias', obrigatorio: true },
  { chave: 'medidores', rotulo: 'Medidor', obrigatorio: true },
  { chave: 'placas', rotulo: `Placas (mínimo ${MIN_PLACAS_BESS} por tributação)`, obrigatorio: true, qtdInicial: MIN_PLACAS_BESS },
  { chave: 'caixas_juncao', rotulo: 'Caixas de junção' },
  { chave: 'opcionais', rotulo: 'Opcionais' },
]

function Segmento({ rotulo, obrigatorio, opcoes, itens, qtdInicial = 1, onChange }: {
  rotulo: string; obrigatorio?: boolean; opcoes: ProdutoBessCat[]; itens: ItemKitBess[]; qtdInicial?: number
  onChange: (i: ItemKitBess[]) => void
}) {
  const [sel, setSel] = useState('')
  const [qtd, setQtd] = useState(qtdInicial)
  function adicionar() {
    const p = opcoes.find((o) => o.id === sel)
    if (!p || !(qtd > 0)) return
    const ja = itens.find((i) => i.id === p.id)
    onChange(ja ? itens.map((i) => (i.id === p.id ? { ...i, qtd: i.qtd + Math.round(qtd) } : i))
      : [...itens, { id: p.id, marca: p.marca, modelo: p.modelo, potencia_kw: p.potencia_kw, qtd: Math.round(qtd), preco_venda: p.preco_venda }])
    setSel(''); setQtd(qtdInicial)
  }
  const rotuloOpcao = (o: ProdutoBessCat) => `${o.modelo}${o.potencia_kw ? ` · ${fmtNum(o.potencia_kw, o.potencia_kw % 1 ? 1 : 0)}` : ''}${o.disponivel ? '' : ' · sem estoque'}${o.preco_venda > 0 ? '' : ' · sem preço'}`
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold text-white/60">{rotulo}{obrigatorio && !itens.length ? <span className="text-coral"> · obrigatório</span> : null}</p>
      <div className="grid grid-cols-[1fr_64px_auto] gap-2">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className={inputCls}>
          <option value="" className="bg-noite">{opcoes.length ? 'Escolha…' : 'Nada no catálogo'}</option>
          {opcoes.map((o) => <option key={o.id} value={o.id} className="bg-noite">{rotuloOpcao(o)}</option>)}
        </select>
        <CampoNumero valor={qtd} onChange={setQtd} aria-label="Quantidade" />
        <button type="button" onClick={adicionar} disabled={!sel} className="px-3 py-2 rounded-xl bg-weg-azul text-white text-xs font-bold disabled:opacity-40">Adicionar</button>
      </div>
      {itens.length > 0 && (
        <ul className="space-y-1">
          {itens.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-[12px] text-white/80 border border-white/10 rounded-lg px-2.5 py-1">
              <span className="truncate">{i.modelo}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <CampoNumero valor={i.qtd} onChange={(n) => onChange(itens.map((x) => (x.id === i.id ? { ...x, qtd: Math.max(1, Math.round(n)) } : x)))}
                  className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-end" aria-label="Quantidade" />
                <button type="button" onClick={() => onChange(itens.filter((x) => x.id !== i.id))} aria-label="Tirar"
                  className="w-6 h-6 rounded-full bg-white/[0.06] text-white/60 hover:text-white">✕</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ComposicaoBess({ api, nomeCliente, onEnviada }: { api: ApiBess; nomeCliente: string; onEnviada?: () => void }) {
  const [catalogo, setCatalogo] = useState<CatalogoBess | null>(null)
  const [kit, setKit] = useState<KitBess>(KIT_VAZIO)
  const [secoes, setSecoes] = useState<SecaoProposta[]>([])
  const [faixas, setFaixas] = useState<FaixaSecao[]>([])
  const [ehAdmin, setEhAdmin] = useState(false)
  const [margem, setMargem] = useState<number | null>(null)
  const [comissao, setComissao] = useState<number | null>(null)
  const [r, setR] = useState<ResultadoBess | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Kalebe 2026-10-14: equipamento novo (datasheet + valores) sem sair da proposta — admin
  const [cadastro, setCadastro] = useState<CategoriaProduto | null>(null)
  const recarregarCatalogo = () => api.carregar().then((d) => { if (!('erro' in d)) setCatalogo(d.catalogo) })

  useEffect(() => {
    api.carregar().then((d) => {
      if ('erro' in d) { setErro(d.erro); return }
      setCatalogo(d.catalogo); setKit(d.kit || KIT_VAZIO); setSecoes(d.secoes); setFaixas(d.faixas)
      setEhAdmin(d.eh_admin); setMargem(d.margem_padrao_pct); setComissao(d.comissao_padrao_pct)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entrada = useMemo<EntradaBess>(() => ({ kit, secoes, margem_pct: ehAdmin ? margem : null, comissao_pct: ehAdmin ? comissao : null }), [kit, secoes, margem, comissao, ehAdmin])
  const pedido = useRef(0)
  useEffect(() => {
    if (!catalogo) return
    const n = ++pedido.current
    const t = setTimeout(async () => {
      const x = await api.calcular(entrada)
      if (n !== pedido.current) return
      if ('erro' in x) setErro(x.erro); else { setErro(null); setR(x.r) }
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrada, catalogo])

  if (!catalogo) return erro ? <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p> : <p className="text-sm text-white/50">Carregando catálogo…</p>
  const c = r?.calculo

  return (
    <div className="space-y-3">
      <Bloco n="1" titulo="Equipamentos">
        {SEGMENTOS.map((s) => (
          <Segmento key={s.chave} rotulo={s.rotulo} obrigatorio={s.obrigatorio} qtdInicial={s.qtdInicial}
            opcoes={catalogo[s.chave]} itens={kit[s.chave]} onChange={(itens) => setKit((k) => ({ ...k, [s.chave]: itens }))} />
        ))}
        {ehAdmin && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => setCadastro('bateria')} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold text-start">📄 Cadastrar bateria (datasheet)</button>
            <button type="button" onClick={() => setCadastro('inversor')} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold text-start">📄 Cadastrar inversor híbrido (datasheet)</button>
            <button type="button" onClick={() => setCadastro('outro')} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold text-start">📄 Outro equipamento</button>
          </div>
        )}
        {cadastro && (
          <CadastroDatasheetModal categoriaInicial={cadastro} subcategoriaInversor="inversor_hibrido"
            onClose={() => setCadastro(null)} onCreated={() => { recarregarCatalogo() }} />
        )}
      </Bloco>

      <Bloco n="2" titulo="Projeto e execução" valor={c && ehAdmin ? reais(c.projeto_art + c.instalacao + c.frete) : null}>
        <ul className="text-[12px] text-white/75 space-y-0.5">
          <li className="flex justify-between gap-2"><span>Projeto e ART{c?.potencia_ca_total_kw ? ` · ${fmtNum(c.potencia_ca_total_kw, 1)} kW` : ''}</span>{c && ehAdmin && <span className="tabular-nums">{reais(c.projeto_art)}</span>}</li>
          <li className="flex justify-between gap-2"><span>Instalação · {c?.qtd_inversor || 0} inversor(es) e {c?.qtd_bateria || 0} bateria(s)</span>{c && ehAdmin && <span className="tabular-nums">{reais(c.instalacao)}</span>}</li>
          <li className="flex justify-between gap-2"><span>Frete</span>{c && ehAdmin && <span className="tabular-nums">{reais(c.frete)}</span>}</li>
        </ul>
      </Bloco>

      <Bloco n="3" titulo="Serviços adicionais">
        <SecoesProposta faixas={faixas} secoes={secoes} onChange={setSecoes} />
      </Bloco>

      <section className="rounded-2xl border border-sol/40 p-3 space-y-2">
        {ehAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Margem (%)</span><CampoNumero valor={margem ?? 0} onChange={setMargem} casas={1} /></label>
            <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Comissão (%)</span><CampoNumero valor={comissao ?? 0} onChange={setComissao} casas={1} /></label>
          </div>
        )}
        {c && ehAdmin && (
          <div className="text-[11px] text-white/55 space-y-0.5">
            <p className="flex justify-between"><span>Kit WEG {reais(c.kit_bess_bruto)} × {fmtNum(c.fator_kit, 4)}</span><span className="tabular-nums">{reais(c.kit_com_fator)}</span></p>
            <p className="flex justify-between"><span>Margem {fmtNum(c.margem_pct, 1)}%</span><span className="tabular-nums">{reais(c.margem)}</span></p>
            <p className="flex justify-between"><span>Comissão {fmtNum(c.comissao_pct, 1)}%</span><span className="tabular-nums">{reais(c.comissao)}</span></p>
            <p className="flex justify-between"><span>Imposto {fmtNum(c.impostos_pct, 1)}% (nota Spin)</span><span className="tabular-nums">{reais(c.imposto)}</span></p>
            <p className="flex justify-between"><span>Desconto máximo na negociação</span><span className="tabular-nums">{reais(c.desconto_max)}</span></p>
          </div>
        )}
        {r && r.total_secoes > 0 && (
          <div className="text-[11px] text-white/60 space-y-0.5">
            <p className="flex justify-between"><span>Sistema BESS</span><span className="tabular-nums">{reais(r.calculo.pv_total)}</span></p>
            <p className="flex justify-between"><span>Serviços adicionais</span><span className="tabular-nums">{reais(r.total_secoes)}</span></p>
          </div>
        )}
        <div className="flex items-end justify-between gap-2 pt-1">
          <span className="text-[11px] font-bold text-white/60 uppercase">Total ao cliente</span>
          <span className="text-2xl font-black text-white tabular-nums">{r ? reais(r.total) : '—'}</span>
        </div>
      </section>
      {erro && <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p>}

      <RodapeProposta
        chave={JSON.stringify(entrada)}
        podeGerar={!!r && !r.pendencia && r.calculo.pv_total > 0}
        motivo={r?.pendencia || null}
        gerar={() => api.gerar(entrada)}
        enviar={api.enviar}
        legendaPadrao={`Oi${nomeCliente ? `, ${nomeCliente.split(' ')[0]}` : ''}! Segue a proposta do seu sistema de armazenamento de energia 🔋 Qualquer dúvida, é só me chamar por aqui.`}
        onEnviada={onEnviada}
      />
    </div>
  )
}
