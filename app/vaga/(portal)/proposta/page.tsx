import { getConviteAtual } from '@/lib/convite'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AceitarPropostaBtn } from '@/components/vaga/AceitarPropostaBtn'
import { BaixarPropostaPdf } from '@/components/vaga/BaixarPropostaPdf'

/**
 * Apresentação da proposta de trabalho — /vaga/proposta
 * Conteúdo: Representante Comercial · Serviços de O&M.
 * Padrão visual Spin (paleta noite/sol/weg).
 */
export default async function PropostaPage() {
  const convite = await getConviteAtual()
  if (!convite) redirect('/vaga/login')

  const jaAceita = ['proposta_aceita', 'contrato_assinado', 'docs_enviados', 'concluido'].includes(convite.status)
  const recusada = convite.status === 'recusado'
  const primeiroNome = convite.nome_candidato?.split(' ')[0] || ''

  const supabase = createClient()
  const { data: empresa } = await supabase
    .from('configuracoes_empresa')
    .select('razao_social, cnpj')
    .eq('singleton', true)
    .maybeSingle()

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 md:py-14">
      {/* ===== HERO ===== */}
      <header className="mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-sol/10 border border-sol/25 rounded-full mb-6">
          <span className="text-sol text-xs font-bold uppercase tracking-wider">SPIN Solar</span>
          <span className="text-white/40 text-xs">· Proposta de trabalho</span>
        </div>

        <h1 className="text-3xl md:text-5xl font-black text-white leading-[1.05] tracking-tighter2 mb-4">
          Representante Comercial
          <br />
          <span className="text-sol">Serviços de O&amp;M</span>
        </h1>
        <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
          {primeiroNome ? <><strong className="text-white">{primeiroNome}</strong>, e</> : 'E'}sta é a
          sua proposta para vender contratos de limpeza e manutenção de sistemas fotovoltaicos —
          telhados comerciais e industriais em Santa Catarina.
        </p>
        {convite.zona && (
          <p className="mt-3 text-sm text-white/40">
            Zona de atuação: <span className="text-white/70 font-semibold">{convite.zona}</span>
          </p>
        )}
        <div className="mt-6">
          <BaixarPropostaPdf nomeCandidato={convite.nome_candidato} empresa={empresa} />
        </div>
      </header>

      {/* ===== A OPORTUNIDADE ===== */}
      <Secao titulo="A oportunidade" numero="01">
        <p className="text-white/70 leading-relaxed mb-4">
          Existem hoje, em Santa Catarina, milhares de sistemas solares instalados há três, quatro anos
          que <Destaque>nunca foram limpos</Destaque>. Cada um está perdendo entre <Destaque>8% e 15%</Destaque> da
          geração — dinheiro que o dono paga na conta de luz todo mês sem saber por quê.
        </p>
        <p className="text-white/70 leading-relaxed">
          Quase ninguém oferece esse serviço de forma profissional. E praticamente ninguém sabe onde esses
          sistemas estão. <span className="text-white font-semibold">Nós sabemos. A SPIN vai te entregar a lista.</span>
        </p>
      </Secao>

      {/* ===== O QUE VOCÊ VAI FAZER ===== */}
      <Secao titulo="O que você vai fazer" numero="02">
        <p className="text-white/70 leading-relaxed mb-6">
          Vender contratos de limpeza e manutenção para <Destaque>telhados comerciais e industriais</Destaque> —
          galpões, agro, avicultura, frigoríficos, supermercados e usinas de geração distribuída. O ciclo
          completo é seu:
        </p>
        <div className="grid gap-4">
          {[
            ['Identificar', 'O telhado — base pública da ANEEL cruzada com imagem de satélite. Você sabe quantos módulos tem, quando foi conectado e quanto está perdendo antes da primeira ligação.'],
            ['Abordar', 'O decisor com um diagnóstico pronto, não com uma oferta fria.'],
            ['Negociar e fechar', 'De preferência em contrato de 12 ou 24 meses.'],
            ['Acompanhar', 'O agendamento e o recebimento.'],
          ].map(([t, d], i) => (
            <div key={i} className="flex gap-4 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <span className="shrink-0 w-8 h-8 rounded-lg bg-sol/15 text-sol font-black flex items-center justify-center">{i + 1}</span>
              <p className="text-white/70 leading-relaxed"><strong className="text-white">{t}</strong> — {d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-white/50 leading-relaxed">
          Você não vende limpeza residencial de porta em porta — isso vem de campanha digital. Seu foco é o
          telhado grande.
        </p>
      </Secao>

      {/* ===== O QUE A SPIN ENTREGA ===== */}
      <Secao titulo="O que a SPIN entrega" numero="03">
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['Lista de alvos', 'Base ANEEL filtrada por porte, segmento e tempo sem limpeza'],
            ['Base própria', 'Clientes que a SPIN já instalou — contato quente, conversão alta'],
            ['Leads de campanha', 'Tráfego pago rodando, leads chegando'],
            ['App SPIN', 'CRM, calculadora, gerador de proposta em PDF — tudo no celular'],
            ['Proposta automática', 'O sistema calcula preço, prazo e quanto o cliente perde'],
            ['Equipe de campo', 'Técnicos próprios — você não executa nada'],
            ['Protocolo de trabalho', 'Método testado, não é "se vira aí"'],
            ['Trabalho remoto', 'Sem deslocamento, sem escritório, sem custo seu'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-white font-bold text-sm mb-1">{t}</p>
              <p className="text-white/55 text-sm leading-snug">{d}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* ===== REMUNERAÇÃO ===== */}
      <Secao titulo="Remuneração" numero="04">
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <Card destaque titulo="Fixo mensal" valor="R$ 2.000" sub="vinculado à meta de atividade do mês" />
          <Card destaque titulo="Garantia de início" valor="R$ 5.000/mês" sub="nos 3 primeiros meses, independente de resultado" />
        </div>
        <p className="text-sm text-white/55 leading-relaxed mb-8">
          Construir carteira nesse mercado leva de 60 a 90 dias. A SPIN banca esse período — é a nossa aposta
          em você, não um risco que jogamos no seu colo.
        </p>

        <h4 className="text-white font-bold mb-3">Comissão escalonada</h4>
        <p className="text-sm text-white/50 mb-4">
          Sobre o faturamento <strong className="text-white/80">recebido</strong> no mês. Cada faixa incide só
          sobre a parte dentro dela.
        </p>
        <div className="overflow-hidden rounded-xl border border-white/10 mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Faturamento no mês</th>
                <th className="px-4 py-3 font-semibold text-right">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['até R$ 15.000', '—'],
                ['R$ 15.001 a 30.000', '10%'],
                ['R$ 30.001 a 50.000', '13%'],
                ['R$ 50.001 a 80.000', '16%'],
                ['acima de R$ 80.000', '18%'],
              ].map(([faixa, com], i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3">{faixa}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{com}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-5 bg-sol/[0.06] border border-sol/25 rounded-xl mb-8">
          <p className="text-sol font-bold mb-1">Multiplicador de prospecção · 1,6×</p>
          <p className="text-white/65 text-sm leading-relaxed">
            Cliente que <strong className="text-white">você</strong> encontrou e trouxe vale 1,6× a comissão
            normal. Quem farma a base recebe menos. Quem caça recebe mais.
          </p>
        </div>

        <h4 className="text-white font-bold mb-3">Extras</h4>
        <div className="grid gap-2 mb-8">
          {[
            ['Contrato recorrente assinado', 'R$ 150 residencial · R$ 500 comercial · R$ 1.200 usina'],
            ['Prêmio de upsell (termografia, laudo, reaperto)', '15% a 30% do valor'],
            ['Carteira própria ativa', 'R$ 500 (10) · R$ 1.500 (25) · R$ 4.000 (50) · R$ 10.000 (100)'],
            ['Indicação para o time de solar', '0,5% do projeto fechado'],
          ].map(([t, v], i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg">
              <span className="text-white/70 text-sm">{t}</span>
              <span className="text-white font-semibold text-sm">{v}</span>
            </div>
          ))}
        </div>

        <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <p className="text-white font-bold mb-1">Titularidade · 24 meses</p>
          <p className="text-white/65 text-sm leading-relaxed">
            Cliente que você prospectou é seu por 24 meses. Toda limpeza que ele fizer nesse período gera
            comissão para você — inclusive as que acontecem sozinhas, pelo contrato.
          </p>
        </div>
      </Secao>

      {/* ===== O QUE DÁ PARA GANHAR ===== */}
      <Secao titulo="O que dá para ganhar" numero="05">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Fase</th>
                <th className="px-4 py-3 font-semibold">Faturamento gerado</th>
                <th className="px-4 py-3 font-semibold text-right">Sua remuneração</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['Meses 1 a 3', 'em construção', 'R$ 5.000 garantidos'],
                ['Meses 4 a 6', 'R$ 35–45 mil', 'R$ 6.000 a 8.000'],
                ['Regime (mês 7+)', 'R$ 60–77 mil', 'R$ 11.000 a 16.000'],
              ].map(([fase, fat, rem], i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3 font-semibold text-white">{fase}</td>
                  <td className="px-4 py-3">{fat}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{rem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-white/45">
          Não é teto. É a projeção do modelo com desempenho consistente.
        </p>
      </Secao>

      {/* ===== O QUE ESPERAMOS ===== */}
      <Secao titulo="O que esperamos" numero="06">
        <p className="text-white/70 leading-relaxed mb-6">
          Meta de <Destaque>atividade</Destaque>, não de sorte. O que você controla:
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            ['176', 'Telhados mapeados / mês'],
            ['66', 'Conversas com decisor / mês'],
            ['33', 'Propostas enviadas / mês'],
          ].map(([n, l], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl text-center">
              <p className="text-2xl md:text-3xl font-black text-sol">{n}</p>
              <p className="text-white/50 text-xs mt-1 leading-tight">{l}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-white/45">Rampa: 60% da meta no mês 1, 80% no mês 2, 100% a partir do mês 3.</p>
      </Secao>

      {/* ===== FORMATO DE CONTRATAÇÃO ===== */}
      <Secao titulo="Formato de contratação" numero="07">
        <p className="text-white/70 leading-relaxed mb-6">
          <Destaque>Representação comercial autônoma</Destaque> (Lei 4.886/65), com zona definida e contrato
          formal registrado. Sendo transparente sobre o que isso significa:
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-5 bg-verde/[0.06] border border-verde/25 rounded-xl">
            <p className="text-verde font-bold mb-2">A favor</p>
            <p className="text-white/65 text-sm leading-relaxed">
              Autonomia de ritmo e método, remuneração sem teto, carteira própria com titularidade, sem
              desconto de INSS sobre comissão.
            </p>
          </div>
          <div className="p-5 bg-coral/[0.06] border border-coral/25 rounded-xl">
            <p className="text-coral font-bold mb-2">Contra</p>
            <p className="text-white/65 text-sm leading-relaxed">
              Não há FGTS, 13º nem férias remuneradas. É necessário CNPJ.
            </p>
          </div>
        </div>
        <p className="mt-5 text-sm text-white/55 leading-relaxed">
          A projeção de R$ 11.000 a 16.000 em regime já considera isso — é remuneração líquida bem acima do
          que a função paga em carteira na região.
        </p>
      </Secao>

      {/* ===== POR QUE AGORA ===== */}
      <div className="mb-16 p-6 md:p-8 bg-gradient-to-br from-sol/[0.08] to-transparent border border-sol/20 rounded-2xl">
        <h3 className="text-xl md:text-2xl font-black text-white mb-3">Por que agora</h3>
        <p className="text-white/70 leading-relaxed">
          O boom de instalações de 2021 e 2022 está completando quatro anos. É uma safra inteira de sistemas
          sujos, com endereço e CNPJ em base pública.{' '}
          <span className="text-white font-semibold">Quem chegar primeiro pega o mercado com contrato de dois anos assinado.</span>
        </p>
      </div>

      {/* ===== CTA / DECISÃO ===== */}
      {recusada ? (
        <div className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl text-center">
          <p className="text-white/70">
            Você recusou esta proposta. Mudou de ideia?{' '}
            <a href="https://wa.me/554832630182" target="_blank" rel="noopener" className="text-sol underline">
              Fale com a Spin
            </a>.
          </p>
        </div>
      ) : (
        <div className="p-6 md:p-8 bg-white/[0.03] border border-white/10 rounded-2xl">
          <h3 className="text-xl md:text-2xl font-black text-white mb-2">Pronto para começar?</h3>
          <p className="text-white/60 text-sm mb-6">
            Ao aceitar, você segue para o contrato de representação comercial e a assinatura digital.
          </p>
          <AceitarPropostaBtn jaAceita={jaAceita} />
        </div>
      )}

      <p className="mt-10 text-center text-xs text-white/30">
        SPIN Solar · Proposta válida para discussão — sujeita a formalização em contrato.
      </p>
    </main>
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

function Card({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub: string; destaque?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border ${destaque ? 'bg-sol/[0.06] border-sol/25' : 'bg-white/[0.03] border-white/10'}`}>
      <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-1">{titulo}</p>
      <p className="text-2xl md:text-3xl font-black text-white">{valor}</p>
      <p className="text-white/50 text-sm mt-1">{sub}</p>
    </div>
  )
}
