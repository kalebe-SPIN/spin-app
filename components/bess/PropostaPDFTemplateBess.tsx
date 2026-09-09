import { forwardRef } from 'react'

/**
 * Template PDF proposta BESS puro — Kalebe 2026-09-09.
 *
 * 3 páginas A4 dark editorial Spin (mesma linguagem visual do template
 * on-grid: fundo #050B16, dourado #F5B400, tipografia Space Grotesk).
 * NÃO substitui PropostaPDFTemplate.tsx (solar) — preserva 100% intacto,
 * é um template PARALELO exclusivo pra kit BESS puro.
 *
 * Páginas:
 *   1. Capa + resumo (cliente, tag "🔋 Backup de energia", PV total)
 *   2. Composição do kit (bateria, controladora, medidor, caixas, opcionais)
 *      + serviços (frete, projeto/ART, instalação)
 *   3. Investimento (PV final, formas de pagamento, garantia, assinatura)
 *
 * Consumido pelo BessPropostaClient via ref → html2canvas → jsPDF.
 * Dimensões A4 @ 96 DPI: 794 × 1123 px.
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
    // v2: arrays. Compat com formato antigo (singular).
    baterias?: ItemComp[]
    controladoras?: ItemComp[]
    medidores?: ItemComp[]
    bateria?: ItemComp
    controladora?: ItemComp
    medidor?: ItemComp
    caixas_juncao?: ItemComp[]
    opcionais?: ItemComp[]
  }
  proposta: {
    pv_total: number
    subtotal_lista_ca?: number
    lista_ca?: ItemComp[]
    frete: number
    projeto_art: number
    instalacao: number
    projeto_art_detalhe?: { potencia_ca_total_kw: number }
    instalacao_detalhe?: {
      qtd_inversor: number
      qtd_bateria: number
      valor_por_inversor: number
      valor_por_bateria: number
    }
    // Kalebe 2026-09-09: paridade com PDF solar
    extras?: Array<{ descricao: string; valor: number }>
    total_extras?: number
    pv_bruto?: number
    valor_ajuste?: number
    sentido_ajuste?: 'desconto' | 'acrescimo' | 'nenhum'
    pv_final?: number
    desconto_admin_pct?: number
    desconto_admin_valor?: number
  }
  configEmpresa: any
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR')

function formatarCpfCnpj(v: string | null | undefined): string {
  if (!v) return ''
  const d = String(v).replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}

export const PropostaPDFTemplateBess = forwardRef<HTMLDivElement, Props>(
  ({ projeto, kit, proposta, configEmpresa }, ref) => {
    const empresa = configEmpresa || {}
    const dataHoje = new Date().toLocaleDateString('pt-BR')
    const validade = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')
    const cnpjFmt = formatarCpfCnpj(projeto.cliente_cpf_cnpj)

    // Extras + ajuste do admin (paridade com PDF solar). pvFinal reflete
    // extras somados menos o desconto (ou mais o acréscimo) aplicado.
    const extras = Array.isArray(proposta.extras) ? proposta.extras : []
    const totalExtras = Number(proposta.total_extras) || 0
    const pvBruto = Number(proposta.pv_bruto) || proposta.pv_total
    const valorAjuste = Number(proposta.valor_ajuste) || 0
    const sentidoAjuste = proposta.sentido_ajuste || 'nenhum'
    const pvFinal = Number(proposta.pv_final) || proposta.pv_total
    const temExtras = extras.length > 0 && totalExtras > 0
    const temAjuste = sentidoAjuste !== 'nenhum' && valorAjuste > 0

    // Formas de pagamento (mesma lógica do template solar)
    const aVistaPix = pvFinal * 0.97
    const parcelaCartao = (pvFinal * 1.0899) / 12
    const parcelaFinMin = (pvFinal * 1.35) / 60
    const parcelaFinMax = (pvFinal * 1.85) / 60

    // v2: normaliza arrays (aceita singular legado)
    const toArr = (x: any): ItemComp[] => Array.isArray(x) ? x : (x?.id ? [x] : [])
    const bateriasArr      = toArr(kit.baterias      ?? kit.bateria)
    const controladorasArr = toArr(kit.controladoras ?? kit.controladora)
    const medidoresArr     = toArr(kit.medidores     ?? kit.medidor)
    const opcionais = [...(kit.caixas_juncao || []), ...(kit.opcionais || [])]

    return (
      <div ref={ref} style={{ background: '#050B16', color: '#F5F5F0', fontFamily: E.fonteBody }}>
        {/* ═══════════════ PÁGINA 1 — CAPA ═══════════════ */}
        <section style={E.pagina}>
          <div style={E.halo} />
          <div style={E.wrap}>
            {/* Cabeçalho */}
            <div style={E.header}>
              <div style={E.headerEsq}>
                {empresa.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={empresa.logo_url} alt="Spin Solar" style={{ height: 40, objectFit: 'contain' as const }} crossOrigin="anonymous" />
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
              <div style={E.headerDir}>
                <p style={E.rotuloMini}>Proposta</p>
                <p style={E.codigoProposta}>{projeto.codigo || '—'}</p>
                <p style={{ ...E.subEmpresa, marginTop: 4 }}>Emitida {dataHoje}</p>
                <p style={E.subEmpresa}>Válida até {validade}</p>
              </div>
            </div>

            {/* Tag BESS + título */}
            <div style={{ marginTop: 60 }}>
              <span style={{
                display: 'inline-block' as const,
                padding: '4px 10px',
                background: 'rgba(63,178,120,0.12)',
                border: '1px solid rgba(63,178,120,0.35)',
                color: '#3FB278',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase' as const,
                borderRadius: 999,
              }}>
                🔋 Backup de energia — BESS puro
              </span>
              <h1 style={E.tituloManifesto}>
                Energia disponível<br />
                <span style={{ color: '#F5B400' }}>em qualquer horário</span>.
              </h1>
              <p style={E.textoLead}>
                Sistema de backup de energia sem geração solar — bateria + controladora + medidor
                dimensionados pra manter cargas essenciais durante falhas da rede.
              </p>
            </div>

            {/* Cliente — com endereço completo (Kalebe 2026-09-09) */}
            <div style={{ marginTop: 40, padding: '20px 24px', background: 'rgba(245,245,240,.03)', border: '1px solid rgba(245,245,240,.08)', borderRadius: 8 }}>
              <p style={E.rotuloDourado}>Preparada para</p>
              <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700 }}>{projeto.cliente_razao_social || '—'}</p>
              {cnpjFmt && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(245,245,240,.6)', fontFamily: 'monospace' }}>{cnpjFmt}</p>}
              {(() => {
                const end = projeto.cliente_endereco || {}
                const linha1 = [end.logradouro, end.numero].filter(Boolean).join(', ')
                const linha2 = [end.bairro, end.cidade, end.uf].filter(Boolean).join(' · ')
                const cep = end.cep ? `CEP ${end.cep}` : ''
                const linha3 = [cep, linha2].filter(Boolean).join(' · ')
                return (
                  <>
                    {linha1 && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'rgba(245,245,240,.7)' }}>{linha1}{end.complemento ? `, ${end.complemento}` : ''}</p>}
                    {linha3 && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(245,245,240,.55)' }}>{linha3}</p>}
                  </>
                )
              })()}
            </div>

            {/* Investimento destaque */}
            <div style={{ marginTop: 40 }}>
              <p style={E.rotuloDourado}>Investimento total</p>
              <p style={E.valorGigante}>R$ {fmtInt(pvFinal)}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(245,245,240,.5)' }}>
                Kit BESS + serviços · instalação inclusa
                {temAjuste && sentidoAjuste === 'desconto' && (
                  <span style={{ color: '#3FB278', fontWeight: 600 }}> · com desconto especial</span>
                )}
              </p>
            </div>

            <div style={{ flex: 1 }} />
            <div style={E.rodapeManifesto}>
              <span>Página 1 de 3</span>
              <span>Spin Solar · Proposta {projeto.codigo}</span>
            </div>
          </div>
        </section>

        {/* ═══════════════ PÁGINA 2 — COMPOSIÇÃO DO KIT ═══════════════ */}
        <section style={E.pagina}>
          <div style={E.wrap}>
            <div style={E.header}>
              <div style={E.headerEsq}>
                {empresa.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={empresa.logo_url} alt="Spin Solar" style={{ height: 40, objectFit: 'contain' as const }} crossOrigin="anonymous" />
                ) : (
                  <div style={E.logoBox}>S</div>
                )}
                <div>
                  <p style={E.tituloEmpresa}>Composição técnica</p>
                  <p style={E.subEmpresa}>Kit BESS + serviços</p>
                </div>
              </div>
              <div style={E.headerDir}>
                <p style={E.rotuloMini}>Página</p>
                <p style={E.codigoProposta}>2/3</p>
              </div>
            </div>

            <h3 style={E.subtituloSecao}>Kit BESS</h3>
            <table style={E.tabela}>
              <thead>
                <tr>
                  <th style={{ ...E.th, textAlign: 'left' as const }}>Item</th>
                  <th style={{ ...E.th, textAlign: 'left' as const }}>Modelo</th>
                  <th style={{ ...E.th, textAlign: 'right' as const }}>Qtd</th>
                </tr>
              </thead>
              <tbody>
                {bateriasArr.map((b, i) => (
                  <LinhaKitPDF key={`b${i}`} label={bateriasArr.length > 1 ? `🔋 Bateria ${i + 1}` : '🔋 Bateria'} item={b} />
                ))}
                {controladorasArr.map((c, i) => (
                  <LinhaKitPDF key={`ct${i}`} label={controladorasArr.length > 1 ? `⚙️ Controladora ${i + 1}` : '⚙️ Controladora / Inversor Híbrido'} item={c} />
                ))}
                {medidoresArr.map((m, i) => (
                  <LinhaKitPDF key={`m${i}`} label={medidoresArr.length > 1 ? `📊 Medidor ${i + 1}` : '📊 Medidor'} item={m} />
                ))}
                {opcionais.map((it, i) => (
                  <LinhaKitPDF key={`o${i}`} label={i < (kit.caixas_juncao?.length || 0) ? '🧰 Caixa de junção' : '✨ Opcional'} item={it} />
                ))}
              </tbody>
            </table>

            {/* Lista CA (só aparece se houver) */}
            {(proposta.lista_ca?.length || 0) > 0 && (
              <>
                <h3 style={{ ...E.subtituloSecao, marginTop: 40 }}>🔌 Lista CA — materiais elétricos</h3>
                <table style={E.tabela}>
                  <tbody>
                    {(proposta.lista_ca || []).map((it, i) => (
                      <LinhaKitPDF key={i} label={`Item ${i + 1}`} item={it} />
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <h3 style={{ ...E.subtituloSecao, marginTop: 40 }}>Serviços inclusos</h3>
            <div style={E.gridDados}>
              {(proposta.subtotal_lista_ca || 0) > 0 && (
                <DadoLinha rot="Lista CA (materiais elétricos)" val={`R$ ${fmt(proposta.subtotal_lista_ca || 0)}`} />
              )}
              <DadoLinha rot="Frete regional" val={`R$ ${fmt(proposta.frete)}`} />
              <DadoLinha
                rot={proposta.projeto_art_detalhe
                  ? `Projeto + ART (${proposta.projeto_art_detalhe.potencia_ca_total_kw.toFixed(1).replace('.', ',')} kW CA)`
                  : 'Projeto + ART'}
                val={`R$ ${fmt(proposta.projeto_art)}`} />
              <DadoLinha
                rot={proposta.instalacao_detalhe
                  ? `Instalação (${proposta.instalacao_detalhe.qtd_inversor}× inv + ${proposta.instalacao_detalhe.qtd_bateria}× bat)`
                  : 'Instalação'}
                val={`R$ ${fmt(proposta.instalacao)}`} />
            </div>

            <div style={{ marginTop: 40, padding: '18px 22px', border: '1px solid rgba(245,180,0,.25)', borderRadius: 8, background: 'rgba(245,180,0,.05)' }}>
              <p style={E.rotuloDourado}>Garantia e cobertura</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: 'rgba(245,245,240,.8)', lineHeight: 1.7 }}>
                <li>Bateria WEG SBW — garantia de 10 anos ou 6.000 ciclos (o que ocorrer primeiro)</li>
                <li>Controladora/inversor híbrido — garantia de 5 anos + 5 anos estendida disponível</li>
                <li>Instalação — garantia de 1 ano em serviços elétricos</li>
                <li>Homologação junto à distribuidora inclusa (se aplicável)</li>
              </ul>
            </div>

            <div style={{ flex: 1 }} />
            <div style={E.rodapeManifesto}>
              <span>Página 2 de 3</span>
              <span>Spin Solar · Proposta {projeto.codigo}</span>
            </div>
          </div>
        </section>

        {/* ═══════════════ PÁGINA 3 — INVESTIMENTO ═══════════════ */}
        <section style={E.pagina}>
          <div style={E.wrap}>
            <div style={E.header}>
              <div style={E.headerEsq}>
                {empresa.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={empresa.logo_url} alt="Spin Solar" style={{ height: 40, objectFit: 'contain' as const }} crossOrigin="anonymous" />
                ) : (
                  <div style={E.logoBox}>S</div>
                )}
                <div>
                  <p style={E.tituloEmpresa}>Investimento</p>
                  <p style={E.subEmpresa}>Formas de pagamento</p>
                </div>
              </div>
              <div style={E.headerDir}>
                <p style={E.rotuloMini}>Página</p>
                <p style={E.codigoProposta}>3/3</p>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <p style={E.rotuloDourado}>Total do investimento</p>
              <p style={E.valorGigante}>R$ {fmtInt(pvFinal)}</p>
              {(temExtras || temAjuste) && (
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(245,245,240,.55)' }}>
                  Kit + serviços {temExtras ? '+ extras ' : ''}
                  {temAjuste && (sentidoAjuste === 'desconto'
                    ? `− desconto R$ ${fmt(valorAjuste)}`
                    : `+ acréscimo R$ ${fmt(valorAjuste)}`)}
                </p>
              )}
            </div>

            {/* Bloco de extras + ajuste (só aparece se houver) */}
            {(temExtras || temAjuste) && (
              <div style={{
                marginTop: 20,
                padding: '14px 18px',
                background: 'rgba(245,245,240,.03)',
                border: '1px solid rgba(245,245,240,.08)',
                borderRadius: 8,
                fontSize: 11,
              }}>
                <p style={{ ...E.rotuloDourado, marginBottom: 8 }}>Detalhamento</p>
                <div style={{ display: 'flex' as const, justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'rgba(245,245,240,.7)' }}>Kit BESS + serviços</span>
                  <span style={{ fontFamily: 'monospace', color: '#F5F5F0' }}>R$ {fmt(proposta.pv_total)}</span>
                </div>
                {extras.map((e, i) => (
                  <div key={i} style={{ display: 'flex' as const, justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: 'rgba(245,245,240,.7)' }}>+ {e.descricao || 'Extra'}</span>
                    <span style={{ fontFamily: 'monospace', color: '#F5F5F0' }}>R$ {fmt(Number(e.valor) || 0)}</span>
                  </div>
                ))}
                {temAjuste && (
                  <div style={{
                    display: 'flex' as const, justifyContent: 'space-between',
                    padding: '4px 0', color: sentidoAjuste === 'desconto' ? '#3FB278' : '#EF6D6D',
                  }}>
                    <span>{sentidoAjuste === 'desconto' ? '− Desconto' : '+ Acréscimo'}</span>
                    <span style={{ fontFamily: 'monospace' }}>R$ {fmt(valorAjuste)}</span>
                  </div>
                )}
                <div style={{
                  display: 'flex' as const, justifyContent: 'space-between',
                  padding: '8px 0 0', marginTop: 4,
                  borderTop: '1px solid rgba(245,180,0,.3)',
                }}>
                  <span style={{ color: '#F5B400', fontWeight: 700 }}>Total final</span>
                  <span style={{ fontFamily: 'monospace', color: '#F5B400', fontWeight: 800 }}>
                    R$ {fmt(pvFinal)}
                  </span>
                </div>
              </div>
            )}

            <h3 style={{ ...E.subtituloSecao, marginTop: 40 }}>Formas de pagamento</h3>

            <div style={{ display: 'grid' as const, gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
              <BlocoPagamento
                titulo="À vista · PIX"
                destaque={`R$ ${fmtInt(aVistaPix)}`}
                nota="3% de desconto"
              />
              <BlocoPagamento
                titulo="Cartão 12×"
                destaque={`R$ ${fmt(parcelaCartao)}/mês`}
                nota={`Total R$ ${fmtInt(parcelaCartao * 12)}`}
              />
              <BlocoPagamento
                titulo="Financiado 60×"
                destaque={`R$ ${fmt(parcelaFinMin)} — ${fmt(parcelaFinMax)}/mês`}
                nota="Sujeito à análise"
              />
            </div>

            <div style={{ marginTop: 60, padding: '20px 24px', background: 'rgba(245,245,240,.03)', border: '1px solid rgba(245,245,240,.08)', borderRadius: 8 }}>
              <p style={E.rotuloDourado}>Próximos passos</p>
              <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 11, color: 'rgba(245,245,240,.8)', lineHeight: 1.8 }}>
                <li>Aprovação desta proposta (validade {validade})</li>
                <li>Assinatura do contrato + entrada</li>
                <li>Dimensionamento final e liberação do kit BESS</li>
                <li>Agendamento da instalação (prazo médio 15 a 30 dias)</li>
                <li>Comissionamento e entrega técnica</li>
              </ol>
            </div>

            {/* Upsell: adicionar placas solares — Kalebe 2026-09-09 */}
            <div style={{
              marginTop: 20,
              padding: '22px 26px',
              background: 'linear-gradient(135deg, rgba(245,180,0,.10) 0%, rgba(63,178,120,.06) 100%)',
              border: '1px solid rgba(245,180,0,.40)',
              borderRadius: 10,
              position: 'relative' as const,
            }}>
              <span style={{
                position: 'absolute' as const,
                top: -10,
                right: 18,
                padding: '3px 10px',
                background: '#F5B400',
                color: '#050B16',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 2,
                textTransform: 'uppercase' as const,
                borderRadius: 4,
              }}>
                Recomendado
              </span>
              <p style={{
                margin: 0,
                fontSize: 10,
                letterSpacing: 2,
                textTransform: 'uppercase' as const,
                color: '#F5B400',
                fontWeight: 700,
              }}>
                🌞 Multiplique o desempenho do seu BESS
              </p>
              <h4 style={{
                margin: '6px 0 10px',
                fontSize: 20,
                fontWeight: 800,
                color: '#F5F5F0',
                fontFamily: E.fonteDisplay,
                lineHeight: 1.2,
              }}>
                Adicione placas solares e transforme backup em <span style={{ color: '#F5B400' }}>energia própria 24h</span>
              </h4>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: 'rgba(245,245,240,.75)', lineHeight: 1.6 }}>
                Com o kit BESS já dimensionado, integrar geração solar fotovoltaica fica mais
                simples e barato do que instalar do zero — o inversor híbrido já suporta as duas
                pontas. Você ganha:
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 11, color: 'rgba(245,245,240,.85)', lineHeight: 1.75 }}>
                <li>Autoconsumo diurno direto — reduz a conta de luz mesmo durante o dia</li>
                <li>Bateria carregada de graça pelo sol — backup + economia no mesmo sistema</li>
                <li>Reserva energética contra apagões E redução do gasto mensal</li>
                <li>Autonomia total em qualquer horário, com retorno mais rápido do investimento</li>
              </ul>
              <div style={{
                marginTop: 8,
                padding: '10px 14px',
                background: 'rgba(5,11,22,.5)',
                border: '1px solid rgba(245,180,0,.30)',
                borderRadius: 6,
                fontSize: 11,
                color: '#F5F5F0',
              }}>
                <strong style={{ color: '#F5B400' }}>Fale com seu consultor Spin</strong> pra receber um
                orçamento do sistema híbrido (BESS + solar) sob medida pra sua conta de luz.
              </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Assinatura Kalebe */}
            <div style={{ marginTop: 40, borderTop: '1px solid rgba(245,180,0,.25)', paddingTop: 20 }}>
              <div style={{ display: 'flex' as const, justifyContent: 'space-between', alignItems: 'flex-end' as const }}>
                <div>
                  <p style={E.rotuloMini}>Responsável comercial</p>
                  {empresa.rt_assinatura_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={empresa.rt_assinatura_url} alt="Assinatura" style={{ height: 48, maxWidth: 200, marginTop: 4 }} />
                  )}
                  <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 700, color: '#F5F5F0' }}>
                    Kalebe Grün
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(245,245,240,.6)' }}>
                    Diretor Comercial · Spin Solar
                  </p>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <p style={E.rotuloMini}>Emissão</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11 }}>{dataHoje}</p>
                </div>
              </div>
            </div>

            <div style={{ ...E.rodapeManifesto, marginTop: 20 }}>
              <span>Página 3 de 3</span>
              <span>Spin Solar · Proposta {projeto.codigo}</span>
            </div>
          </div>
        </section>
      </div>
    )
  }
)
PropostaPDFTemplateBess.displayName = 'PropostaPDFTemplateBess'

