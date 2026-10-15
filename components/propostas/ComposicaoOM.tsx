'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatarMoedaBRL, fmtNum } from '@/lib/formatters'
import type { FaixaSecao, SecaoProposta } from '@/lib/propostas/secoes'
import { calcularEntradaOM, type EntradaOM, type ParamsOM, type ServicoOM } from '@/lib/propostas/categorias-servidor'
import { OPCOES_PAVIMENTO, OPCOES_PROGRAMACAO, OPCOES_TELHADO } from '@/lib/precificacao/servico-retirada-recolocacao'
import type { EntradasLimpeza } from '@/lib/precificacao/servico-limpeza'
import type { EntradasRevisao } from '@/lib/precificacao/servico-revisao'
import type { EntradasRetiradaRecolocacao } from '@/lib/precificacao/servico-retirada-recolocacao'
import { CampoNumero, inputCls } from './CampoNumero'
import { SecoesProposta } from './SecoesProposta'
import { RodapeProposta } from './RodapeProposta'
import { Bloco, Opcao, Rotulo } from './ui'
import { SeletorCidade } from '@/components/inbox/SeletorCidade'

const TELHADOS_AZ = [...OPCOES_TELHADO].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

/**
 * Proposta de O&M dentro do Spinzap (Kalebe 2026-10-14): limpeza, manutenção
 * com revisão ou retirada e recolocação — as mesmas calculadoras das telas de
 * serviço do projeto (parâmetros, visita mínima, faixa de referência e ajuste).
 */

export type ApiOM = {
  carregar: () => Promise<{ params: ParamsOM; faixas_om: FaixaSecao[]; km: number; cidade: string | null; entrada: EntradaOM | null; secoes: SecaoProposta[]; faixas: FaixaSecao[] } | { erro: string }>
  gerar: (e: EntradaOM) => Promise<{ url_pdf: string; projeto_id: string } | { erro: string }>
  enviar: (projeto_id: string, url: string, legenda: string) => Promise<{ sucesso: true } | { erro: string }>
}

const reais = formatarMoedaBRL
const SERVICOS: Array<{ chave: ServicoOM; rotulo: string; faixa: string }> = [
  { chave: 'limpeza', rotulo: 'Limpeza', faixa: 'limpeza_fotovoltaica' },
  { chave: 'revisao', rotulo: 'Manutenção com revisão', faixa: 'revisao_manutencao' },
  { chave: 'retirada', rotulo: 'Retirada e recolocação', faixa: 'retirada_recolocacao' },
]
// Mesmos valores iniciais das telas de serviço do projeto
const limpezaPadrao = (km: number): EntradasLimpeza => ({
  qtd_modulos: 0, tipo_telhado: 'fibrocimento', altura_telhado_m: null, pavimento: 'terreo', km_deslocamento: km,
  programacao: 'normal', qtd_instaladores: 2, dias_estimados: 1, tem_ponto_agua: true, tem_ponto_energia: true, sujidade: 'medio',
})
const revisaoPadrao = (km: number): EntradasRevisao => ({
  qtd_modulos: 0, qtd_strings: 2, qtd_inversores: 1, tipo_telhado: 'fibrocimento', altura_telhado_m: null, pavimento: 'terreo',
  km_deslocamento: km, programacao: 'normal', qtd_instaladores: 2, dias_estimados: 1, tem_ponto_energia: true,
  inclui_termografia: false, inclui_teste_string: true, inclui_teste_inversor: true, inclui_relatorio_tecnico: true,
})
const retiradaPadrao = (km: number): EntradasRetiradaRecolocacao => ({
  qtd_modulos: 0, qtd_strings: 1, tipo_telhado_atual: 'fibrocimento', tipo_telhado_apos: 'fibrocimento', altura_telhado_m: null,
  pavimento: 'terreo', distancia_realocacao_m: 10, km_deslocamento: km, programacao: 'normal', qtd_instaladores: 2, dias_estimados: 1,
  reaproveita_cabeamento: true,
})

