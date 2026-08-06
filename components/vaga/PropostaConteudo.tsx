import { BaixarPropostaPdf } from '@/components/vaga/BaixarPropostaPdf'
import {
  FIXO_MENSAL, GARANTIA_ESCALONADA, MULTIPLICADOR_LABEL, COMISSAO_FAIXAS,
  PROJECAO, METAS, EXTRAS, REGIME_FAIXA_LABEL, MODULOS_MIN,
} from '@/lib/proposta-om'

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`

/**
 * Conteúdo apresentacional da proposta de trabalho (Parceiro Comercial O&M).
 * Reutilizado pela página do candidato (/vaga/proposta) e pela prévia do admin
 * (/admin/vagas/previa). NÃO inclui o CTA de aceite — cada página põe o seu.
 */
export function PropostaConteudo({
  nomeCandidato,
  zona,
  empresa,
  podeBaixarPdf = false,
}: {
  nomeCandidato: string
  zona?: string | null
  empresa?: { razao_social?: string | null; cnpj?: string | null } | null
  /** PDF da proposta só libera depois do contrato assinado. */
  podeBaixarPdf?: boolean
}) {
  const primeiroNome = nomeCandidato?.split(' ')[0] || ''

  return (
    <>
      {/* ===== HERO ===== */}
      <header className="mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-sol/10 border border-sol/25 rounded-full mb-6">
          <span className="text-sol text-xs font-bold uppercase tracking-wider">SPIN Solar</span>
          <span className="text-white/40 text-xs">· Proposta de trabalho</span>
        </div>

        <h1 className="text-3xl md:text-5xl font-black text-white leading-[1.05] tracking-tighter2 mb-4">
          Parceiro Comercial
          <br />
          <span className="text-sol">Serviços de O&amp;M</span>
        </h1>
        <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
          {primeiroNome ? <><strong className="text-white">{primeiroNome}</strong>, e</> : 'E'}sta é a
          sua proposta para vender contratos de limpeza e manutenção de sistemas fotovoltaicos —
          telhados comerciais e industriais em Santa Catarina.
        </p>
        {zona && (
          <p className="mt-3 text-sm text-white/40">
            Zona de atuação: <span className="text-white/70 font-semibold">{zona}</span>
          </p>
        )}
        <div className="mt-6">
          {podeBaixarPdf ? (
            <BaixarPropostaPdf nomeCandidato={nomeCandidato} empresa={empresa} />
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-white/40">
              🔒 O PDF da proposta fica disponível para download após a assinatura do contrato.
            </p>
          )}
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
            ['Painel de controle', 'Suas atividades, resultados de vendas e agenda — tudo em tempo real, no seu login'],
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
          <Card destaque titulo="Fixo mensal" valor={brl(FIXO_MENSAL)} sub="base pelo trabalho de campo, conforme a meta do mês" />
          <Card destaque titulo="Garantido de início" valor="3 meses" sub="piso crescente durante o período de experiência" />
        </div>

        {/* Escadinha do garantido — piso condicionado ao cumprimento da meta de trabalho */}
        <div className="p-5 md:p-6 bg-sol/[0.08] border border-sol/30 rounded-2xl mb-6">
          <p className="text-sol font-bold mb-4">Seu piso garantido nos 3 primeiros meses</p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {GARANTIA_ESCALONADA.map((g) => (
              <div key={g.mes} className="text-center p-3 bg-white/[0.04] border border-white/10 rounded-xl">
                <p className="text-[11px] text-white/50 uppercase tracking-wider mb-1">Mês {g.mes}</p>
                <p className="text-xl md:text-2xl font-black text-white">{brl(g.valor)}</p>
              </div>
            ))}
          </div>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            Esse piso é a sua base pelo trabalho de campo. Ele é pago{' '}
            <strong className="text-white">integralmente quando você cumpre a meta de trabalho do mês</strong>.
            Se a meta não for atingida, o valor é{' '}
            <strong className="text-white">ajustado proporcionalmente ao que você efetivamente entregou</strong> —
            você é pago pelo que produz. Depois dos 3 meses, o fixo de {brl(FIXO_MENSAL)} segue a mesma lógica.{' '}
            <strong className="text-sol">Fazendo o trabalho, você tem piso.</strong>
          </p>
        </div>

        <p className="text-sm text-white/55 leading-relaxed mb-8">
          Os 3 primeiros meses são o seu <strong className="text-white/80">período de experiência</strong>: a
          escadinha cresce a cada mês entregue e a continuidade depende de meta cumprida <em>com</em> resultado de
          vendas (veja “O que esperamos”). Construir carteira leva de 60 a 90 dias, e a SPIN banca esse período.
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
              {COMISSAO_FAIXAS.map((f, i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3">{f.faixa}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{f.pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-5 bg-sol/[0.06] border border-sol/25 rounded-xl mb-8">
          <p className="text-sol font-bold mb-1">Multiplicador de prospecção · {MULTIPLICADOR_LABEL}</p>
          <p className="text-white/65 text-sm leading-relaxed">
            Cliente que <strong className="text-white">você</strong> encontrou e trouxe vale {MULTIPLICADOR_LABEL} a
            comissão normal. Quem só atende a base pronta recebe menos. Quem traz cliente novo recebe mais.
          </p>
        </div>

        <h4 className="text-white font-bold mb-3">Extras</h4>
        <div className="grid gap-2 mb-8">
          {EXTRAS.map((e, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg">
              <span className="text-white/70 text-sm">{e.item}</span>
              <span className="text-white font-semibold text-sm">{e.valor}</span>
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
              {PROJECAO.map((p, i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3 font-semibold text-white">{p.fase}</td>
                  <td className="px-4 py-3">{p.faturamento}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{p.remuneracao}</td>
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
            [String(METAS.telhados), `Telhados ≥ ${MODULOS_MIN} módulos / mês`],
            [String(METAS.conversas), 'Conversas com decisor / mês'],
            [String(METAS.propostas), 'Propostas enviadas / mês'],
          ].map(([n, l], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl text-center">
              <p className="text-2xl md:text-3xl font-black text-sol">{n}</p>
              <p className="text-white/50 text-xs mt-1 leading-tight">{l}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-white/45 mb-6">Rampa: 60% da meta no mês 1, 80% no mês 2, 100% a partir do mês 3.</p>

        {/* Renovação da experiência: meta de trabalho + desempenho de vendas */}
        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl">
          <p className="text-white font-bold text-base md:text-lg mb-2">Como funciona a renovação da experiência</p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed mb-3">
            O período de experiência renova (e vira contratação efetiva) quando <strong className="text-white">duas
            coisas andam juntas</strong>:
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="p-4 bg-white/[0.04] border border-white/10 rounded-xl">
              <p className="text-sol font-bold text-sm mb-1">1 · Meta de trabalho</p>
              <p className="text-white/65 text-sm leading-snug">Cumprir a atividade acima (telhados, conversas, propostas).</p>
            </div>
            <div className="p-4 bg-white/[0.04] border border-white/10 rounded-xl">
              <p className="text-sol font-bold text-sm mb-1">2 · Desempenho de vendas</p>
              <p className="text-white/65 text-sm leading-snug">Resultado real — contratos fechados que mostram que o seu perfil de venda encaixa.</p>
            </div>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            <strong className="text-white">Não basta cumprir tabela.</strong> A gente avalia atividade{' '}
            <em>e</em> resultado juntos: é isso que diz se faz sentido seguir. Entregando os dois, renovamos e
            seguimos juntos.
          </p>
        </div>
      </Secao>

      {/* ===== FORMATO DE CONTRATAÇÃO ===== */}
      <Secao titulo="Formato de contratação" numero="07">
        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl mb-6">
          <p className="text-white font-bold text-base md:text-lg mb-2">
            📋 Contratação PJ — sem vínculo empregatício
          </p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            Esta é uma <strong className="text-white">contratação como pessoa jurídica (PJ)</strong>: você atua como{' '}
            <strong className="text-white">parceiro comercial autônomo</strong> (representação comercial, Lei 4.886/65),
            com <strong className="text-white">CNPJ próprio</strong>, zona definida e contrato formal registrado.{' '}
            <strong className="text-sol">Não há vínculo empregatício</strong> — não é CLT, não há subordinação,
            FGTS, 13º nem férias remuneradas.
          </p>
        </div>
        <p className="text-white/70 leading-relaxed mb-6">
          Sendo transparente sobre o que isso significa na prática:
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
          A projeção de {REGIME_FAIXA_LABEL} em regime já considera isso — é remuneração líquida bem acima do
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

function Card({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub: string; destaque?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border ${destaque ? 'bg-sol/[0.06] border-sol/25' : 'bg-white/[0.03] border-white/10'}`}>
      <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-1">{titulo}</p>
      <p className="text-2xl md:text-3xl font-black text-white">{valor}</p>
      <p className="text-white/50 text-sm mt-1">{sub}</p>
    </div>
  )
}