// ═══ Helpers de layout ═══

function LinhaKitPDF({ label, item }: { label: string; item: ItemComp }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(245,245,240,.06)' }}>
      <td style={E.td}>{label}</td>
      <td style={{ ...E.td, color: 'rgba(245,245,240,.75)' }}>
        {item?.marca ? `${item.marca} · ` : ''}{item?.modelo || '—'}
        {item?.potencia_kw ? ` (${item.potencia_kw}kW)` : ''}
      </td>
      <td style={{ ...E.td, textAlign: 'right' as const, color: '#F5B400', fontWeight: 700 }}>{item?.qtd || 0}</td>
    </tr>
  )
}

function DadoLinha({ rot, val }: { rot: string; val: string }) {
  return (
    <div style={{ display: 'flex' as const, justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(245,245,240,.05)' }}>
      <span style={{ fontSize: 11, color: 'rgba(245,245,240,.6)' }}>{rot}</span>
      <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#F5F5F0', fontWeight: 600 }}>{val}</span>
    </div>
  )
}

function BlocoPagamento({ titulo, destaque, nota }: { titulo: string; destaque: string; nota: string }) {
  return (
    <div style={{ padding: 16, background: 'rgba(245,245,240,.03)', border: '1px solid rgba(245,245,240,.1)', borderRadius: 8 }}>
      <p style={{ margin: 0, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' as const, color: '#F5B400', fontWeight: 700 }}>
        {titulo}
      </p>
      <p style={{ margin: '8px 0 4px', fontSize: 18, fontWeight: 800, color: '#F5F5F0', fontFamily: E.fonteDisplay }}>
        {destaque}
      </p>
      <p style={{ margin: 0, fontSize: 10, color: 'rgba(245,245,240,.55)' }}>{nota}</p>
    </div>
  )
}

// ═══ Estilos ═══

const E = {
  fonteDisplay: '"Space Grotesk", system-ui, sans-serif',
  fonteBody: '"Inter", system-ui, sans-serif',
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
  halo: {
    position: 'absolute' as const,
    top: -200,
    right: -200,
    width: 600,
    height: 600,
    background: 'radial-gradient(circle, rgba(245,180,0,0.16) 0%, rgba(245,180,0,0) 60%)',
    pointerEvents: 'none' as const,
  },
  wrap: {
    position: 'relative' as const,
    padding: '56px 64px',
    minHeight: 1123,
    boxSizing: 'border-box' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  header: { display: 'flex' as const, justifyContent: 'space-between', alignItems: 'flex-start' as const, borderBottom: '1px solid rgba(245,180,0,.25)', paddingBottom: 16 },
  headerEsq: { display: 'flex' as const, alignItems: 'center' as const, gap: 12 },
  headerDir: { textAlign: 'right' as const },
  logoBox: {
    width: 36, height: 36, background: '#F5B400',
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18, color: '#050B16',
  },
  tituloEmpresa: { margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#F5F5F0' },
  subEmpresa: { margin: 0, fontSize: 9, color: 'rgba(245,245,240,.5)', letterSpacing: 0.5 },
  rotuloDourado: {
    margin: 0, fontSize: 9, color: '#F5B400',
    letterSpacing: 2, textTransform: 'uppercase' as const, fontWeight: 600,
  },
  rotuloMini: {
    margin: '0 0 4px', fontSize: 9, color: 'rgba(245,245,240,.5)',
    textTransform: 'uppercase' as const, letterSpacing: 2, fontWeight: 600,
  },
  codigoProposta: {
    margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 14, fontWeight: 600, letterSpacing: '0.02em', color: '#F5B400',
  },
  tituloManifesto: {
    margin: '20px 0 20px', fontSize: 48, fontWeight: 800, lineHeight: 1.05,
    fontFamily: '"Space Grotesk", sans-serif', color: '#F5F5F0', letterSpacing: '-0.02em',
  },
  textoLead: { margin: '0 0 8px', fontSize: 13, lineHeight: 1.55, color: 'rgba(245,245,240,.75)', maxWidth: 560 },
  subtituloSecao: {
    margin: '32px 0 12px', fontSize: 13, fontWeight: 700,
    letterSpacing: 2, textTransform: 'uppercase' as const, color: '#F5B400',
    fontFamily: '"Space Grotesk", sans-serif',
  },
  valorGigante: {
    margin: '6px 0 0', fontSize: 56, fontWeight: 900, lineHeight: 1,
    color: '#F5B400', fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em',
  },
  tabela: {
    width: '100%', borderCollapse: 'collapse' as const, marginTop: 12,
    fontSize: 11,
  },
  th: {
    padding: '8px 6px', fontSize: 9, letterSpacing: 2,
    textTransform: 'uppercase' as const, color: 'rgba(245,245,240,.5)', fontWeight: 700,
    borderBottom: '1px solid rgba(245,180,0,.3)',
  },
  td: { padding: '10px 6px', color: '#F5F5F0', fontSize: 11 },
  gridDados: { marginTop: 8 },
  rodapeManifesto: {
    display: 'flex' as const, justifyContent: 'space-between',
    fontSize: 9, color: 'rgba(245,245,240,.4)',
    borderTop: '1px solid rgba(245,245,240,.08)', paddingTop: 10,
  },
}
