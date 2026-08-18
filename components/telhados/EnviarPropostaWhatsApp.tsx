'use client'

import { useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Botão + template PDF pra proposta de limpeza. Ao clicar:
 *   1. Renderiza o template DOM (fica invisível)
 *   2. html2canvas → jsPDF gera o arquivo A4
 *   3. Upload no bucket propostas-servicos (público)
 *   4. Monta link wa.me com mensagem + URL pública do PDF
 *   5. Abre WhatsApp em nova aba
 *
 * Requer: bucket propostas-servicos criado como público.
 */
export type DadosProposta = {
  clienteNome: string | null
  clienteTelefone: string | null
  endereco: string
  cidade: string | null
  apelido: string | null
  qtdPlacas: number
  potenciaKwp: number
  valorFinal: number
  numTecnicos: number
  numDias: number
  temPontoAgua: boolean
  temPontoEnergia: boolean
  sujidade: string  // 'leve' | 'medio' | 'pesado'
  observacoesVendedor?: string | null
}

export type DadosEmpresa = {
  razao_social?: string | null
  cnpj?: string | null
  telefone?: string | null
  email?: string | null
  logo_url?: string | null
}

export function EnviarPropostaWhatsApp({
  telhadoId, dados, empresa,
}: {
  telhadoId: string
  dados: DadosProposta
  empresa?: DadosEmpresa | null
}) {
  const pdfRef = useRef<HTMLDivElement>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gerarEEnviar() {
    if (dados.valorFinal <= 0) { setErro('Salva a proposta antes'); return }
    setErro(null)
    setGerando(true)

    try {
      const el = pdfRef.current
      if (!el) throw new Error('Template não montado')

      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).jsPDF

      el.style.display = 'block'
      const canvas = await html2canvas(el, { backgroundColor: '#FFFFFF', scale: 2, logging: false, useCORS: true })
      el.style.display = 'none'

      const imgData = canvas.toDataURL('image/png', 1.0)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const w = 210
      const h = (canvas.height * w) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, w, h > 297 ? 297 : h, undefined, 'FAST')

      // Blob → upload
      const blob = pdf.output('blob')
      const nomeArquivo = `${telhadoId}-${Date.now()}.pdf`
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { error: upErr } = await supabase.storage.from('propostas-servicos').upload(nomeArquivo, blob, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      })
      if (upErr) throw new Error(`Falha ao subir PDF: ${upErr.message}`)

      const pdfUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/propostas-servicos/${nomeArquivo}`

      // Monta mensagem WA — sem emojis de 4 bytes (WA Web quebra alguns),
      // link no final pra o preview automático ficar limpo (sem repetição
      // do URL no texto acima do card).
      const primeiroNome = dados.clienteNome?.trim().split(' ')[0] || 'cliente'
      const valor = dados.valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
      const linhas = [
        `Oi ${primeiroNome}, tudo bem?`,
        '',
        `Segue a proposta da SPIN Solar pra limpeza e revisão do seu sistema (${dados.qtdPlacas} placas · ${dados.potenciaKwp} kWp):`,
        '',
        `*Valor: ${valor}*`,
        '',
        'Podemos agendar? Qualquer dúvida é só me chamar.',
        '',
        pdfUrl,
      ]
      const mensagem = encodeURIComponent(linhas.join('\n'))
      const telLimpo = dados.clienteTelefone?.replace(/\D/g, '') || ''
      const linkWa = telLimpo
        ? `https://wa.me/55${telLimpo}?text=${mensagem}`
        : `https://wa.me/?text=${mensagem}`

      window.open(linkWa, '_blank', 'noopener')
    } catch (err: any) {
      setErro(err?.message || 'Falha ao gerar/enviar PDF')
    } finally {
      setGerando(false)
    }
  }

  const valorFmt = dados.valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const dataHoje = new Date().toLocaleDateString('pt-BR')
  const validade = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')

  return (
    <>
      <button
        onClick={gerarEEnviar}
        disabled={gerando}
        className="w-full mt-3 px-4 py-2.5 bg-verde text-noite-0 font-bold text-sm rounded-lg hover:bg-verde/80 disabled:opacity-50"
      >
        {gerando ? '📄 Gerando PDF e abrindo WhatsApp...' : '📄 Gerar PDF e enviar WhatsApp'}
      </button>
      {erro && <p className="text-xs text-coral mt-1">{erro}</p>}

      {/* Template A4 — fica escondido, só renderiza pra virar PDF */}
      <div ref={pdfRef} style={{ display: 'none', background: '#FFFFFF', color: '#111', width: 794, padding: '48px 56px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* Cabeçalho */}
        <div style={{ borderBottom: '3px solid #FFB94D', paddingBottom: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            {empresa?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={empresa.logo_url} alt="Logo" style={{ height: 56, objectFit: 'contain' }} crossOrigin="anonymous" />
            ) : (
              <div style={{ fontSize: 28, fontWeight: 900, color: '#0B0F1A' }}>SPIN <span style={{ color: '#FFB94D' }}>SOLAR</span></div>
            )}
            <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
              {empresa?.razao_social || 'Spin Solar Energias Renováveis Ltda'}
              {empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#666' }}>
            <div>Data: <strong>{dataHoje}</strong></div>
            <div>Validade: <strong>{validade}</strong></div>
          </div>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4, color: '#0B0F1A' }}>Proposta comercial</h1>
        <div style={{ fontSize: 14, color: '#FFB94D', marginBottom: 24, fontWeight: 700 }}>
          Limpeza técnica e revisão de sistema fotovoltaico
        </div>

        {/* Cliente */}
        <Bloco titulo="Cliente">
          <Linha rotulo="Nome" valor={dados.clienteNome || '—'} />
          {dados.apelido && <Linha rotulo="Referência" valor={dados.apelido} />}
          <Linha rotulo="Endereço" valor={dados.endereco} />
          {dados.cidade && <Linha rotulo="Cidade" valor={dados.cidade} />}
          {dados.clienteTelefone && <Linha rotulo="Contato" valor={dados.clienteTelefone} />}
        </Bloco>

        {/* Sistema */}
        <Bloco titulo="Sistema a ser atendido">
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <BoxNumero label="Placas" valor={String(dados.qtdPlacas)} />
            <BoxNumero label="Potência" valor={`${dados.potenciaKwp} kWp`} />
            <BoxNumero label="Sujidade" valor={dados.sujidade === 'leve' ? 'Leve' : dados.sujidade === 'medio' ? 'Média' : 'Pesada'} />
          </div>
        </Bloco>

        {/* Escopo */}
        <Bloco titulo="Escopo do serviço">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#333', lineHeight: 1.8 }}>
            <li><strong>Limpeza técnica</strong> das {dados.qtdPlacas} placas com produtos apropriados (sem risco de arranhão ou perda de garantia)</li>
            <li><strong>Revisão elétrica</strong>: testes de tensão, corrente e continuidade nas strings</li>
            <li><strong>Revisão mecânica</strong>: aperto de todos os pontos de fixação das placas</li>
            <li>Checklist com fotos <strong>antes e depois</strong> entregue ao final</li>
            <li>Registro no sistema SPIN com laudo técnico</li>
          </ul>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 11 }}>
            <div style={{ background: dados.temPontoAgua ? '#DCFCE7' : '#FEE2E2', color: dados.temPontoAgua ? '#166534' : '#991B1B', padding: '4px 10px', borderRadius: 6 }}>
              💧 Água no local: {dados.temPontoAgua ? 'sim' : 'não (caminhão pipa)'}
            </div>
            <div style={{ background: dados.temPontoEnergia ? '#DCFCE7' : '#FEE2E2', color: dados.temPontoEnergia ? '#166534' : '#991B1B', padding: '4px 10px', borderRadius: 6 }}>
              ⚡ Energia no local: {dados.temPontoEnergia ? 'sim' : 'não (gerador)'}
            </div>
          </div>
        </Bloco>

        {/* Execução */}
        <Bloco titulo="Execução prevista">
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <BoxNumero label="Profissionais" valor={String(dados.numTecnicos)} />
            <BoxNumero label="Dias" valor={String(dados.numDias)} />
          </div>
        </Bloco>

        {/* Valor */}
        <div style={{ background: '#FFB94D', padding: 20, borderRadius: 8, margin: '24px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#0B0F1A', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Valor total do serviço
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#0B0F1A' }}>{valorFmt}</div>
        </div>

        {/* Condições */}
        <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6, borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
          <strong>Condições:</strong> Validade da proposta 15 dias · Pagamento à vista PIX ou em até 3× no cartão sem juros ·
          Serviço agendado após confirmação · Emissão de NF pela SPIN Solar após conclusão.
          {dados.observacoesVendedor ? ` · Observações: ${dados.observacoesVendedor}` : ''}
        </div>

        {/* Rodapé */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
          <div>{empresa?.telefone || ''} {empresa?.email ? ` · ${empresa.email}` : ''}</div>
          <div>app.spinsolar.com.br</div>
        </div>
      </div>
    </>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#FFB94D', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ fontSize: 12, color: '#333', marginBottom: 2 }}>
      <span style={{ color: '#888' }}>{rotulo}: </span>
      <strong>{valor}</strong>
    </div>
  )
}

function BoxNumero({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ flex: 1, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: '#0B0F1A' }}>{valor}</div>
    </div>
  )
}
