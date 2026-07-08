'use client'

import { forwardRef } from 'react'
import type { PropostaCalculada } from '@/lib/precificacao/calcular'

type Props = {
  projeto: any
  proposta: PropostaCalculada
  configEmpresa: any
  listaCa: any[]
}

/**
 * Template A4 da proposta comercial.
 * Renderiza HTML formatado como 3 páginas A4 pra html2canvas converter em PDF.
 *
 * Dimensões A4 em px @ 96 DPI: 794 × 1123
 */
export const PropostaPDFTemplate = forwardRef<HTMLDivElement, Props>(
  ({ projeto, proposta, configEmpresa, listaCa }, ref) => {
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR')
    const kit = projeto.kit_selecionado || {}
    const empresa = configEmpresa || {}
    const dataHoje = new Date().toLocaleDateString('pt-BR')
    const validade = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')

    // Geração estimada (mensal e anual)
    const HORAS_SOL = 4.5
    const PERDAS = 0.20
    const geracaoMesKwh = (kit.potencia_cc_kwp || 0) * HORAS_SOL * 30 * (1 - PERDAS)
    const geracaoAnoKwh = geracaoMesKwh * 12
    const economiaMesEstimada = geracaoMesKwh * 0.9  // tarifa CELESC média ~R$ 0,90/kWh
    const roiAnos = economiaMesEstimada > 0 ? proposta.pv_total / (economiaMesEstimada * 12) : 0

    return (
      <div ref={ref} style={{ background: '#fff', color: '#111' }}>
        {/* ============ PÁGINA 1 — CAPA ============ */}
        <section style={estilos.pagina}>
          <div style={estilos.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {empresa.logo_url ? (
                <img src={empresa.logo_url} alt="Logo" style={{ height: 60, objectFit: 'contain' }} crossOrigin="anonymous" />
              ) : (
                <div style={{ height: 60, width: 120, background: '#FFB94D', color: '#0B0F1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22 }}>
                  SPIN
                </div>
              )}
              <div>
                <p style={{ fontSize: 10, color: '#666', margin: 0 }}>{empresa.razao_social || 'Spin Solar Energias Renováveis Ltda'}</p>
                <p style={{ fontSize: 9, color: '#999', margin: 0 }}>{empresa.telefone || ''} · {empresa.email || ''}</p>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 9, color: '#666' }}>
              <p style={{ margin: 0 }}>Proposta: <strong>{projeto.codigo}</strong></p>
              <p style={{ margin: 0 }}>Emitida em {dataHoje}</p>
              <p style={{ margin: 0 }}>Válida até {validade}</p>
            </div>
          </div>

          <div style={estilos.tituloCentral}>
            <p style={{ fontSize: 14, color: '#FFB94D', fontWeight: 700, margin: '0 0 8px', letterSpacing: 2 }}>PROPOSTA COMERCIAL</p>
            <h1 style={{ fontSize: 42, fontWeight: 900, margin: '0 0 12px', color: '#0B0F1A', lineHeight: 1 }}>
              Sistema Fotovoltaico<br />
              <span style={{ color: '#FFB94D' }}>{(kit.potencia_cc_kwp || 0).toFixed(2)} kWp</span>
            </h1>
            <p style={{ fontSize: 16, color: '#444', margin: 0 }}>Preparada para <strong>{projeto.cliente_razao_social}</strong></p>
          </div>

          <div style={estilos.cardCliente}>
            <h3 style={estilos.cardTitulo}>Dados do Cliente</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 11 }}>
              <div><strong>Razão social:</strong><br />{projeto.cliente_razao_social}</div>
              <div><strong>CPF/CNPJ:</strong><br />{projeto.cliente_cpf_cnpj || '—'}</div>
              <div><strong>WhatsApp:</strong><br />{projeto.cliente_telefone || '—'}</div>
              <div><strong>UC geradora:</strong><br />{projeto.uc_geradora || '—'}</div>
              <div style={{ gridColumn: '1 / 3' }}>
                <strong>Endereço:</strong><br />
                {projeto.cliente_endereco?.logradouro || '—'} · {projeto.cliente_endereco?.cidade || '—'}/{projeto.cliente_endereco?.uf || 'SC'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <Metric label="Potência CC" value={`${(kit.potencia_cc_kwp || 0).toFixed(2)} kWp`} cor="#FFB94D" />
              <Metric label="Geração/mês" value={`${fmtInt(geracaoMesKwh)} kWh`} cor="#5FCF80" />
              <Metric label="Retorno" value={`~ ${roiAnos.toFixed(1)} anos`} cor="#587FFF" />
            </div>
          </div>

          <div style={estilos.rodape}>Página 1 · {empresa.razao_social || 'Spin Solar'}</div>
        </section>

        {/* ============ PÁGINA 2 — SISTEMA TÉCNICO ============ */}
        <section style={estilos.pagina}>
          <div style={estilos.headerPagina}>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#0B0F1A' }}>Sistema fotovoltaico proposto</h2>
            <p style={{ fontSize: 11, color: '#666', margin: '4px 0 0' }}>Componentes técnicos e projeção de geração</p>
          </div>

          {/* Kit principal */}
          <div style={estilos.cardCliente}>
            <h3 style={estilos.cardTitulo}>Composição do kit</h3>
            <table style={estilos.tabela}>
              <thead>
                <tr>
                  <th style={estilos.th}>Componente</th>
                  <th style={{ ...estilos.th, textAlign: 'right' }}>Qtd</th>
                  <th style={estilos.th}>Modelo</th>
                  <th style={{ ...estilos.th, textAlign: 'right' }}>Potência</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={estilos.td}>Módulo fotovoltaico</td>
                  <td style={{ ...estilos.td, textAlign: 'right', fontWeight: 700 }}>{kit.qtd_placas || 0}</td>
                  <td style={estilos.td}>{kit.placa?.modelo || '—'}</td>
                  <td style={{ ...estilos.td, textAlign: 'right' }}>{kit.placa?.potencia_wp || 0} Wp</td>
                </tr>
                <tr>
                  <td style={estilos.td}>Inversor</td>
                  <td style={{ ...estilos.td, textAlign: 'right', fontWeight: 700 }}>{kit.qtd_inversores || 0}</td>
                  <td style={estilos.td}>{kit.inversor?.modelo || '—'}</td>
                  <td style={{ ...estilos.td, textAlign: 'right' }}>{kit.inversor?.potencia_kw || 0} kW</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Estimativas */}
          <div style={{ marginTop: 24 }}>
            <h3 style={estilos.cardTitulo}>Geração estimada</h3>
            <table style={estilos.tabelaLimpa}>
              <tbody>
                <tr><td style={estilos.td}>Potência CC total</td><td style={{ ...estilos.td, textAlign: 'right', fontWeight: 700 }}>{(kit.potencia_cc_kwp || 0).toFixed(2)} kWp</td></tr>
                <tr><td style={estilos.td}>Potência CA total</td><td style={{ ...estilos.td, textAlign: 'right', fontWeight: 700 }}>{(kit.potencia_ca_kw || 0).toFixed(2)} kW</td></tr>
                <tr><td style={estilos.td}>Fator de carregamento (FCI)</td><td style={{ ...estilos.td, textAlign: 'right', fontWeight: 700 }}>{(kit.fci_pct || 0).toFixed(0)}%</td></tr>
                <tr><td style={estilos.td}>Horas de sol pleno/dia (SC)</td><td style={{ ...estilos.td, textAlign: 'right', fontWeight: 700 }}>{HORAS_SOL} h</td></tr>
                <tr><td style={estilos.td}>Perdas assumidas</td><td style={{ ...estilos.td, textAlign: 'right', fontWeight: 700 }}>{(PERDAS * 100).toFixed(0)}%</td></tr>
                <tr style={{ background: '#FFF8E7' }}>
                  <td style={{ ...estilos.td, fontWeight: 700 }}>Geração média mensal</td>
                  <td style={{ ...estilos.td, textAlign: 'right', fontWeight: 900, color: '#B8860B' }}>{fmtInt(geracaoMesKwh)} kWh</td>
                </tr>
                <tr style={{ background: '#FFF8E7' }}>
                  <td style={{ ...estilos.td, fontWeight: 700 }}>Geração anual estimada</td>
                  <td style={{ ...estilos.td, textAlign: 'right', fontWeight: 900, color: '#B8860B' }}>{fmtInt(geracaoAnoKwh)} kWh</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={estilos.rodape}>Página 2 · {empresa.razao_social || 'Spin Solar'}</div>
        </section>

        {/* ============ PÁGINA 3 — INVESTIMENTO ============ */}
        <section style={estilos.pagina}>
          <div style={estilos.headerPagina}>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#0B0F1A' }}>Investimento e formas de pagamento</h2>
            <p style={{ fontSize: 11, color: '#666', margin: '4px 0 0' }}>Kit WEG + materiais + instalação + garantias</p>
          </div>

          {/* Valor total destacado */}
          <div style={{ background: 'linear-gradient(135deg, #FFB94D, #F5A623)', color: '#0B0F1A', padding: '32px 24px', borderRadius: 12, textAlign: 'center', marginBottom: 24 }}>
            <p style={{ fontSize: 12, letterSpacing: 2, margin: '0 0 4px', fontWeight: 700 }}>VALOR TOTAL DA PROPOSTA</p>
            <p style={{ fontSize: 42, fontWeight: 900, margin: 0, lineHeight: 1 }}>R$ {fmt(proposta.pv_total)}</p>
            <p style={{ fontSize: 11, margin: '8px 0 0', opacity: 0.75 }}>Sistema completo — chaves na mão</p>
          </div>

          {/* Formas de pagamento */}
          <h3 style={estilos.cardTitulo}>Formas de pagamento</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            <div style={estilos.cardPagto}>
              <p style={estilos.cardPagtoTitulo}>À vista PIX</p>
              <p style={estilos.cardPagtoValor}>R$ {fmt(proposta.formas_pagamento.a_vista_pix.valor)}</p>
              <p style={estilos.cardPagtoDesc}>{proposta.formas_pagamento.a_vista_pix.desconto_pct}% de desconto</p>
            </div>
            <div style={estilos.cardPagto}>
              <p style={estilos.cardPagtoTitulo}>Cartão em {proposta.formas_pagamento.parcelado_cartao.parcelas}x</p>
              <p style={estilos.cardPagtoValor}>R$ {fmt(proposta.formas_pagamento.parcelado_cartao.valor_parcela)}/mês</p>
              <p style={estilos.cardPagtoDesc}>Total: R$ {fmt(proposta.formas_pagamento.parcelado_cartao.valor_total)}</p>
            </div>
            <div style={estilos.cardPagto}>
              <p style={estilos.cardPagtoTitulo}>Financiado {proposta.formas_pagamento.financiado_estimado.parcelas}x</p>
              <p style={estilos.cardPagtoValor}>R$ {fmt(proposta.formas_pagamento.financiado_estimado.valor_parcela_min)}<br /><span style={{ fontSize: 12 }}>até R$ {fmt(proposta.formas_pagamento.financiado_estimado.valor_parcela_max)}/mês</span></p>
              <p style={estilos.cardPagtoDesc}>Sujeito à análise de crédito</p>
            </div>
          </div>

          {/* Garantias */}
          <div style={{ background: '#F5F5F5', padding: 16, borderRadius: 8, marginBottom: 24 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, margin: '0 0 8px', color: '#0B0F1A' }}>✓ Garantias</h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 10, color: '#333', lineHeight: 1.6 }}>
              <li>Módulos: <strong>25 anos de garantia de geração</strong> (linear WEG)</li>
              <li>Inversor: <strong>10 anos de garantia estendida WEG</strong></li>
              <li>Estrutura: <strong>12 anos anticorrosão</strong></li>
              <li>Instalação e mão-de-obra: <strong>1 ano Spin Solar</strong></li>
            </ul>
          </div>

          {/* Selo Kalebe */}
          <div style={{ marginTop: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderTop: '2px solid #FFB94D', paddingTop: 16 }}>
            <div style={{ fontSize: 10, color: '#333' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Responsável Técnico</p>
              <p style={{ margin: '4px 0 0' }}>{empresa.rt_nome || '—'}</p>
              <p style={{ margin: 0 }}>{empresa.rt_titulo || 'Eletrotécnico'} · CREA/CFT {empresa.rt_crea || '—'}</p>
              <p style={{ margin: 0 }}>{empresa.rt_telefone || ''} · {empresa.rt_email || ''}</p>
            </div>
            {empresa.rt_assinatura_url && (
              <img src={empresa.rt_assinatura_url} alt="Assinatura" style={{ height: 60, objectFit: 'contain' }} crossOrigin="anonymous" />
            )}
          </div>

          <div style={estilos.rodape}>Página 3 · {empresa.razao_social || 'Spin Solar'} · Proposta {projeto.codigo}</div>
        </section>
      </div>
    )
  }
)

