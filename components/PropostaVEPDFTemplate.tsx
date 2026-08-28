'use client'

import { forwardRef, type ReactNode } from 'react'
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
    // Non-breaking space e separador consistente — html2canvas colapsa
    // whitespace comum, então usamos   pra garantir espaço estável
    const NBSP = ' '
    const SEP = `${NBSP}·${NBSP}`
    // CNPJ formatado (fallback pro CNPJ da Spin quando o cadastro empresa
    // vier sem máscara). Sempre passa pelo formatador.
    const cnpjEmpresa = formatarCpfCnpj(String(empresa.cnpj || '22279642000104'))
    const razaoEmpresa = empresa.razao_social || 'Spin Solar Energias Renováveis Ltda'
    const cidadeInst = projeto.endereco_instalacao?.cidade
      || projeto.cliente_endereco?.cidade
      || 'Tijucas'
    const ufInst = String(projeto.endereco_instalacao?.uf || projeto.cliente_endereco?.uf || 'SC').toUpperCase()

    // Endereço do cliente pra capa (rua, nº, bairro, cidade/uf) — usa
    // endereco_instalacao como fonte primária; cai pra cliente_endereco.
    // Kalebe 2026-08-27: mostrar endereço + CPF/CNPJ no bloco Cliente.
    const endObj = projeto.endereco_instalacao || projeto.cliente_endereco || {}
    const enderecoLinhaCliente = [
      [endObj.rua || endObj.logradouro, endObj.numero ? `${endObj.numero}` : null].filter(Boolean).join(', '),
      endObj.bairro,
      [endObj.cidade || endObj.municipio, endObj.uf].filter(Boolean).join('/'),
      endObj.cep,
    ].filter((s) => s && String(s).trim().length > 0).join(' · ')

    // Usa equipamentos_enriquecidos (com descricao_curta+specs vindas do catálogo)
    // se disponível; senão cai pra estrutura salva no projeto
    const equipamentos: any[] = selecao?.equipamentos_enriquecidos || selecao?.equipamentos || []
    // Kalebe 2026-08-27: 'aparece 1 equipamento sendo que foram 4 selecionados'.
    // equipamentos.length conta LINHAS; qtdTotalEquip soma as quantidades.
    const qtdTotalEquip: number = equipamentos.reduce((s, e) => s + Number(e.qtd || 0), 0)
    // Materiais CA totais (soma qtd de cada linha)
    const qtdTotalCA: number = (selecao?.itens_ca || []).reduce((s: number, l: any) => s + Number(l.qtd || 0), 0)
    const prazoEntregaDias: number = Number(selecao?.prazo_entrega_dias || 45)
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
                    <span>{razaoEmpresa}</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <span>CNPJ {cnpjEmpresa}</span>
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={E.rotuloDourado}>Proposta VE</p>
                <p style={E.codigoProposta}>{projeto.codigo}</p>
              </div>
            </div>

            <div style={E.railVertical}>
              <span>Emitida {dataHoje.replace(/\//g, '.')}</span>
              <span style={{ margin: '0 8px' }}>·</span>
              <span>Válida até {validade.replace(/\//g, '.')}</span>
            </div>

            <div style={{ marginTop: 88 }}>
              <p style={{ ...E.rotuloDourado, fontSize: 11, letterSpacing: 4, marginBottom: 12 }}>
                <span>Proposta comercial</span>
                <span style={{ margin: '0 10px' }}>·</span>
                <span>Estação de recarga</span>
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
                {projeto.cliente_cpf_cnpj && (
                  <p style={E.docCliente}>
                    CPF/CNPJ {formatarCpfCnpj(String(projeto.cliente_cpf_cnpj))}
                  </p>
                )}
                {enderecoLinhaCliente && (
                  <p style={{ ...E.docCliente, marginTop: 2 }}>{enderecoLinhaCliente}</p>
                )}
              </div>
              <div>
                <p style={E.rotuloMini}>Estação proposta</p>
                {/* Lista os equipamentos concretos em vez do texto genérico */}
                <div style={{ marginTop: 4 }}>
                  {equipamentos.length > 0 ? (
                    equipamentos.slice(0, 4).map((e, i) => (
                      <p key={i} style={{
                        margin: '0 0 4px', fontFamily: E.font.display,
                        fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: '#F5F5F0',
                      }}>
                        {e.qtd}× <span style={{ color: '#F5B400' }}>{e.modelo}</span>
                      </p>
                    ))
                  ) : (
                    <p style={E.nomeCliente}>—</p>
                  )}
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(245,245,240,.6)' }}>
                    <span>Linha WEMOB</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <span>potência {fmtNum(potenciaHeadline, 1)} kW</span>
                  </p>
                </div>
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={E.metricasGrid}>
              <MetricM label="Potência" valor={fmtNum(potenciaHeadline, 1)} unidade="kW" />
              <MetricM label="Equipamentos" valor={String(qtdTotalEquip)} unidade="itens" cor="#F5B400" borda />
              <MetricM label="Materiais CA" valor="✓" unidade="componentes inclusos" borda />
              <MetricM label="Investimento" valor={invHeadline.replace('R$ ', '')} unidade="chaves na mão" prefixo="R$" />
            </div>

            <div style={E.rodapeManifesto}>
              <span>Página 1 de 3</span>
              <span>
                <span>Equipamentos WEG WEMOB</span>
                <span style={{ margin: '0 6px' }}>·</span>
                <span>Instalação Spin</span>
              </span>
            </div>
          </div>
        </section>

        {/* ============ PÁGINA 2 — COMPOSIÇÃO ============ */}
        <section style={E.pagina}>
          <div style={E.conteudoRel}>
            <div style={E.headerSecao}>
              <p style={{ ...E.rotuloDourado, fontSize: 10, letterSpacing: 3 }}>
                <span>02</span>
                <span style={{ margin: '0 8px' }}>·</span>
                <span>Composição da estação</span>
              </p>
              <h2 style={E.tituloSecao}>Equipamentos, materiais e serviços</h2>
            </div>

            {/* Bloco 1 — Equipamentos WEG (com ficha técnica de cada) */}
            <h3 style={E.subtituloSecao}>🔌 Equipamentos WEG</h3>
            <p style={E.paragrafo}>
              <span>Composição do kit de recarga com equipamentos originais WEG da linha WEMOB, com garantia de fábrica.&nbsp;</span>
              <strong style={{ color: '#F5B400' }}>Prazo de entrega do fabricante: {prazoEntregaDias} dias úteis</strong>
              <span>&nbsp;após confirmação do pedido.</span>
            </p>
            {equipamentos.length === 0 && (
              <p style={{ ...E.paragrafo, color: 'rgba(245,245,240,.4)', fontStyle: 'italic' }}>Nenhum equipamento adicionado.</p>
            )}
            {equipamentos.map((e, i) => (
              <FichaEquipamento key={i} equip={e} />
            ))}

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
                <ItemServ titulo="Elétrica predial:">
                  {mao.eletrica_qtd_profissionais} profissional{mao.eletrica_qtd_profissionais === 1 ? '' : 'is'} × {mao.eletrica_dias} dia{mao.eletrica_dias === 1 ? '' : 's'} de execução da infraestrutura elétrica CA.
                </ItemServ>
              )}
              {mao.alvenaria_qtd_profissionais > 0 && mao.alvenaria_dias > 0 && (
                <ItemServ titulo="Alvenaria:">
                  {mao.alvenaria_qtd_profissionais} profissional{mao.alvenaria_qtd_profissionais === 1 ? '' : 'is'} × {mao.alvenaria_dias} dia{mao.alvenaria_dias === 1 ? '' : 's'} para fixação, canaletas e acabamentos.
                </ItemServ>
              )}
              {kmTotal > 0 && (
                <ItemServ titulo="Deslocamento:">
                  {fmtNum(kmTotal, 0)} km rodados (ida + volta) da SPIN Solar até o local do cliente.
                </ItemServ>
              )}
              {incluiUni && (
                <ItemServ titulo="Diagrama Unifilar:">
                  elaboração do documento técnico da instalação, assinado por RT habilitado.
                </ItemServ>
              )}
              {incluiTri && (
                <ItemServ titulo="Diagrama Trifilar:">
                  detalhamento das fases, neutros e proteções — assinado por RT habilitado.
                </ItemServ>
              )}
              <ItemServ titulo="Instalação e comissionamento:">
                montagem, testes, energização e treinamento inicial de operação.
              </ItemServ>
            </ul>

            <div style={{ flex: 1 }} />

            <div style={E.rodapeManifesto}>
              <span>Página 2 de 3</span>
              <span>
                <span>Spin Solar</span>
                <span style={{ margin: '0 6px' }}>·</span>
                <span>Proposta {projeto.codigo}</span>
              </span>
            </div>
          </div>
        </section>

        {/* ============ PÁGINA 3 — INVESTIMENTO ============ */}
        <section style={E.pagina}>
          <div style={E.conteudoRel}>
            <div style={E.headerSecao}>
              <p style={{ ...E.rotuloDourado, fontSize: 10, letterSpacing: 3 }}>
                <span>03</span>
                <span style={{ margin: '0 8px' }}>·</span>
                <span>Investimento</span>
              </p>
              <h2 style={E.tituloSecao}>Valor total e formas de pagamento</h2>
            </div>

            <div style={E.blocoValor}>
              <p style={E.rotuloValorTotal}>Valor total da proposta</p>
              <p style={E.valorTotal}>R$ {fmt(totalCliente)}</p>
              <p style={E.subValor}>
                <span>Estação de recarga</span>
                <span style={{ margin: '0 6px' }}>·</span>
                <span>chaves na mão</span>
                <span style={{ margin: '0 6px' }}>·</span>
                <span>equipamentos WEG + materiais + serviços</span>
              </p>
            </div>

            {/* Escopo detalhado SEM valor por item — Kalebe 2026-08-27:
                regra Spin fixa é 'cliente vê só total consolidado', mas o
                escopo entra descritivo pra dar transparência do que está
                incluso sem quebrar a regra. */}
            <h3 style={E.subtituloSecao}>Escopo consolidado</h3>
            <div style={E.gridDados}>
              <DadoLinha rot="Equipamentos WEG" val={`${qtdTotalEquip} item${qtdTotalEquip === 1 ? '' : 's'} · incluso`} />
              <DadoLinha rot="Materiais CA" val="Componentes inclusos" />
              {precoEle > 0 && <DadoLinha rot="Elétrica predial" val="incluso" />}
              {precoAlv > 0 && <DadoLinha rot="Alvenaria" val="incluso" />}
              {precoDesloc > 0 && <DadoLinha rot="Deslocamento" val="incluso" />}
              {(incluiUni || incluiTri) && (
                <DadoLinha
                  rot="Documentos técnicos"
                  val={`${incluiUni && incluiTri ? 'Unifilar + Trifilar' : incluiUni ? 'Unifilar' : 'Trifilar'} · incluso`}
                />
              )}
              <DadoLinha rot="Instalação e comissionamento" val="incluso" />
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
                  <span>{cidadeInst}/{ufInst}</span>
                  <span>,&nbsp;</span>
                  <span>{dataHoje}</span>
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
                  <p style={E.cargoAssinaturaEscuro}>
                    <span>Diretor comercial</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <span>Spin Solar</span>
                  </p>
                  <p style={E.docAssinaturaEscuro}>CNPJ {cnpjEmpresa}</p>
                </div>
                <div style={E.blocoAssinaturaLado}>
                  <div style={E.espacoScan} />
                  <div style={E.linhaAssinaturaBranca} />
                  <p style={E.nomeAssinaturaEscuro}>{projeto.cliente_razao_social || '—'}</p>
                  <p style={E.cargoAssinaturaEscuro}>
                    <span>Cliente</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <span>Tomador</span>
                  </p>
                  <p style={E.docAssinaturaEscuro}>
                    {projeto.cliente_cpf_cnpj ? `CPF/CNPJ ${formatarCpfCnpj(String(projeto.cliente_cpf_cnpj))}` : 'CPF/CNPJ ______________________'}
                  </p>
                </div>
              </div>
            </div>

            <div style={E.rodapeManifesto}>
              <span>Página 3 de 3</span>
              <span>
                <span>Assinado digitalmente</span>
                <span style={{ margin: '0 6px' }}>·</span>
                <span>{dataHoje}</span>
              </span>
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

/**
 * Ficha técnica de 1 equipamento WEG.
 * Mostra: modelo + qtd + potência no header dourado, descrição curta do
 * catálogo, e specs relevantes (tensão, corrente, protocolos, dimensões).
 * Se não tem descrição cadastrada, orienta pra completar no catálogo.
 */
function FichaEquipamento({ equip }: { equip: any }) {
  const specs = equip.specs || {}
  const specsRelevantes: Array<[string, string]> = []
  const push = (rot: string, val: any) => {
    if (val !== undefined && val !== null && val !== '') specsRelevantes.push([rot, String(val)])
  }
  push('Tensão', specs.tensao || specs.tensao_desc)
  push('Corrente máx', specs.corrente_max_a ? `${specs.corrente_max_a} A` : specs.corrente)
  push('Fases', specs.fases || specs.num_fases)
  push('Conector', specs.tipo_conector || specs.conector)
  push('Protocolo', specs.protocolo_comunicacao || specs.protocolos)
  push('Grau proteção', specs.grau_protecao || specs.ip)
  push('Certificação', specs.certificacoes || specs.certificacao)

  return (
    <div style={{ marginBottom: 16, border: '1px solid rgba(245,180,0,.2)', borderRadius: 4, overflow: 'hidden' as const }}>
      <div style={{ background: 'rgba(245,180,0,.08)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontFamily: E.font.display, fontSize: 13, fontWeight: 700, color: '#F5F5F0', letterSpacing: '-0.01em' }}>
            {equip.modelo}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 9, color: 'rgba(245,245,240,.55)', letterSpacing: 0.5 }}>
            <span>Código WEG</span>
            <span style={{ margin: '0 5px' }}>·</span>
            <span>{equip.codigo_weg}</span>
          </p>
        </div>
        <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
          <p style={{ margin: 0, fontFamily: E.font.display, fontSize: 20, fontWeight: 700, color: '#F5B400', letterSpacing: '-0.02em' }}>
            {equip.qtd}×
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 9, color: 'rgba(245,245,240,.55)' }}>
            {Number(equip.potencia_kw || 0) > 0 ? `${equip.potencia_kw} kW` : 'sem potência'}
          </p>
        </div>
      </div>
      <div style={{ padding: '10px 14px' }}>
        {equip.descricao_curta ? (
          <p style={{ margin: '0 0 8px', fontSize: 10.5, color: 'rgba(245,245,240,.75)', lineHeight: 1.5 }}>
            {equip.descricao_curta}
          </p>
        ) : (
          <p style={{ margin: '0 0 8px', fontSize: 10, color: 'rgba(245,245,240,.35)', fontStyle: 'italic' as const, lineHeight: 1.5 }}>
            Descrição técnica não cadastrada no catálogo — complete em /admin/catalogo pra aparecer aqui.
          </p>
        )}
        {specsRelevantes.length > 0 && (
          <div style={{ display: 'grid' as const, gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 16px', paddingTop: 6, borderTop: '1px solid rgba(245,245,240,.06)' }}>
            {specsRelevantes.slice(0, 8).map(([rot, val]) => (
              <div key={rot} style={{ display: 'flex' as const, justifyContent: 'space-between' as const, gap: 8, fontSize: 9.5 }}>
                <span style={{ color: 'rgba(245,245,240,.5)' }}>{rot}</span>
                <span style={{ color: '#F5F5F0', fontWeight: 600 as const, textAlign: 'right' as const }}>{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Item de lista de serviço com título em bold + descrição inline, sem
 *  colar as palavras (html2canvas colapsa whitespace de text nodes puros). */
function ItemServ({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <li style={E.itemServ}>
      <strong style={{ color: '#F5F5F0' }}>{titulo}</strong>
      <span>&nbsp;{children}</span>
    </li>
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
  tituloEmpresa: { margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, letterSpacing: '0.04em' },
  subEmpresa: { margin: '2px 0 0', fontSize: 9, color: 'rgba(245,245,240,.55)', letterSpacing: 0.4 },
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
