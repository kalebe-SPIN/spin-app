'use client'

import { useState } from 'react'
import { salvarPassivoAction } from '@/app/financeiro/fluxo-caixa/actions'
import {
  MODALIDADES_PASSIVO, hojeBR, lerValor, brl, dividirEmParcelas, addMeses, dataBR,
} from '@/lib/financeiro/fluxo'
import { Campo, InputValor, Selecao, Modal, Aviso, Botoes, classeInput } from './ui'

/**
 * Passivo bancário (Kalebe 2026-09-29): contrato vira N parcelas PREVISTAS
 * (e, se marcado, a entrada do dinheiro captado). Cada parcela é efetivada
 * com o valor realmente pago (juros/multa entram aí).
 */
export function ModalPassivo({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (msg: string) => void }) {
  const hoje = hojeBR()
  const [banco, setBanco] = useState('')
  const [modalidade, setModalidade] = useState('emprestimo')
  const [contrato, setContrato] = useState('')
  const [valor, setValor] = useState('')
  const [dataContratacao, setDataContratacao] = useState(hoje)
  const [taxa, setTaxa] = useState('')
  const [parcelas, setParcelas] = useState('12')
  const [valorParcela, setValorParcela] = useState('')
  const [primeiro, setPrimeiro] = useState(addMeses(hoje, 1))
  const [captacao, setCaptacao] = useState(true)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const valorNum = lerValor(valor)
  const n = Math.max(1, Math.floor(Number(parcelas) || 1))
  const parcelaNum = lerValor(valorParcela)
  const lista = parcelaNum > 0 ? Array(n).fill(parcelaNum) : dividirEmParcelas(valorNum, n)
  const totalPagar = lista.reduce((s, v) => s + v, 0)
  const custo = totalPagar - valorNum

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      const r = await salvarPassivoAction({
        banco, modalidade, numero_contrato: contrato,
        valor_contratado: valorNum, data_contratacao: dataContratacao,
        taxa_juros_mes: taxa ? lerValor(taxa) : null,
        parcelas_total: n, valor_parcela: parcelaNum > 0 ? parcelaNum : null,
        primeiro_vencimento: primeiro, lancar_captacao: captacao, observacoes: obs,
      })
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo(`Contrato cadastrado: ${n} parcela(s) prevista(s)`)
    } finally { setSalvando(false) }
  }

  return (
    <Modal titulo="🏦 Passivo bancário" subtitulo="Empréstimo, financiamento, capital de giro bancário, cartão, consórcio…" onFechar={onFechar}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo rotulo="Banco / instituição *"><input className={classeInput} value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ex.: Sicoob, BB, Caixa" autoFocus /></Campo>
        <Campo rotulo="Modalidade *"><Selecao valor={modalidade} onChange={setModalidade} opcoes={MODALIDADES_PASSIVO.map((m) => ({ valor: m.chave, rotulo: m.rotulo }))} /></Campo>
        <Campo rotulo="Nº do contrato"><input className={classeInput} value={contrato} onChange={(e) => setContrato(e.target.value)} placeholder="Opcional" /></Campo>
        <Campo rotulo="Valor contratado *"><InputValor valor={valor} onChange={setValor} /></Campo>
        <Campo rotulo="Data da contratação *"><input type="date" className={classeInput} value={dataContratacao} onChange={(e) => setDataContratacao(e.target.value)} /></Campo>
        <Campo rotulo="Taxa de juros (% a.m.)" dica="Informativo"><input className={classeInput} inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Ex.: 1,89" /></Campo>
        <Campo rotulo="Nº de parcelas *"><input type="number" min={1} max={420} className={classeInput} value={parcelas} onChange={(e) => setParcelas(e.target.value)} /></Campo>
        <Campo rotulo="Valor da parcela" dica="Do contrato (com juros). Vazio = valor ÷ parcelas">
          <InputValor valor={valorParcela} onChange={setValorParcela} />
        </Campo>
        <Campo rotulo="1º vencimento *"><input type="date" className={classeInput} value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} /></Campo>
      </div>

      <label className="flex items-start gap-2 text-sm text-white/80 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={captacao} onChange={(e) => setCaptacao(e.target.checked)} />
        <span>Lançar a entrada do dinheiro captado no caixa ({brl(valorNum)} em {dataBR(dataContratacao)})
          <span className="block text-[10px] text-white/45">Desmarque se o valor não passa pela conta (ex.: financiamento pago direto ao vendedor do bem).</span>
        </span>
      </label>

      {valorNum > 0 && (
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-xs text-white/70 space-y-0.5">
          <p>{n}× de {brl(lista[0])} · de {dataBR(primeiro)} a {dataBR(addMeses(primeiro, n - 1))}</p>
          <p>Total a pagar: <strong className="text-white">{brl(totalPagar)}</strong>
            {custo > 0.009 && <> · custo do dinheiro: <strong className="text-coral">{brl(custo)}</strong></>}</p>
        </div>
      )}

      <Campo rotulo="Observações"><textarea className={`${classeInput} resize-none`} rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      {erro && <Aviso tipo="erro">⚠️ {erro}</Aviso>}
      <Botoes onCancelar={onFechar} onConfirmar={salvar} processando={salvando} rotulo="Cadastrar contrato" desabilitado={!banco.trim() || !(valorNum > 0)} />
    </Modal>
  )
}
