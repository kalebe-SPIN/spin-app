'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatarMoedaBRL, fmtNum } from '@/lib/formatters'
import type { FaixaSecao, SecaoProposta } from '@/lib/propostas/secoes'
import type { EntradaTecnico, ResultadoTecnico } from '@/lib/propostas/categorias-servidor'
import { CampoNumero, inputCls } from './CampoNumero'
import { SecoesProposta } from './SecoesProposta'
import { RodapeProposta } from './RodapeProposta'
import { Bloco, Opcao, Rotulo } from './ui'

/**
 * Proposta de projetos técnicos dentro do Spinzap (Kalebe 2026-10-14):
 * projeto elétrico + ART e diagramas (parâmetros — custo, com margem por
 * cima), laudo técnico e análise de rede (tabela de faixas).
 */

export type ApiTecnico = {
  carregar: () => Promise<{ faixas_tecnico: FaixaSecao[]; entrada: EntradaTecnico | null; secoes: SecaoProposta[]; faixas: FaixaSecao[]; eh_admin: boolean; margem_padrao_pct: number | null; comissao_padrao_pct: number | null } | { erro: string }>
  calcular: (e: EntradaTecnico) => Promise<{ r: ResultadoTecnico } | { erro: string }>
  gerar: (e: EntradaTecnico) => Promise<{ url_pdf: string; projeto_id: string } | { erro: string }>
  enviar: (projeto_id: string, url: string, legenda: string) => Promise<{ sucesso: true } | { erro: string }>
}

const reais = formatarMoedaBRL
const VAZIA: EntradaTecnico = { projeto_art: true, potencia_kw: 0, unifilar: false, trifilar: false, laudo_nivel: 0, analise_dias: 0, descricao: '' }

