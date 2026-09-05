import { MapaSantaCatarina } from '@/components/vaga/MapaSantaCatarina'
import { SimuladorCredenciamento } from '@/components/vaga/SimuladorCredenciamento'
import {
  NIVEIS,
  FECHADOR_DO_MES,
  BONUS_RECUPERACAO_LABEL,
  META_SEMANA_LABEL,
} from '@/lib/proposta-credenciamento'

/**
 * Proposta CREDENCIAMENTO SPIN — parceiro de vendas de sistemas fotovoltaicos.
 *
 * Versão gamificada do modelo de parceria: comissão com acelerador de volume +
 * multiplicador de origem, carteira recorrente de O&M, Semana de Fechamento
 * (recuperações) e Sistema de Níveis (Credenciado → Sênior → Master).
 *
 * Copy dos blocos "Segunda Chance" e "Níveis" transcrita do ADENDO 01 do Kalebe.
 */
export function PropostaCredenciamentoConteudo({
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
      {/* HERO */}
      <header className="mb-16">
        {empresa?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={empresa.logo_url} alt={empresa.razao_social || 'Spin Solar'} className="h-12 w-auto object-contain mb-6" style={{ filter: 'brightness(0) invert(1)' }} />
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sol/10 border border-sol/25 rounded-full mb-6">
            <span className="text-sol text-xs font-bold uppercase tracking-wider">SPIN Solar</span>
            <span className="text-white/40 text-xs">· Programa de Credenciamento</span>
          </div>
        )}
        <h1 className="text-3xl md:text-5xl font-black text-white leading-[1.05] tracking-tighter2 mb-3">
          Credenciamento
          <br />
          <span className="text-sol">de parceiros comerciais</span>
        </h1>
        <p className="text-white/45 text-sm mb-4">Venda de sistemas fotovoltaicos · Comissão acelerada · Carteira recorrente</p>
        <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
          {primeiroNome ? <><strong className="text-white">{primeiroNome}</strong>, a</> : 'A'}qui você não é
          contratado — é <strong className="text-white">credenciado</strong>. Vende com autonomia, ganha mais
          quanto mais fatura no mês, e cada cliente que traz vira <strong className="text-white">carteira que
          paga todo mês</strong>.
        </p>
        {zona && <p className="mt-3 text-sm text-white/40">Zona de atuação: <span className="text-white/70 font-semibold">{zona}</span></p>}
        <div className="mt-6">
          {podeBaixarPdf
            ? <p className="text-sm text-verde">📄 PDF disponível após assinatura do contrato.</p>
            : <p className="inline-flex items-center gap-2 text-sm text-white/40">🔒 O PDF da proposta fica disponível para download após a assinatura do contrato.</p>}
        </div>
      </header>

      {/* COMO FUNCIONA — resumo */}
      <div className="mb-16 p-6 md:p-8 bg-gradient-to-br from-sol/[0.08] to-transparent border border-sol/20 rounded-2xl">
        <h3 className="text-xl md:text-2xl font-black text-white mb-3">Três fontes de ganho, não uma</h3>
        <p className="text-white/70 leading-relaxed">
          <strong className="text-white">Comissão na venda</strong> — que acelera conforme seu volume no mês.{' '}
          <strong className="text-white">Bônus</strong> quando o cliente leva o plano de O&amp;M junto.{' '}
          <strong className="text-sol">Carteira recorrente</strong> — um percentual de tudo que sua base paga,
          todo mês, enquanto a usina existir.
        </p>
      </div>

      {/* ÁREA DE ATUAÇÃO */}
      {cidades.length > 0 && (
        <Secao titulo="Sua área de atuação" numero="00">
          <p className="text-white/60 leading-relaxed mb-6">
            Em Santa Catarina, sua zona{zona ? <> (<span className="text-white/80">{zona}</span>)</> : ''} cobre as
            cidades marcadas abaixo.
          </p>
          <MapaSantaCatarina cidades={cidades} />
        </Secao>
      )}

      {/* 01 · PORTFÓLIO E COMISSÃO BASE */}
      <Secao titulo="O portfólio e a comissão base" numero="01">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Linha</th>
                <th className="px-4 py-3 font-semibold">Ticket médio</th>
                <th className="px-4 py-3 font-semibold text-right">Comissão base</th>
                <th className="px-4 py-3 font-semibold text-right">Com plano</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['Sistema residencial', 'R$ 32 mil', '5,0%', '5,5%'],
                ['Sistema comercial', 'R$ 190 mil', '3,5%', '4,0%'],
                ['Usina / industrial', 'R$ 620 mil', '2,5%', '3,0%'],
              ].map(([l, t, c, p], i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3 font-semibold text-white">{l}</td>
                  <td className="px-4 py-3">{t}</td>
                  <td className="px-4 py-3 text-right">{c}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-white/50">A comissão base é o piso. Sobre ela incidem o acelerador de volume e o multiplicador de origem.</p>
      </Secao>

      {/* 02 · ACELERADOR DE VOLUME */}
      <Secao titulo="O acelerador — quanto mais você fatura, mais cada real vale" numero="02">
        <p className="text-white/60 leading-relaxed mb-6">
          A comissão não é uma taxa fixa. Cada faixa de faturamento no mês multiplica o que vem depois dela —
          e o efeito é retroativo dentro da faixa, não só na margem:
        </p>
        <div className="overflow-hidden rounded-xl border border-white/10 mb-4">
          <table className="w-full text-sm">
            <thead><tr className="bg-white/[0.04] text-white/50 text-left"><th className="px-4 py-3 font-semibold">Faturamento no mês</th><th className="px-4 py-3 font-semibold text-right">Multiplicador da faixa</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['Até R$ 50 mil', '1,00×'],
                ['R$ 50 mil – 100 mil', '1,10×'],
                ['R$ 100 mil – 200 mil', '1,20×'],
                ['R$ 200 mil – 400 mil', '1,30×'],
                ['Acima de R$ 400 mil', '1,40×'],
              ].map(([f, m], i) => (
                <tr key={i} className="text-white/75"><td className="px-4 py-3">{f}</td><td className="px-4 py-3 text-right font-bold text-sol">{m}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-weg-azul/10 border border-weg-azul/40 rounded-xl">
          <p className="text-white/80 text-sm leading-relaxed">
            <strong className="text-white">Origem também conta.</strong> Negócio que você mesmo prospecta rende{' '}
            <strong className="text-sol">1,35×</strong> sobre a comissão; lead entregue pela SPIN rende 1,0×. Você
            escolhe o quanto quer depender de lead — e é pago por isso.
          </p>
        </div>
      </Secao>

      {/* 03 · CARTEIRA RECORRENTE */}
      <Secao titulo="A carteira — o que fica depois da venda" numero="03">
        <p className="text-white/70 leading-relaxed mb-4">
          Todo sistema sai da proposta com plano de O&amp;M incluído por padrão. Ele mantém a garantia de
          desempenho válida e gera <Destaque>renda recorrente para você</Destaque>: um percentual de tudo que o
          cliente paga no plano, todo mês, com escala conforme sua carteira cresce.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead><tr className="bg-white/[0.04] text-white/50 text-left"><th className="px-4 py-2.5 font-semibold">Carteira acumulada (MRR)</th><th className="px-3 py-2.5 font-semibold text-right">Anuidade</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {[['até R$ 2.000/mês', '12%'], ['até R$ 5.000/mês', '14%'], ['até R$ 10.000/mês', '16%'], ['acima disso', '18%']].map(([f, p], i) => (
                  <tr key={i} className="text-white/75"><td className="px-4 py-2.5">{f}</td><td className="px-3 py-2.5 text-right font-bold text-sol">{p}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-5 bg-sol/[0.06] border border-sol/25 rounded-xl flex flex-col justify-center">
            <p className="text-white/70 text-sm leading-relaxed">
              No ano 1 a carteira é pequena. No ano 5, com base construída, são
              <strong className="text-sol"> milhares de reais por mês</strong> entrando sem você vender nada.
              Simule abaixo.
            </p>
          </div>
        </div>
      </Secao>

      {/* 04 · SIMULADOR */}
      <Secao titulo="Simule o seu ganho" numero="04">
        <p className="text-white/60 leading-relaxed mb-6">Mexa nos controles: volume, mix de produto, origem, anexação de plano e as recuperações da Semana de Fechamento.</p>
        <SimuladorCredenciamento />
      </Secao>

      {/* 05 · SEGUNDA CHANCE — SEMANA DE FECHAMENTO (copy ADENDO 01, sem urgência) */}
      <Secao titulo="Segunda chance — nenhum “não” aqui é definitivo" numero="05">
        <h3 className="text-lg md:text-xl font-black text-white mb-3">
          Toda última semana do mês, os “não” voltam para a mesa.
        </h3>
        <p className="text-white/70 leading-relaxed mb-3">
          Você trabalhou o lead. Fez proposta. Ele sumiu. Na maioria das empresas, esse cliente vira estatística
          de perda e ninguém toca nele de novo. Aqui não.
        </p>
        <p className="text-white/70 leading-relaxed mb-6">
          Na última semana de todo mês, a base dos últimos 90 dias que não fechou volta a circular — com
          condições especiais de fechamento aprovadas individualmente e uma equipe inteira em regime de campanha.
        </p>

        {/* Faixa "aviso operacional" — 1px sol topo/base, valores em mono à direita */}
        <div className="my-6 border-y border-sol/50 bg-white/[0.02]">
          <div className="px-5 py-5">
            <p className="text-xs uppercase tracking-wider text-sol font-bold mb-4">Bônus de recuperação</p>
            <div className="grid gap-2 max-w-md">
              {BONUS_RECUPERACAO_LABEL.map(({ linha, valor }) => (
                <div key={linha} className="flex items-baseline justify-between border-b border-white/5 pb-1.5">
                  <span className="text-white/70 text-sm">{linha}</span>
                  <span className="text-white font-black font-mono text-lg">{valor}</span>
                </div>
              ))}
              <div className="h-2" />
              {META_SEMANA_LABEL.map(({ meta, bonus }) => (
                <div key={meta} className="flex items-baseline justify-between">
                  <span className="text-white/50 text-sm">{meta}</span>
                  <span className="text-sol font-bold font-mono">{bonus}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
            <p className="text-white font-bold text-sm mb-2">Como funciona</p>
            <ul className="text-white/60 text-sm leading-relaxed space-y-1.5 list-disc pl-4">
              <li>Você recebe uma lista de leads trabalhados e não convertidos</li>
              <li>Nunca os seus — sempre de outro consultor</li>
              <li>Condição facilitada, aprovada caso a caso</li>
              <li>Comissão reduzida, porque a condição é facilitada</li>
              <li><strong className="text-white/80">Bônus de recuperação por fora</strong>, que compensa a diferença</li>
            </ul>
          </div>
          <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
            <p className="text-white font-bold text-sm mb-2">Por que você recebe o lead de outro</p>
            <p className="text-white/60 text-sm leading-relaxed">
              Terceira voz no mesmo contato converte muito acima da mesma voz insistindo. Você chega sem o
              histórico da negociação travada, com uma condição nova e um ângulo novo. E os seus leads não
              convertidos vão para outro consultor, pelo mesmo motivo. Todo mundo ganha uma chance limpa.
            </p>
          </div>
        </div>
        <p className="text-sm text-white/55">
          Cinco recuperações residenciais numa semana somam <strong className="text-sol">R$ 2.450 em bônus</strong> —
          sobre clientes que já estavam perdidos.
        </p>
      </Secao>

      {/* 06 · NÍVEIS (copy ADENDO 01) */}
      <Secao titulo="Níveis — reconhecimento vem com poder, não com placa" numero="06">
        <h3 className="text-lg md:text-xl font-black text-white mb-6">
          Aqui não tem “consultor do mês”. Tem autoridade que muda seu mês.
        </h3>

        {/* Fechador do Mês — destaque próprio antes dos cards */}
        <div className="mb-8 p-5 md:p-6 bg-sol/[0.06] border border-sol/30 rounded-2xl">
          <p className="text-sol font-black text-base mb-1">Fechador do Mês</p>
          <p className="text-white/60 text-sm mb-4">Quem mais recuperar na Semana de Fechamento leva, no mês seguinte:</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {FECHADOR_DO_MES.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-white/75">
                <span className="text-sol mt-0.5">›</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-white/40 mt-4">Rotativo. Perdeu, volta ao normal. Ranking público no app, em tempo real.</p>
        </div>

        {/* Três níveis em escada */}
        <div className="grid md:grid-cols-3 gap-4 items-end">
          {NIVEIS.map((n) => (
            <div
              key={n.nome}
              className={`rounded-2xl border p-5 ${n.destaque ? 'border-sol/50 bg-sol/[0.06] md:pb-8' : 'border-white/10 bg-white/[0.03]'}`}
            >
              <p className={`font-black text-lg mb-1 ${n.destaque ? 'text-sol' : 'text-white'}`}>{n.nome}</p>
              <p className="text-white/45 text-xs leading-relaxed mb-4">{n.criterio}</p>
              <ul className="space-y-1.5">
                {n.privilegios.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-white/75">
                    <span className={n.destaque ? 'text-sol mt-0.5' : 'text-white/30 mt-0.5'}>•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-white/55 leading-relaxed">
          <strong className="text-white/80">O que Master significa na prática:</strong> você deixa de ser só
          consultor e passa a formar consultores — ganhando 1% sobre tudo que eles produzem, todo mês, enquanto
          estiverem na casa. É a diferença entre ter uma carteira e ter uma operação.
        </p>
      </Secao>

      {/* 07 · O QUE A SPIN ENTREGA */}
      <Secao titulo="O que a SPIN entrega" numero="07">
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['Leads de campanha', 'Tráfego pago rodando o mês inteiro'],
            ['App SPIN', 'CRM, calculadora, proposta em PDF — tudo no celular'],
            ['Proposta automática', 'Plano já incluído, preço calculado, comparativo de parcela'],
            ['Engenharia e homologação', 'Projeto, ART, processo na distribuidora'],
            ['Equipe de campo', 'Técnicos próprios de O&M — você não executa serviço'],
            ['Painel “Meu ganho”', 'Faixa do acelerador, MRR da carteira, ranking e próximo nível em tempo real'],
            ['Verba de apoio', 'Reembolso de marketing — 1% do volume, à parte da comissão'],
            ['100% remoto', 'Só um celular e internet, de qualquer lugar'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-white font-bold text-sm mb-1">{t}</p>
              <p className="text-white/55 text-sm leading-snug">{d}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* 08 · FORMATO */}
      <Secao titulo="Formato de credenciamento" numero="08">
        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl mb-4">
          <p className="text-white font-bold text-base md:text-lg mb-2">📋 Representação comercial autônoma (Lei 4.886/65)</p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            Credenciamento PJ, com zona definida e contrato registrado. <strong className="text-sol">Não há
            vínculo empregatício</strong> — não é CLT, sem FGTS, 13º ou férias remuneradas. É necessário CNPJ.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-5 bg-verde/[0.06] border border-verde/25 rounded-xl">
            <p className="text-verde font-bold mb-2">A favor</p>
            <p className="text-white/65 text-sm leading-relaxed">Autonomia de método e ritmo, remuneração sem teto, carteira própria, renda recorrente e plano de carreira com níveis.</p>
          </div>
          <div className="p-5 bg-coral/[0.06] border border-coral/25 rounded-xl">
            <p className="text-coral font-bold mb-2">Contra</p>
            <p className="text-white/65 text-sm leading-relaxed">Sem FGTS, 13º ou férias remuneradas. É necessário CNPJ.</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-white/55 leading-relaxed">
          <strong className="text-white/80">Sobre a carteira:</strong> ela é sua enquanto você for credenciado
          ativo da SPIN. Encerrado o contrato, a anuidade cessa — está escrito de forma clara no instrumento.
        </p>
      </Secao>

      <p className="mt-4 text-center text-xs text-white/30">
        SPIN Solar · Proposta para discussão — sujeita a formalização contratual.
      </p>
    </>
  )
}

/* ----------------------------- Sub-componentes ----------------------------- */

function Secao({ titulo, numero, children }: { titulo: string; numero: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sol/40 font-mono text-sm font-bold">{numero}</span>
        <h2 className="text-lg md:text-2xl font-black text-white tracking-tightish">{titulo}</h2>
        <span className="flex-1 h-px bg-white/10" />
      </div>
      {children}
    </section>
  )
}

function Destaque({ children }: { children: React.ReactNode }) {
  return <strong className="text-sol font-semibold">{children}</strong>
}
