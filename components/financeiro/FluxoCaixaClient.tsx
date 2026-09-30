'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  efetivarLancamentoAction, desfazerEfetivacaoAction, cancelarLancamentoAction, excluirPassivoAction,
  ignorarVendaAction, salvarConfigFluxoAction, salvarFornecedorAction,
  vendaDaProgramacaoAction, renegociarPassivoAction,
} from '@/app/financeiro/fluxo-caixa/actions'
import {
  GRUPOS, FORMAS_PAGAMENTO, MODALIDADES_PASSIVO,
  addDias, addMeses, arred, brl, consolidarMensal, dataBR, fimDoMes, hojeBR, lerValor, mesDe, mesesJanela, rotuloMes,
  saldoProjetadoAte, saldoRealizadoAte, statusDe,
  type ConfigFluxo, type Fornecedor, type Grupo, type Lancamento, type VendaPendente,
} from '@/lib/financeiro/fluxo'
import type { DadosFluxo } from '@/lib/financeiro/dados'
import { ModalLancamento } from './ModalLancamento'
import { ModalPassivo } from './ModalPassivo'
import { ModalProgramarVenda } from './ModalProgramarVenda'
import { Campo, InputValor, Selecao, Modal, Aviso, Botoes, classeInput } from './ui'

/**
 * Fluxo de caixa (Kalebe 2026-09-29): previsto × realizado, integrado às
 * vendas do sistema. Tudo nasce PREVISTO; "Efetivar" grava o valor pago.
 */

type Aba = 'mensal' | 'lancamentos' | 'programar' | 'passivo' | 'fornecedores'
type Msg = { tipo: 'ok' | 'erro'; texto: string } | null

const ABAS: Aba[] = ['mensal', 'lancamentos', 'programar', 'passivo', 'fornecedores']

