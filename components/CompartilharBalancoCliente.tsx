'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { fmtNum } from '@/lib/formatters'
import { balancoCreditos, type SerieUc } from '@/lib/dimensionamento/meta-energia'
import { GraficoConsumoInjetado } from './GraficoConsumoInjetado'
import { abrirCanalDoProjetoAction, enviarArquivoAction, janelaAbertaAction } from '@/app/inbox/actions'

/**
 * Kalebe 2026-09-29: botão pra mandar o gráfico de consumo × injetado e o
 * balanço de créditos pro cliente pelo inbox (WhatsApp Spin). A imagem é
 * uma versão PRO CLIENTE — linguagem simples, sem notas internas nem kWp.
 */

const LIMITE = 4 * 1024 * 1024

type SerieGrafico = SerieUc & { cor: string }

export function CompartilharBalancoCliente({
  projetoId, nomeCliente, uc, series, injetado, temGeracao,
}: {
  projetoId: string
  nomeCliente: string
  uc: string
  series: SerieGrafico[]
  injetado: Array<number | null>
  temGeracao: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'livre' | 'gerando' | 'enviando'>('livre')
  const [erro, setErro] = useState<string | null>(null)
  const [enviadoConversa, setEnviadoConversa] = useState<string | null>(null)

  const b = temGeracao ? balancoCreditos(series) : null
  const temInjecao = injetado.some((v) => v !== null && v > 0)
  const meses = series[0]?.historico?.length || 0
  const primeiroNome = (nomeCliente || '').split(' ')[0]
  const primeiroNomeCap = primeiroNome ? primeiroNome[0] + primeiroNome.slice(1).toLowerCase() : ''

  const frase = !b ? null
    : b.status === 'deficitario' ? `Hoje faltam cerca de ${fmtNum(Math.abs(b.balanco_mes), 0)} kWh por mês para zerar a sua conta de energia.`
    : b.status === 'superavitario' ? `Hoje sobram cerca de ${fmtNum(Math.abs(b.balanco_mes), 0)} kWh por mês em créditos de energia.`
    : 'Hoje a sua geração e o seu consumo estão praticamente empatados.'

  const legenda = [
    `Olá${primeiroNomeCap ? `, ${primeiroNomeCap}` : ''}! Separei o balanço da sua energia dos últimos ${meses} meses, com base nas suas faturas da CELESC.`,
    frase,
    'Qualquer dúvida é só me chamar por aqui.',
  ].filter(Boolean).join('\n\n')

  async function gerarImagem(): Promise<File> {
    if (!ref.current) throw new Error('Imagem não montada')
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#0B0F1A', useCORS: true, logging: false })
    const png: Blob = await new Promise((r, j) => canvas.toBlob((x) => (x ? r(x) : j(new Error('Falha ao gerar a imagem'))), 'image/png'))
    if (png.size <= LIMITE) return new File([png], 'balanco-energia.png', { type: 'image/png' })
    const jpg: Blob = await new Promise((r, j) => canvas.toBlob((x) => (x ? r(x) : j(new Error('Falha ao gerar a imagem'))), 'image/jpeg', 0.9))
    return new File([jpg], 'balanco-energia.jpg', { type: 'image/jpeg' })
  }

  async function enviar() {
    setErro(null); setEnviadoConversa(null); setEstado('gerando')
    try {
      const arquivo = await gerarImagem()
      setEstado('enviando')
      const canal = await abrirCanalDoProjetoAction(projetoId)
      if ('erro' in canal) throw new Error(canal.erro)
      const janela = await janelaAbertaAction(canal.conversa_id)
      if ('erro' in janela) throw new Error(janela.erro)
      if (!janela.aberta) {
        throw new Error('O cliente não mandou mensagem pro número da Spin nas últimas 24h — o WhatsApp só libera modelo aprovado. Baixe a imagem e mande pelo celular, ou peça pro cliente mandar um "oi" e envie de novo.')
      }
      const fd = new FormData()
      fd.append('conversa_id', canal.conversa_id)
      fd.append('arquivo', arquivo)
      fd.append('legenda', legenda)
      const r = await enviarArquivoAction(fd)
      if ('erro' in r) {
        throw new Error(/24|re-?engage|131047/i.test(r.erro)
          ? 'O cliente não falou com o número da Spin nas últimas 24h — o WhatsApp só libera modelo aprovado. Baixe a imagem e mande pelo celular, ou peça pro cliente mandar um "oi".'
          : r.erro)
      }
      setEnviadoConversa(canal.conversa_id)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar')
    } finally { setEstado('livre') }
  }

  async function baixar() {
    setErro(null); setEstado('gerando')
    try {
      const arquivo = await gerarImagem()
      const url = URL.createObjectURL(arquivo)
      const a = document.createElement('a')
      a.href = url; a.download = arquivo.name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gerar a imagem')
    } finally { setEstado('livre') }
  }

  const corStatus = b?.status === 'deficitario' ? '#F17A5C' : b?.status === 'superavitario' ? '#5FCF80' : '#F5B400'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={enviar} disabled={estado !== 'livre'}
          className="px-4 py-2 bg-verde/20 border border-verde/40 text-verde font-bold text-sm rounded-lg hover:bg-verde/30 disabled:opacity-50">
          {estado === 'gerando' ? '⏳ Montando imagem…' : estado === 'enviando' ? '⏳ Enviando…' : '💬 Enviar este gráfico pro cliente'}
        </button>
        <button type="button" onClick={baixar} disabled={estado !== 'livre'}
          className="px-3 py-2 bg-white/5 border border-white/10 text-white/70 text-xs font-bold rounded-lg hover:bg-white/10 disabled:opacity-50">
          ⬇ Baixar imagem
        </button>
        <span className="text-[10px] text-white/40">Vai pela conversa do WhatsApp Spin do projeto, com uma mensagem explicando.</span>
      </div>
      {enviadoConversa && (
        <p className="text-xs text-verde">✓ Enviado. <Link href={`/spinzap?c=${enviadoConversa}`} className="underline">Ver no Spinzap</Link></p>
      )}
      {erro && <p className="text-xs text-coral bg-coral/10 border border-coral/30 rounded-lg p-2">⚠ {erro}</p>}

      {/* Versão pro cliente — fora da tela, só pra virar imagem */}
      <div aria-hidden className="tema-fixo" style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
        <div ref={ref} style={{ width: 900, padding: 32, background: '#0B0F1A', color: '#F5F5F0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, letterSpacing: 3, color: '#F5B400', fontWeight: 700, textTransform: 'uppercase' }}>Spin Solar</p>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800 }}>
                {temInjecao ? 'Sua energia: consumo × geração injetada' : 'Seu consumo de energia'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(245,245,240,.6)' }}>
                {nomeCliente}{uc ? ` · UC ${uc}` : ''} · últimos {meses} meses
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 18, fontSize: 12, marginBottom: 8, color: 'rgba(245,245,240,.75)' }}>
            {series.map((s) => (
              <span key={s.uc} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 10, background: s.cor, display: 'inline-block' }} />
                Consumo {series.length > 1 ? `UC ${s.uc}` : 'da rede'}
              </span>
            ))}
            {temInjecao && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: 'rgba(95,207,128,.6)', border: '1px solid #5FCF80', display: 'inline-block' }} />
                Energia que você injeta na rede
              </span>
            )}
          </div>
          <GraficoConsumoInjetado series={series} injetado={temInjecao ? injetado : undefined} legendaMedia="Consumo médio" semMoldura />

          {b && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
                <Caixa rotulo="Você injeta em média" valor={`${fmtNum(b.injetado_medio, 0)} kWh/mês`} />
                <Caixa rotulo="Consumo a compensar" valor={`${fmtNum(b.compensavel, 0)} kWh/mês`} nota="consumo menos a taxa mínima da CELESC" />
                <Caixa rotulo="Resultado" valor={`${b.balanco_mes >= 0 ? '+' : '−'}${fmtNum(Math.abs(b.balanco_mes), 0)} kWh/mês`} cor={corStatus} />
              </div>
              <p style={{ margin: '18px 0 0', fontSize: 16, fontWeight: 700, color: corStatus }}>{frase}</p>
            </>
          )}
          <p style={{ margin: '20px 0 0', fontSize: 11, color: 'rgba(245,245,240,.4)' }}>
            Dados das suas faturas da CELESC · Spin Solar — integrador WEG
          </p>
        </div>
      </div>
    </div>
  )
}

function Caixa({ rotulo, valor, nota, cor }: { rotulo: string; valor: string; nota?: string; cor?: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
      <p style={{ margin: 0, fontSize: 11, color: 'rgba(245,245,240,.5)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{rotulo}</p>
      <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 800, color: cor || '#F5F5F0' }}>{valor}</p>
      {nota && <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(245,245,240,.45)' }}>{nota}</p>}
    </div>
  )
}
