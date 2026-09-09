'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { salvarOrcamentoAction, marcarPropostaEnviadaAction } from '@/app/projetos/[id]/orcamento/actions'

/**
 * Tela de proposta BESS puro — Kalebe 2026-09-09.
 *
 * Mostra composição do kit (bateria + controladora + medidor + caixas + opcionais),
 * memória de cálculo (kit bruto → fator WEG → margem/comissão/imposto → PV),
 * e permite salvar como orçamento + marcar como enviada. Custos internos
 * (kit bruto, fator, margem em R$) só aparecem pra admin.
 */

type ItemComp = {
  id?: string
  marca?: string | null
  modelo: string
  potencia_kw?: number | null
  qtd: number
  preco_venda: number
}

type Props = {
  projeto: any
  kit: {
    modo: 'bess_puro'
    bateria: ItemComp
    controladora: ItemComp
    medidor: ItemComp
    caixas_juncao?: ItemComp[]
    opcionais?: ItemComp[]
    preco_total_estimado?: number
  }
  proposta: {
    kit_bess_bruto: number
    kit_com_fator: number
    frete: number
    projeto_art: number
    instalacao: number
    instalacao_detalhe?: {
      qtd_inversor: number
      qtd_bateria: number
      valor_por_inversor: number
      valor_por_bateria: number
    }
    base_impostavel: number
    margem: number
    comissao_vendedor: number
    impostos_simples: number
    pv_total: number
    memoria: {
      fator_kit_weg_aplicado: number
      margem_pct: number
      comissao_pct: number
      impostos_pct: number
    }
  }
  configEmpresa: any
  ehAdmin: boolean
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export function BessPropostaClient({ projeto, kit, proposta, configEmpresa, ehAdmin }: Props) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    setErro(null); setMsg(null)
    startTransition(async () => {
      const r = await salvarOrcamentoAction(projeto.id, proposta as any)
      if (!r.sucesso) { setErro(r.erro || 'Erro ao salvar'); return }
      setMsg('Orçamento salvo — projeto avançou pra etapa Orçamento Gerado')
    })
  }

  function marcarEnviada() {
    setErro(null); setMsg(null)
    startTransition(async () => {
      const r = await marcarPropostaEnviadaAction(projeto.id)
      if (!r.sucesso) { setErro(r.erro || 'Erro ao marcar'); return }
      setMsg('Proposta marcada como enviada — projeto avançou pro CRM')
    })
  }

  const todosOpcionais = [...(kit.caixas_juncao || []), ...(kit.opcionais || [])]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna 1-2: composição do kit */}
      <div className="lg:col-span-2 space-y-4">
        <section className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 bg-white/5 text-[10px] uppercase tracking-widest font-bold text-white/60 border-b border-white/5">
            Composição do kit BESS
          </p>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-white/50">
              <tr>
                <th className="text-left p-3">Item</th>
                <th className="text-left p-3">Modelo</th>
                <th className="text-right p-3">Qtd</th>
                {ehAdmin && <th className="text-right p-3">Unit.</th>}
                <th className="text-right p-3">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <LinhaKit label="🔋 Bateria" item={kit.bateria} ehAdmin={ehAdmin} />
              <LinhaKit label="⚙️ Controladora" item={kit.controladora} ehAdmin={ehAdmin} />
              <LinhaKit label="📊 Medidor" item={kit.medidor} ehAdmin={ehAdmin} />
              {(kit.caixas_juncao || []).map((c, i) => (
                <LinhaKit key={`c${i}`} label={`🧰 Caixa junção ${i + 1}`} item={c} ehAdmin={ehAdmin} />
              ))}
              {(kit.opcionais || []).map((o, i) => (
                <LinhaKit key={`o${i}`} label={`✨ Opcional ${i + 1}`} item={o} ehAdmin={ehAdmin} />
              ))}
              {ehAdmin && (
                <tr className="border-t border-sol/20 bg-sol/5">
                  <td colSpan={4} className="p-3 text-right text-[10px] uppercase tracking-wider font-bold text-sol">
                    Kit BESS bruto (custo WEG)
                  </td>
                  <td className="p-3 text-right font-mono font-black text-sol">
                    {fmtBRL(proposta.kit_bess_bruto)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Serviços */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/60 mb-3">
            Serviços e complementos
          </p>
          <div className="space-y-2 text-sm">
            <LinhaServico label="Frete regional" valor={proposta.frete} />
            <LinhaServico label="Projeto + ART" valor={proposta.projeto_art} />
            <LinhaServico
              label={
                proposta.instalacao_detalhe
                  ? `Instalação (${proposta.instalacao_detalhe.qtd_inversor}× inversor R$ ${proposta.instalacao_detalhe.valor_por_inversor} + ${proposta.instalacao_detalhe.qtd_bateria}× bateria R$ ${proposta.instalacao_detalhe.valor_por_bateria})`
                  : 'Instalação (mão de obra)'
              }
              valor={proposta.instalacao}
            />
            <hr className="border-white/5 my-2" />
            <LinhaServico label="Base impostável" valor={proposta.base_impostavel} destaque />
          </div>
        </section>

        {ehAdmin && (
          <section className="bg-sol/[0.05] border border-sol/25 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest font-bold text-sol mb-3">
              🔒 Memória de cálculo (só admin)
            </p>
            <div className="space-y-2 text-sm">
              <LinhaServico label={`Fator kit WEG (${proposta.memoria.fator_kit_weg_aplicado})`} valor={proposta.kit_com_fator} />
              <LinhaServico label={`Margem (${proposta.memoria.margem_pct}%)`} valor={proposta.margem} />
              <LinhaServico label={`Comissão vendedor (${proposta.memoria.comissao_pct}%)`} valor={proposta.comissao_vendedor} />
              <LinhaServico label={`Imposto Simples (${proposta.memoria.impostos_pct}% s/ nota Spin)`} valor={proposta.impostos_simples} />
            </div>
          </section>
        )}
      </div>

      {/* Coluna 3: total + ações */}
      <div className="space-y-4">
        <section className="bg-gradient-to-br from-verde/10 to-sol/5 border border-verde/40 rounded-xl p-6 sticky top-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/60">PV total</p>
          <p className="text-3xl font-mono font-black text-white mt-1">{fmtBRL(proposta.pv_total)}</p>
          <p className="text-xs text-white/50 mt-1">Kit BESS + serviços · à vista</p>

          <div className="mt-6 space-y-2">
            <button
              onClick={salvar}
              disabled={pending}
              className="w-full px-4 py-3 rounded-lg bg-sol text-noite font-bold text-sm hover:bg-sol/80 disabled:opacity-40 transition"
            >
              {pending ? 'Salvando…' : '💾 Salvar orçamento'}
            </button>
            <button
              onClick={marcarEnviada}
              disabled={pending}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 text-white text-sm font-bold transition disabled:opacity-40"
            >
              📤 Marcar como enviada
            </button>
            <Link
              href={`/projetos/${projeto.id}/kit`}
              className="block text-center w-full px-4 py-2 rounded-lg text-white/60 hover:text-white text-xs transition"
            >
              ← Editar kit BESS
            </Link>
          </div>

          {erro && (
            <div className="mt-3 p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
              ⚠️ {erro}
            </div>
          )}
          {msg && (
            <div className="mt-3 p-2.5 bg-verde/10 border border-verde/30 rounded text-xs text-verde">
              ✓ {msg}
            </div>
          )}
        </section>

        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-4 text-xs text-white/60 leading-relaxed">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/50 mb-2">Cliente</p>
          <p className="text-white font-semibold">{projeto.cliente_razao_social}</p>
          {projeto.cliente_cpf_cnpj && (
            <p className="font-mono text-white/70 text-[11px] mt-0.5">{projeto.cliente_cpf_cnpj}</p>
          )}
          <p className="mt-3 text-[11px]">
            PDF da proposta BESS ainda em desenvolvimento — por enquanto salva o
            orçamento e usa o PDF genérico até o template BESS ficar pronto.
          </p>
        </section>
      </div>
    </div>
  )
}

function LinhaKit({ label, item, ehAdmin }: { label: string; item: ItemComp; ehAdmin: boolean }) {
  const subtotal = (Number(item?.preco_venda) || 0) * (Number(item?.qtd) || 1)
  return (
    <tr className="border-t border-white/5">
      <td className="p-3 text-white font-semibold">{label}</td>
      <td className="p-3 text-white/70">
        {item?.marca ? `${item.marca} · ` : ''}{item?.modelo || '—'}
        {item?.potencia_kw ? <span className="text-white/40 ml-1">({item.potencia_kw}kW)</span> : null}
      </td>
      <td className="p-3 text-right font-mono text-white/70">{item?.qtd || 0}</td>
      {ehAdmin && (
        <td className="p-3 text-right font-mono text-white/60 text-xs">
          {fmtBRL(Number(item?.preco_venda) || 0)}
        </td>
      )}
      <td className="p-3 text-right font-mono text-white font-bold">{fmtBRL(subtotal)}</td>
    </tr>
  )
}

function LinhaServico({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={destaque ? 'text-white/80 font-bold text-xs' : 'text-white/60 text-xs'}>{label}</span>
      <span className={`font-mono ${destaque ? 'text-white font-black' : 'text-white/80'}`}>
        {fmtBRL(valor)}
      </span>
    </div>
  )
}
