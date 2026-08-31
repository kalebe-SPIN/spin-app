'use client'

import { forwardRef } from 'react'
import type { PropostaCalculada } from '@/lib/precificacao/calcular'
import { formatarCpfCnpj, fmtNum } from '@/lib/formatters'

type Props = {
  projeto: any
  proposta: PropostaCalculada
  configEmpresa: any
  listaCa: any[]
  /** Kalebe 2026-08-29: modo kit-por-UC. Se presente, o template ganha
   *  uma seção adicional "Mapa de kits por UC" mostrando todas as UCs
   *  contempladas. O resto do PDF descreve a UC ativa (que o admin
   *  seleciona no OrcamentoClient). */
  modoComposicao?: 'centralizado' | 'por_uc'
  propostasPorUc?: Array<{
    uc_ref: string
    label: string
    endereco_label?: string | null
    endereco_proprio?: boolean
    kit: any
    proposta: PropostaCalculada
  }>
}

/**
 * Template A4 da proposta comercial — Direção A "Manifesto Solar".
 *
 * 3 páginas A4 dark editorial: fundo #050B16, tipografia display Space
 * Grotesk, sol dourado #F5B400 no accent, KPIs em grid com hairlines,
 * assinatura do responsável no rodapé da p.3.
 *
 * Regras fixas aplicadas:
 * - Bloco Cliente exibe SÓ Nome + CPF/CNPJ formatado (endereço/tel/email
 *   ficam no cadastro interno, nunca aparecem no PDF).
 * - Assinatura vem de configuracoes_empresa.rt_assinatura_url (Kalebe).
 *
 * Dimensões A4 em px @ 96 DPI: 794 × 1123.
 */