export function ComposicaoTecnico({ api, nomeCliente, onEnviada }: { api: ApiTecnico; nomeCliente: string; onEnviada?: () => void }) {
  const [faixasTec, setFaixasTec] = useState<FaixaSecao[] | null>(null)
  const [faixas, setFaixas] = useState<FaixaSecao[]>([])
  const [e, setE] = useState<EntradaTecnico>(VAZIA)
  const [secoes, setSecoes] = useState<SecaoProposta[]>([])
  const [ehAdmin, setEhAdmin] = useState(false)
  const [margem, setMargem] = useState<number | null>(null)
  const [comissao, setComissao] = useState<number | null>(null)
  const [r, setR] = useState<ResultadoTecnico | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api.carregar().then((d) => {
      if ('erro' in d) { setErro(d.erro); return }
      setFaixasTec(d.faixas_tecnico); setFaixas(d.faixas); setSecoes(d.secoes); setEhAdmin(d.eh_admin)
      if (d.entrada) setE({ ...VAZIA, ...d.entrada })
      setMargem(d.entrada?.margem_pct ?? d.margem_padrao_pct); setComissao(d.entrada?.comissao_pct ?? d.comissao_padrao_pct)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entrada = useMemo<EntradaTecnico>(() => ({ ...e, secoes, margem_pct: ehAdmin ? margem : null, comissao_pct: ehAdmin ? comissao : null }), [e, secoes, margem, comissao, ehAdmin])
  const pedido = useRef(0)
  useEffect(() => {
    if (!faixasTec) return
    const n = ++pedido.current
    const t = setTimeout(async () => {
      const x = await api.calcular(entrada)
      if (n !== pedido.current) return
      if ('erro' in x) setErro(x.erro); else { setErro(null); setR(x.r) }
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrada, faixasTec])

  if (!faixasTec) return erro ? <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p> : <p className="text-sm text-white/50">Carregando…</p>
  // Laudo: ordem da tabela (simples → pericial), a ordem carrega sentido
  const niveisLaudo = faixasTec.filter((f) => f.chave_servico === 'laudo_tecnico').sort((a, b) => a.faixa_min - b.faixa_min)
  const mudar = (p: Partial<EntradaTecnico>) => setE((x) => ({ ...x, ...p }))

  return (
    <div className="space-y-3">
      <Bloco n="1" titulo="Serviços técnicos">
        <div className="flex flex-wrap gap-2">
          <Opcao ativo={e.projeto_art} onClick={() => mudar({ projeto_art: !e.projeto_art })}>Projeto elétrico + ART</Opcao>
          <Opcao ativo={e.unifilar} onClick={() => mudar({ unifilar: !e.unifilar })}>Diagrama unifilar</Opcao>
          <Opcao ativo={e.trifilar} onClick={() => mudar({ trifilar: !e.trifilar })}>Diagrama trifilar</Opcao>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {e.projeto_art && (
            <Rotulo texto="Potência do sistema (kW)"><CampoNumero valor={e.potencia_kw} onChange={(n) => mudar({ potencia_kw: n })} casas={1} placeholder="até 30 kW = valor fixo" /></Rotulo>
          )}
          <Rotulo texto="Laudo técnico">
            <select value={e.laudo_nivel} onChange={(x) => mudar({ laudo_nivel: Number(x.target.value) })} className={inputCls}>
              <option value={0} className="bg-noite">Sem laudo</option>
              {niveisLaudo.map((f) => <option key={f.faixa_min} value={f.faixa_min} className="bg-noite">{f.descricao}</option>)}
            </select>
          </Rotulo>
          <Rotulo texto="Análise de rede (dias de coleta)"><CampoNumero valor={e.analise_dias} onChange={(n) => mudar({ analise_dias: Math.max(0, Math.round(n)) })} placeholder="0 = sem análise" /></Rotulo>
        </div>
        <Rotulo texto="Escopo para o cliente (opcional)">
          <textarea rows={2} value={e.descricao || ''} onChange={(x) => mudar({ descricao: x.target.value })} className={`${inputCls} resize-none`}
            placeholder="Ex.: projeto elétrico da ampliação do galpão, com homologação na CELESC" />
        </Rotulo>
        {r && r.linhas.length > 0 && (
          <ul className="text-[12px] text-white/75 space-y-0.5">
            {r.linhas.map((l) => (
              <li key={l.chave} className="flex justify-between gap-2">
                <span>{l.descricao} <span className="text-white/45">· {l.detalhe}{l.tipo === 'tabela' ? ' (tabela de faixas)' : ''}</span></span>
                {(ehAdmin || l.tipo === 'tabela') && <span className="tabular-nums shrink-0">{reais(l.valor)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco n="2" titulo="Serviços adicionais">
        <SecoesProposta faixas={faixas} secoes={secoes} onChange={setSecoes} />
      </Bloco>

      <section className="rounded-2xl border border-sol/40 p-3 space-y-2">
        {ehAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <Rotulo texto="Margem (%)"><CampoNumero valor={margem ?? 0} onChange={setMargem} casas={1} /></Rotulo>
            <Rotulo texto="Comissão (%)"><CampoNumero valor={comissao ?? 0} onChange={setComissao} casas={1} /></Rotulo>
          </div>
        )}
        {r && ehAdmin && r.custo > 0 && (
          <div className="text-[11px] text-white/55 space-y-0.5">
            <p className="flex justify-between"><span>Custo (projeto/diagramas)</span><span className="tabular-nums">{reais(r.custo)}</span></p>
            <p className="flex justify-between"><span>Margem {fmtNum(r.margem_pct, 1)}% · comissão {fmtNum(r.comissao_pct, 1)}% · imposto {fmtNum(r.imposto_pct, 1)}%</span><span className="tabular-nums">{reais(r.pv_custos)}</span></p>
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
        podeGerar={!!r && !r.erro && r.total > 0}
        motivo={r?.erro || null}
        gerar={() => api.gerar(entrada)}
        enviar={api.enviar}
        legendaPadrao={`Oi${nomeCliente ? `, ${nomeCliente.split(' ')[0]}` : ''}! Segue a proposta do projeto técnico que conversamos 📐 Qualquer dúvida, é só me chamar por aqui.`}
        onEnviada={onEnviada}
      />
    </div>
  )
}