export function FluxoCaixaClient({ dados, abaInicial }: { dados: DadosFluxo; abaInicial?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const hoje = hojeBR()
  const { config, lancamentos, passivos, fornecedores, categorias, pendentes, faturamentoPorMes, projetosLista, equipe } = dados
  // Links do hub: ?aba=receber / ?aba=pagar abrem Lançamentos já filtrados
  const contas = abaInicial === 'receber' ? 'entrada' : abaInicial === 'pagar' ? 'saida' : ''

  const [aba, setAba] = useState<Aba>(contas ? 'lancamentos' : ABAS.includes(abaInicial as Aba) ? (abaInicial as Aba) : 'mensal')
  const [msg, setMsg] = useState<Msg>(null)
  const [modal, setModal] = useState<
    | { t: 'lancamento'; editando?: Lancamento }
    | { t: 'passivo' }
    | { t: 'programar'; venda: VendaPendente; substituir?: string }
    | { t: 'efetivar'; lanc: Lancamento }
    | { t: 'config' }
    | { t: 'fornecedor'; f?: Fornecedor }
    | { t: 'detalhe'; filtro: FiltroDetalhe }
    | { t: 'excluir'; lanc: Lancamento }
    | { t: 'renegociar'; passivo: DadosFluxo['passivos'][number] }
    | null
  >(null)
  // Ação aberta a partir do detalhe de um valor → ao terminar, volta pro detalhe
  const [voltarDetalhe, setVoltarDetalhe] = useState<FiltroDetalhe | null>(null)

  // Filtros da aba Lançamentos
  const [fMes, setFMes] = useState(mesDe(hoje))
  const [fTodos, setFTodos] = useState(!!contas)
  const [fDirecao, setFDirecao] = useState<'' | 'entrada' | 'saida'>(contas)
  const [fGrupo, setFGrupo] = useState<'' | Grupo>('')
  const [fStatus, setFStatus] = useState<'' | 'pendente' | 'aberto' | 'atrasado' | 'realizado'>(contas ? 'pendente' : '')
  const [fBusca, setFBusca] = useState('')
  const [fPassivo, setFPassivo] = useState<string | null>(null)
  const [fFornec, setFFornec] = useState<string | null>(null)

  // Janela da visão mensal
  const [inicioJanela, setInicioJanela] = useState(mesDe(addMeses(hoje, -2)))

  function pronto(m: string) {
    setModal(voltarDetalhe ? { t: 'detalhe', filtro: voltarDetalhe } : null)
    setMsg({ tipo: 'ok', texto: m })
    router.refresh()
  }
  function fecharModal() {
    setModal(voltarDetalhe ? { t: 'detalhe', filtro: voltarDetalhe } : null)
  }
  function rodar(fn: () => Promise<{ erro: string } | { sucesso: true }>, ok: string) {
    startTransition(async () => {
      const r = await fn()
      if ('erro' in r) setMsg({ tipo: 'erro', texto: r.erro })
      else { setMsg({ tipo: 'ok', texto: ok }); router.refresh() }
    })
  }

  // Ações rápidas de um lançamento (lista e detalhe da visão mensal)
  const acoes: AcoesLancamento = {
    pending,
    onEfetivar: (l) => setModal({ t: 'efetivar', lanc: l }),
    onEditar: (l) => setModal({ t: 'lancamento', editando: l }),
    onDesfazer: (l) => rodar(() => desfazerEfetivacaoAction(l.id), 'Efetivação desfeita — voltou a previsto'),
    onExcluir: (l) => setModal({ t: 'excluir', lanc: l }),
    onAjustarVenda: (l) => {
      if (!l.programacao_id) return
      startTransition(async () => {
        const r = await vendaDaProgramacaoAction(l.programacao_id!)
        if ('erro' in r) setMsg({ tipo: 'erro', texto: r.erro })
        else setModal({ t: 'programar', venda: r.venda, substituir: l.programacao_id! })
      })
    },
  }
  function abrirDetalhe(filtro: FiltroDetalhe) {
    setVoltarDetalhe(filtro)
    setModal({ t: 'detalhe', filtro })
  }
  function fecharDetalhe() {
    setVoltarDetalhe(null)
    setModal(null)
  }

  // ─── Indicadores ──────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const abertos = lancamentos.filter((l) => !l.data_realizada)
    const soma = (ls: Lancamento[]) => arred(ls.reduce((s, l) => s + l.valor_previsto, 0))
    const receber = abertos.filter((l) => l.direcao === 'entrada')
    const pagar = abertos.filter((l) => l.direcao === 'saida')
    const proj = [30, 60, 90].map((d) => saldoProjetadoAte(lancamentos, config, addDias(hoje, d), hoje))
    // Menor saldo projetado dia a dia nos próximos 90 dias (capital de giro)
    let menor = saldoRealizadoAte(lancamentos, config, hoje)
    let menorData = hoje
    const datas = Array.from(new Set(abertos.map((l) => (l.data_prevista < hoje ? hoje : l.data_prevista)))).filter((d) => d <= addDias(hoje, 90)).sort()
    for (const d of datas) {
      const s = saldoProjetadoAte(lancamentos, config, d, hoje)
      if (s < menor) { menor = s; menorData = d }
    }
    return {
      saldoHoje: saldoRealizadoAte(lancamentos, config, hoje),
      receber: soma(receber), receberAtraso: soma(receber.filter((l) => l.data_prevista < hoje)),
      pagar: soma(pagar), pagarAtraso: soma(pagar.filter((l) => l.data_prevista < hoje)),
      passivo: soma(pagar.filter((l) => l.grupo === 'passivo_bancario')),
      impostos: soma(pagar.filter((l) => l.grupo === 'impostos')),
      fornecedores: soma(pagar.filter((l) => l.grupo === 'fornecedores')),
      proj, menor, menorData,
    }
  }, [lancamentos, config, hoje])

  return (
    <div className="space-y-5">
      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setModal({ t: 'lancamento' })} className="px-4 py-2.5 bg-sol text-noite font-bold rounded-lg text-sm hover:bg-sol/90">➕ Novo lançamento</button>
        <button onClick={() => setModal({ t: 'passivo' })} className="px-3 py-2.5 bg-white/5 border border-white/15 text-white rounded-lg text-sm hover:bg-white/10">🏦 Passivo bancário</button>
        <button onClick={() => setModal({ t: 'config' })} className="px-3 py-2.5 bg-white/5 border border-white/15 text-white/80 rounded-lg text-sm hover:bg-white/10">⚙️ Saldo inicial e capital de giro</button>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg border text-sm ${msg.tipo === 'erro' ? 'bg-coral/10 border-coral/30 text-coral' : 'bg-verde/10 border-verde/30 text-verde'}`}>
          {msg.texto}<button onClick={() => setMsg(null)} className="float-right text-xs opacity-70">✕</button>
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Saldo em caixa hoje" valor={brl(kpi.saldoHoje)} cor={kpi.saldoHoje >= 0 ? 'text-white' : 'text-coral'}
          sub={`Saldo inicial ${brl(config.saldo_inicial)} em ${dataBR(config.data_inicio)}`} />
        <Kpi rotulo="A receber (previsto)" valor={brl(kpi.receber)} cor="text-verde"
          sub={kpi.receberAtraso > 0 ? `⚠ ${brl(kpi.receberAtraso)} atrasado` : 'nada atrasado'} alerta={kpi.receberAtraso > 0} />
        <Kpi rotulo="A pagar (previsto)" valor={brl(kpi.pagar)} cor="text-coral"
          sub={kpi.pagarAtraso > 0 ? `⚠ ${brl(kpi.pagarAtraso)} atrasado` : 'nada atrasado'} alerta={kpi.pagarAtraso > 0} />
        <Kpi rotulo="Saldo projetado" valor={brl(kpi.proj[0])} cor={kpi.proj[0] >= 0 ? 'text-sol' : 'text-coral'}
          sub={`30d · 60d ${brl(kpi.proj[1])} · 90d ${brl(kpi.proj[2])}`} />
        <Kpi rotulo="🏦 Passivo bancário (saldo devedor)" valor={brl(kpi.passivo)} sub={`${passivos.length} contrato(s)`} />
        <Kpi rotulo="🧾 Impostos a pagar" valor={brl(kpi.impostos)} />
        <Kpi rotulo="🏭 Fornecedores a pagar" valor={brl(kpi.fornecedores)} />
        <Kpi rotulo="💼 Capital de giro" valor={brl(kpi.menor)}
          cor={kpi.menor < config.reserva_minima ? 'text-coral' : 'text-verde'}
          sub={`Menor saldo em 90 dias (${dataBR(kpi.menorData)}) · reserva mínima ${brl(config.reserva_minima)}`}
          alerta={kpi.menor < config.reserva_minima} />
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/10">
        {([
          ['mensal', '📊 Visão mensal'],
          ['lancamentos', '📋 Lançamentos'],
          ['programar', `📥 Vendas a programar${pendentes.length ? ` (${pendentes.length})` : ''}`],
          ['passivo', '🏦 Passivo bancário'],
          ['fornecedores', '🏭 Fornecedores'],
        ] as Array<[Aba, string]>).map(([k, r]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${aba === k ? 'border-sol text-white font-bold' : 'border-transparent text-white/55 hover:text-white'}`}>
            {r}
          </button>
        ))}
      </div>

      {aba === 'mensal' && (
        <VisaoMensal lancamentos={lancamentos} config={config} faturamento={faturamentoPorMes}
          inicio={inicioJanela} setInicio={setInicioJanela} hoje={hoje} onDetalhe={abrirDetalhe} />
      )}

      {aba === 'lancamentos' && (
        <ListaLancamentos
          lancamentos={lancamentos} hoje={hoje}
          filtros={{ fMes, setFMes, fTodos, setFTodos, fDirecao, setFDirecao, fGrupo, setFGrupo, fStatus, setFStatus, fBusca, setFBusca, fPassivo, setFPassivo, fFornec, setFFornec }}
          passivos={passivos} fornecedores={fornecedores}
          acoes={acoes}
        />
      )}

      {aba === 'programar' && (
        <div className="space-y-2">
          <p className="text-xs text-white/55">
            Vendas fechadas a partir de {dataBR(config.data_inicio)} (início do fluxo) já entram <strong>sozinhas</strong>, com a condição
            informada no fechamento e os custos do orçamento — pra mudar a condição, use “⚙ ajustar venda” no lançamento.
            Aqui ficam as vendas <strong>anteriores</strong> ao início (últimos 12 meses): programe só as que ainda têm dinheiro a receber.
          </p>
          {pendentes.length === 0 && <p className="text-sm text-white/40 py-8 text-center">Nenhuma venda aguardando programação. 🎉</p>}
          {pendentes.map((v) => (
            <div key={`${v.origem}:${v.origem_id}`} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{v.cliente}</p>
                <p className="text-xs text-white/55">
                  {v.origem === 'projeto' ? 'Projeto' : 'Venda manual'} · fechado em {dataBR(v.data_venda)}
                  {v.vendedor_nome && ` · ${v.vendedor_nome}`}
                </p>
                {v.condicao_vendedor && <p className="text-[11px] text-sol/90 mt-0.5 truncate">Condição: {v.condicao_vendedor}{v.observacoes_vendedor ? ` — ${v.observacoes_vendedor}` : ''}</p>}
              </div>
              <p className="text-lg font-black text-verde shrink-0">{brl(v.valor_venda)}</p>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setModal({ t: 'programar', venda: v })} className="px-3 py-2 bg-sol text-noite text-xs font-bold rounded-lg">📥 Programar</button>
                <button disabled={pending} onClick={() => {
                  if (confirm(`Tirar "${v.cliente}" da lista? Use quando a venda já foi liquidada antes do fluxo existir.`)) {
                    rodar(() => ignorarVendaAction(v.origem, v.origem_id, v.valor_venda), 'Venda retirada da lista')
                  }
                }} className="px-3 py-2 bg-white/5 border border-white/15 text-white/60 text-xs rounded-lg">Já liquidada</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === 'passivo' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/70">Saldo devedor total: <strong className="text-coral">{brl(kpi.passivo)}</strong></p>
            <button onClick={() => setModal({ t: 'passivo' })} className="px-3 py-2 bg-sol text-noite text-xs font-bold rounded-lg">+ Novo contrato</button>
          </div>
          {passivos.length === 0 && <p className="text-sm text-white/40 py-8 text-center">Nenhum contrato cadastrado.</p>}
          {passivos.map((p) => {
            const parcelas = lancamentos.filter((l) => l.passivo_id === p.id && l.direcao === 'saida')
            const pagas = parcelas.filter((l) => l.data_realizada)
            const abertas = parcelas.filter((l) => !l.data_realizada).sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
            const devedor = arred(abertas.reduce((s, l) => s + l.valor_previsto, 0))
            const pago = arred(pagas.reduce((s, l) => s + (l.valor_realizado || 0), 0))
            const prox = abertas[0]
            return (
              <div key={p.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-white">🏦 {p.banco}{p.numero_contrato && <span className="text-white/50 font-normal"> · {p.numero_contrato}</span>}</p>
                    <p className="text-xs text-white/55">
                      {MODALIDADES_PASSIVO.find((m) => m.chave === p.modalidade)?.rotulo || p.modalidade} · contratado {brl(p.valor_contratado)} em {dataBR(p.data_contratacao)}
                      {p.taxa_juros_mes ? ` · ${String(p.taxa_juros_mes).replace('.', ',')}% a.m.` : ''}
                    </p>
                    {/* Dívida: face × negociado (Kalebe 2026-09-30) */}
                    {(p.valor_face || p.valor_negociado) && (
                      <p className="text-xs text-white/60 mt-0.5">
                        {p.valor_face ? <>face {brl(p.valor_face)}</> : null}
                        {p.valor_negociado ? <> · negociado {brl(p.valor_negociado)}</> : null}
                        {p.valor_face && p.valor_negociado && p.valor_face - p.valor_negociado > 0.009 && (
                          <strong className="text-verde"> · desconto {brl(p.valor_face - p.valor_negociado)} ({(((p.valor_face - p.valor_negociado) / p.valor_face) * 100).toFixed(1).replace('.', ',')}%)</strong>
                        )}
                      </p>
                    )}
                    {!!p.renegociacoes?.length && (
                      <p className="text-[11px] text-white/45">🔁 renegociado {p.renegociacoes.length}× · última em {dataBR(p.renegociacoes[p.renegociacoes.length - 1].data)}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-coral">{brl(devedor)}</p>
                    <p className="text-[10px] text-white/45">saldo devedor</p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-verde" style={{ width: `${(pagas.length / Math.max(parcelas.length, 1)) * 100}%` }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                  <span>{pagas.length}/{parcelas.length} parcelas efetivadas · pago {brl(pago)}
                    {prox && <> · próxima {dataBR(prox.data_prevista)} ({brl(prox.valor_previsto)})</>}</span>
                  <span className="flex gap-3">
                    <button className="text-sol hover:underline" onClick={() => { setFPassivo(p.id); setFFornec(null); setFTodos(true); setAba('lancamentos') }}>ver parcelas</button>
                    {abertas.length > 0 && (
                      <button className="text-verde hover:underline" onClick={() => setModal({ t: 'renegociar', passivo: p })}>🔁 renegociar</button>
                    )}
                    <button className="text-coral/80 hover:underline" disabled={pending} onClick={() => {
                      if (confirm(`Excluir o contrato ${p.banco} e todas as parcelas previstas?`)) rodar(() => excluirPassivoAction(p.id), 'Contrato excluído')
                    }}>excluir</button>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {aba === 'fornecedores' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/70">A pagar a fornecedores: <strong className="text-coral">{brl(kpi.fornecedores)}</strong></p>
            <button onClick={() => setModal({ t: 'fornecedor' })} className="px-3 py-2 bg-sol text-noite text-xs font-bold rounded-lg">+ Novo fornecedor</button>
          </div>
          {fornecedores.length === 0 && <p className="text-sm text-white/40 py-8 text-center">Nenhum fornecedor cadastrado.</p>}
          {[...fornecedores].sort((a, b) => a.razao_social.localeCompare(b.razao_social, 'pt-BR')).map((f) => {
            const ls = lancamentos.filter((l) => l.fornecedor_id === f.id)
            const aberto = arred(ls.filter((l) => !l.data_realizada).reduce((s, l) => s + l.valor_previsto, 0))
            const pago = arred(ls.filter((l) => l.data_realizada).reduce((s, l) => s + (l.valor_realizado || 0), 0))
            const prox = ls.filter((l) => !l.data_realizada).sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))[0]
            return (
              <div key={f.id} className={`bg-white/[0.03] border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${f.ativo ? '' : 'opacity-50'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">🏭 {f.razao_social}{f.nome_fantasia && <span className="text-white/50 font-normal"> ({f.nome_fantasia})</span>}</p>
                  <p className="text-xs text-white/50">{[f.categoria, f.cnpj && `CNPJ ${f.cnpj}`].filter(Boolean).join(' · ') || 'Sem detalhes'}
                    {prox && ` · próximo ${dataBR(prox.data_prevista)} (${brl(prox.valor_previsto)})`}</p>
                </div>
                <div className="text-xs text-right shrink-0">
                  <p className="text-coral font-bold">{brl(aberto)} a pagar</p>
                  <p className="text-white/45">{brl(pago)} pago</p>
                </div>
                <div className="flex gap-3 text-xs shrink-0">
                  <button className="text-sol hover:underline" onClick={() => { setFFornec(f.id); setFPassivo(null); setFTodos(true); setAba('lancamentos') }}>lançamentos</button>
                  <button className="text-white/60 hover:underline" onClick={() => setModal({ t: 'fornecedor', f })}>editar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modais */}
      {modal?.t === 'lancamento' && (
        <ModalLancamento fornecedores={fornecedores} categorias={categorias} projetos={projetosLista} equipe={equipe}
          editando={modal.editando}
          qtdSerie={modal.editando?.lote_id ? lancamentos.filter((x) => x.lote_id === modal.editando!.lote_id && x.id !== modal.editando!.id
            && !x.data_realizada && x.data_prevista > modal.editando!.data_prevista).length : 0}
          onFechar={fecharModal} onSalvo={pronto}
          onAbrirPassivo={() => setModal({ t: 'passivo' })} />
      )}
      {modal?.t === 'passivo' && <ModalPassivo onFechar={fecharModal} onSalvo={pronto} />}
      {modal?.t === 'programar' && (
        <ModalProgramarVenda venda={modal.venda} regimeImposto={config.regime_imposto} substituirProgramacaoId={modal.substituir}
          onFechar={fecharModal} onSalvo={pronto} />
      )}
      {modal?.t === 'efetivar' && <ModalEfetivar lanc={modal.lanc} onFechar={fecharModal} onSalvo={pronto} />}
      {modal?.t === 'config' && <ModalConfig config={config} onFechar={fecharModal} onSalvo={pronto} />}
      {modal?.t === 'fornecedor' && <ModalFornecedor f={modal.f} onFechar={fecharModal} onSalvo={pronto} />}
      {modal?.t === 'detalhe' && (
        <ModalDetalhe filtro={modal.filtro} lancamentos={lancamentos} hoje={hoje} acoes={acoes} onFechar={fecharDetalhe}
          onNovo={() => setModal({ t: 'lancamento' })} />
      )}
      {modal?.t === 'excluir' && (
        <ModalExcluir lanc={modal.lanc}
          qtdSeguintes={modal.lanc.lote_id ? lancamentos.filter((x) => x.lote_id === modal.lanc.lote_id && x.id !== modal.lanc.id
            && !x.data_realizada && x.data_prevista >= modal.lanc.data_prevista).length : 0}
          onFechar={fecharModal}
          onConfirmar={(serie) => {
            startTransition(async () => {
              const r = await cancelarLancamentoAction(modal.lanc.id, serie)
              if ('erro' in r) setMsg({ tipo: 'erro', texto: r.erro })
              else pronto(`${r.cancelados} lançamento(s) excluído(s)`)
            })
          }} />
      )}
      {modal?.t === 'renegociar' && (
        <ModalRenegociar passivo={modal.passivo}
          saldoAberto={arred(lancamentos.filter((l) => l.passivo_id === modal.passivo.id && l.direcao === 'saida' && !l.data_realizada)
            .reduce((s, l) => s + l.valor_previsto, 0))}
          onFechar={fecharModal} onSalvo={pronto} />
      )}
    </div>
  )
}

// ─── Indicador ──────────────────────────────────────────────────────────────

function Kpi({ rotulo, valor, sub, cor = 'text-white', alerta }: { rotulo: string; valor: string; sub?: string; cor?: string; alerta?: boolean }) {
  return (
    <div className={`bg-white/[0.03] border rounded-xl p-3 ${alerta ? 'border-coral/40' : 'border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/50">{rotulo}</p>
      <p className={`text-lg sm:text-xl font-black mt-0.5 ${cor}`}>{valor}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${alerta ? 'text-coral' : 'text-white/45'}`}>{sub}</p>}
    </div>
  )
}

// ─── Visão mensal: previsto × realizado ─────────────────────────────────────

type FiltroDetalhe = { direcao: 'entrada' | 'saida' | null; grupo: Grupo | null; mes: string; tipo: 'P' | 'R'; rotulo: string }

function VisaoMensal({ lancamentos, config, faturamento, inicio, setInicio, hoje, onDetalhe }: {
  lancamentos: Lancamento[]; config: ConfigFluxo; faturamento: Record<string, number>
  inicio: string; setInicio: (m: string) => void; hoje: string
  onDetalhe: (f: FiltroDetalhe) => void
}) {
  const meses = mesesJanela(inicio, 6)
  const mesAtual = mesDe(hoje)
  const { entradas, saidas } = useMemo(() => consolidarMensal(lancamentos, meses), [lancamentos, meses.join()])

  const tot = (linhas: typeof entradas, m: string, k: 'previsto' | 'realizado') => arred(linhas.reduce((s, l) => s + l.meses[m][k], 0))
  // Saldo final: passado = plano (P) × real (R); mês atual e futuro = projeção (realizado + em aberto)
  const saldoPlano = (fim: string) => arred(lancamentos.reduce((s, l) =>
    l.data_prevista >= config.data_inicio && l.data_prevista <= fim ? s + (l.direcao === 'entrada' ? 1 : -1) * l.valor_previsto : s, config.saldo_inicial))
  const saldos = meses.map((m) => {
    const fim = fimDoMes(m)
    return {
      p: m < mesAtual ? saldoPlano(fim) : saldoProjetadoAte(lancamentos, config, fim, hoje),
      r: m > mesAtual ? null : saldoRealizadoAte(lancamentos, config, m === mesAtual ? hoje : fim),
    }
  })

  // Kalebe 2026-09-30: clicar no valor abre os lançamentos que o compõem (editar/excluir/efetivar)
  const cel = (v: number, forte: boolean, abrir?: () => void) => {
    const txt = <span className={`font-mono ${v === 0 ? 'text-white/20' : forte ? 'text-white font-bold' : 'text-white/80'}`}>{v === 0 ? '—' : brl(v).replace('R$', '').trim()}</span>
    if (v === 0 || !abrir) return txt
    return (
      <button type="button" onClick={abrir} title="Ver os lançamentos deste valor"
        className="rounded px-1 -mx-1 hover:bg-sol/15 hover:outline hover:outline-1 hover:outline-sol/40 cursor-pointer">
        {txt}
      </button>
    )
  }
  const Linha = ({ rotulo, valores, forte, cor, filtro }: {
    rotulo: string; valores: Array<{ p: number | null; r: number | null }>; forte?: boolean; cor?: string
    filtro?: { direcao: 'entrada' | 'saida' | null; grupo: Grupo | null }
  }) => (
    <tr className={forte ? 'bg-white/[0.04]' : ''}>
      <td className={`sticky left-0 bg-noite px-2 py-1.5 text-xs whitespace-nowrap ${forte ? 'font-bold' : ''} ${cor || 'text-white/75'}`}>{rotulo}</td>
      {valores.map((v, i) => {
        const abrir = (tipo: 'P' | 'R') => filtro
          ? () => onDetalhe({ ...filtro, mes: meses[i], tipo, rotulo: `${rotulo.replace(/^\S+\s/, '')} · ${rotuloMes(meses[i])} · ${tipo === 'P' ? 'previsto' : 'realizado'}` })
          : undefined
        return (
          <td key={i} colSpan={1} className="px-2 py-1.5 text-right text-xs" style={{ minWidth: 0 }}>
            <div className="grid grid-cols-2 gap-2">
              <span>{v.p === null ? '' : cel(v.p, !!forte, abrir('P'))}</span>
              <span className={meses[i] > mesAtual ? 'opacity-30' : ''}>{v.r === null ? <span className="text-white/20">·</span> : cel(v.r, !!forte, abrir('R'))}</span>
            </div>
          </td>
        )
      })}
    </tr>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setInicio(mesDe(addMeses(inicio + '-01', -1)))} className="px-2 py-1 bg-white/5 rounded text-white/70 hover:bg-white/10">◀</button>
          <span className="text-sm text-white font-bold">{rotuloMes(meses[0])} – {rotuloMes(meses[meses.length - 1])}</span>
          <button onClick={() => setInicio(mesDe(addMeses(inicio + '-01', 1)))} className="px-2 py-1 bg-white/5 rounded text-white/70 hover:bg-white/10">▶</button>
        </div>
        <p className="text-[10px] text-white/45">P = previsto · R = realizado (valor efetivamente pago/recebido)</p>
      </div>

      <GraficoFluxo meses={meses} mesAtual={mesAtual}
        entradas={meses.map((m) => (m < mesAtual ? tot(entradas, m, 'realizado') : tot(entradas, m, 'previsto')))}
        saidas={meses.map((m) => (m < mesAtual ? tot(saidas, m, 'realizado') : tot(saidas, m, 'previsto')))}
        saldos={saldos.map((s, i) => (meses[i] < mesAtual ? s.r ?? s.p ?? 0 : s.p ?? 0))}
        reserva={config.reserva_minima} />

      <div className="overflow-x-auto border border-white/10 rounded-xl">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              <th className="sticky left-0 bg-noite px-2 py-2 text-left text-[10px] uppercase text-white/50">R$</th>
              {meses.map((m) => (
                <th key={m} className={`px-2 py-2 text-xs ${m === mesAtual ? 'text-sol' : 'text-white/70'}`}>
                  {rotuloMes(m)}
                  <div className="grid grid-cols-2 gap-2 text-[9px] text-white/40 font-normal mt-0.5"><span className="text-right">P</span><span className="text-right">R</span></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={meses.length + 1} className="px-2 pt-3 pb-1 text-[10px] uppercase font-bold text-verde tracking-wider sticky left-0">↑ Entradas</td></tr>
            {entradas.map((l) => <Linha key={l.chave} rotulo={`${l.emoji} ${l.rotulo}`} filtro={{ direcao: 'entrada', grupo: l.chave.split(':')[1] as Grupo }} valores={meses.map((m) => ({ p: l.meses[m].previsto, r: l.meses[m].realizado }))} />)}
            <Linha forte cor="text-verde" rotulo="Total de entradas" filtro={{ direcao: 'entrada', grupo: null }} valores={meses.map((m) => ({ p: tot(entradas, m, 'previsto'), r: tot(entradas, m, 'realizado') }))} />

            <tr><td colSpan={meses.length + 1} className="px-2 pt-3 pb-1 text-[10px] uppercase font-bold text-coral tracking-wider sticky left-0">↓ Saídas</td></tr>
            {saidas.map((l) => <Linha key={l.chave} rotulo={`${l.emoji} ${l.rotulo}`} filtro={{ direcao: 'saida', grupo: l.chave.split(':')[1] as Grupo }} valores={meses.map((m) => ({ p: l.meses[m].previsto, r: l.meses[m].realizado }))} />)}
            <Linha forte cor="text-coral" rotulo="Total de saídas" filtro={{ direcao: 'saida', grupo: null }} valores={meses.map((m) => ({ p: tot(saidas, m, 'previsto'), r: tot(saidas, m, 'realizado') }))} />

            <tr><td colSpan={meses.length + 1} className="h-2" /></tr>
            <Linha forte rotulo="Resultado do mês" valores={meses.map((m) => ({
              p: arred(tot(entradas, m, 'previsto') - tot(saidas, m, 'previsto')),
              r: arred(tot(entradas, m, 'realizado') - tot(saidas, m, 'realizado')),
            }))} />
            <tr className="bg-sol/[0.06]">
              <td className="sticky left-0 bg-noite px-2 py-2 text-xs font-bold text-sol whitespace-nowrap">Saldo final de caixa</td>
              {saldos.map((s, i) => {
                const baixo = s.p !== null && s.p < config.reserva_minima
                return (
                  <td key={i} className="px-2 py-2 text-right text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <span className={`font-mono font-bold ${baixo ? 'text-coral' : 'text-white'}`} title={baixo ? 'Abaixo da reserva mínima de capital de giro' : ''}>{brl(s.p ?? 0).replace('R$', '').trim()}{baixo && ' ⚠'}</span>
                      <span className="font-mono font-bold text-white">{s.r === null ? <span className="text-white/20">·</span> : brl(s.r).replace('R$', '').trim()}</span>
                    </div>
                  </td>
                )
              })}
            </tr>
            <tr className="border-t border-white/10">
              <td className="sticky left-0 bg-noite px-2 py-2 text-[11px] text-white/55 whitespace-nowrap">📈 Vendas fechadas no sistema</td>
              {meses.map((m) => (
                <td key={m} className="px-2 py-2 text-right text-[11px] font-mono text-white/55">{faturamento[m] ? brl(faturamento[m]).replace('R$', '').trim() : '—'}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-white/40">
        Saldo final: meses passados comparam o plano (P) com o real (R); do mês atual em diante, P é a projeção (saldo real de hoje + tudo em aberto, inclusive atrasado).
        “Vendas fechadas” é o faturamento por competência (data do fechamento) — referência pra comparar com o que entra no caixa.
      </p>
    </div>
  )
}

function GraficoFluxo({ meses, mesAtual, entradas, saidas, saldos, reserva }: {
  meses: string[]; mesAtual: string; entradas: number[]; saidas: number[]; saldos: number[]; reserva: number
}) {
  const W = 720, H = 190, pad = 28, larg = (W - pad * 2) / meses.length
  const max = Math.max(1, ...entradas, ...saidas, ...saldos.map(Math.abs), reserva)
  const min = Math.min(0, ...saldos)
  const y = (v: number) => pad / 2 + (H - pad * 1.5) * (1 - (v - min) / (max - min))
  const pontos = saldos.map((s, i) => `${pad + larg * i + larg / 2},${y(s)}`).join(' ')
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Entradas, saídas e saldo por mês">
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.15)" />
        {reserva > 0 && <line x1={pad} x2={W - pad} y1={y(reserva)} y2={y(reserva)} stroke="#ef4444" strokeDasharray="4 4" opacity={0.6} />}
        {meses.map((m, i) => {
          const x = pad + larg * i
          const bw = larg * 0.28
          const futuro = m >= mesAtual
          return (
            <g key={m}>
              <rect x={x + larg * 0.18} y={y(entradas[i])} width={bw} height={Math.max(0, y(0) - y(entradas[i]))} fill="#22c55e" opacity={futuro ? 0.45 : 0.9} rx={2} />
              <rect x={x + larg * 0.18 + bw + 3} y={y(saidas[i])} width={bw} height={Math.max(0, y(0) - y(saidas[i]))} fill="#ef4444" opacity={futuro ? 0.45 : 0.9} rx={2} />
              <text x={x + larg / 2} y={H - 4} textAnchor="middle" fontSize="11" fill={m === mesAtual ? '#F5B400' : 'rgba(255,255,255,0.55)'}>{rotuloMes(m)}</text>
            </g>
          )
        })}
        <polyline points={pontos} fill="none" stroke="#F5B400" strokeWidth={2.5} />
        {saldos.map((s, i) => <circle key={i} cx={pad + larg * i + larg / 2} cy={y(s)} r={3.5} fill={s < reserva ? '#ef4444' : '#F5B400'} />)}
      </svg>
      <div className="flex flex-wrap gap-3 px-2 pb-1 text-[10px] text-white/55">
        <span><span className="inline-block w-2.5 h-2.5 bg-verde rounded-sm mr-1" />Entradas</span>
        <span><span className="inline-block w-2.5 h-2.5 bg-coral rounded-sm mr-1" />Saídas</span>
        <span><span className="inline-block w-3 h-0.5 bg-sol mr-1 align-middle" />Saldo</span>
        {reserva > 0 && <span className="text-coral/80">- - reserva mínima</span>}
        <span>Barras claras = previsto (mês atual e futuros); fortes = realizado</span>
      </div>
    </div>
  )
}

// ─── Lançamentos ────────────────────────────────────────────────────────────

type AcoesLancamento = {
  pending: boolean
  onEfetivar: (l: Lancamento) => void
  onEditar: (l: Lancamento) => void
  onDesfazer: (l: Lancamento) => void
  onExcluir: (l: Lancamento) => void
  onAjustarVenda: (l: Lancamento) => void
}

/** Uma linha de lançamento com ações rápidas (lista, detalhe da visão mensal). */
function LinhaLancamento({ l, hoje, acoes }: { l: Lancamento; hoje: string; acoes: AcoesLancamento }) {
  const st = statusDe(l, hoje)
  const dif = l.valor_realizado !== null ? arred(l.valor_realizado - l.valor_previsto) : 0
  const serie = l.parcelas_total && l.parcela_num ? `${l.parcela_num}/${l.parcelas_total}` : l.lote_id && l.origem === 'manual' ? 'recorrente' : null
  return (
    <div className={`bg-white/[0.03] border rounded-lg p-2.5 flex flex-col md:flex-row md:items-center gap-2 ${st === 'atrasado' ? 'border-coral/40' : 'border-white/10'}`}>
      <div className="flex items-center gap-2 md:w-28 shrink-0">
        <span className={l.direcao === 'entrada' ? 'text-verde' : 'text-coral'}>{l.direcao === 'entrada' ? '↑' : '↓'}</span>
        <span className={`text-xs font-mono ${st === 'atrasado' ? 'text-coral' : 'text-white/70'}`}>{dataBR(l.data_prevista)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <button type="button" onClick={() => acoes.onEditar(l)} className="text-sm text-white truncate text-left max-w-full hover:text-sol" title="Editar">
          {l.descricao}
        </button>
        <p className="text-[10px] text-white/45 flex flex-wrap gap-x-2">
          <span>{GRUPOS[l.grupo]?.emoji} {GRUPOS[l.grupo]?.rotulo}</span>
          {serie && <span>🔁 {serie}</span>}
          {l.origem === 'projeto' && <span className="text-sol/80">📥 venda do sistema{l.detalhes?.automatico ? ' (automático)' : ''}</span>}
          {l.detalhes?.revisar_condicao && <span className="text-sol font-bold">⚠ conferir condição de pagamento</span>}
          {l.origem === 'passivo' && <span>🏦 contrato</span>}
          {l.forma_pagamento && <span>{l.forma_pagamento}</span>}
          {l.detalhes?.tipo_imposto && <span>{l.detalhes.tipo_imposto}</span>}
          {l.detalhes?.nf && <span>NF {l.detalhes.nf}</span>}
        </p>
      </div>
      <div className="text-right md:w-32 shrink-0">
        <p className="text-[10px] text-white/40">previsto</p>
        <p className="text-sm font-mono text-white/80">{brl(l.valor_previsto)}</p>
      </div>
      <div className="text-right md:w-40 shrink-0">
        {l.data_realizada ? (
          <>
            <p className="text-[10px] text-verde">✓ efetivado {dataBR(l.data_realizada)}</p>
            <p className="text-sm font-mono font-bold text-white">{brl(l.valor_realizado)}
              {Math.abs(dif) > 0.009 && <span className={`text-[10px] ml-1 ${(dif > 0) === (l.direcao === 'saida') ? 'text-coral' : 'text-verde'}`}>{dif > 0 ? '+' : ''}{brl(dif).replace('R$', '').trim()}</span>}
            </p>
          </>
        ) : (
          <p className={`text-[11px] ${st === 'atrasado' ? 'text-coral font-bold' : 'text-white/40'}`}>{st === 'atrasado' ? '⚠ atrasado' : 'em aberto'}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs shrink-0 md:w-56 justify-end items-center">
        {l.data_realizada
          ? <button disabled={acoes.pending} onClick={() => acoes.onDesfazer(l)} className="text-white/50 hover:text-white">↺ desfazer</button>
          : <button disabled={acoes.pending} onClick={() => acoes.onEfetivar(l)} className="px-2 py-1 bg-verde/15 border border-verde/40 text-verde font-bold rounded">✓ Efetivar</button>}
        {l.origem !== 'passivo' && <button onClick={() => acoes.onEditar(l)} className="text-white/60 hover:text-white">✎ editar</button>}
        {l.programacao_id && <button onClick={() => acoes.onAjustarVenda(l)} className="text-sol/80 hover:text-sol">⚙ ajustar venda</button>}
        {!l.data_realizada && <button disabled={acoes.pending} onClick={() => acoes.onExcluir(l)} className="text-coral/70 hover:text-coral">🗑 excluir</button>}
      </div>
    </div>
  )
}

function ListaLancamentos({ lancamentos, hoje, filtros: f, passivos, fornecedores, acoes }: {
  lancamentos: Lancamento[]; hoje: string
  filtros: any
  passivos: DadosFluxo['passivos']; fornecedores: Fornecedor[]
  acoes: AcoesLancamento
}) {
  const lista = useMemo(() => {
    const q = f.fBusca.trim().toLowerCase()
    return lancamentos.filter((l) => {
      if (f.fPassivo && l.passivo_id !== f.fPassivo) return false
      if (f.fFornec && l.fornecedor_id !== f.fFornec) return false
      if (!f.fTodos) {
        const m = mesDe(l.data_realizada || l.data_prevista)
        if (m !== f.fMes && mesDe(l.data_prevista) !== f.fMes) return false
      }
      if (f.fDirecao && l.direcao !== f.fDirecao) return false
      if (f.fGrupo && l.grupo !== f.fGrupo) return false
      if (f.fStatus === 'pendente') { if (l.data_realizada) return false }
      else if (f.fStatus && statusDe(l, hoje) !== f.fStatus) return false
      if (q && !`${l.descricao} ${l.observacoes || ''}`.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
  }, [lancamentos, f, hoje])

  const somaP = (d: 'entrada' | 'saida') => arred(lista.filter((l) => l.direcao === d).reduce((s, l) => s + l.valor_previsto, 0))
  const somaR = (d: 'entrada' | 'saida') => arred(lista.filter((l) => l.direcao === d && l.data_realizada).reduce((s, l) => s + (l.valor_realizado || 0), 0))
  const nomePassivo = passivos.find((p) => p.id === f.fPassivo)?.banco
  const nomeFornec = fornecedores.find((x) => x.id === f.fFornec)?.razao_social
  const gruposOrdenados = (Object.keys(GRUPOS) as Grupo[]).sort((a, b) => GRUPOS[a].rotulo.localeCompare(GRUPOS[b].rotulo, 'pt-BR'))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <div className="col-span-2 md:col-span-2 flex gap-2 items-center">
          <input type="month" value={f.fMes} disabled={f.fTodos} onChange={(e) => f.setFMes(e.target.value)} className={`${classeInput} disabled:opacity-40`} />
          <label className="flex items-center gap-1 text-xs text-white/60 whitespace-nowrap"><input type="checkbox" checked={f.fTodos} onChange={(e) => f.setFTodos(e.target.checked)} /> todos</label>
        </div>
        <Selecao valor={f.fDirecao} onChange={f.setFDirecao} opcoes={[{ valor: '', rotulo: 'Entradas e saídas' }, { valor: 'entrada', rotulo: '↑ Entradas' }, { valor: 'saida', rotulo: '↓ Saídas' }]} />
        <Selecao valor={f.fGrupo} onChange={f.setFGrupo} vazio="Todos os tipos" opcoes={gruposOrdenados.map((g) => ({ valor: g, rotulo: `${GRUPOS[g].emoji} ${GRUPOS[g].rotulo}` }))} />
        <Selecao valor={f.fStatus} onChange={f.setFStatus} opcoes={[
          { valor: '', rotulo: 'Todos os status' },
          { valor: 'pendente', rotulo: 'A pagar/receber (inclui atrasados)' },
          { valor: 'aberto', rotulo: 'Previsto no prazo' },
          { valor: 'atrasado', rotulo: '⚠ Atrasado' },
          { valor: 'realizado', rotulo: '✓ Efetivado' },
        ]} />
        <input value={f.fBusca} onChange={(e) => f.setFBusca(e.target.value)} placeholder="🔍 Buscar" className={classeInput} />
      </div>
      {(nomePassivo || nomeFornec) && (
        <p className="text-xs text-sol">
          Filtrando por {nomePassivo ? `contrato ${nomePassivo}` : `fornecedor ${nomeFornec}`}
          <button onClick={() => { f.setFPassivo(null); f.setFFornec(null) }} className="ml-2 underline">limpar</button>
        </p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/60">
        <span>↑ Entradas P <strong className="text-verde">{brl(somaP('entrada'))}</strong> · R <strong className="text-verde">{brl(somaR('entrada'))}</strong></span>
        <span>↓ Saídas P <strong className="text-coral">{brl(somaP('saida'))}</strong> · R <strong className="text-coral">{brl(somaR('saida'))}</strong></span>
        <span>{lista.length} lançamento(s)</span>
      </div>

      <div className="space-y-1.5">
        {lista.length === 0 && <p className="text-sm text-white/40 py-8 text-center">Nada neste filtro.</p>}
        {lista.map((l) => <LinhaLancamento key={l.id} l={l} hoje={hoje} acoes={acoes} />)}
      </div>
    </div>
  )
}

// ─── Detalhe de um valor da visão mensal (Kalebe 2026-09-30) ───────────────

function ModalDetalhe({ filtro, lancamentos, hoje, acoes, onFechar, onNovo }: {
  filtro: FiltroDetalhe; lancamentos: Lancamento[]; hoje: string; acoes: AcoesLancamento
  onFechar: () => void; onNovo: () => void
}) {
  // Mesma regra da tabela: P pela data prevista, R pela data em que foi efetivado
  const lista = lancamentos.filter((l) => {
    if (filtro.direcao && l.direcao !== filtro.direcao) return false
    if (filtro.grupo && l.grupo !== filtro.grupo) return false
    return filtro.tipo === 'P' ? mesDe(l.data_prevista) === filtro.mes : !!l.data_realizada && mesDe(l.data_realizada) === filtro.mes
  }).sort((a, b) => b.valor_previsto - a.valor_previsto)
  const total = arred(lista.reduce((s, l) => s + (filtro.tipo === 'P' ? l.valor_previsto : (l.valor_realizado || 0)), 0))
  return (
    <Modal titulo={filtro.rotulo} subtitulo={`${lista.length} lançamento(s) · total ${brl(total)} — clique na descrição pra editar`} onFechar={onFechar} largura="max-w-5xl">
      <div className="space-y-1.5 max-h-[65vh] overflow-y-auto">
        {lista.length === 0 && <p className="text-sm text-white/40 py-6 text-center">Nada aqui.</p>}
        {lista.map((l) => <LinhaLancamento key={l.id} l={l} hoje={hoje} acoes={acoes} />)}
      </div>
      <div className="flex justify-between gap-2">
        <button onClick={onNovo} className="px-3 py-2 bg-white/5 border border-white/15 text-white/80 text-xs rounded-lg hover:bg-white/10">➕ Novo lançamento</button>
        <button onClick={onFechar} className="px-4 py-2 bg-sol text-noite text-xs font-bold rounded-lg">Fechar</button>
      </div>
    </Modal>
  )
}

function ModalExcluir({ lanc, qtdSeguintes, onFechar, onConfirmar }: {
  lanc: Lancamento; qtdSeguintes: number; onFechar: () => void; onConfirmar: (serie: boolean) => void
}) {
  return (
    <Modal titulo="🗑 Excluir lançamento" subtitulo={`${lanc.descricao} · ${brl(lanc.valor_previsto)} em ${dataBR(lanc.data_prevista)}`} onFechar={onFechar} largura="max-w-md">
      <p className="text-xs text-white/60">Sai do fluxo (fica registrado no histórico). Lançamentos já efetivados não mudam.</p>
      <div className="flex flex-col gap-2">
        <button onClick={() => onConfirmar(false)} className="py-2.5 bg-coral/15 border border-coral/40 text-coral font-bold text-sm rounded-lg">Excluir só este</button>
        {qtdSeguintes > 0 && (
          <button onClick={() => onConfirmar(true)} className="py-2.5 bg-coral text-noite font-bold text-sm rounded-lg">
            Encerrar a série: este e os próximos {qtdSeguintes} em aberto
          </button>
        )}
        <button onClick={onFechar} className="py-2 text-white/60 text-sm">Cancelar</button>
      </div>
    </Modal>
  )
}

/** Renegociação: parcelas em aberto saem, entram as novas pelo valor negociado. */
function ModalRenegociar({ passivo, saldoAberto, onFechar, onSalvo }: {
  passivo: DadosFluxo['passivos'][number]; saldoAberto: number; onFechar: () => void; onSalvo: (m: string) => void
}) {
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState('12')
  const [valorParcela, setValorParcela] = useState('')
  const [primeiro, setPrimeiro] = useState(addMeses(hojeBR(), 1))
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const v = lerValor(valor)
  const n = Math.max(1, Math.floor(Number(parcelas) || 1))
  const vp = lerValor(valorParcela)
  const totalPagar = vp > 0 ? vp * n : v
  const desconto = arred(saldoAberto - v)

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await renegociarPassivoAction({
        passivo_id: passivo.id, valor_negociado: v, parcelas_total: n,
        valor_parcela: vp > 0 ? vp : null, primeiro_vencimento: primeiro, motivo,
      })
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo(r.desconto > 0 ? `Renegociado — desconto de ${brl(r.desconto)}` : 'Contrato renegociado')
    } finally { setSalvando(false) }
  }

  return (
    <Modal titulo={`🔁 Renegociar — ${passivo.banco}`} subtitulo={`Saldo em aberto hoje: ${brl(saldoAberto)} (valor de face da negociação)`} onFechar={onFechar} largura="max-w-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo rotulo="Valor negociado (o que vai pagar) *"><InputValor valor={valor} onChange={setValor} autoFocus /></Campo>
        <Campo rotulo="Nº de parcelas *"><input type="number" min={1} max={420} className={classeInput} value={parcelas} onChange={(e) => setParcelas(e.target.value)} /></Campo>
        <Campo rotulo="Valor da parcela" dica="Vazio = negociado ÷ parcelas"><InputValor valor={valorParcela} onChange={setValorParcela} /></Campo>
        <Campo rotulo="1º vencimento *"><input type="date" className={classeInput} value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} /></Campo>
      </div>
      {v > 0 && (
        <Aviso tipo={desconto >= 0 ? 'ok' : 'erro'}>
          {desconto >= 0
            ? <>Desconto obtido: <strong>{brl(desconto)}</strong> ({saldoAberto > 0 ? ((desconto / saldoAberto) * 100).toFixed(1).replace('.', ',') : '0'}% do saldo)</>
            : <>Acréscimo de {brl(-desconto)} sobre o saldo em aberto</>}
          {' '}· {n}× de {brl(vp > 0 ? vp : v / n)} · total {brl(totalPagar)}
        </Aviso>
      )}
      <Campo rotulo="Motivo / observação"><input className={classeInput} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: acordo com o banco, quitação com desconto" /></Campo>
      <p className="text-[11px] text-white/45">As parcelas em aberto saem do fluxo (ficam no histórico) e entram as novas. Parcelas já pagas não mudam.</p>
      {erro && <Aviso tipo="erro">⚠️ {erro}</Aviso>}
      <Botoes onCancelar={onFechar} onConfirmar={salvar} processando={salvando} rotulo="Renegociar" desabilitado={!(v > 0)} />
    </Modal>
  )
}

// ─── Efetivar (valor efetivamente pago/recebido) ────────────────────────────

function ModalEfetivar({ lanc, onFechar, onSalvo }: { lanc: Lancamento; onFechar: () => void; onSalvo: (m: string) => void }) {
  const [valor, setValor] = useState(String(lanc.valor_previsto).replace('.', ','))
  const [data, setData] = useState(hojeBR())
  const [forma, setForma] = useState(lanc.forma_pagamento || '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const v = lerValor(valor)
  const dif = arred(v - lanc.valor_previsto)
  const entrada = lanc.direcao === 'entrada'

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await efetivarLancamentoAction(lanc.id, v, data, forma || null)
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo(`${entrada ? 'Recebimento' : 'Pagamento'} efetivado: ${brl(v)}`)
    } finally { setSalvando(false) }
  }

  return (
    <Modal titulo={`✓ Efetivar ${entrada ? 'recebimento' : 'pagamento'}`} subtitulo={lanc.descricao} onFechar={onFechar} largura="max-w-md">
      <p className="text-xs text-white/60">Previsto: <strong className="text-white">{brl(lanc.valor_previsto)}</strong> em {dataBR(lanc.data_prevista)}</p>
      <Campo rotulo={entrada ? 'Valor efetivamente recebido' : 'Valor efetivamente pago'} dica="Com juros, multa, desconto ou diferença de compra — o que saiu/entrou de verdade.">
        <InputValor valor={valor} onChange={setValor} autoFocus />
      </Campo>
      {Math.abs(dif) > 0.009 && (
        <Aviso tipo={(dif > 0) === !entrada ? 'erro' : 'ok'}>
          {dif > 0 ? '+' : ''}{brl(dif)} em relação ao previsto ({lanc.valor_previsto > 0 ? `${dif > 0 ? '+' : ''}${((dif / lanc.valor_previsto) * 100).toFixed(1).replace('.', ',')}%` : '—'})
        </Aviso>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data"><input type="date" className={classeInput} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <Campo rotulo="Forma"><Selecao valor={forma} onChange={setForma} vazio="—" opcoes={FORMAS_PAGAMENTO.map((x) => ({ valor: x, rotulo: x }))} /></Campo>
      </div>
      {erro && <Aviso tipo="erro">⚠️ {erro}</Aviso>}
      <Botoes onCancelar={onFechar} onConfirmar={salvar} processando={salvando} rotulo="✓ Efetivar" />
    </Modal>
  )
}

// ─── Configuração ───────────────────────────────────────────────────────────

function ModalConfig({ config, onFechar, onSalvo }: { config: ConfigFluxo; onFechar: () => void; onSalvo: (m: string) => void }) {
  const [saldo, setSaldo] = useState(String(config.saldo_inicial).replace('.', ','))
  const [inicio, setInicio] = useState(config.data_inicio)
  const [reserva, setReserva] = useState(String(config.reserva_minima).replace('.', ','))
  const [regime, setRegime] = useState(config.regime_imposto)
  const [kitPadrao, setKitPadrao] = useState(config.kit_passa_caixa_padrao ? 'sim' : 'nao')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await salvarConfigFluxoAction({
        saldo_inicial: lerValor(saldo), data_inicio: inicio, reserva_minima: lerValor(reserva), regime_imposto: regime,
        kit_passa_caixa_padrao: kitPadrao === 'sim',
      })
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo('Configuração do fluxo salva')
    } finally { setSalvando(false) }
  }

  return (
    <Modal titulo="⚙️ Saldo inicial e capital de giro" onFechar={onFechar} largura="max-w-md">
      <Campo rotulo="Saldo em conta na data de início" dica="Soma das contas bancárias + caixa no dia em que o fluxo começa a valer.">
        <InputValor valor={saldo} onChange={setSaldo} />
      </Campo>
      <Campo rotulo="Data de início do fluxo"><input type="date" className={classeInput} value={inicio} onChange={(e) => setInicio(e.target.value)} /></Campo>
      <Campo rotulo="Reserva mínima de capital de giro" dica="O sistema alerta quando o saldo projetado fica abaixo desse valor.">
        <InputValor valor={reserva} onChange={setReserva} />
      </Campo>
      <Campo rotulo="Apuração do Simples (DAS)" dica="Confirme com a contabilidade. Define quando o imposto das vendas é previsto.">
        <Selecao valor={regime} onChange={(v) => setRegime(v as any)} opcoes={[
          { valor: 'competencia', rotulo: 'Competência — na emissão da nota' },
          { valor: 'caixa', rotulo: 'Caixa — a cada recebimento' },
        ]} />
      </Campo>
      <Campo rotulo="Kit nas vendas que entram sozinhas" dica="Vale pras vendas automáticas; em cada venda dá pra ajustar em “⚙ ajustar venda”.">
        <Selecao valor={kitPadrao} onChange={setKitPadrao} opcoes={[
          { valor: 'nao', rotulo: 'Faturado direto ao cliente (não passa pelo caixa)' },
          { valor: 'sim', rotulo: 'Passa pelo caixa da Spin (entra e sai como fornecedor)' },
        ]} />
      </Campo>
      {erro && <Aviso tipo="erro">⚠️ {erro}</Aviso>}
      <Botoes onCancelar={onFechar} onConfirmar={salvar} processando={salvando} rotulo="Salvar" />
    </Modal>
  )
}

// ─── Fornecedor ─────────────────────────────────────────────────────────────

function ModalFornecedor({ f, onFechar, onSalvo }: { f?: Fornecedor; onFechar: () => void; onSalvo: (m: string) => void }) {
  const [razao, setRazao] = useState(f?.razao_social || '')
  const [fantasia, setFantasia] = useState(f?.nome_fantasia || '')
  const [cnpj, setCnpj] = useState(f?.cnpj || '')
  const [categoria, setCategoria] = useState(f?.categoria || '')
  const [tel, setTel] = useState(f?.contato_telefone || '')
  const [ativo, setAtivo] = useState(f?.ativo !== false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await salvarFornecedorAction({ id: f?.id, razao_social: razao, nome_fantasia: fantasia, cnpj, categoria, contato_telefone: tel, ativo })
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo(f ? 'Fornecedor atualizado' : 'Fornecedor cadastrado')
    } finally { setSalvando(false) }
  }

  return (
    <Modal titulo={`🏭 ${f ? 'Editar' : 'Novo'} fornecedor`} onFechar={onFechar} largura="max-w-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo rotulo="Razão social / nome *" className="sm:col-span-2"><input className={classeInput} value={razao} onChange={(e) => setRazao(e.target.value)} autoFocus /></Campo>
        <Campo rotulo="Nome fantasia"><input className={classeInput} value={fantasia} onChange={(e) => setFantasia(e.target.value)} /></Campo>
        <Campo rotulo="CNPJ"><input className={classeInput} value={cnpj} onChange={(e) => setCnpj(e.target.value)} /></Campo>
        <Campo rotulo="Categoria" dica="Ex.: distribuidor, material elétrico, serviços"><input className={classeInput} value={categoria} onChange={(e) => setCategoria(e.target.value)} /></Campo>
        <Campo rotulo="Telefone"><input className={classeInput} value={tel} onChange={(e) => setTel(e.target.value)} /></Campo>
      </div>
      {f && (
        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo</label>
      )}
      {erro && <Aviso tipo="erro">⚠️ {erro}</Aviso>}
      <Botoes onCancelar={onFechar} onConfirmar={salvar} processando={salvando} rotulo="Salvar" desabilitado={!razao.trim()} />
    </Modal>
  )
}
