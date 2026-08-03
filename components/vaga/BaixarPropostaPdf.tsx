'use client'

import { useRef, useState } from 'react'

/**
 * Botão + template A4 (branco) da proposta de trabalho O&M.
 * Gera o PDF client-side (html2canvas + jsPDF), igual ao padrão de
 * OrcamentoClient.gerarPDF: itera as <section> (1 por página A4).
 */
export function BaixarPropostaPdf({
  nomeCandidato,
  empresa,
}: {
  nomeCandidato: string
  empresa?: { razao_social?: string | null; cnpj?: string | null } | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [gerando, setGerando] = useState(false)

  async function gerar() {
    if (!ref.current) return
    setGerando(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const paginas = Array.from(ref.current.querySelectorAll('section'))
      for (let i = 0; i < paginas.length; i++) {
        const canvas = await html2canvas(paginas[i] as HTMLElement, {
          scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
        })
        const img = canvas.toDataURL('image/jpeg', 0.92)
        if (i > 0) pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297)
      }
      const nome = nomeCandidato.replace(/[^a-zA-Z0-9]/g, '_')
      pdf.save(`Proposta-SPIN-Representante-OM-${nome}.pdf`)
    } catch (e) {
      console.error('[BaixarPropostaPdf] erro:', e)
      alert('Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <>
      <button
        onClick={gerar}
        disabled={gerando}
        className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/15 rounded-lg text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        {gerando ? 'Gerando PDF...' : '⬇ Baixar proposta em PDF'}
      </button>

      {/* Template A4 fora da tela */}
      <div style={{ position: 'fixed', left: -9999, top: 0 }} aria-hidden>
        <div ref={ref} style={{ background: '#fff', color: '#111', width: 794, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <PdfPaginas nomeCandidato={nomeCandidato} empresa={empresa} />
        </div>
      </div>
    </>
  )
}

/* ------------------------------- Template ------------------------------- */

const SOL = '#F5B400'
const P: React.CSSProperties = {
  width: 794, height: 1123, padding: '56px 56px', boxSizing: 'border-box',
  position: 'relative', overflow: 'hidden',
}
const H2: React.CSSProperties = { fontSize: 22, fontWeight: 900, color: '#0B0F1A', margin: '0 0 14px' }
const TXT: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.6, color: '#333', margin: '0 0 12px' }
const TH: React.CSSProperties = { fontSize: 12, textAlign: 'left', padding: '9px 12px', background: '#f4f4f5', color: '#555', fontWeight: 700 }
const TD: React.CSSProperties = { fontSize: 13, padding: '9px 12px', color: '#333', borderTop: '1px solid #eee' }

function Rodape() {
  return (
    <p style={{ position: 'absolute', bottom: 28, left: 56, right: 56, fontSize: 10, color: '#999', margin: 0, borderTop: '1px solid #eee', paddingTop: 8 }}>
      SPIN Solar · Proposta válida para discussão — sujeita a formalização em contrato.
    </p>
  )
}

function PdfPaginas({ nomeCandidato, empresa }: { nomeCandidato: string; empresa?: { razao_social?: string | null } | null }) {
  return (
    <>
      {/* PÁGINA 1 */}
      <section style={P}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            <span style={{ fontSize: 26, fontWeight: 900, color: '#0B0F1A' }}>SPIN </span>
            <span style={{ fontSize: 26, fontWeight: 900, color: SOL }}>SOLAR</span>
            <p style={{ fontSize: 10, color: '#999', margin: '2px 0 0', letterSpacing: 1 }}>
              {empresa?.razao_social || 'Spin Solar Energias Renováveis'}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#999' }}>
            <p style={{ margin: 0 }}>Proposta de trabalho</p>
            <p style={{ margin: 0 }}>Preparada para {nomeCandidato}</p>
          </div>
        </div>

        <p style={{ fontSize: 13, color: SOL, fontWeight: 700, letterSpacing: 1.5, margin: '0 0 6px' }}>REPRESENTANTE COMERCIAL</p>
        <h1 style={{ fontSize: 38, fontWeight: 900, color: '#0B0F1A', lineHeight: 1.05, margin: '0 0 28px' }}>
          Serviços de O&amp;M
        </h1>

        <h2 style={H2}>A oportunidade</h2>
        <p style={TXT}>
          Existem hoje, em Santa Catarina, milhares de sistemas solares instalados há três, quatro anos que
          nunca foram limpos. Cada um perde entre 8% e 15% da geração — dinheiro que o dono paga na conta de
          luz todo mês. Quase ninguém oferece esse serviço de forma profissional, e ninguém sabe onde esses
          sistemas estão. <strong>Nós sabemos. A SPIN vai te entregar a lista.</strong>
        </p>

        <h2 style={{ ...H2, marginTop: 24 }}>O que você vai fazer</h2>
        <p style={TXT}>
          Vender contratos de limpeza e manutenção para telhados comerciais e industriais — galpões, agro,
          avicultura, frigoríficos, supermercados e usinas. O ciclo completo é seu:
        </p>
        <ol style={{ ...TXT, paddingLeft: 20 }}>
          <li><strong>Identificar</strong> o telhado (base ANEEL + satélite).</li>
          <li><strong>Abordar</strong> o decisor com um diagnóstico pronto.</li>
          <li><strong>Negociar e fechar</strong> — de preferência em contrato de 12 ou 24 meses.</li>
          <li><strong>Acompanhar</strong> o agendamento e o recebimento.</li>
        </ol>

        <h2 style={{ ...H2, marginTop: 24 }}>O que a SPIN entrega</h2>
        <p style={TXT}>
          Lista de alvos (ANEEL filtrada), base própria de clientes já instalados, leads de campanha, app com
          CRM e proposta automática, equipe de campo própria e protocolo de trabalho testado. Trabalho remoto,
          sem custo seu.
        </p>
        <Rodape />
      </section>

      {/* PÁGINA 2 — Remuneração */}
      <section style={P}>
        <h2 style={H2}>Remuneração</h2>
        <p style={TXT}>
          <strong>Fixo mensal de R$ 2.000</strong> (vinculado à meta de atividade) +{' '}
          <strong>garantia de R$ 5.000/mês nos 3 primeiros meses</strong>, independente de resultado. Construir
          carteira leva de 60 a 90 dias — a SPIN banca esse período.
        </p>

        <p style={{ ...TXT, fontWeight: 700, color: '#0B0F1A', margin: '18px 0 8px' }}>Comissão escalonada</p>
        <p style={{ ...TXT, fontSize: 12, color: '#666' }}>Sobre o faturamento recebido no mês; cada faixa incide só sobre a parte dentro dela.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 18px' }}>
          <thead><tr><th style={TH}>Faturamento no mês</th><th style={{ ...TH, textAlign: 'right' }}>Comissão</th></tr></thead>
          <tbody>
            {[['até R$ 15.000', '—'], ['R$ 15.001 a 30.000', '10%'], ['R$ 30.001 a 50.000', '13%'], ['R$ 50.001 a 80.000', '16%'], ['acima de R$ 80.000', '18%']].map((r, i) => (
              <tr key={i}><td style={TD}>{r[0]}</td><td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#0B0F1A' }}>{r[1]}</td></tr>
            ))}
          </tbody>
        </table>

        <p style={TXT}>
          <strong>Multiplicador de prospecção 1,6×:</strong> cliente que você encontrou e trouxe vale 1,6× a
          comissão normal. Quem caça recebe mais.
        </p>
        <p style={TXT}>
          <strong>Extras:</strong> bônus por contrato recorrente (R$ 150 residencial · R$ 500 comercial ·
          R$ 1.200 usina), prêmio de upsell (15% a 30%), bônus de carteira própria (até R$ 10.000 por 100
          clientes) e 0,5% por indicação ao time de solar.
        </p>
        <p style={TXT}>
          <strong>Titularidade de 24 meses:</strong> cliente que você prospectou é seu — toda limpeza no
          período gera comissão, inclusive as recorrentes de contrato.
        </p>

        <p style={{ ...TXT, fontWeight: 700, color: '#0B0F1A', margin: '18px 0 8px' }}>Projeção</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Fase</th><th style={TH}>Faturamento gerado</th><th style={{ ...TH, textAlign: 'right' }}>Sua remuneração</th></tr></thead>
          <tbody>
            {[['Meses 1 a 3', 'em construção', 'R$ 5.000 garantidos'], ['Meses 4 a 6', 'R$ 35–45 mil', 'R$ 6.000 a 8.000'], ['Regime (mês 7+)', 'R$ 60–77 mil', 'R$ 11.000 a 16.000']].map((r, i) => (
              <tr key={i}><td style={{ ...TD, fontWeight: 700, color: '#0B0F1A' }}>{r[0]}</td><td style={TD}>{r[1]}</td><td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: SOL }}>{r[2]}</td></tr>
            ))}
          </tbody>
        </table>
        <Rodape />
      </section>

      {/* PÁGINA 3 — Contratação */}
      <section style={P}>
        <h2 style={H2}>Formato de contratação</h2>
        <p style={TXT}>
          Representação comercial autônoma (Lei 4.886/65), com zona definida e contrato formal registrado.
        </p>
        <p style={TXT}>
          <strong>A favor:</strong> autonomia de ritmo e método, remuneração sem teto, carteira própria com
          titularidade, sem desconto de INSS sobre comissão.<br />
          <strong>Contra:</strong> não há FGTS, 13º nem férias remuneradas; é necessário CNPJ.
        </p>
        <p style={TXT}>
          A projeção de R$ 11.000 a 16.000 em regime já considera isso — remuneração líquida bem acima do que a
          função paga em carteira na região.
        </p>

        <h2 style={{ ...H2, marginTop: 24 }}>O que esperamos</h2>
        <p style={TXT}>
          Meta de atividade (não de sorte), por mês: <strong>176 telhados mapeados</strong>,{' '}
          <strong>66 conversas com decisor</strong> e <strong>33 propostas enviadas</strong>. Rampa de 60% no
          mês 1, 80% no mês 2 e 100% a partir do mês 3.
        </p>

        <div style={{ marginTop: 24, padding: 20, background: '#FFF8E6', border: `1px solid ${SOL}`, borderRadius: 12 }}>
          <h2 style={{ ...H2, margin: '0 0 8px' }}>Por que agora</h2>
          <p style={{ ...TXT, margin: 0 }}>
            O boom de instalações de 2021 e 2022 está completando quatro anos — uma safra inteira de sistemas
            sujos, com endereço e CNPJ em base pública. Quem chegar primeiro pega o mercado com contrato de dois
            anos assinado.
          </p>
        </div>
        <Rodape />
      </section>
    </>
  )
}