PropostaPDFTemplate.displayName = 'PropostaPDFTemplate'

// ==========================================================
// Sub-components
// ==========================================================
function Metric({ label, value, cor }: { label: string; value: string; cor: string }) {
  return (
    <div style={{ background: '#F9F9F9', padding: 16, borderRadius: 8, borderTop: `4px solid ${cor}` }}>
      <p style={{ fontSize: 9, color: '#666', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 900, margin: 0, color: '#0B0F1A' }}>{value}</p>
    </div>
  )
}

// ==========================================================
// Estilos inline (necessário pra html2canvas capturar corretamente)
// ==========================================================
const estilos: Record<string, React.CSSProperties> = {
  pagina: {
    width: 794,
    minHeight: 1123,
    padding: '48px 56px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    position: 'relative',
    boxSizing: 'border-box',
    pageBreakAfter: 'always',
    background: '#fff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '2px solid #EEE',
    paddingBottom: 16,
    marginBottom: 32,
  },
  headerPagina: {
    borderBottom: '2px solid #FFB94D',
    paddingBottom: 12,
    marginBottom: 24,
  },
  tituloCentral: {
    textAlign: 'center' as const,
    padding: '32px 0',
  },
  cardCliente: {
    background: '#F9F9F9',
    padding: 20,
    borderRadius: 8,
    marginTop: 16,
  },
  cardTitulo: {
    fontSize: 13,
    fontWeight: 700,
    margin: '0 0 12px',
    color: '#0B0F1A',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  tabela: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 11,
  },
  tabelaLimpa: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 11,
  },
  th: {
    background: '#0B0F1A',
    color: '#FFB94D',
    padding: '8px 12px',
    textAlign: 'left' as const,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #EEE',
  },
  cardPagto: {
    background: '#F9F9F9',
    padding: 16,
    borderRadius: 8,
    textAlign: 'center' as const,
    border: '1px solid #EEE',
  },
  cardPagtoTitulo: {
    fontSize: 10,
    fontWeight: 700,
    margin: '0 0 8px',
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  cardPagtoValor: {
    fontSize: 18,
    fontWeight: 900,
    margin: '0 0 4px',
    color: '#0B0F1A',
    lineHeight: 1.2,
  },
  cardPagtoDesc: {
    fontSize: 9,
    margin: 0,
    color: '#999',
  },
  rodape: {
    position: 'absolute' as const,
    bottom: 24,
    left: 56,
    right: 56,
    fontSize: 9,
    color: '#999',
    textAlign: 'center' as const,
    paddingTop: 12,
    borderTop: '1px solid #EEE',
  },
}