function Sel<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: Array<{ id: T; label: string; hint?: string }>; onChange: (v: T) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
      {opcoes.map((o) => <option key={o.id} value={o.id} className="bg-noite">{o.label}{o.hint ? ` (${o.hint})` : ''}</option>)}
    </select>
  )
}

export function ComposicaoOM({ api, nomeCliente, onEnviada }: { api: ApiOM; nomeCliente: string; onEnviada?: () => void }) {
  const [d, setD] = useState<Exclude<Awaited<ReturnType<ApiOM['carregar']>>, { erro: string }> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [servico, setServico] = useState<ServicoOM>('limpeza')
  const [limpeza, setLimpeza] = useState<EntradasLimpeza>(limpezaPadrao(0))
  const [revisao, setRevisao] = useState<EntradasRevisao>(revisaoPadrao(0))
  const [retirada, setRetirada] = useState<EntradasRetiradaRecolocacao>(retiradaPadrao(0))
  const [ajuste, setAjuste] = useState(0)
  const [secoes, setSecoes] = useState<SecaoProposta[]>([])
  // Kalebe 2026-10-15: limpeza simplificada — telhado, local, residencial/empresa, placas e extras
  const [local, setLocal] = useState<{ cidade: string; uf: string } | null>(null)
  const [tipoInstalacao, setTipoInstalacao] = useState<'residencial' | 'empresa' | null>(null)
  const [comExtras, setComExtras] = useState(false)

  useEffect(() => {
    api.carregar().then((r) => {
      if ('erro' in r) { setErro(r.erro); return }
      setD(r); setSecoes(r.secoes); setComExtras(r.secoes.length > 0)
      const e = r.entrada
      setServico(e?.servico || 'limpeza')
      setLimpeza(e?.limpeza || limpezaPadrao(r.km)); setRevisao(e?.revisao || revisaoPadrao(r.km)); setRetirada(e?.retirada || retiradaPadrao(r.km))
      setAjuste(Number(e?.ajuste) || 0)
      setLocal(e?.local || (r.cidade ? { cidade: r.cidade, uf: '' } : null))
      setTipoInstalacao(e?.tipo_instalacao || null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entrada = useMemo<EntradaOM>(() => ({
    servico, limpeza, revisao, retirada, ajuste, secoes: comExtras ? secoes : [], local, tipo_instalacao: tipoInstalacao,
  }), [servico, limpeza, revisao, retirada, ajuste, secoes, comExtras, local, tipoInstalacao])
  const r = useMemo(() => (d ? calcularEntradaOM(entrada, d.params) : null), [entrada, d])

  if (!d) return erro ? <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p> : <p className="text-sm text-white/50">Carregando parâmetros…</p>

  const qtd = servico === 'limpeza' ? limpeza.qtd_modulos : servico === 'revisao' ? revisao.qtd_modulos : retirada.qtd_modulos
  const faixaRef = d.faixas_om
    .filter((f) => f.chave_servico === SERVICOS.find((s) => s.chave === servico)!.faixa)
    .sort((a, b) => a.faixa_min - b.faixa_min)
    .find((f) => qtd >= f.faixa_min && (f.faixa_max == null || qtd <= f.faixa_max))
  const comum = (v: any, set: (x: any) => void) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Rotulo texto="Placas"><CampoNumero valor={v.qtd_modulos} onChange={(n) => set({ ...v, qtd_modulos: Math.round(n) })} /></Rotulo>
      <Rotulo texto="Pavimento"><Sel valor={v.pavimento} opcoes={OPCOES_PAVIMENTO} onChange={(x) => set({ ...v, pavimento: x })} /></Rotulo>
      <Rotulo texto="Programação"><Sel valor={v.programacao} opcoes={OPCOES_PROGRAMACAO} onChange={(x) => set({ ...v, programacao: x })} /></Rotulo>
      <Rotulo texto="Deslocamento (km de ida)"><CampoNumero valor={v.km_deslocamento} onChange={(n) => set({ ...v, km_deslocamento: n })} /></Rotulo>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
        {SERVICOS.map((s) => (
          <button key={s.chave} type="button" onClick={() => setServico(s.chave)}
            className={`py-2 rounded-lg text-xs font-bold ${servico === s.chave ? 'bg-weg-azul text-white' : 'text-white/60 hover:text-white'}`}>{s.rotulo}</button>
        ))}
      </div>
      {d.cidade && <p className="text-[11px] text-white/45">📍 {d.cidade}{d.km ? ` · ${fmtNum(d.km, 0)} km da Spin` : ' · cidade sem km cadastrado'}</p>}

      <Bloco n="1" titulo="Escopo do serviço">
        {servico === 'limpeza' && (
          <>
            {/* O essencial, rápido: placas, telhado, local e tipo de instalação */}
            <div className="grid grid-cols-2 gap-2">
              <Rotulo texto="Placas"><CampoNumero valor={limpeza.qtd_modulos} onChange={(n) => setLimpeza({ ...limpeza, qtd_modulos: Math.round(n) })} placeholder="Ex.: 12" /></Rotulo>
              <Rotulo texto="Telhado"><Sel valor={limpeza.tipo_telhado} opcoes={TELHADOS_AZ} onChange={(x) => setLimpeza({ ...limpeza, tipo_telhado: x })} /></Rotulo>
            </div>
            <div>
              <span className="block text-[11px] font-bold text-white/60 mb-1">Local (cidade)</span>
              <SeletorCidade cidadeAtual={local?.cidade || null} ufAtual={local?.uf || null} campoFormulario={inputCls}
                onEscolher={(c) => { setLocal({ cidade: c.cidade, uf: c.uf }); setLimpeza((l) => ({ ...l, km_deslocamento: c.km })) }} />
            </div>
            <div>
              <span className="block text-[11px] font-bold text-white/60 mb-1">Instalação</span>
              <div className="flex flex-wrap gap-2">
                <Opcao ativo={tipoInstalacao === 'residencial'} onClick={() => setTipoInstalacao('residencial')}>🏠 Residencial</Opcao>
                <Opcao ativo={tipoInstalacao === 'empresa'} onClick={() => setTipoInstalacao('empresa')}>🏢 Empresa</Opcao>
              </div>
            </div>
            {local && <p className="text-[11px] text-white/45">📍 {local.cidade}{local.uf ? `/${local.uf}` : ''} · {limpeza.km_deslocamento ? `${fmtNum(limpeza.km_deslocamento, 0)} km da Spin` : 'sem km no cadastro — informe nos ajustes'}</p>}
            {/* O resto já vem no padrão (térreo, dia útil, sujeira média, com água e energia) */}
            <details className="rounded-xl border border-white/10 px-3 py-2">
              <summary className="text-[11px] font-bold text-white/70 cursor-pointer">Ajustes finos (opcional)</summary>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Rotulo texto="Pavimento"><Sel valor={limpeza.pavimento} opcoes={OPCOES_PAVIMENTO} onChange={(x) => setLimpeza({ ...limpeza, pavimento: x })} /></Rotulo>
                  <Rotulo texto="Programação"><Sel valor={limpeza.programacao} opcoes={OPCOES_PROGRAMACAO} onChange={(x) => setLimpeza({ ...limpeza, programacao: x })} /></Rotulo>
                  <Rotulo texto="Deslocamento (km de ida)"><CampoNumero valor={limpeza.km_deslocamento} onChange={(n) => setLimpeza({ ...limpeza, km_deslocamento: n })} /></Rotulo>
                  <Rotulo texto="Sujeira">
                    <Sel valor={limpeza.sujidade || 'medio'} opcoes={[{ id: 'leve', label: 'Leve' }, { id: 'medio', label: 'Média' }, { id: 'pesado', label: 'Pesada' }]}
                      onChange={(x) => setLimpeza({ ...limpeza, sujidade: x })} />
                  </Rotulo>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Opcao ativo={limpeza.tem_ponto_agua} onClick={() => setLimpeza({ ...limpeza, tem_ponto_agua: !limpeza.tem_ponto_agua })}>Tem ponto de água</Opcao>
                  <Opcao ativo={limpeza.tem_ponto_energia} onClick={() => setLimpeza({ ...limpeza, tem_ponto_energia: !limpeza.tem_ponto_energia })}>Tem ponto de energia</Opcao>
                  <Opcao ativo={!!limpeza.cliente_disponibiliza_ajudante} onClick={() => setLimpeza({ ...limpeza, cliente_disponibiliza_ajudante: !limpeza.cliente_disponibiliza_ajudante })}>Cliente cede ajudante</Opcao>
                </div>
              </div>
            </details>
          </>
        )}
        {servico === 'revisao' && (
          <>
            {comum(revisao, setRevisao)}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Rotulo texto="Telhado"><Sel valor={revisao.tipo_telhado} opcoes={OPCOES_TELHADO} onChange={(x) => setRevisao({ ...revisao, tipo_telhado: x })} /></Rotulo>
              <Rotulo texto="Strings"><CampoNumero valor={revisao.qtd_strings} onChange={(n) => setRevisao({ ...revisao, qtd_strings: Math.round(n) })} /></Rotulo>
              <Rotulo texto="Inversores"><CampoNumero valor={revisao.qtd_inversores} onChange={(n) => setRevisao({ ...revisao, qtd_inversores: Math.round(n) })} /></Rotulo>
              <Rotulo texto="Instaladores"><CampoNumero valor={revisao.qtd_instaladores} onChange={(n) => setRevisao({ ...revisao, qtd_instaladores: Math.max(1, Math.round(n)) })} /></Rotulo>
              <Rotulo texto="Dias"><CampoNumero valor={revisao.dias_estimados} onChange={(n) => setRevisao({ ...revisao, dias_estimados: Math.max(1, n) })} casas={1} /></Rotulo>
            </div>
            <div className="flex flex-wrap gap-2">
              <Opcao ativo={revisao.inclui_termografia} onClick={() => setRevisao({ ...revisao, inclui_termografia: !revisao.inclui_termografia })}>Termografia</Opcao>
              <Opcao ativo={revisao.inclui_teste_string} onClick={() => setRevisao({ ...revisao, inclui_teste_string: !revisao.inclui_teste_string })}>Teste de strings</Opcao>
              <Opcao ativo={revisao.inclui_teste_inversor} onClick={() => setRevisao({ ...revisao, inclui_teste_inversor: !revisao.inclui_teste_inversor })}>Teste de inversores</Opcao>
              <Opcao ativo={revisao.inclui_relatorio_tecnico} onClick={() => setRevisao({ ...revisao, inclui_relatorio_tecnico: !revisao.inclui_relatorio_tecnico })}>Relatório técnico</Opcao>
              <Opcao ativo={revisao.tem_ponto_energia} onClick={() => setRevisao({ ...revisao, tem_ponto_energia: !revisao.tem_ponto_energia })}>Tem ponto de energia</Opcao>
            </div>
          </>
        )}
        {servico === 'retirada' && (
          <>
            {comum(retirada, setRetirada)}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Rotulo texto="Telhado hoje"><Sel valor={retirada.tipo_telhado_atual} opcoes={OPCOES_TELHADO} onChange={(x) => setRetirada({ ...retirada, tipo_telhado_atual: x })} /></Rotulo>
              <Rotulo texto="Telhado depois"><Sel valor={retirada.tipo_telhado_apos} opcoes={OPCOES_TELHADO} onChange={(x) => setRetirada({ ...retirada, tipo_telhado_apos: x })} /></Rotulo>
              <Rotulo texto="Strings"><CampoNumero valor={retirada.qtd_strings} onChange={(n) => setRetirada({ ...retirada, qtd_strings: Math.round(n) })} /></Rotulo>
              <Rotulo texto="Realocação (m)"><CampoNumero valor={retirada.distancia_realocacao_m} onChange={(n) => setRetirada({ ...retirada, distancia_realocacao_m: n })} /></Rotulo>
              <Rotulo texto="Instaladores"><CampoNumero valor={retirada.qtd_instaladores} onChange={(n) => setRetirada({ ...retirada, qtd_instaladores: Math.max(1, Math.round(n)) })} /></Rotulo>
              <Rotulo texto="Dias"><CampoNumero valor={retirada.dias_estimados} onChange={(n) => setRetirada({ ...retirada, dias_estimados: Math.max(1, n) })} casas={1} /></Rotulo>
            </div>
            <div className="flex flex-wrap gap-2">
              <Opcao ativo={retirada.reaproveita_cabeamento} onClick={() => setRetirada({ ...retirada, reaproveita_cabeamento: !retirada.reaproveita_cabeamento })}>Reaproveita o cabeamento</Opcao>
            </div>
          </>
        )}
        {r && r.resultado && (
          <details className="rounded-xl border border-white/10 px-3 py-2">
            <summary className="text-[11px] font-bold text-white/70 cursor-pointer">Memória de cálculo</summary>
            <ul className="mt-2 space-y-0.5">{r.memoria.map((m, i) => <li key={i} className="text-[11px] text-white/60 whitespace-pre-wrap">{m}</li>)}</ul>
          </details>
        )}
      </Bloco>

      <Bloco n="2" titulo="Serviços adicionais" valor={comExtras && r?.total_secoes ? reais(r.total_secoes) : null}>
        <div className="flex flex-wrap gap-2">
          <Opcao ativo={!comExtras} onClick={() => setComExtras(false)}>Só o serviço</Opcao>
          <Opcao ativo={comExtras} onClick={() => setComExtras(true)}>Incluir extras na proposta</Opcao>
        </div>
        {comExtras && <SecoesProposta faixas={d.faixas} secoes={secoes} onChange={setSecoes} />}
      </Bloco>

      <section className="rounded-2xl border border-sol/40 p-3 space-y-2">
        <div className="text-[11px] text-white/60 space-y-0.5">
          <p className="flex justify-between"><span>Calculado{r?.resultado?.aplicou_visita_minima ? ' (visita mínima)' : ''}</span><span className="tabular-nums">{reais(r?.subtotal || 0)}</span></p>
          {faixaRef && <p className="flex justify-between"><span>Faixa de referência · {faixaRef.descricao}</span><span className="tabular-nums">{reais(faixaRef.valor)}</span></p>}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <Rotulo texto="Ajuste em R$ (margem, desconto — pode ser negativo)">
            <CampoNumero valor={ajuste} onChange={setAjuste} casas={2} />
          </Rotulo>
          {faixaRef && r && Math.abs(faixaRef.valor - r.subtotal - ajuste) > 1 && (
            <button type="button" onClick={() => setAjuste(Math.round((faixaRef.valor - r.subtotal) * 100) / 100)}
              className="px-3 py-2 rounded-xl border border-white/15 text-white/80 text-xs font-bold">Usar valor da faixa</button>
          )}
        </div>
        {r && r.total_secoes > 0 && (
          <div className="text-[11px] text-white/60 space-y-0.5">
            <p className="flex justify-between"><span>Serviço</span><span className="tabular-nums">{reais(r.valor_servico)}</span></p>
            <p className="flex justify-between"><span>Serviços adicionais</span><span className="tabular-nums">{reais(r.total_secoes)}</span></p>
          </div>
        )}
        <div className="flex items-end justify-between gap-2 pt-1">
          <span className="text-[11px] font-bold text-white/60 uppercase">Total ao cliente</span>
          <span className="text-2xl font-black text-white tabular-nums">{r ? reais(r.total) : '—'}</span>
        </div>
      </section>

      <RodapeProposta
        chave={JSON.stringify(entrada)}
        podeGerar={!!r && !r.erro && r.valor_servico > 0}
        motivo={r?.erro || null}
        gerar={() => api.gerar(entrada)}
        enviar={api.enviar}
        legendaPadrao={`Oi${nomeCliente ? `, ${nomeCliente.split(' ')[0]}` : ''}! Segue a proposta do serviço que conversamos ☀️ Qualquer dúvida, é só me chamar por aqui.`}
        onEnviada={onEnviada}
      />
    </div>
  )
}
