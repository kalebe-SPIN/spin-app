import { MapaSantaCatarina } from '@/components/vaga/MapaSantaCatarina'
import { SimuladorSolar } from '@/components/vaga/SimuladorSolar'
import { COMISSAO_SOLAR_FAIXAS, GARANTIA_ESCALONADA, calcularComissaoSolar } from '@/lib/proposta-solar'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Proposta do PARCEIRO COMERCIAL — SISTEMAS FOTOVOLTAICOS (venda de sistemas).
 * Estrutura espelha a comercial O&M. Condições reais:
 *   comissão escalonada 3-6% sobre o valor total da venda; seguro mínimo só nos
 *   3 primeiros meses; no regime é 100% comissão (sem fixo).
 */
export function PropostaSolarConteudo({
  nomeCandidato,
  zona,
  cidades = [],
  empresa,
  podeBaixarPdf = false,
}: {
  nomeCandidato: string
  zona?: string | null
  cidades?: string[]
  empresa?: { razao_social?: string | null; cnpj?: string | null; logo_url?: string | null } | null
  podeBaixarPdf?: boolean
}) {
  const primeiroNome = nomeCandidato?.split(' ')[0] || ''

  return (
    <>
      {/* ===== HERO ===== */}
      <header className="mb-16">
        {empresa?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={empresa.logo_url} alt={empresa.razao_social || 'Spin Solar'} className="h-12 w-auto object-contain mb-6" style={{ filter: 'brightness(0) invert(1)' }} />
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sol/10 border border-sol/25 rounded-full mb-6">
            <span className="text-sol text-xs font-bold uppercase tracking-wider">SPIN Solar</span>
            <span className="text-white/40 text-xs">· Proposta de parceria</span>
          </div>
        )}
        <h1 className="text-3xl md:text-5xl font-black text-white leading-[1.05] tracking-tighter2 mb-4">
          Parceiro Comercial
          <br />
          <span className="text-sol">Sistemas Fotovoltaicos</span>
        </h1>
        <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
          {primeiroNome ? <><strong className="text-white">{primeiroNome}</strong>, e</> : 'E'}sta é a
          sua proposta para <strong className="text-white">vender sistemas fotovoltaicos</strong> — do residencial
          ao industrial — com a estrutura, o catálogo e o app da SPIN por trás de você.
        </p>
        {zona && (
          <p className="mt-3 text-sm text-white/40">
            Zona de atuação: <span className="text-white/70 font-semibold">{zona}</span>
          </p>
        )}
        <div className="mt-6">
          {podeBaixarPdf ? (
            <p className="text-sm text-verde">📄 PDF disponível após assinatura do contrato.</p>
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-white/40">🔒 O PDF da proposta fica disponível para download após a assinatura do contrato.</p>
          )}
        </div>
      </header>

      {/* ===== ÁREA DE ATUAÇÃO ===== */}
      {cidades.length > 0 && (
        <Secao titulo="Sua área de atuação" numero="00">
          <p className="text-white/60 leading-relaxed mb-6">
            Em Santa Catarina, sua zona{zona ? <> (<span className="text-white/80">{zona}</span>)</> : ''} cobre as
            cidades marcadas abaixo. É onde estão os seus clientes.
          </p>
          <MapaSantaCatarina cidades={cidades} />
        </Secao>
      )}

      {/* ===== 01 · A OPORTUNIDADE ===== */}
      <Secao titulo="A oportunidade" numero="01">
        <p className="text-white/70 leading-relaxed mb-4">
          A conta de luz não para de subir e a energia solar já se pagou como o melhor investimento pra casa e
          empresa. A demanda existe — <Destaque>o que falta é quem apresente a solução certa</Destaque>, com preço,
          engenharia e instalação que o cliente confia.
        </p>
        <p className="text-white/70 leading-relaxed">
          A SPIN é <strong className="text-white">integradora WEG autorizada há 9 anos</strong>. Você vende; a SPIN
          projeta, homologa e instala. Você ganha comissão sobre cada sistema fechado.
        </p>
      </Secao>

      {/* ===== 02 · O QUE VOCÊ VAI FAZER ===== */}
      <Secao titulo="O que você vai fazer" numero="02">
        <p className="text-white/70 leading-relaxed mb-6">
          Vender <Destaque>sistemas fotovoltaicos</Destaque> — residencial, comercial e industrial. O ciclo é seu:
        </p>
        <div className="grid gap-4">
          {[
            ['Prospectar / receber o lead', 'Você trabalha os leads das campanhas da SPIN e os que você mesmo traz.'],
            ['Dimensionar e orçar', 'No app: conta de luz vira dimensionamento e proposta em PDF na hora.'],
            ['Apresentar e negociar', 'Mostra economia, retorno e as formas de pagamento (à vista, cartão, financiamento).'],
            ['Fechar', 'Cliente assinou — a SPIN assume projeto, homologação e instalação. Você acompanha.'],
          ].map(([t, d], i) => (
            <div key={i} className="flex gap-4 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <span className="shrink-0 w-8 h-8 rounded-lg bg-sol/15 text-sol font-black flex items-center justify-center">{i + 1}</span>
              <p className="text-white/70 leading-relaxed"><strong className="text-white">{t}</strong> — {d}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* ===== 03 · O QUE A SPIN ENTREGA ===== */}
      <Secao titulo="O que a SPIN entrega" numero="03">
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['Leads de campanha', 'Tráfego pago rodando — leads chegando pra você trabalhar'],
            ['App com orçamento', 'Dimensionamento e proposta em PDF na hora, no celular'],
            ['Catálogo WEG', 'Integrador autorizado há 9 anos — produto de ponta e preço competitivo'],
            ['Engenharia e projeto', 'Dimensionamento técnico, ART e responsável técnico — por conta da SPIN'],
            ['Homologação CELESC', 'A SPIN cuida de toda a burocracia com a distribuidora'],
            ['Equipe de instalação', 'Instaladores próprios — você não coloca a mão na obra'],
            ['Financiamento', 'Parcerias com bancos pra viabilizar a venda'],
            ['Pós-venda', 'Monitoramento e suporte — o cliente fica seu, satisfeito'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-white font-bold text-sm mb-1">{t}</p>
              <p className="text-white/55 text-sm leading-snug">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 p-4 bg-sol/[0.06] border border-sol/25 rounded-xl">
          <span className="text-2xl">📱</span>
          <p className="text-white/75 text-sm leading-relaxed">
            <strong className="text-white">Trabalho de qualquer lugar.</strong> Precisa de um celular e internet —
            o app faz o orçamento e a proposta. A SPIN entrega o resto.
          </p>
        </div>
      </Secao>

      {/* ===== 04 · REMUNERAÇÃO ===== */}
      <Secao titulo="Remuneração" numero="04">
        <p className="text-white/70 leading-relaxed mb-6">
          Você é <Destaque>100% comissionado</Destaque>: ganha sobre o <strong className="text-white">valor total
          das vendas</strong>. A comissão é escalonada — <strong className="text-white">o percentual da faixa que
          você atingir no mês incide sobre TODO o faturamento</strong> (não é por parte, é sobre o total). Bateu a
          faixa de cima? O percentual maior vale pra tudo que você vendeu no mês.
        </p>
        <div className="overflow-hidden rounded-xl border border-white/10 mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Faturamento de vendas no mês</th>
                <th className="px-4 py-3 font-semibold text-right">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {COMISSAO_SOLAR_FAIXAS.map((f, i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3">{f.faixa}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{f.pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Seguro mínimo (garantia de recebimento) nos 3 meses */}
        <div className="p-5 md:p-6 bg-sol/[0.08] border border-sol/30 rounded-2xl mb-6">
          <p className="text-sol font-bold mb-1">🛡 Garantia de recebimento nos 3 primeiros meses</p>
          <p className="text-white/60 text-sm mb-4">Você nunca recebe menos que isto enquanto monta a carteira:</p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {GARANTIA_ESCALONADA.map((g) => (
              <div key={g.mes} className="text-center p-3 bg-white/[0.04] border border-white/10 rounded-xl">
                <p className="text-[11px] text-white/50 uppercase tracking-wider mb-1">Mês {g.mes}</p>
                <p className="text-xl md:text-2xl font-black text-white">{brl(g.valor)}</p>
              </div>
            ))}
          </div>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            Funciona como um <strong className="text-white">seguro</strong>: se a sua comissão do mês{' '}
            <strong className="text-white">não alcançar</strong> esse valor, você recebe o garantido. Se{' '}
            <strong className="text-white">ultrapassar</strong>, recebe a comissão cheia — sempre o que for maior.
            Pago integral com a meta cumprida (proporcional se não atingir).
          </p>
        </div>
        <p className="text-sm text-white/55 leading-relaxed">
          <strong className="text-white/80">Depois dos 3 meses não há fixo</strong> — é 100% comissão, sem teto:
          quem vende mais, ganha mais.
        </p>
      </Secao>

      {/* ===== 05 · SIMULADOR ===== */}
      <Secao titulo="Simule o seu ganho" numero="05">
        <p className="text-white/60 leading-relaxed mb-6">
          Escolha o período, diga se bateu a meta e informe quanto vendeu no mês — a comissão aparece ao vivo.
        </p>
        <SimuladorSolar />
      </Secao>

      {/* ===== 06 · O QUE DÁ PRA GANHAR ===== */}
      <Secao titulo="O que dá para ganhar" numero="06">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Vendas no mês</th>
                <th className="px-4 py-3 font-semibold text-right">Sua comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[100000, 180000, 300000, 500000].map((v, i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3 font-semibold text-white">{brl(v)}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{brl(calcularComissaoSolar(v).total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-white/45">
          Um sistema comercial já fecha na casa das dezenas de milhares — poucas vendas por mês colocam você em
          faixas altas. Não é teto: é a comissão do modelo com vendas consistentes.
        </p>
      </Secao>

      {/* ===== 07 · O QUE ESPERAMOS ===== */}
      <Secao titulo="O que esperamos" numero="07">
        <p className="text-white/70 leading-relaxed mb-6">
          Meta de <Destaque>atividade e resultado</Destaque>, não de sorte. Nos 3 primeiros meses (experiência), a
          continuidade depende de <strong className="text-white">duas coisas juntas</strong>:
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="p-4 bg-white/[0.04] border border-white/10 rounded-xl">
            <p className="text-sol font-bold text-sm mb-1">1 · Atividade</p>
            <p className="text-white/65 text-sm leading-snug">Prospecção, atendimento aos leads e propostas enviadas.</p>
          </div>
          <div className="p-4 bg-white/[0.04] border border-white/10 rounded-xl">
            <p className="text-sol font-bold text-sm mb-1">2 · Vendas fechadas</p>
            <p className="text-white/65 text-sm leading-snug">Resultado real — sistemas vendidos que mostram que o perfil encaixa.</p>
          </div>
        </div>
        <p className="text-white/60 text-sm leading-relaxed">
          <strong className="text-white">Não basta atividade.</strong> Entregando os dois, a experiência renova e
          vira contratação efetiva — aí é você e a comissão, sem teto.
        </p>
      </Secao>

      {/* ===== 08 · FORMATO DE CONTRATAÇÃO ===== */}
      <Secao titulo="Formato de contratação" numero="08">
        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl mb-6">
          <p className="text-white font-bold text-base md:text-lg mb-2">📋 Contratação PJ — sem vínculo empregatício</p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            Você atua como <strong className="text-white">pessoa jurídica (PJ)</strong>, representante comercial
            autônomo (Lei 4.886/65), com <strong className="text-white">CNPJ próprio</strong>.{' '}
            <strong className="text-sol">Não há vínculo empregatício</strong> — não é CLT, não há subordinação,
            FGTS, 13º nem férias remuneradas. Após a experiência, remuneração 100% por comissão.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-5 bg-verde/[0.06] border border-verde/25 rounded-xl">
            <p className="text-verde font-bold mb-2">A favor</p>
            <p className="text-white/65 text-sm leading-relaxed">
              Autonomia total, comissão sem teto, estrutura completa da SPIN (engenharia, homologação, instalação),
              leads de campanha e trabalho de qualquer lugar.
            </p>
          </div>
          <div className="p-5 bg-coral/[0.06] border border-coral/25 rounded-xl">
            <p className="text-coral font-bold mb-2">Contra</p>
            <p className="text-white/65 text-sm leading-relaxed">
              Não há FGTS, 13º nem férias. É necessário CNPJ. Após os 3 meses, a renda é 100% variável (por comissão).
            </p>
          </div>
        </div>
      </Secao>

      {/* ===== 09 · COMO E QUANDO RECEBE ===== */}
      <Secao titulo="Como e quando você recebe" numero="09">
        <div className="grid sm:grid-cols-4 gap-3 mb-6">
          {[
            ['Fim do mês', 'Fecha o ciclo: apuramos as vendas fechadas e recebidas.'],
            ['Consolidação', 'O sistema consolida a comissão (e o seguro, nos 3 meses).'],
            ['Você emite a NF', 'Como PJ, você emite a nota fiscal do valor apurado.'],
            ['Até o dia 05', 'O pagamento cai no seu PIX até o dia 05 do mês seguinte.'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-sol/15 text-sol font-black flex items-center justify-center mb-2 text-sm">{i + 1}</div>
              <p className="text-white font-bold text-sm mb-1">{t}</p>
              <p className="text-white/55 text-xs leading-snug">{d}</p>
            </div>
          ))}
        </div>
        <div className="p-5 bg-verde/[0.06] border border-verde/25 rounded-2xl">
          <p className="text-verde font-bold mb-2">Exemplo prático</p>
          <p className="text-white/75 text-sm leading-relaxed">
            Em março você vendeu <strong className="text-white">{brl(180000)}</strong> em sistemas. Comissão do mês:{' '}
            <strong className="text-sol">{brl(calcularComissaoSolar(180000).total)}</strong>. Fecha o ciclo no dia
            31/03, você emite a NF e, até 05/04, o valor cai no seu PIX.
          </p>
        </div>
      </Secao>

      {/* ===== POR QUE AGORA ===== */}
      <div className="mb-16 p-6 md:p-8 bg-gradient-to-br from-sol/[0.08] to-transparent border border-sol/20 rounded-2xl">
        <h3 className="text-xl md:text-2xl font-black text-white mb-3">Por que agora</h3>
        <p className="text-white/70 leading-relaxed">
          A energia solar deixou de ser tendência e virou padrão — e a conta de luz só sobe.{' '}
          <span className="text-white font-semibold">
            Quem tem uma integradora forte por trás vende com confiança e fecha mais.
          </span>{' '}
          A SPIN te dá exatamente isso: 9 anos de WEG, engenharia, homologação e instalação prontas.
        </p>
      </div>
    </>
  )
}

/* ----------------------------- Sub-componentes ----------------------------- */

function Secao({ titulo, numero, children }: { titulo: string; numero: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sol/40 font-mono text-sm font-bold">{numero}</span>
        <h2 className="text-xl md:text-2xl font-black text-white tracking-tightish">{titulo}</h2>
        <span className="flex-1 h-px bg-white/10" />
      </div>
      {children}
    </section>
  )
}

function Destaque({ children }: { children: React.ReactNode }) {
  return <strong className="text-sol font-semibold">{children}</strong>
}
