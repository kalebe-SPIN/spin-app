'use client'

import { forwardRef } from 'react'
import { E } from '@/components/PropostaVEPDFTemplate'
import { formatarCpfCnpj, fmtNum } from '@/lib/formatters'
import type { CalculoVendaDireta } from '@/lib/precificacao/venda-direta'
import { enderecoEntrega, type ItemDadosVendaDireta } from '@/lib/venda-direta/tipos'
import { TITULO_TERMO_VENDA_DIRETA, CLAUSULAS_TERMO_VENDA_DIRETA } from '@/lib/venda-direta/termo'

/**
 * PDF da proposta de VENDA DIRETA de equipamentos (Kalebe 2026-09-29).
 * Mesmo visual "Manifesto" das propostas VE/FV. Regras aplicadas:
 *  - bloco Cliente só com Nome + CPF/CNPJ (endereço/tel/e-mail ficam no sistema)
 *  - visão cliente: lista de equipamentos + TOTAL (sem preço por item)
 *  - assinatura escaneada do Kalebe no bloco Spin
 *  - termo de isenção de responsabilidade técnica anexado
 * Cada <section> vira uma página A4 (794 × 1123 px).
 */

const ITENS_PAGINA_1 = 12
const ITENS_PAGINA_EXTRA = 24
const PAGINA = { ...E.pagina, height: 1123, minHeight: 1123 }
const CONTEUDO = { ...E.conteudoRel, height: 1123, minHeight: 1123 }

type Props = {
  projeto: any
  dados: ItemDadosVendaDireta
  calculo: CalculoVendaDireta
  configEmpresa: any
}

