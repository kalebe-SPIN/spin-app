import { MapaSantaCatarina } from '@/components/vaga/MapaSantaCatarina'
import { SimuladorConsultor } from '@/components/vaga/SimuladorConsultor'

/**
 * Proposta UNIFICADA — Consultor Comercial · Linha Completa SPIN.
 * Vende sistemas FV + carregadores e anexa plano de O&M (carteira recorrente).
 * Substitui as propostas separadas "Vendas Solar" e "Comercial O&M".
 */
export function PropostaConsultorConteudo({
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
            <span className="text-white/40 text-xs">· Proposta de parceria</span>
          </div>
        )}
        <h1 className="text-3xl md:text-5xl font-black text-white leading-[1.05] tracking-tighter2 mb-3">
          Consultor Comercial
          <br />
          <span className="text-sol">Linha Completa</span>
        </h1>
        <p className="text-white/45 text-sm mb-4">Sistemas fotovoltaicos · Carregadores · Planos de O&amp;M</p>
        <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
          {primeiroNome ? <><strong className="text-white">{primeiroNome}</strong>, c</> : 'C'}ada sistema que você
          vende deixa <strong className="text-white">duas coisas</strong> pra trás: a comissão, que você recebe uma
          vez, e um cliente na sua carteira de serviços, que paga <strong className="text-white">todo mês enquanto
          a usina existir</strong>.
        </p>
        {zona && <p className="mt-3 text-sm text-white/40">Zona de atuação: <span className="text-white/70 font-semibold">{zona}</span></p>}
        <div className="mt-6">
          {podeBaixarPdf
            ? <p className="text-sm text-verde">📄 PDF disponível após assinatura do contrato.</p>
            : <p className="inline-flex items-center gap-2 text-sm text-white/40">🔒 O PDF da proposta fica disponível para download após a assinatura do contrato.</p>}
        </div>
      </header>

      {/* O QUE MUDA */}
      <div className="mb-16 p-6 md:p-8 bg-gradient-to-br from-sol/[0.08] to-transparent border border-sol/20 rounded-2xl">
        <h3 className="text-xl md:text-2xl font-black text-white mb-3">O que muda em relação ao modelo tradicional</h3>
        <p className="text-white/70 leading-relaxed mb-3">
          Consultor de solar vende, recebe e recomeça do zero no dia 1º do mês seguinte. Toda comissão é
          transacional — a renda de janeiro depende inteiramente do que se fecha em janeiro. <strong className="text-white">Aqui não.</strong>
        </p>
        <p className="text-white/70 leading-relaxed">
          No ano 1 isso é irrelevante. No ano 5, são <strong className="text-sol">mais de R$ 3.600 por mês</strong>{' '}
          entrando sem você vender nada.
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

      {/* 01 · PORTFÓLIO */}
      <Secao titulo="O portfólio" numero="01">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Linha</th>
                <th className="px-4 py-3 font-semibold">Ticket típico</th>
                <th className="px-4 py-3 font-semibold text-right">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['Sistema fotovoltaico residencial', 'R$ 25–45 mil', '5%'],
                ['Sistema comercial', 'R$ 120–350 mil', '3,5%'],
                ['Sistema industrial / usina', 'R$ 400 mil – 1,5 mi', '2,5%'],
                ['Carregador de veículo elétrico', 'R$ 10–25 mil', '8%'],
                ['Plano de O&M', 'recorrente', 'ver abaixo'],
              ].map(([l, t, c], i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3 font-semibold text-white">{l}</td>
                  <td className="px-4 py-3">{t}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-white/50">Residencial dá volume e ritmo; comercial dá ticket; usina dá o mês que muda o ano.</p>
      </Secao>

      {/* 02 · PLANO DE O&M — CENTRO DO MODELO */}
      <Secao titulo="O plano de O&M — o centro do modelo" numero="02">
        <p className="text-white/70 leading-relaxed mb-6">
          Todo sistema vendido sai da proposta <Destaque>com plano de manutenção incluído por padrão</Destaque>. O
          cliente pode remover, mas ele já está lá. Não é venda adicional — é condição do que ele acabou de comprar:
        </p>
        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl mb-6">
          <p className="text-white/85 text-base md:text-lg leading-relaxed italic">
            "A garantia estendida de desempenho de 25 anos exige comprovação de manutenção. O plano é o que mantém
            sua garantia válida — e garantimos 92% da geração estimada em contrato."
          </p>
        </div>
        <p className="text-white/60 text-sm leading-relaxed mb-6">
          Fabricante de módulo e inversor nega garantia em sistema sem manutenção documentada. Isso é verdade, e é
          o argumento mais forte que você tem.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead><tr className="bg-white/[0.04] text-white/50 text-left"><th className="px-4 py-2.5 font-semibold">Residencial</th><th className="px-3 py-2.5 font-semibold text-right">Essencial</th><th className="px-3 py-2.5 font-semibold text-right">Completo</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                <tr className="text-white/75"><td className="px-4 py-2.5">até 12 módulos</td><td className="px-3 py-2.5 text-right">R$ 45</td><td className="px-3 py-2.5 text-right font-bold text-sol">R$ 79</td></tr>
                <tr className="text-white/75"><td className="px-4 py-2.5">13 a 25 módulos</td><td className="px-3 py-2.5 text-right">R$ 59</td><td className="px-3 py-2.5 text-right font-bold text-sol">R$ 105</td></tr>
              </tbody>
            </table>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead><tr className="bg-white/[0.04] text-white/50 text-left"><th className="px-4 py-2.5 font-semibold">Comercial / industrial</th><th className="px-3 py-2.5 font-semibold text-right">Mensalidade</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                <tr className="text-white/75"><td className="px-4 py-2.5">150 módulos</td><td className="px-3 py-2.5 text-right font-bold text-sol">R$ 485</td></tr>
                <tr className="text-white/75"><td className="px-4 py-2.5">400 módulos</td><td className="px-3 py-2.5 text-right font-bold text-sol">R$ 1.102</td></tr>
                <tr className="text-white/75"><td className="px-4 py-2.5">1.000 módulos</td><td className="px-3 py-2.5 text-right font-bold text-sol">R$ 2.442</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-white/60 text-sm leading-relaxed">
          O plano entra <strong className="text-white">dentro do financiamento</strong>, junto com o sistema. Numa
          residência de R$ 28 mil em 60 meses, a parcela vai de R$ 650 para R$ 695 — <strong className="text-white">R$ 45
          dentro de uma parcela que ele já aceitou</strong>.
        </p>
      </Secao>

      {/* 03 · COMO O PLANO REMUNERA */}
      <Secao titulo="Como o plano remunera você" numero="03">
        <p className="text-white/60 leading-relaxed mb-6">Três eventos, em momentos diferentes:</p>

        <div className="space-y-4">
          <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
            <p className="text-sol font-bold mb-2">1 · Comissão acelerada — na venda</p>
            <p className="text-white/65 text-sm mb-3">Sistema vendido com plano paga meio ponto percentual a mais:</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {[['Residencial', '5,0%', '5,5%'], ['Comercial', '3,5%', '4,0%'], ['Industrial / usina', '2,5%', '3,0%']].map(([l, s, c], i) => (
                <div key={i} className="p-3 bg-white/[0.03] border border-white/10 rounded-lg text-center">
                  <p className="text-white/60 text-xs">{l}</p>
                  <p className="text-white/40 text-xs">{s} → <span className="text-sol font-bold">{c}</span></p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
            <p className="text-sol font-bold mb-2">2 · Bônus de anexação — na assinatura</p>
            <div className="grid gap-2">
              {[['Residencial', '3 mensalidades'], ['Comercial até 400 módulos', '2 mensalidades'], ['Acima de 400 módulos / usina', '1,5 mensalidade']].map(([p, b], i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm">
                  <span className="text-white/70">{p}</span><span className="text-white font-semibold">{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 bg-sol/[0.06] border border-sol/25 rounded-xl">
            <p className="text-sol font-bold mb-1">3 · Carteira — todo mês, enquanto durar</p>
            <p className="text-white/70 text-sm leading-relaxed">
              <strong className="text-white">12% sobre tudo que o cliente pagar</strong> — plano, limpeza, revisão,
              assistência técnica. Sem prazo. Enquanto ele for cliente e você for consultor.
            </p>
          </div>
        </div>
      </Secao>

      {/* 04 · SIMULADOR */}
      <Secao titulo="Simule o seu ganho" numero="04">
        <p className="text-white/60 leading-relaxed mb-6">Escolha a linha, o valor do sistema e a mensalidade do plano — veja o antes e depois de anexar.</p>
        <SimuladorConsultor />
      </Secao>

      {/* 05 · NA PRÁTICA — um mês real */}
      <Secao titulo="Na prática — um mês real" numero="05">
        <p className="text-white/60 leading-relaxed mb-4">3 residenciais e 1 comercial:</p>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead><tr className="bg-white/[0.04] text-white/50 text-left"><th className="px-4 py-3 font-semibold">Venda</th><th className="px-4 py-3 font-semibold text-right">Sem plano</th><th className="px-4 py-3 font-semibold text-right">Com plano</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['Residencial R$ 28k (com plano)', 'R$ 1.400', 'R$ 1.777'],
                ['Residencial R$ 40k (com plano)', 'R$ 2.000', 'R$ 2.515'],
                ['Residencial R$ 32k (sem plano)', 'R$ 1.600', 'R$ 1.600'],
                ['Comercial R$ 280k (com plano)', 'R$ 9.800', 'R$ 12.170'],
              ].map(([v, s, c], i) => (
                <tr key={i} className="text-white/75"><td className="px-4 py-3">{v}</td><td className="px-4 py-3 text-right">{s}</td><td className="px-4 py-3 text-right text-sol font-semibold">{c}</td></tr>
              ))}
              <tr className="bg-verde/[0.06] text-white font-bold"><td className="px-4 py-3">Total do mês</td><td className="px-4 py-3 text-right">R$ 14.800</td><td className="px-4 py-3 text-right text-verde">R$ 18.062</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-white/70 text-sm">
          <strong className="text-sol">+22% no mesmo mês</strong>, sem vender um sistema a mais — e R$ 963 por ano
          que passam a entrar sozinhos.
        </p>
      </Secao>

      {/* 06 · FIXO E GARANTIA */}
      <Secao titulo="Fixo e garantia de início" numero="06">
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <Card titulo="Fixo mensal" valor="R$ 2.000" sub="vinculado à meta de atividade" />
          <Card destaque titulo="Garantia nos 3 primeiros meses" valor="R$ 5.000/mês" sub="independente de resultado" />
        </div>
        <p className="text-sm text-white/55">Ciclo de venda comercial leva de 45 a 90 dias. A SPIN banca esse período.</p>
      </Secao>

      {/* 07 · PLANO DE CARREIRA 5 ANOS */}
      <Secao titulo="Plano de carreira — 5 anos" numero="07">
        <p className="text-white/60 leading-relaxed mb-4">Desempenho consistente, com anexação de 25% em residencial e 50% em comercial/industrial.</p>
        <div className="overflow-x-auto rounded-xl border border-white/10 mb-4">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="bg-white/[0.04] text-white/50 text-left"><th className="px-3 py-2.5 font-semibold"></th><th className="px-3 py-2.5 text-right">Ano 1</th><th className="px-3 py-2.5 text-right">Ano 2</th><th className="px-3 py-2.5 text-right">Ano 3</th><th className="px-3 py-2.5 text-right">Ano 4</th><th className="px-3 py-2.5 text-right">Ano 5</th></tr></thead>
            <tbody className="divide-y divide-white/5 text-white/75">
              {[
                ['Comissão de venda', 'R$ 55.160', 'R$ 100.100', 'R$ 140.900', 'R$ 184.860', 'R$ 222.880'],
                ['Bônus de anexação', 'R$ 3.362', 'R$ 7.247', 'R$ 9.913', 'R$ 14.783', 'R$ 15.020'],
                ['Carteira (12%)', 'R$ 2.584', 'R$ 7.277', 'R$ 15.264', 'R$ 26.304', 'R$ 38.400'],
                ['Fixo', 'R$ 24.000', 'R$ 24.000', 'R$ 24.000', 'R$ 24.000', 'R$ 24.000'],
              ].map((row, i) => (
                <tr key={i}>{row.map((c, j) => <td key={j} className={`px-3 py-2.5 ${j === 0 ? 'text-white/60' : 'text-right'}`}>{c}</td>)}</tr>
              ))}
              <tr className="bg-sol/[0.06] text-white font-bold">
                <td className="px-3 py-2.5">Total no ano</td>
                <td className="px-3 py-2.5 text-right">R$ 85.106</td><td className="px-3 py-2.5 text-right">R$ 138.624</td><td className="px-3 py-2.5 text-right">R$ 190.077</td><td className="px-3 py-2.5 text-right">R$ 249.947</td><td className="px-3 py-2.5 text-right text-sol">R$ 300.300</td>
              </tr>
              <tr className="text-white/75">
                <td className="px-3 py-2.5 text-white/60">Média mensal</td>
                <td className="px-3 py-2.5 text-right">R$ 7.092</td><td className="px-3 py-2.5 text-right">R$ 11.552</td><td className="px-3 py-2.5 text-right">R$ 15.840</td><td className="px-3 py-2.5 text-right">R$ 20.829</td><td className="px-3 py-2.5 text-right text-sol font-bold">R$ 25.025</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Secao>

      {/* 08 · SE EU PARAR DE VENDER */}
      <Secao titulo='"Se eu parar de vender hoje, quanto continua entrando?"' numero="08">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead><tr className="bg-white/[0.04] text-white/50 text-left"><th className="px-4 py-3 font-semibold">Ao fim do</th><th className="px-4 py-3 font-semibold text-right">Renda mensal sem vender nada</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {[['Ano 1', 'R$ 120'], ['Ano 2', 'R$ 450'], ['Ano 3', 'R$ 1.100'], ['Ano 4', 'R$ 2.000'], ['Ano 5', 'R$ 3.620'], ['Ano 8 (projeção)', '~R$ 6.500']].map(([a, r], i) => (
                <tr key={i} className={i === 4 ? 'bg-sol/[0.06] text-white font-bold' : 'text-white/75'}><td className="px-4 py-3">{a}</td><td className="px-4 py-3 text-right text-sol">{r}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-white/50">É patrimônio de renda construído sobre clientes que você trouxe — e que continuam pagando porque a usina precisa de manutenção todo ano, pra sempre.</p>
      </Secao>

      {/* 09 · O QUE VOCÊ NÃO FAZ */}
      <Secao titulo="O que você não faz" numero="09">
        <div className="grid gap-3">
          {[
            ['Não prospecta serviço', 'Não liga oferecendo limpeza, não persegue cliente antigo, não monta rota. A carteira vem sozinha, da base que você vendeu.'],
            ['Não agenda nem executa', 'O sistema abre a OS 60 dias antes da data prevista, agenda com o técnico e avisa o cliente. Você não toca.'],
            ['Sua única ação de serviço é na venda', 'Deixar o plano na proposta e defender o argumento da garantia. Uma linha na proposta, zero hora adicional.'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-white font-bold text-sm mb-1">{t}</p>
              <p className="text-white/60 text-sm leading-snug">{d}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* 10 · O QUE A SPIN ENTREGA */}
      <Secao titulo="O que a SPIN entrega" numero="10">
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['Base instalada', 'Clientes já atendidos, liberados para você após 12 meses da conexão'],
            ['Leads de campanha', 'Tráfego pago rodando'],
            ['App SPIN', 'CRM, calculadora, proposta em PDF — tudo no celular'],
            ['Proposta automática', 'Plano já incluído, preço calculado, comparativo de parcela'],
            ['Engenharia e homologação', 'Projeto, ART, processo na distribuidora'],
            ['Equipe de campo', 'Técnicos próprios de O&M'],
            ['Painel de carteira', 'Sua anuidade em tempo real'],
            ['100% remoto', 'Só um celular e internet, de qualquer lugar'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-white font-bold text-sm mb-1">{t}</p>
              <p className="text-white/55 text-sm leading-snug">{d}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* 11 · FORMATO */}
      <Secao titulo="Formato de contratação" numero="11">
        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl mb-4">
          <p className="text-white font-bold text-base md:text-lg mb-2">📋 Representação comercial autônoma (Lei 4.886/65)</p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            Contratação PJ, com zona definida e contrato registrado. <strong className="text-sol">Não há vínculo
            empregatício</strong> — não é CLT, sem FGTS, 13º ou férias remuneradas. É necessário CNPJ.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div className="p-5 bg-verde/[0.06] border border-verde/25 rounded-xl">
            <p className="text-verde font-bold mb-2">A favor</p>
            <p className="text-white/65 text-sm leading-relaxed">Autonomia de método e ritmo, remuneração sem teto, carteira própria, renda recorrente.</p>
          </div>
          <div className="p-5 bg-coral/[0.06] border border-coral/25 rounded-xl">
            <p className="text-coral font-bold mb-2">Contra</p>
            <p className="text-white/65 text-sm leading-relaxed">Sem FGTS, 13º ou férias remuneradas. É necessário CNPJ.</p>
          </div>
        </div>
        <p className="text-sm text-white/55 leading-relaxed">
          <strong className="text-white/80">Sobre a carteira:</strong> ela é sua enquanto você for consultor ativo
          da SPIN. Encerrado o contrato, a anuidade cessa — está escrito de forma clara no instrumento, sem ambiguidade.
        </p>
      </Secao>

      {/* 12 · CONDIÇÕES DA CARTEIRA */}
      <Secao titulo="Condições da carteira" numero="12">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead><tr className="bg-white/[0.04] text-white/50 text-left"><th className="px-4 py-3 font-semibold">Situação</th><th className="px-4 py-3 font-semibold text-right">Efeito</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['Plano cancelado em até 6 meses', 'Estorno de 100% do bônus e do acréscimo de comissão'],
                ['Cancelado entre 7 e 12 meses', 'Estorno de 50%'],
                ['Cancelado após 12 meses', 'Sem estorno'],
                ['Cliente inadimplente há mais de 60 dias', 'Anuidade suspensa até regularizar'],
              ].map(([s, e], i) => (
                <tr key={i} className="text-white/75"><td className="px-4 py-3">{s}</td><td className="px-4 py-3 text-right text-white/70">{e}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
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

function Card({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub: string; destaque?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border ${destaque ? 'bg-sol/[0.06] border-sol/25' : 'bg-white/[0.03] border-white/10'}`}>
      <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-1">{titulo}</p>
      <p className="text-2xl md:text-3xl font-black text-white">{valor}</p>
      <p className="text-white/50 text-sm mt-1">{sub}</p>
    </div>
  )
}