export const PropostaPDFTemplate = forwardRef<HTMLDivElement, Props>(
  ({ projeto, proposta, configEmpresa, modoComposicao, propostasPorUc }, ref) => {
    const ehPorUc = modoComposicao === 'por_uc' && !!propostasPorUc?.length
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

    // Formato do investimento em milhões/mil pro headline da capa
    const invMil = proposta.pv_total / 1000
    const invHeadline = invMil >= 1000
      ? `R$ ${fmtNum(invMil / 1000, 2)} mi`
      : `R$ ${fmtNum(invMil, 1)} mil`

    // Totais consolidados quando por_uc
    const totalPvUcs = ehPorUc ? (propostasPorUc || []).reduce((s, u) => s + (u.proposta?.pv_total || 0), 0) : 0
    const totalPotenciaUcs = ehPorUc ? (propostasPorUc || []).reduce((s, u) => s + (u.kit?.potencia_cc_kwp || 0), 0) : 0

    return (
      <div ref={ref} style={{ background: '#050B16', color: '#F5F5F0', fontFamily: E.font.body }}>
        {/* ============ PÁGINA EXTRA — MAPA DE KITS POR UC (modo por_uc) ============ */}
        {ehPorUc && (
          <section style={E.pagina}>
            <div style={E.haloCanto} />
            <div style={E.conteudoRel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#D4AF37', margin: 0 }}>
                    Sistema modular · {propostasPorUc?.length} UCs
                  </p>
                  <h1 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.05, margin: '8px 0 4px', color: '#F5F5F0' }}>
                    Um sistema<br/>por unidade
                  </h1>
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: '#F5F5F0AA' }}>
                  <p style={{ margin: 0 }}>{projeto.codigo}</p>
                  <p style={{ margin: '4px 0 0' }}>{dataHoje}</p>
                </div>
              </div>

              <p style={{ fontSize: 14, color: '#F5F5F0BB', lineHeight: 1.5, marginBottom: 24 }}>
                {projeto.cliente_razao_social}, o sistema foi dimensionado com um kit dedicado
                pra cada uma das {propostasPorUc?.length} unidades consumidoras. Cada UC tem
                sua própria capacidade, projeto e proteções — abaixo o mapa consolidado.
              </p>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #D4AF3760' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#D4AF37', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>UC</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#D4AF37', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Endereço</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', color: '#D4AF37', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Placas</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', color: '#D4AF37', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Potência</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', color: '#D4AF37', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Investimento</th>
                  </tr>
                </thead>
                <tbody>
                  {(propostasPorUc || []).map((u) => (
                    <tr key={u.uc_ref} style={{ borderBottom: '1px solid #F5F5F015' }}>
                      <td style={{ padding: '12px 8px', color: '#F5F5F0' }}>{u.label}</td>
                      <td style={{ padding: '12px 8px', color: '#F5F5F0AA' }}>
                        {u.endereco_proprio && u.endereco_label ? u.endereco_label : 'Mesmo endereço da UC principal'}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', color: '#F5F5F0' }}>{u.kit?.qtd_placas || 0}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', color: '#F5F5F0' }}>{fmtNum(u.kit?.potencia_cc_kwp || 0, 2)} kWp</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', color: '#D4AF37', fontWeight: 700 }}>R$ {fmt(u.proposta?.pv_total || 0)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #D4AF37' }}>
                    <td style={{ padding: '16px 8px', color: '#F5F5F0', fontWeight: 800, fontSize: 13 }} colSpan={3}>TOTAL</td>
                    <td style={{ padding: '16px 8px', textAlign: 'right', color: '#F5F5F0', fontWeight: 800, fontSize: 13 }}>{fmtNum(totalPotenciaUcs, 2)} kWp</td>
                    <td style={{ padding: '16px 8px', textAlign: 'right', color: '#D4AF37', fontWeight: 900, fontSize: 15 }}>R$ {fmt(totalPvUcs)}</td>
                  </tr>
                </tbody>
              </table>

              <p style={{ fontSize: 11, color: '#F5F5F088', marginTop: 32, lineHeight: 1.6 }}>
                As páginas a seguir descrevem em detalhe o sistema da UC principal.
                Para o detalhamento técnico de cada UC secundária, entre em contato — o
                projeto executivo é individualizado.
              </p>
            </div>
          </section>
        )}

        {/* ============ PÁGINA 1 — MANIFESTO ============ */}
        <section style={E.pagina}>
          {/* Halo dourado no canto sup direito */}
          <div style={E.haloCanto} />

          <div style={E.conteudoRel}>
            {/* Header — logo/empresa + código proposta */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {empresa.logo_url ? (
                  <img src={empresa.logo_url} alt="Spin" style={{ height: 40, objectFit: 'contain' }} crossOrigin="anonymous" />
                ) : (
                  <div style={E.logoBox}>S</div>
                )}
                <div>
                  <p style={E.tituloEmpresa}>SPIN SOLAR</p>
                  <p style={E.subEmpresa}>
                    {empresa.razao_social || 'Energias Renováveis Ltda'}
                    {empresa.cnpj ? ` · CNPJ ${empresa.cnpj}` : ' · CNPJ 22.279.642/0001-04'}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={E.rotuloDourado}>Proposta</p>
                <p style={E.codigoProposta}>{projeto.codigo}</p>
              </div>
            </div>

            {/* Rail vertical — data emissão/validade */}
            <div style={E.railVertical}>
              Emitida {dataHoje.replace(/\//g, '.')} · Válida até {validade.replace(/\//g, '.')}
            </div>

            {/* Título gigante */}
            <div style={{ marginTop: 88 }}>
              <p style={{ ...E.rotuloDourado, fontSize: 11, letterSpacing: 4, marginBottom: 12 }}>
                Proposta comercial
              </p>
              <h1 style={E.tituloManifesto}>
                Um sistema<br />
                <span style={{ color: '#F5B400' }}>fotovoltaico</span><br />
                pra você deixar<br />
                de pagar CELESC.
              </h1>
            </div>

            {/* Cliente + sistema em grid */}
            <div style={E.blocoDados}>
              <div>
                <p style={E.rotuloMini}>Cliente</p>
                <p style={E.nomeCliente}>{projeto.cliente_razao_social || '—'}</p>
                <p style={E.docCliente}>
                  {projeto.cliente_cpf_cnpj
                    ? `CPF/CNPJ ${formatarCpfCnpj(String(projeto.cliente_cpf_cnpj))}`
                    : ''}
                </p>
              </div>
              <div>
                <p style={E.rotuloMini}>Sistema proposto</p>
                {/* Potência CC total + composição da placa */}
                <p style={{ margin: 0, fontFamily: E.font.display, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: '#F5F5F0' }}>
                  {fmtNum(kit.potencia_cc_kwp || 0, 2)} <span style={{ fontSize: 14, color: 'rgba(245,245,240,.6)', fontWeight: 500 }}>kWp CC</span>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(245,245,240,.75)', fontWeight: 500 }}>
                  {kit.qtd_placas || 0}× {kit.placa?.modelo || 'placa'} ({(kit.placa?.potencia_wp || 0)} Wp)
                </p>
                {/* Potência CA total + composição do(s) inversor(es) */}
                <p style={{ margin: '10px 0 0', fontFamily: E.font.display, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: '#F5F5F0' }}>
                  {fmtNum(kit.potencia_ca_kw || 0, 2)} <span style={{ fontSize: 14, color: 'rgba(245,245,240,.6)', fontWeight: 500 }}>kW CA</span>
                </p>
                {(Array.isArray(kit.inversores) && kit.inversores.length > 0)
                  ? kit.inversores.map((inv: any, i: number) => (
                      <p key={i} style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(245,245,240,.75)', fontWeight: 500 }}>
                        {inv.qtd || 1}× {inv.modelo} ({inv.potencia_kw} kW)
                      </p>
                    ))
                  : (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(245,245,240,.75)', fontWeight: 500 }}>
                      {kit.qtd_inversores || 1}× {kit.inversor?.modelo || 'inversor'} ({kit.inversor?.potencia_kw || 0} kW)
                    </p>
                  )}
              </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Métricas grandes com hairlines */}
            <div style={E.metricasGrid}>
              <MetricManifesto label="Potência" valor={fmtNum(kit.potencia_cc_kwp || 0, 2)} unidade="kWp" />
              <MetricManifesto label="Geração/mês" valor={fmtInt(geracaoMesKwh)} unidade="kWh" cor="#F5B400" borda />
              <MetricManifesto label="Retorno" valor={fmtNum(roiAnos, 1)} unidade="anos" borda />
              <MetricManifesto label="Investimento" valor={invHeadline.replace('R$ ', '')} unidade="chaves na mão" prefixo="R$" />
            </div>

            <div style={E.rodapeManifesto}>
              <span>Página 1 de 3</span>
              <span>Kit WEG homologado · Instalação Spin</span>
            </div>
          </div>
        </section>

        {/* ============ PÁGINA 2 — SISTEMA TÉCNICO ============ */}
        <section style={E.pagina}>
          <div style={E.conteudoRel}>
            <div style={E.headerSecao}>
              <p style={{ ...E.rotuloDourado, fontSize: 10, letterSpacing: 3 }}>02 · Sistema técnico</p>
              <h2 style={E.tituloSecao}>Composição e projeção de geração</h2>
            </div>

            {/* Composição do kit */}
            <h3 style={E.subtituloSecao}>Composição do kit</h3>
            <table style={E.tabela}>
              <thead>
                <tr>
                  <th style={E.th}>Componente</th>
                  <th style={{ ...E.th, textAlign: 'right' }}>Qtd</th>
                  <th style={E.th}>Modelo</th>
                  <th style={{ ...E.th, textAlign: 'right' }}>Potência</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={E.td}>Módulo fotovoltaico</td>
                  <td style={{ ...E.td, textAlign: 'right', color: '#F5B400', fontWeight: 700, paddingRight: 14 }}>{kit.qtd_placas || 0}</td>
                  <td style={{ ...E.td, paddingLeft: 14 }}>{kit.placa?.modelo || '—'}</td>
                  <td style={{ ...E.td, textAlign: 'right' }}>{kit.placa?.potencia_wp || 0} Wp</td>
                </tr>
                {(Array.isArray(kit.inversores) && kit.inversores.length > 0)
                  ? kit.inversores.map((inv: any, i: number) => {
                      const isMicro = /^SIW100/i.test(inv.modelo || '')
                      return (
                        <tr key={i}>
                          <td style={E.td}>{isMicro ? 'Microinversor' : 'Inversor'}{i > 0 ? '' : ''}</td>
                          <td style={{ ...E.td, textAlign: 'right', color: '#F5B400', fontWeight: 700, paddingRight: 14 }}>{inv.qtd || 1}</td>
                          <td style={{ ...E.td, paddingLeft: 14 }}>{inv.modelo || '—'}</td>
                          <td style={{ ...E.td, textAlign: 'right' }}>{inv.potencia_kw || 0} kW</td>
                        </tr>
                      )
                    })
                  : (
                    <tr>
                      <td style={E.td}>Inversor</td>
                      <td style={{ ...E.td, textAlign: 'right', color: '#F5B400', fontWeight: 700, paddingRight: 14 }}>{kit.qtd_inversores || 0}</td>
                      <td style={{ ...E.td, paddingLeft: 14 }}>{kit.inversor?.modelo || '—'}</td>
                      <td style={{ ...E.td, textAlign: 'right' }}>{kit.inversor?.potencia_kw || 0} kW</td>
                    </tr>
                  )}
              </tbody>
            </table>

            {/* Perfil de consumo (histórico da fatura CELESC + gráfico) */}
            <PerfilConsumo analise={projeto.analise_fatura} />

            {/* Geração estimada */}
            <h3 style={{ ...E.subtituloSecao, marginTop: 40 }}>Geração estimada</h3>
            <div style={E.gridDados}>
              <DadoLinha rot="Potência CC total" val={`${fmtNum(kit.potencia_cc_kwp || 0, 2)} kWp`} />
              <DadoLinha rot="Potência CA total" val={`${fmtNum(kit.potencia_ca_kw || 0, 2)} kW`} />
              <DadoLinha rot="Fator de carregamento (FCI)" val={`${fmtNum(kit.fci_pct || 0, 0)}%`} />
              <DadoLinha rot="Horas de sol pleno/dia (SC)" val={`${HORAS_SOL} h`} />
              <DadoLinha rot="Perdas assumidas" val={`${fmtNum(PERDAS * 100, 0)}%`} />
            </div>

            <div style={E.destaqueGeracao}>
              <div>
                <p style={E.rotuloDourado}>Geração média mensal</p>
                <p style={E.valorGigante}>{fmtInt(geracaoMesKwh)} <span style={{ fontSize: 20, color: 'rgba(245,245,240,.6)' }}>kWh</span></p>
              </div>
              <div style={{ borderLeft: '1px solid rgba(245,180,0,.25)', paddingLeft: 24 }}>
                <p style={E.rotuloDourado}>Geração anual estimada</p>
                <p style={E.valorGigante}>{fmtInt(geracaoAnoKwh)} <span style={{ fontSize: 20, color: 'rgba(245,245,240,.6)' }}>kWh</span></p>
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={E.rodapeManifesto}>
              <span>Página 2 de 3</span>
              <span>Spin Solar · Proposta {projeto.codigo}</span>
            </div>
          </div>
        </section>

        {/* ============ PÁGINA 3 — INVESTIMENTO ============ */}
        <section style={E.pagina}>
          <div style={E.conteudoRel}>
            <div style={E.headerSecao}>
              <p style={{ ...E.rotuloDourado, fontSize: 10, letterSpacing: 3 }}>03 · Investimento</p>
              <h2 style={E.tituloSecao}>Valor total e formas de pagamento</h2>
            </div>

            {/* Valor gigante em bloco dourado */}
            <div style={E.blocoValor}>
              <p style={E.rotuloValorTotal}>Valor total da proposta</p>
              <p style={E.valorTotal}>R$ {fmt(proposta.pv_total)}</p>
              <p style={E.subValor}>Sistema completo · chaves na mão · kit WEG + materiais + instalação</p>
            </div>

            {/* Formas de pagamento */}
            <h3 style={E.subtituloSecao}>Formas de pagamento</h3>
            <div style={E.grid3}>
              <CardPgto
                titulo="À vista PIX"
                valor={`R$ ${fmt(proposta.formas_pagamento.a_vista_pix.valor)}`}
                sub={`${proposta.formas_pagamento.a_vista_pix.desconto_pct}% de desconto`}
                destaque
              />
              <CardPgto
                titulo={`Cartão em ${proposta.formas_pagamento.parcelado_cartao.parcelas}×`}
                valor={`R$ ${fmt(proposta.formas_pagamento.parcelado_cartao.valor_parcela)}/mês`}
                sub={`Total: R$ ${fmt(proposta.formas_pagamento.parcelado_cartao.valor_total)}`}
              />
              <CardPgto
                titulo={`Financiado ${proposta.formas_pagamento.financiado_estimado.parcelas}×`}
                valor={`R$ ${fmt(proposta.formas_pagamento.financiado_estimado.valor_parcela_min)}`}
                sub={`até R$ ${fmt(proposta.formas_pagamento.financiado_estimado.valor_parcela_max)}/mês · sujeito à análise`}
              />
            </div>

            {/* Garantias — barra dourada minimalista */}
            <div style={E.blocoGarantias}>
              <p style={{ ...E.rotuloDourado, marginBottom: 12 }}>Garantias inclusas</p>
              <div style={E.gridDados}>
                <DadoLinha rot="Módulos WEG" val="25 anos de geração linear" />
                <DadoLinha rot="Inversor WEG" val="10 anos estendida" />
                <DadoLinha rot="Estrutura" val="12 anos anticorrosão" />
                <DadoLinha rot="Instalação Spin" val="1 ano de mão de obra" />
              </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Aceite e assinaturas — cartão branco pra dar leitura de "documento
                oficial" no meio da paleta dark. Bloco Spin (Kalebe, com scan) +
                bloco Cliente (linha vazia pra assinar). */}
            <div style={E.blocoAssinaturaCard}>
              <div style={E.tituloAceite}>
                <span style={E.rotuloAceiteDourado}>Aceite e assinaturas</span>
                <span style={E.dataAceite}>
                  {projeto.cliente_endereco?.cidade || 'Tijucas'}/{projeto.cliente_endereco?.uf || 'SC'}, {dataHoje}
                </span>
              </div>

              <div style={E.gridAssinaturas}>
                {/* Spin — Kalebe */}
                <div style={E.blocoAssinaturaLado}>
                  <div style={E.espacoScan}>
                    {empresa.rt_assinatura_url && (
                      <img
                        src={empresa.rt_assinatura_url}
                        alt="Assinatura Kalebe"
                        style={E.imgAssinatura}
                        crossOrigin="anonymous"
                      />
                    )}
                  </div>
                  <div style={E.linhaAssinaturaBranca} />
                  <p style={E.nomeAssinaturaEscuro}>{empresa.rt_nome || 'Kalebe Grün'}</p>
                  <p style={E.cargoAssinaturaEscuro}>Diretor comercial · Spin Solar</p>
                  <p style={E.docAssinaturaEscuro}>CNPJ 22.279.642/0001-04</p>
                </div>

                {/* Cliente */}
                <div style={E.blocoAssinaturaLado}>
                  <div style={E.espacoScan} />
                  <div style={E.linhaAssinaturaBranca} />
                  <p style={E.nomeAssinaturaEscuro}>{projeto.cliente_razao_social || '—'}</p>
                  <p style={E.cargoAssinaturaEscuro}>Cliente · Tomador</p>
                  <p style={E.docAssinaturaEscuro}>
                    {projeto.cliente_cpf_cnpj
                      ? `CPF/CNPJ ${formatarCpfCnpj(String(projeto.cliente_cpf_cnpj))}`
                      : 'CPF/CNPJ ______________________'}
                  </p>
                </div>
              </div>
            </div>

            <div style={E.rodapeManifesto}>
              <span>Página 3 de 3</span>
              <span>Assinado digitalmente · {dataHoje}</span>
            </div>
          </div>
        </section>
      </div>
    )
  }
)

PropostaPDFTemplate.displayName = 'PropostaPDFTemplate'

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════
function MetricManifesto({ label, valor, unidade, cor, prefixo, borda }: {
  label: string
  valor: string
  unidade: string
  cor?: string
  prefixo?: string
  borda?: boolean
}) {
  return (
    <div style={{ padding: borda ? '0 20px' : 0, borderRight: borda ? '1px solid rgba(245,245,240,.08)' : 'none', paddingRight: 20 }}>
      <p style={{ margin: '0 0 4px', fontSize: 9, letterSpacing: 2, color: 'rgba(245,245,240,.5)', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontFamily: E.font.display, fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: cor || '#F5F5F0' }}>
        {prefixo && <span style={{ fontSize: 16, marginRight: 4 }}>{prefixo}</span>}
        {valor}
        <span style={{ fontSize: 14, color: 'rgba(245,245,240,.6)', fontWeight: 500 }}> {unidade}</span>
      </p>
    </div>
  )
}

/**
 * Bloco "Perfil de consumo" da proposta — resumo dos números da fatura
 * CELESC (média, total anual, mês pico/vale) + gráfico SVG dos 12 meses
 * com linha da média. Kalebe 2026-08-27: mostra o consumo pra reforçar
 * o dimensionamento na hora da venda.
 *
 * Só renderiza se analise_fatura tem histórico com ≥ 1 mês de dados.
 */
function PerfilConsumo({ analise }: { analise: any }) {
  const historico: Array<{ mes_ano: string; consumo_kwh: number | string }> =
    Array.isArray(analise?.historico_12_meses) ? analise.historico_12_meses : []
  const pontos = historico
    .map((h) => ({ mes_ano: h.mes_ano, consumo_kwh: Number(h.consumo_kwh) || 0 }))
    .filter((p) => p.consumo_kwh > 0)

  if (pontos.length === 0) return null

  const media = Number(analise?.consumo_medio_kwh) || (pontos.reduce((s, p) => s + p.consumo_kwh, 0) / pontos.length)
  const maxReal = Math.max(...pontos.map((p) => p.consumo_kwh))
  const minReal = Math.min(...pontos.map((p) => p.consumo_kwh))
  const totalAno = pontos.reduce((s, p) => s + p.consumo_kwh, 0)
  const pico = pontos.find((p) => p.consumo_kwh === maxReal)
  const vale = pontos.find((p) => p.consumo_kwh === minReal)

  // Dimensões SVG compactas pra caber no A4
  const W = 640, H = 200
  const pL = 40, pR = 12, pT = 16, pB = 32
  const plotW = W - pL - pR
  const plotH = H - pT - pB
  const maxKwh = Math.max(maxReal, media) * 1.1
  const yPx = (kwh: number) => pT + plotH - (kwh / maxKwh) * plotH
  const xPx = (idx: number) => pL + (pontos.length > 1 ? (idx / (pontos.length - 1)) * plotW : plotW / 2)
  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPx(i)} ${yPx(p.consumo_kwh)}`).join(' ')
  const yTicks = [0, 0.33, 0.66, 1].map((f) => Math.round(maxKwh * f))

  return (
    <div style={{ marginTop: 40 }}>
      <h3 style={E.subtituloSecao}>Perfil de consumo</h3>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'rgba(245,245,240,.7)', lineHeight: 1.5 }}>
        Base pra dimensionar o sistema. Extraído do histórico dos últimos {pontos.length} meses da fatura CELESC.
      </p>

      {/* 4 números-chave em grid */}
      <div style={{ display: 'grid' as const, gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <NumConsumo label="Média/mês" valor={Math.round(media)} unidade="kWh" destaque />
        <NumConsumo label="Total anual" valor={Math.round(totalAno)} unidade="kWh" />
        <NumConsumo label={`Pico · ${pico?.mes_ano || ''}`} valor={Math.round(maxReal)} unidade="kWh" />
        <NumConsumo label={`Vale · ${vale?.mes_ano || ''}`} valor={Math.round(minReal)} unidade="kWh" />
      </div>

      {/* Gráfico SVG puro do consumo mês a mês com linha da média */}
      <div style={{ background: 'rgba(245,245,240,.03)', border: '1px solid rgba(245,245,240,.08)', borderRadius: 4, padding: 10 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          {/* Grid horizontal */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={pL} y1={yPx(tick)} x2={W - pR} y2={yPx(tick)}
                stroke="rgba(245,245,240,0.08)" strokeWidth={1} />
              <text x={pL - 6} y={yPx(tick) + 3} fontSize={9}
                fill="rgba(245,245,240,0.5)" textAnchor="end"
                fontFamily='"Inter", system-ui, sans-serif'>
                {tick}
              </text>
            </g>
          ))}

          {/* Área sob a curva */}
          <path d={`${linha} L ${xPx(pontos.length - 1)} ${yPx(0)} L ${xPx(0)} ${yPx(0)} Z`}
            fill="rgba(88,127,255,0.10)" />

          {/* Linha da média */}
          <line x1={pL} y1={yPx(media)} x2={W - pR} y2={yPx(media)}
            stroke="#F5B400" strokeWidth={1.5} strokeDasharray="5 3" />
          <text x={W - pR - 4} y={yPx(media) - 4} fontSize={9}
            fill="#F5B400" textAnchor="end" fontWeight={700}
            fontFamily='"Inter", system-ui, sans-serif'>
            Média {Math.round(media)} kWh
          </text>

          {/* Linha do consumo */}
          <path d={linha} fill="none" stroke="#587FFF" strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Pontos + valores */}
          {pontos.map((p, i) => {
            const cx = xPx(i)
            const cy = yPx(p.consumo_kwh)
            const acima = p.consumo_kwh > media
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={2.5} fill="#587FFF" />
                <text x={cx} y={acima ? cy - 6 : cy + 12} fontSize={8}
                  fill="rgba(245,245,240,0.75)" textAnchor="middle"
                  fontFamily='"Inter", system-ui, sans-serif'>
                  {Math.round(p.consumo_kwh)}
                </text>
              </g>
            )
          })}

          {/* Rótulos do eixo X */}
          {pontos.map((p, i) => (
            <text key={i} x={xPx(i)} y={H - pB + 14} fontSize={8}
              fill="rgba(245,245,240,0.5)" textAnchor="middle"
              fontFamily='"Inter", system-ui, sans-serif'>
              {p.mes_ano}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

function NumConsumo({ label, valor, unidade, destaque }: {
  label: string; valor: number; unidade: string; destaque?: boolean
}) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 4,
      background: destaque ? 'rgba(245,180,0,.08)' : 'rgba(245,245,240,.03)',
      border: `1px solid ${destaque ? 'rgba(245,180,0,.3)' : 'rgba(245,245,240,.08)'}`,
    }}>
      <p style={{ margin: '0 0 4px', fontSize: 8, letterSpacing: 1.5,
        color: destaque ? '#F5B400' : 'rgba(245,245,240,.5)',
        textTransform: 'uppercase' as const, fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 18, fontWeight: 700, color: '#F5F5F0', letterSpacing: '-0.01em' }}>
        {valor.toLocaleString('pt-BR')}
        <span style={{ fontSize: 10, color: 'rgba(245,245,240,.6)', fontWeight: 500 }}> {unidade}</span>
      </p>
    </div>
  )
}

function DadoLinha({ rot, val }: { rot: string; val: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(245,245,240,.06)' }}>
      <span style={{ fontSize: 11, color: 'rgba(245,245,240,.6)' }}>{rot}</span>
      <span style={{ fontSize: 12, color: '#F5F5F0', fontWeight: 600 }}>{val}</span>
    </div>
  )
}

function CardPgto({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub: string; destaque?: boolean }) {
  return (
    <div style={{
      background: destaque ? 'rgba(245,180,0,.08)' : 'rgba(245,245,240,.03)',
      border: `1px solid ${destaque ? 'rgba(245,180,0,.35)' : 'rgba(245,245,240,.10)'}`,
      padding: 18,
      borderRadius: 4,
    }}>
      <p style={{ margin: '0 0 8px', fontSize: 10, letterSpacing: 1.5, color: destaque ? '#F5B400' : 'rgba(245,245,240,.5)', textTransform: 'uppercase', fontWeight: 700 }}>
        {titulo}
      </p>
      <p style={{ margin: '0 0 6px', fontFamily: E.font.display, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: '#F5F5F0', lineHeight: 1.2 }}>
        {valor}
      </p>
      <p style={{ margin: 0, fontSize: 10, color: 'rgba(245,245,240,.5)' }}>{sub}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Estilos (Direção A — Manifesto Solar)
// ═══════════════════════════════════════════════════════════════════
const E = {
  font: {
    display: '"Space Grotesk", system-ui, sans-serif',
    body: '"Inter", system-ui, -apple-system, sans-serif',
  },
  pagina: {
    width: 794,
    minHeight: 1123,
    background: '#050B16',
    color: '#F5F5F0',
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
    pageBreakAfter: 'always' as const,
    overflow: 'hidden' as const,
  },
  haloCanto: {
    position: 'absolute' as const,
    top: -200,
    right: -200,
    width: 600,
    height: 600,
    background: 'radial-gradient(circle, rgba(245,180,0,0.16) 0%, rgba(245,180,0,0) 60%)',
    pointerEvents: 'none' as const,
  },
  conteudoRel: {
    position: 'relative' as const,
    padding: '56px 64px',
    minHeight: 1123,
    boxSizing: 'border-box' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  logoBox: {
    width: 36,
    height: 36,
    background: '#F5B400',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontFamily: '"Space Grotesk", sans-serif',
    fontWeight: 700,
    fontSize: 18,
    color: '#050B16',
  },
  tituloEmpresa: { margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#F5F5F0' },
  subEmpresa: { margin: 0, fontSize: 9, color: 'rgba(245,245,240,.5)', letterSpacing: 0.5 },
  rotuloDourado: {
    margin: 0,
    fontSize: 9,
    color: '#F5B400',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    fontWeight: 600,
  },
  rotuloMini: {
    margin: '0 0 4px',
    fontSize: 9,
    color: 'rgba(245,245,240,.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: 2,
    fontWeight: 600,
  },
  codigoProposta: {
    margin: '2px 0 0',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: '#F5B400',
  },
  railVertical: {
    position: 'absolute' as const,
    left: 24,
    top: 200,
    transform: 'rotate(-90deg)',
    transformOrigin: 'left top',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 4,
    color: 'rgba(245,245,240,.35)',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },
  tituloManifesto: {
    margin: 0,
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 76,
    fontWeight: 700,
    lineHeight: 0.94,
    letterSpacing: '-0.045em',
    color: '#F5F5F0',
  },
  blocoDados: {
    marginTop: 48,
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr',
    gap: 32,
    paddingTop: 20,
    borderTop: '1px solid rgba(245,245,240,.12)',
  },
  nomeCliente: {
    margin: 0,
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 20,
    fontWeight: 600,
    color: '#F5F5F0',
    lineHeight: 1.25,
  },
  docCliente: {
    margin: '6px 0 0',
    fontSize: 11,
    color: 'rgba(245,245,240,.6)',
  },
  metricasGrid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 0,
    borderTop: '1px solid rgba(245,245,240,.12)',
    paddingTop: 24,
  },
  rodapeManifesto: {
    marginTop: 24,
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    fontSize: 9,
    color: 'rgba(245,245,240,.35)',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  headerSecao: {
    paddingBottom: 20,
    borderBottom: '1px solid rgba(245,180,0,.25)',
    marginBottom: 32,
  },
  tituloSecao: {
    margin: '8px 0 0',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    color: '#F5F5F0',
  },
  subtituloSecao: {
    margin: '0 0 12px',
    fontSize: 10,
    color: 'rgba(245,245,240,.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: 2,
    fontWeight: 700,
  },
  tabela: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 12,
  },
  th: {
    padding: '10px 0',
    textAlign: 'left' as const,
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 9,
    color: 'rgba(245,245,240,.5)',
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    borderTop: '1px solid rgba(245,245,240,.20)',
    borderBottom: '1px solid rgba(245,245,240,.20)',
  },
  td: {
    padding: '12px 0',
    borderBottom: '1px solid rgba(245,245,240,.08)',
    color: '#F5F5F0',
  },
  gridDados: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr',
    gap: '0 32px',
  },
  destaqueGeracao: {
    marginTop: 24,
    padding: '20px 24px',
    background: 'rgba(245,180,0,.06)',
    border: '1px solid rgba(245,180,0,.25)',
    borderRadius: 4,
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
  },
  valorGigante: {
    margin: '4px 0 0',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: '#F5B400',
  },
  blocoValor: {
    padding: '36px 24px',
    background: 'linear-gradient(135deg, rgba(245,180,0,.15), rgba(245,180,0,.05))',
    border: '1px solid rgba(245,180,0,.35)',
    borderRadius: 4,
    textAlign: 'center' as const,
    marginBottom: 32,
  },
  rotuloValorTotal: {
    margin: '0 0 8px',
    fontSize: 11,
    letterSpacing: 3,
    color: '#F5B400',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
  },
  valorTotal: {
    margin: 0,
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 56,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    color: '#F5F5F0',
    lineHeight: 1,
  },
  subValor: {
    margin: '12px 0 0',
    fontSize: 11,
    color: 'rgba(245,245,240,.7)',
  },
  grid3: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 32,
  },
  blocoGarantias: {
    padding: '20px 24px',
    background: 'rgba(245,245,240,.03)',
    border: '1px solid rgba(245,245,240,.08)',
    borderRadius: 4,
  },
  blocoAssinatura: {
    marginTop: 40,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
  },
  linhaAssinatura: {
    borderTop: '1px solid rgba(245,245,240,.5)',
    width: 280,
    marginTop: 4,
    paddingTop: 6,
  },
  nomeAssinatura: {
    margin: '4px 0 0',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 14,
    fontWeight: 600,
    color: '#F5F5F0',
  },
  cargoAssinatura: {
    margin: '2px 0 0',
    fontSize: 10,
    color: 'rgba(245,245,240,.6)',
  },
  emailAssinatura: {
    margin: '2px 0 0',
    fontSize: 10,
    color: 'rgba(245,245,240,.45)',
  },
  // ═══ Cartão branco de aceite/assinaturas ═══
  blocoAssinaturaCard: {
    marginTop: 32,
    background: '#FFFFFF',
    color: '#050B16',
    padding: '28px 32px 32px',
    borderRadius: 4,
    boxShadow: '0 8px 32px rgba(245,180,0,0.08)',
    border: '1px solid rgba(245,180,0,.3)',
  },
  tituloAceite: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    paddingBottom: 16,
    marginBottom: 24,
    borderBottom: '1px solid rgba(5,11,22,.08)',
  },
  rotuloAceiteDourado: {
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: '#B8860B',
  },
  dataAceite: {
    fontSize: 10,
    color: 'rgba(5,11,22,.55)',
    fontStyle: 'italic' as const,
  },
  gridAssinaturas: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr',
    gap: 48,
  },
  blocoAssinaturaLado: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
  },
  espacoScan: {
    height: 72,
    width: '100%',
    display: 'flex' as const,
    alignItems: 'flex-end' as const,
    marginBottom: -12,
  },
  imgAssinatura: {
    height: 68,
    objectFit: 'contain' as const,
    filter: 'contrast(1.15) brightness(0.85)',
    // sem invert — fundo agora é branco, assinatura preta natural
  },
  linhaAssinaturaBranca: {
    width: '100%',
    borderTop: '1.5px solid #050B16',
    marginTop: 4,
    paddingTop: 8,
  },
  nomeAssinaturaEscuro: {
    margin: 0,
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: '#050B16',
  },
  cargoAssinaturaEscuro: {
    margin: '3px 0 0',
    fontSize: 10,
    color: 'rgba(5,11,22,.65)',
    fontWeight: 500,
  },
  docAssinaturaEscuro: {
    margin: '2px 0 0',
    fontSize: 10,
    color: 'rgba(5,11,22,.45)',
  },
}