export const PropostaVendaDiretaPDF = forwardRef<HTMLDivElement, Props>(
  ({ projeto, dados, calculo, configEmpresa }, ref) => {
    const empresa = configEmpresa || {}
    const brl = (v: number) => `R$ ${fmtNum(v, 2)}`
    const hoje = new Date()
    const validade = new Date(hoje.getTime() + 15 * 24 * 3600 * 1000)
    const razaoEmpresa = empresa.razao_social || 'Spin Solar Energias Renováveis Ltda'
    const cnpjEmpresa = formatarCpfCnpj(String(empresa.cnpj || '22279642000104'))
    const entrega = enderecoEntrega(dados)
    const destino = [entrega.cidade, entrega.uf].filter(Boolean).join('/')
    const itens = dados.itens || []
    const pg = calculo.pagamento

    const paginasItens: typeof itens[] = [itens.slice(0, ITENS_PAGINA_1)]
    for (let i = ITENS_PAGINA_1; i < itens.length; i += ITENS_PAGINA_EXTRA) {
      paginasItens.push(itens.slice(i, i + ITENS_PAGINA_EXTRA))
    }

    const Cabecalho = () => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {empresa.logo_url
            ? <img src={empresa.logo_url} alt="Spin" style={{ height: 40, objectFit: 'contain' }} crossOrigin="anonymous" />
            : <div style={E.logoBox}>S</div>}
          <div>
            <p style={E.tituloEmpresa}>SPIN SOLAR</p>
            <p style={E.subEmpresa}>{razaoEmpresa} · CNPJ {cnpjEmpresa}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={E.rotuloDourado}>Venda de equipamentos</p>
          <p style={E.codigoProposta}>{projeto.codigo}</p>
        </div>
      </div>
    )

    const Rodape = ({ pagina }: { pagina: string }) => (
      <div style={{ ...E.rodapeManifesto, marginTop: 'auto' }}>
        <span>Emitida em {hoje.toLocaleDateString('pt-BR')} · válida até {validade.toLocaleDateString('pt-BR')}</span>
        <span>{pagina}</span>
      </div>
    )

    const TabelaItens = ({ lista, inicio }: { lista: typeof itens; inicio: number }) => (
      <table style={E.tabela}>
        <thead>
          <tr>
            <th style={{ ...E.th, width: 36 }}>#</th>
            <th style={E.th}>Equipamento</th>
            <th style={{ ...E.th, textAlign: 'right' as const, width: 70 }}>Qtd</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((it, i) => {
            const numero = inicio + i + 1
            return (
              <tr key={`${it.produto_id}-${numero}`}>
                <td style={{ ...E.td, color: 'rgba(245,245,240,.45)' }}>{numero}</td>
                <td style={E.td}>
                  <span style={{ fontWeight: 700 }}>{[it.fabricante, it.modelo].filter(Boolean).join(' · ')}</span>
                  {it.descricao && it.descricao !== it.modelo && (
                    <span style={{ display: 'block', fontSize: 10, color: 'rgba(245,245,240,.55)', marginTop: 2 }}>{it.descricao}</span>
                  )}
                </td>
                <td style={{ ...E.td, textAlign: 'right' as const, fontWeight: 700 }}>{fmtNum(it.qtd, 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )

    const totalPaginas = paginasItens.length + 2

    return (
      <div ref={ref} style={{ background: '#050B16', color: '#F5F5F0', fontFamily: E.font.body }}>
        {paginasItens.map((lista, idx) => (
          <section key={idx} style={PAGINA}>
            {idx === 0 && <div style={E.haloCanto} />}
            <div style={CONTEUDO}>
              <Cabecalho />
              {idx === 0 ? (
                <>
                  <p style={{ ...E.rotuloDourado, fontSize: 11, letterSpacing: 4, marginBottom: 12 }}>Proposta comercial</p>
                  <h1 style={{ ...E.tituloManifesto, fontSize: 40 }}>Fornecimento de<br />equipamentos</h1>
                  <div style={{ ...E.blocoDados, marginTop: 36, marginBottom: 32 }}>
                    <div>
                      <p style={E.rotuloMini}>Cliente</p>
                      <p style={E.nomeCliente}>{dados.nf.nome}</p>
                      <p style={E.docCliente}>{formatarCpfCnpj(dados.nf.documento)}</p>
                    </div>
                    <div>
                      <p style={E.rotuloMini}>Entrega</p>
                      <p style={E.nomeCliente}>{destino || '—'}</p>
                      <p style={E.docCliente}>{calculo.frete > 0 ? 'Frete incluso no valor' : 'Frete a combinar'}</p>
                    </div>
                  </div>
                  <p style={E.subtituloSecao}>Equipamentos ({fmtNum(calculo.qtd_itens, 0)} unidades)</p>
                </>
              ) : (
                <p style={E.subtituloSecao}>Equipamentos (continuação)</p>
              )}
              <TabelaItens lista={lista} inicio={idx === 0 ? 0 : ITENS_PAGINA_1 + (idx - 1) * ITENS_PAGINA_EXTRA} />
              <Rodape pagina={`${idx + 1}/${totalPaginas}`} />
            </div>
          </section>
        ))}

        {/* Investimento e condições */}
        <section style={PAGINA}>
          <div style={CONTEUDO}>
            <Cabecalho />
            <div style={E.headerSecao}>
              <p style={E.rotuloDourado}>Investimento</p>
              <h2 style={E.tituloSecao}>Valor e formas de pagamento</h2>
            </div>
            <div style={E.blocoValor}>
              <p style={E.rotuloValorTotal}>Total à vista</p>
              {/* Kalebe 2026-09-30: cupom de desconto aparece como "de/por" */}
              {calculo.desconto_cupom > 0 && (
                <p style={{ fontSize: 13, color: 'rgba(245,245,240,.5)', textDecoration: 'line-through', margin: '4px 0 0' }}>
                  de {brl(calculo.pv_cheio)}
                </p>
              )}
              <p style={E.valorTotal}>{brl(pg.a_vista)}</p>
              {calculo.desconto_cupom > 0 && calculo.cupom && (
                <p style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, margin: '2px 0 6px' }}>
                  Cupom {calculo.cupom.codigo}: −{brl(calculo.desconto_cupom)}
                </p>
              )}
              <p style={E.subValor}>PIX ou boleto bancário à vista · equipamentos{calculo.frete > 0 ? ' + frete' : ''} · nota fiscal emitida pela Spin Solar</p>
            </div>
            <table style={E.tabela}>
              <tbody>
                <tr>
                  <td style={E.td}>PIX à vista</td>
                  <td style={{ ...E.td, textAlign: 'right' as const, fontWeight: 700 }}>{brl(pg.a_vista)}</td>
                </tr>
                <tr>
                  <td style={E.td}>Boleto bancário à vista</td>
                  <td style={{ ...E.td, textAlign: 'right' as const, fontWeight: 700 }}>{brl(pg.a_vista)}</td>
                </tr>
                <tr>
                  <td style={E.td}>
                    Cartão de crédito em até {fmtNum(pg.cartao_parcelas, 0)}x
                    <span style={{ display: 'block', fontSize: 10, color: 'rgba(245,245,240,.55)', marginTop: 2 }}>
                      Taxa do cartão por conta do cliente · total {brl(pg.cartao_total)}
                    </span>
                  </td>
                  <td style={{ ...E.td, textAlign: 'right' as const, fontWeight: 700 }}>
                    {fmtNum(pg.cartao_parcelas, 0)}x de {brl(pg.cartao_parcela)}
                  </td>
                </tr>
              </tbody>
            </table>

            <p style={E.subtituloSecao}>Condições</p>
            <ul style={E.listaServ}>
              <li style={E.itemServ}>Proposta válida até {validade.toLocaleDateString('pt-BR')}; preços sujeitos à disponibilidade de estoque do fabricante.</li>
              <li style={E.itemServ}>{calculo.frete > 0 ? `Frete incluso para entrega em ${destino}.` : `Frete não incluso — combinado à parte para entrega em ${destino}.`}</li>
              <li style={E.itemServ}>Prazo de entrega informado na confirmação do pedido, conforme disponibilidade do fabricante.</li>
              <li style={E.itemServ}>Fornecimento apenas dos equipamentos listados — sem projeto, instalação ou homologação (ver termo na página seguinte).</li>
              <li style={E.itemServ}>Garantia dos equipamentos conforme os termos do fabricante.</li>
            </ul>
            <Rodape pagina={`${totalPaginas - 1}/${totalPaginas}`} />
          </div>
        </section>

        {/* Termo + aceite */}
        <section style={PAGINA}>
          <div style={CONTEUDO}>
            <Cabecalho />
            <div style={E.headerSecao}>
              <p style={E.rotuloDourado}>Termo</p>
              <h2 style={{ ...E.tituloSecao, fontSize: 24 }}>{TITULO_TERMO_VENDA_DIRETA}</h2>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(245,245,240,.78)' }}>
              {CLAUSULAS_TERMO_VENDA_DIRETA.map((c, i) => (
                <li key={i} style={{ fontSize: 11, lineHeight: 1.55, marginBottom: 10 }}>{c}</li>
              ))}
            </ol>

            <div style={E.blocoAssinaturaCard}>
              <div style={E.tituloAceite}>
                <span style={E.rotuloAceiteDourado}>Aceite da proposta e do termo</span>
                <span style={E.dataAceite}>{projeto.codigo}</span>
              </div>
              <div style={E.gridAssinaturas}>
                <div style={E.blocoAssinaturaLado}>
                  <div style={E.espacoScan}>
                    {empresa.rt_assinatura_url && (
                      <img src={empresa.rt_assinatura_url} alt="Assinatura" style={E.imgAssinatura} crossOrigin="anonymous" />
                    )}
                  </div>
                  <div style={E.linhaAssinaturaBranca} />
                  <p style={E.nomeAssinaturaEscuro}>{empresa.rt_nome || 'Kalebe Grün'}</p>
                  <p style={E.cargoAssinaturaEscuro}>Spin Solar · Diretor comercial</p>
                </div>
                <div style={E.blocoAssinaturaLado}>
                  <div style={E.espacoScan} />
                  <div style={E.linhaAssinaturaBranca} />
                  <p style={E.nomeAssinaturaEscuro}>{dados.nf.nome}</p>
                  <p style={E.cargoAssinaturaEscuro}>{formatarCpfCnpj(dados.nf.documento)}</p>
                  <p style={E.docAssinaturaEscuro}>Data: ____/____/______</p>
                </div>
              </div>
            </div>
            <Rodape pagina={`${totalPaginas}/${totalPaginas}`} />
          </div>
        </section>
      </div>
    )
  },
)
PropostaVendaDiretaPDF.displayName = 'PropostaVendaDiretaPDF'
