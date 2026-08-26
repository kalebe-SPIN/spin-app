'use client'

import { forwardRef } from 'react'
import { formatarCpfCnpj, fmtNum } from '@/lib/formatters'

type Props = {
  projeto: any
  selecao: any        // projeto.ve_recarga_selecionada
  configEmpresa: any
}

/**
 * Template A4 da proposta comercial da ESTAÇÃO DE RECARGA VE.
 *
 * 3 páginas A4 seguindo o padrão Direção A "Manifesto Solar" (mesmo que
 * o fotovoltaico usa), mas com blocos específicos:
 * - Página 1: Capa Manifesto VE
 * - Página 2: Composição — Equipamentos + Lista de Materiais + Serviços
 *             (incluindo Diagrama Unifilar/Trifilar quando marcados)
 * - Página 3: Investimento + Garantias + Assinaturas
 *
 * Dimensões A4 em px @ 96 DPI: 794 × 1123.
 */
export const PropostaVEPDFTemplate = forwardRef<HTMLDivElement, Props>(
  ({ projeto, selecao, configEmpresa }, ref) => {
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const empresa = configEmpresa || {}
    const dataHoje = new Date().toLocaleDateString('pt-BR')
    const validade = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')

    const equipamentos: any[] = selecao?.equipamentos || []
    const itensCA: any[] = selecao?.itens_ca || []
    const mao = selecao?.mao_obra || {}
    const totalCliente = Number(selecao?.preco_final_cliente || 0)
    const potenciaTotal = equipamentos.reduce((s, e) => s + (Number(e.potencia_kw || 0) * (Number(e.qtd || 1))), 0)
    const potenciaHeadline = potenciaTotal || Number(selecao?.potencia_efetiva_kw || 0)

    const incluiUni = selecao?.inclui_diagrama_unifilar
    const incluiTri = selecao?.inclui_diagrama_trifilar
    const valorUni = Number(selecao?.valor_diagrama_unifilar || 0)
    const valorTri = Number(selecao?.valor_diagrama_trifilar || 0)

    const precoAlv = Number(selecao?.preco_alvenaria_total || 0)
    const precoEle = Number(selecao?.preco_eletrica_total || 0)
    const precoDesloc = Number(selecao?.preco_deslocamento_total || 0)
    const kmTotal = Number(selecao?.deslocamento_km_total || 0)
    const rsKm = Number(selecao?.deslocamento_rs_km || 2.5)

    const invMil = totalCliente / 1000
    const invHeadline = invMil >= 1000
      ? `R$ ${fmtNum(invMil / 1000, 2)} mi`
      : `R$ ${fmtNum(invMil, 1)} mil`

    return (
      <div ref={ref} style={{ background: '#050B16', color: '#F5F5F0', fontFamily: E.font.body }}>
        {/* ============ PÁGINA 1 — MANIFESTO VE ============ */}
        <section style={E.pagina}>
          <div style={E.haloCanto} />
          <div style={E.conteudoRel}>
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
                <p style={E.rotuloDourado}>Proposta VE</p>
                <p style={E.codigoProposta}>{projeto.codigo}</p>
              </div>
            </div>

            <div style={E.railVertical}>
              Emitida {dataHoje.replace(/\//g, '.')} · Válida até {validade.replace(/\//g, '.')}
            </div>

            <div style={{ marginTop: 88 }}>
              <p style={{ ...E.rotuloDourado, fontSize: 11, letterSpacing: 4, marginBottom: 12 }}>
                Proposta comercial · Estação de recarga
              </p>
              <h1 style={E.tituloManifesto}>
                Sua estação<br />
                <span style={{ color: '#F5B400' }}>de recarga</span><br />
                pra rodar<br />
                a energia do sol.
              </h1>
            </div>

            <div style={E.blocoDados}>
              <div>
                <p style={E.rotuloMini}>Cliente</p>
                <p style={E.nomeCliente}>{projeto.cliente_razao_social || '—'}</p>
                <p style={E.docCliente}>
                  {projeto.cliente_cpf_cnpj ? `CPF/CNPJ ${formatarCpfCnpj(String(projeto.cliente_cpf_cnpj))}` : ''}
                </p>
              </div>
              <div>
                <p style={E.rotuloMini}>Estação proposta</p>
                <p style={E.nomeCliente}>
                  {equipamentos.length} equipamento(s) WEG<br />
                  <span style={{ fontSize: 14, color: 'rgba(245,245,240,.7)', fontWeight: 500 }}>
                    Linha WEMOB · potência {fmtNum(potenciaHeadline, 1)} kW
                  </span>
                </p>
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={E.metricasGrid}>
              <MetricM label="Potência" valor={fmtNum(potenciaHeadline, 1)} unidade="kW" />
              <MetricM label="Equipamentos" valor={String(equipamentos.length)} unidade="itens" cor="#F5B400" borda />
              <MetricM label="Materiais CA" valor={String(itensCA.length)} unidade="itens" borda />
              <MetricM label="Investimento" valor={invHeadline.replace('R$ ', '')} unidade="chaves na mão" prefixo="R$" />
            </div>

            <div style={E.rodapeManifesto}>
              <span>Página 1 de 3</span>
              <span>Equipamentos WEG WEMOB · Instalação Spin</span>
            </div>
          </div>
        </section>

        {/* ============ PÁGINA 2 — COMPOSIÇÃO ============ */}
        <section style={E.pagina}>
          <div style={E.conteudoRel}>
            <div style={E.headerSecao}>
              <p style={{ ...E.rotuloDourado, fontSize: 10, letterSpacing: 3 }}>02 · Composição da estação</p>
              <h2 style={E.tituloSecao}>Equipamentos, materiais e serviços</h2>
            </div>

            {/* Bloco 1 — Equipamentos WEG */}
            <h3 style={E.subtituloSecao}>🔌 Equipamentos WEG</h3>
            <p style={E.paragrafo}>
              Composição do kit de recarga com equipamentos originais WEG da linha WEMOB, com garantia de fábrica.
            </p>
            <table style={E.tabela}>
              <thead>
                <tr>
                  <th style={E.th}>Equipamento</th>
                  <th style={{ ...E.th, textAlign: 'right' }}>Qtd</th>
                  <th style={E.th}>Código</th>
                  <th style={{ ...E.th, textAlign: 'right' }}>Potência</th>
                </tr>
              </thead>
              <tbody>
                {equipamentos.length === 0 && (
                  <tr><td style={E.td} colSpan={4}><em style={{ color: 'rgba(245,245,240,.4)' }}>Nenhum equipamento adicionado.</em></td></tr>
                )}
                {equipamentos.map((e, i) => (
                  <tr key={i}>
                    <td style={E.td}>{e.modelo}</td>
                    <td style={{ ...E.td, textAlign: 'right', color: '#F5B400', fontWeight: 700 }}>{e.qtd}</td>
                    <td style={E.td}>{e.codigo_weg}</td>
                    <td style={{ ...E.td, textAlign: 'right' }}>
                      {Number(e.potencia_kw || 0) > 0 ? `${fmtNum(Number(e.potencia_kw), 1)} kW` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Bloco 2 — Lista de materiais CA */}
            <h3 style={{ ...E.subtituloSecao, marginTop: 32 }}>📋 Lista de materiais (CA)</h3>
            <p style={E.paragrafo}>
              Materiais elétricos complementares para instalação em conformidade com a NBR 5410 e requisitos da concessionária.
            </p>
            <table style={E.tabela}>
              <thead>
                <tr>
                  <th style={E.th}>Item</th>
                  <th style={E.th}>Categoria</th>
                  <th style={{ ...E.th, textAlign: 'right' }}>Qtd</th>
                </tr>
              </thead>
              <tbody>
                {itensCA.length === 0 && (
                  <tr><td style={E.td} colSpan={3}><em style={{ color: 'rgba(245,245,240,.4)' }}>Lista CA não gerada.</em></td></tr>
                )}
                {itensCA.map((l, i) => (
                  <tr key={i}>
                    <td style={E.td}>{l.modelo}</td>
                    <td style={{ ...E.td, color: 'rgba(245,245,240,.6)', fontSize: 10, textTransform: 'uppercase' }}>{l.categoria}</td>
                    <td style={{ ...E.td, textAlign: 'right', color: '#F5B400', fontWeight: 700 }}>{l.qtd}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Bloco 3 — Descrição dos serviços */}
            <h3 style={{ ...E.subtituloSecao, marginTop: 32 }}>🛠 Descrição dos serviços</h3>
            <ul style={E.listaServ}>
              {mao.eletrica_qtd_profissionais > 0 && mao.eletrica_dias > 0 && (
                <li style={E.itemServ}>
                  <strong style={{ color: '#F5F5F0' }}>Elétrica predial:</strong> {mao.eletrica_qtd_profissionais} profissional(is) × {mao.eletrica_dias} dia(s) de execução da infraestrutura elétrica CA.
                </li>
              )}
              {mao.alvenaria_qtd_profissionais > 0 && mao.alvenaria_dias > 0 && (
                <li style={E.itemServ}>
                  <strong style={{ color: '#F5F5F0' }}>Alvenaria:</strong> {mao.alvenaria_qtd_profissionais} profissional(is) × {mao.alvenaria_dias} dia(s) para fixação, canaletas e acabamentos.
                </li>
              )}
              {kmTotal > 0 && (
                <li style={E.itemServ}>
                  <strong style={{ color: '#F5F5F0' }}>Deslocamento:</strong> {fmtNum(kmTotal, 0)} km rodados a R$ {fmt(rsKm)}/km (ida + volta).
                </li>
              )}
              {incluiUni && (
                <li style={E.itemServ}>
                  <strong style={{ color: '#F5F5F0' }}>Diagrama Unifilar:</strong> elaboração do documento técnico da instalação, assinado por RT habilitado.
                </li>
              )}
              {incluiTri && (
                <li style={E.itemServ}>
                  <strong style={{ color: '#F5F5F0' }}>Diagrama Trifilar:</strong> detalhamento das fases, neutros e proteções — assinado por RT habilitado.
                </li>
              )}
              <li style={E.itemServ}>
                <strong style={{ color: '#F5F5F0' }}>Instalação e comissionamento:</strong> montagem, testes, energização e treinamento inicial de operação.
              </li>
            </ul>

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

            <div style={E.blocoValor}>
              <p style={E.rotuloValorTotal}>Valor total da proposta</p>
              <p style={E.valorTotal}>R$ {fmt(totalCliente)}</p>
              <p style={E.subValor}>Estação de recarga · chaves na mão · equipamentos WEG + materiais + serviços</p>
            </div>

            <h3 style={E.subtituloSecao}>Escopo consolidado</h3>
            <div style={E.gridDados}>
              <DadoLinha rot="Equipamentos WEG" val={`R$ ${fmt(Number(selecao?.preco_wallbox_total || 0))}`} />
              <DadoLinha rot="Materiais CA" val={`R$ ${fmt(Number(selecao?.preco_acessorios_total || 0))}`} />
              {precoEle > 0 && <DadoLinha rot="Elétrica predial" val={`R$ ${fmt(precoEle)}`} />}
              {precoAlv > 0 && <DadoLinha rot="Alvenaria" val={`R$ ${fmt(precoAlv)}`} />}
              {precoDesloc > 0 && <DadoLinha rot="Deslocamento" val={`R$ ${fmt(precoDesloc)}`} />}
              {(incluiUni || incluiTri) && (
                <DadoLinha
                  rot="Documentos técnicos"
                  val={`R$ ${fmt((incluiUni ? valorUni : 0) + (incluiTri ? valorTri : 0))}`}
                />
              )}
            </div>

            <div style={E.blocoGarantias}>
              <p style={{ ...E.rotuloDourado, marginBottom: 12 }}>Garantias inclusas</p>
              <div style={E.gridDados}>
                <DadoLinha rot="Wallbox WEG" val="3 anos de garantia de fábrica" />
                <DadoLinha rot="Componentes elétricos" val="12 meses" />
                <DadoLinha rot="Instalação Spin" val="1 ano de mão de obra" />
                <DadoLinha rot="Documentos técnicos" val="Cópia digital + ART" />
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={E.blocoAssinaturaCard}>
              <div style={E.tituloAceite}>
                <span style={E.rotuloAceiteDourado}>Aceite e assinaturas</span>
                <span style={E.dataAceite}>
                  {projeto.endereco_instalacao?.cidade || projeto.cliente_endereco?.cidade || 'Tijucas'}/{projeto.endereco_instalacao?.uf || projeto.cliente_endereco?.uf || 'SC'}, {dataHoje}
                </span>
              </div>
              <div style={E.gridAssinaturas}>
                <div style={E.blocoAssinaturaLado}>
                  <div style={E.espacoScan}>
                    {empresa.rt_assinatura_url && (
                      <img src={empresa.rt_assinatura_url} alt="Assinatura Kalebe" style={E.imgAssinatura} crossOrigin="anonymous" />
                    )}
                  </div>
                  <div style={E.linhaAssinaturaBranca} />
                  <p style={E.nomeAssinaturaEscuro}>{empresa.rt_nome || 'Kalebe Grün'}</p>
                  <p style={E.cargoAssinaturaEscuro}>Diretor comercial · Spin Solar</p>
                  <p style={E.docAssinaturaEscuro}>CNPJ 22.279.642/0001-04</p>
                </div>
                <div style={E.blocoAssinaturaLado}>
                  <div style={E.espacoScan} />
                  <div style={E.linhaAssinaturaBranca} />
                  <p style={E.nomeAssinaturaEscuro}>{projeto.cliente_razao_social || '—'}</p>
                  <p style={E.cargoAssinaturaEscuro}>Cliente · Tomador</p>
                  <p style={E.docAssinaturaEscuro}>
                    {projeto.cliente_cpf_cnpj ? `CPF/CNPJ ${formatarCpfCnpj(String(projeto.cliente_cpf_cnpj))}` : 'CPF/CNPJ ______________________'}
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

PropostaVEPDFTemplate.displayName = 'PropostaVEPDFTemplate'

function MetricM({ label, valor, unidade, cor, prefixo, borda }: {
  label: string; valor: string; unidade: string; cor?: string; prefixo?: string; borda?: boolean
}) {
  return (
    <div style={{ padding: borda ? '0 20px' : 0, borderRight: borda ? '1px solid rgba(245,245,240,.08)' : 'none', paddingRight: 20 }}>
      <p style={{ margin: '0 0 4px', fontSize: 9, letterSpacing: 2, color: 'rgba(245,245,240,.5)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</p>
      <p style={{ margin: 0, fontFamily: E.font.display, fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: cor || '#F5F5F0' }}>
        {prefixo && <span style={{ fontSize: 16, marginRight: 4 }}>{prefixo}</span>}
        {valor}
        <span style={{ fontSize: 14, color: 'rgba(245,245,240,.6)', fontWeight: 500 }}> {unidade}</span>
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

const E = {
  font: {
    display: '"Space Grotesk", system-ui, sans-serif',
    body: '"Inter", system-ui, -apple-system, sans-serif',
  },
  pagina: { width: 794, minHeight: 1123, background: '#050B16', color: '#F5F5F0', position: 'relative' as const, boxSizing: 'border-box' as const, pageBreakAfter: 'always' as const, overflow: 'hidden' as const },
  haloCanto: { position: 'absolute' as const, top: -200, right: -200, width: 600, height: 600, background: 'radial-gradient(circle, rgba(245,180,0,0.16) 0%, rgba(245,180,0,0) 60%)', pointerEvents: 'none' as const },
  conteudoRel: { position: 'relative' as const, padding: '56px 64px', minHeight: 1123, boxSizing: 'border-box' as const, display: 'flex' as const, flexDirection: 'column' as const },
  logoBox: { width: 36, height: 36, background: '#F5B400', display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18, color: '#050B16' },
  tituloEmpresa: { margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em' },
  subEmpresa: { margin: '2px 0 0', fontSize: 9, color: 'rgba(245,245,240,.5)' },
  rotuloDourado: { margin: 0, fontSize: 9, letterSpacing: 2.5, color: '#F5B400', textTransform: 'uppercase' as const, fontWeight: 700 },
  codigoProposta: { margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 16, fontWeight: 700, color: '#F5F5F0' },
  railVertical: { position: 'absolute' as const, left: 20, top: '50%', transform: 'rotate(-90deg) translateX(50%)', transformOrigin: 'left top', fontSize: 9, letterSpacing: 2, color: 'rgba(245,245,240,.35)', textTransform: 'uppercase' as const },
  tituloManifesto: { margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 56, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em' },
  blocoDados: { display: 'grid' as const, gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 56 },
  rotuloMini: { margin: '0 0 4px', fontSize: 9, letterSpacing: 2, color: 'rgba(245,245,240,.4)', textTransform: 'uppercase' as const, fontWeight: 600 },
  nomeCliente: { margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 18, fontWeight: 700, lineHeight: 1.3 },
  docCliente: { margin: '4px 0 0', fontSize: 11, color: 'rgba(245,245,240,.6)' },
  metricasGrid: { display: 'grid' as const, gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: '1px solid rgba(245,245,240,.08)', paddingTop: 20 },
  rodapeManifesto: { display: 'flex' as const, justifyContent: 'space-between' as const, marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(245,245,240,.08)', fontSize: 9, color: 'rgba(245,245,240,.4)' },
  headerSecao: { marginBottom: 32 },
  tituloSecao: { margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
  subtituloSecao: { margin: '24px 0 12px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 16, fontWeight: 700, color: '#F5B400', letterSpacing: '-0.01em' },
  paragrafo: { margin: '0 0 12px', fontSize: 11, color: 'rgba(245,245,240,.7)', lineHeight: 1.5 },
  tabela: { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 12 },
  th: { padding: '8px 10px', textAlign: 'left' as const, fontSize: 9, letterSpacing: 1.5, color: 'rgba(245,245,240,.5)', textTransform: 'uppercase' as const, fontWeight: 700, borderBottom: '1px solid rgba(245,245,240,.15)' },
  td: { padding: '8px 10px', fontSize: 11, color: 'rgba(245,245,240,.85)', borderBottom: '1px solid rgba(245,245,240,.05)' },
  listaServ: { margin: 0, paddingLeft: 20, listStyleType: 'disc' as const, color: 'rgba(245,245,240,.7)' },
  itemServ: { fontSize: 11, lineHeight: 1.6, marginBottom: 6 },
  gridDados: { display: 'flex' as const, flexDirection: 'column' as const, marginTop: 8 },
  blocoValor: { background: 'rgba(245,180,0,.08)', border: '1px solid rgba(245,180,0,.35)', padding: 28, marginBottom: 32, borderRadius: 4 },
  rotuloValorTotal: { margin: '0 0 8px', fontSize: 10, letterSpacing: 2, color: '#F5B400', textTransform: 'uppercase' as const, fontWeight: 700 },
  valorTotal: { margin: '0 0 8px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 48, fontWeight: 700, color: '#F5F5F0', letterSpacing: '-0.02em' },
  subValor: { margin: 0, fontSize: 11, color: 'rgba(245,245,240,.6)' },
  blocoGarantias: { marginTop: 32, padding: 20, border: '1px solid rgba(245,180,0,.2)', borderRadius: 4 },
  blocoAssinaturaCard: { background: '#F5F5F0', color: '#050B16', borderRadius: 4, padding: 24, marginTop: 24 },
  tituloAceite: { display: 'flex' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(5,11,22,.12)' },
  rotuloAceiteDourado: { fontSize: 9, letterSpacing: 2, color: '#B78900', textTransform: 'uppercase' as const, fontWeight: 700 },
  dataAceite: { fontSize: 10, color: 'rgba(5,11,22,.6)' },
  gridAssinaturas: { display: 'grid' as const, gridTemplateColumns: '1fr 1fr', gap: 24 },
  blocoAssinaturaLado: { display: 'flex' as const, flexDirection: 'column' as const },
  espacoScan: { height: 60, display: 'flex' as const, alignItems: 'flex-end' as const },
  imgAssinatura: { maxHeight: 55, maxWidth: 220, objectFit: 'contain' as const },
  linhaAssinaturaBranca: { borderBottom: '1px solid rgba(5,11,22,.35)', marginBottom: 8 },
  nomeAssinaturaEscuro: { margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700, color: '#050B16' },
  cargoAssinaturaEscuro: { margin: '2px 0 0', fontSize: 10, color: 'rgba(5,11,22,.65)' },
  docAssinaturaEscuro: { margin: '2px 0 0', fontSize: 9, color: 'rgba(5,11,22,.5)' },
}
