import { MapaSantaCatarina } from '@/components/vaga/MapaSantaCatarina'

/**
 * Proposta do PROFISSIONAL DE CAMPO (prestador PJ com equipe própria).
 * Estrutura espelha PropostaConteudo (comercial): mesmas seções 01-09.
 * Copy adaptado ao perfil de execução em campo.
 * Valores comerciais entram como <PlaceholderValor> até Kalebe passar o modelo.
 */
export function PropostaCampoConteudo({
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
          <img
            src={empresa.logo_url}
            alt={empresa.razao_social || 'Spin Solar'}
            className="h-12 w-auto object-contain mb-6"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sol/10 border border-sol/25 rounded-full mb-6">
            <span className="text-sol text-xs font-bold uppercase tracking-wider">SPIN Solar</span>
            <span className="text-white/40 text-xs">· Proposta de parceria</span>
          </div>
        )}

        <h1 className="text-3xl md:text-5xl font-black text-white leading-[1.05] tracking-tighter2 mb-4">
          Profissional de Campo
          <br />
          <span className="text-sol">Serviços de O&amp;M</span>
        </h1>
        <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
          {primeiroNome ? <><strong className="text-white">{primeiroNome}</strong>, e</> : 'E'}sta é a
          sua proposta para <strong className="text-white">executar</strong> a limpeza e a manutenção
          de sistemas fotovoltaicos em campo — atendendo os contratos que a SPIN fecha.
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
            <p className="inline-flex items-center gap-2 text-sm text-white/40">
              🔒 O PDF da proposta fica disponível para download após a assinatura do contrato.
            </p>
          )}
        </div>
      </header>

      {/* ===== ÁREA DE ATUAÇÃO ===== */}
      {cidades.length > 0 && (
        <Secao titulo="Sua área de atuação" numero="00">
          <p className="text-white/60 leading-relaxed mb-6">
            Em Santa Catarina, sua zona{zona ? <> (<span className="text-white/80">{zona}</span>)</> : ''} cobre as
            cidades marcadas abaixo. É onde estão as OS que você vai executar.
          </p>
          <MapaSantaCatarina cidades={cidades} />
        </Secao>
      )}

      {/* ===== 01 · A OPORTUNIDADE ===== */}
      <Secao titulo="A oportunidade" numero="01">
        <p className="text-white/70 leading-relaxed mb-4">
          Existem hoje, em Santa Catarina, milhares de sistemas solares instalados há três, quatro anos que{' '}
          <Destaque>nunca foram limpos</Destaque>. A SPIN já está fechando os contratos — o que falta é uma
          equipe de campo profissional pra <strong className="text-white">executar</strong>.
        </p>
        <p className="text-white/70 leading-relaxed">
          Você não precisa vender, não precisa prospectar, não precisa correr atrás.{' '}
          <span className="text-white font-semibold">
            A SPIN te entrega as OS já fechadas, com endereço, contato e escopo definidos.
          </span>{' '}
          Você foca no que sabe fazer: entregar o serviço com qualidade.
        </p>
      </Secao>

      {/* ===== 02 · O QUE VOCÊ VAI FAZER ===== */}
      <Secao titulo="O que você vai fazer" numero="02">
        <p className="text-white/70 leading-relaxed mb-6">
          Executar as ordens de serviço (OS) que a SPIN distribui pela sua zona —{' '}
          <Destaque>limpeza técnica</Destaque> e <Destaque>manutenção preventiva/corretiva</Destaque> em
          sistemas fotovoltaicos, do residencial ao industrial. O ciclo de cada OS é seu:
        </p>
        <div className="grid gap-4">
          {[
            ['Receber a OS', 'A SPIN te entrega a OS com cliente, endereço, potência do sistema, quantidade de placas e escopo definido antes da visita.'],
            ['Agendar', 'Você combina com o cliente o melhor dia e horário dentro do prazo do contrato.'],
            ['Executar', 'Faz o serviço com o protocolo SPIN — limpeza técnica, checklist de manutenção, fotos antes e depois.'],
            ['Registrar e fechar', 'Envia o laudo com fotos pelo app; o pagamento é liberado após conferência.'],
          ].map(([t, d], i) => (
            <div key={i} className="flex gap-4 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <span className="shrink-0 w-8 h-8 rounded-lg bg-sol/15 text-sol font-black flex items-center justify-center">{i + 1}</span>
              <p className="text-white/70 leading-relaxed"><strong className="text-white">{t}</strong> — {d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-white/50 leading-relaxed">
          Você não vende nem cobra do cliente — o financeiro é 100% com a SPIN. Seu foco é execução.
        </p>
      </Secao>

      {/* ===== 03 · O QUE A SPIN ENTREGA ===== */}
      <Secao titulo="O que a SPIN entrega" numero="03">
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['OS já fechadas', 'Contratos que a SPIN vendeu — você recebe a lista mensal pela sua zona'],
            ['Roteirização', 'App agrupa OS próximas no mesmo dia — menos deslocamento, mais serviços/dia'],
            ['Protocolo técnico', 'Checklist padronizado de limpeza e manutenção — método testado'],
            ['App SPIN no celular', 'Recebe OS, tira fotos, envia laudo, marca conclusão — tudo por lá'],
            ['Suporte técnico', 'Dúvida em campo? Consulta rápida com o engenheiro pelo WhatsApp'],
            ['Painel de controle', 'Suas OS executadas, ganhos do mês e agenda — em tempo real, no seu login'],
            ['Marca SPIN', 'Você atende pelo nome da SPIN — uniforme, veículo identificado, credencial'],
            ['Base recorrente', 'Contratos anuais garantem OS repetidas — mesmo cliente, ganho recorrente'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-white font-bold text-sm mb-1">{t}</p>
              <p className="text-white/55 text-sm leading-snug">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 p-4 bg-sol/[0.06] border border-sol/25 rounded-xl">
          <span className="text-2xl">🚐</span>
          <p className="text-white/75 text-sm leading-relaxed">
            <strong className="text-white">Você precisa ter:</strong> CNPJ, veículo próprio, EPI de altura
            (NR-35) e elétrica (NR-10), equipamento de limpeza técnica (mangueira desmineralizada, escova macia,
            rodo apropriado) e disponibilidade de agenda. A SPIN entrega o resto.
          </p>
        </div>
      </Secao>

      {/* ===== 04 · REMUNERAÇÃO ===== */}
      <Secao titulo="Remuneração" numero="04">
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <Card destaque titulo="Fixo mensal" valor={<PlaceholderValor rotulo="R$/mês" />} sub="base pela disponibilidade e cumprimento da meta de OS/mês" />
          <Card destaque titulo="Seguro mínimo" valor="3 meses" sub="rede de segurança escalonada no período de experiência" />
        </div>

        {/* Seguro mínimo (escalonada) */}
        <div className="p-5 md:p-6 bg-sol/[0.08] border border-sol/30 rounded-2xl mb-6">
          <p className="text-sol font-bold mb-1">🛡 Seguro mínimo nos 3 primeiros meses</p>
          <p className="text-white/60 text-sm mb-4">Você nunca recebe menos que isto no período de experiência:</p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[1, 2, 3].map((mes) => (
              <div key={mes} className="text-center p-3 bg-white/[0.04] border border-white/10 rounded-xl">
                <p className="text-[11px] text-white/50 uppercase tracking-wider mb-1">Mês {mes}</p>
                <p className="text-xl md:text-2xl font-black text-white"><PlaceholderValor rotulo="R$" /></p>
              </div>
            ))}
          </div>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            O garantido funciona como um <strong className="text-white">seguro</strong>, não uma soma: se{' '}
            <strong className="text-white">base + variável por OS</strong> do mês{' '}
            <strong className="text-white">não alcançar</strong> esse valor, você recebe o garantido. Se{' '}
            <strong className="text-white">ultrapassar</strong>, recebe base + variável normalmente — sempre o que
            for maior. É uma rede de segurança enquanto você entra no ritmo do protocolo SPIN.
          </p>
        </div>

        <p className="text-sm text-white/55 leading-relaxed mb-8">
          Os 3 primeiros meses são o seu <strong className="text-white/80">período de experiência</strong>: a
          escadinha cresce a cada mês entregue e a continuidade depende de meta cumprida <em>com</em> resultado de
          qualidade (veja "O que esperamos"). Entrar no ritmo do protocolo leva de 30 a 60 dias, e a SPIN banca esse
          período.
        </p>

        <h4 className="text-white font-bold mb-3">Variável por OS executada</h4>
        <p className="text-sm text-white/50 mb-4">
          Sobre as OS <strong className="text-white/80">concluídas e aprovadas</strong> no mês. O valor varia por
          porte do sistema — quanto maior a usina, maior o pagamento por OS.
        </p>
        <div className="overflow-hidden rounded-xl border border-white/10 mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Porte do sistema (nº placas)</th>
                <th className="px-4 py-3 font-semibold text-right">Valor por OS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                'Residencial pequeno (até 20 placas)',
                'Residencial grande / comercial pequeno (21-70)',
                'Comercial médio (71-200)',
                'Industrial / usina (201-500)',
                'Grande usina (500+)',
              ].map((faixa, i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3">{faixa}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol"><PlaceholderValor rotulo="R$" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-5 bg-sol/[0.06] border border-sol/25 rounded-xl mb-8">
          <p className="text-sol font-bold mb-1">Bônus de produtividade · <PlaceholderValor rotulo="+X%" /></p>
          <p className="text-white/65 text-sm leading-relaxed">
            Bateu a meta de OS/mês e continuou executando? As OS extras (acima da meta) recebem{' '}
            <strong className="text-sol">bônus percentual sobre o valor da faixa</strong>. Estrutura ainda a ser
            definida — não é um teto, é um incentivo pra quem sobra energia.
          </p>
        </div>

        <h4 className="text-white font-bold mb-3">Extras</h4>
        <div className="grid gap-2 mb-8">
          {[
            ['Deslocamento fora de zona', <PlaceholderValor key="1" rotulo="R$/km" />],
            ['Serviço fim de semana / feriado', <PlaceholderValor key="2" rotulo="+X%" />],
            ['Serviço urgente (SLA reduzido)', <PlaceholderValor key="3" rotulo="+X%" />],
            ['OS de altura ≥ 3 pavimentos', <PlaceholderValor key="4" rotulo="R$" />],
          ].map((e, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg">
              <span className="text-white/70 text-sm">{e[0]}</span>
              <span className="text-white font-semibold text-sm">{e[1]}</span>
            </div>
          ))}
        </div>

        <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <p className="text-white font-bold mb-1">Vínculo por zona · exclusividade</p>
          <p className="text-white/65 text-sm leading-relaxed">
            Todas as OS da sua zona são suas por padrão. Se o volume ultrapassar sua capacidade, a SPIN oferece a
            você primeiro (ampliar equipe) antes de contratar outro parceiro. Cliente que você atendeu segue sendo
            seu nas próximas visitas do contrato.
          </p>
        </div>
      </Secao>

      {/* ===== 05 · SIMULADOR ===== */}
      <Secao titulo="Simule o seu ganho" numero="05">
        <div className="p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl">
          <p className="text-white font-bold mb-2">🧮 Simulador em preparação</p>
          <p className="text-white/70 text-sm leading-relaxed">
            Assim que os valores da variável por OS estiverem confirmados, o simulador aparece aqui — você escolhe
            quantas OS de cada porte quer executar no mês e vê o cálculo ao vivo (base + variável + bônus).
          </p>
        </div>
      </Secao>

      {/* ===== 06 · O QUE DÁ PRA GANHAR ===== */}
      <Secao titulo="O que dá para ganhar" numero="06">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Fase</th>
                <th className="px-4 py-3 font-semibold">OS/mês</th>
                <th className="px-4 py-3 font-semibold text-right">Sua remuneração</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                { fase: 'Mês 1 (rampa)', os: '~40% da meta' },
                { fase: 'Mês 2', os: '~70% da meta' },
                { fase: 'Mês 3 em diante', os: '100% da meta' },
                { fase: 'Regime consolidado', os: 'meta + bônus de produtividade' },
              ].map((p, i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3 font-semibold text-white">{p.fase}</td>
                  <td className="px-4 py-3">{p.os}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol"><PlaceholderValor rotulo="R$/mês" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-white/45">
          Não é teto — quem entrega mais OS com qualidade e produtividade ganha mais. A projeção é o mínimo do
          modelo com desempenho consistente.
        </p>
      </Secao>

      {/* ===== 07 · O QUE ESPERAMOS ===== */}
      <Secao titulo="O que esperamos" numero="07">
        <p className="text-white/70 leading-relaxed mb-6">
          Meta de <Destaque>execução com qualidade</Destaque>, não de sorte. O que você controla:
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            [<PlaceholderValor key="1" rotulo="N" />, 'OS concluídas / mês'],
            [<PlaceholderValor key="2" rotulo="%" />, 'Índice de qualidade (checklist + fotos)'],
            [<PlaceholderValor key="3" rotulo="dias" />, 'Prazo médio de atendimento'],
          ].map(([n, l], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl text-center">
              <p className="text-2xl md:text-3xl font-black text-sol">{n}</p>
              <p className="text-white/50 text-xs mt-1 leading-tight">{l}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-white/45 mb-6">Rampa: 40% da meta no mês 1, 70% no mês 2, 100% a partir do mês 3.</p>

        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl">
          <p className="text-white font-bold text-base md:text-lg mb-2">Como funciona a renovação da experiência</p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed mb-3">
            O período de experiência renova (e vira contratação efetiva) quando <strong className="text-white">duas
            coisas andam juntas</strong>:
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="p-4 bg-white/[0.04] border border-white/10 rounded-xl">
              <p className="text-sol font-bold text-sm mb-1">1 · Meta de OS</p>
              <p className="text-white/65 text-sm leading-snug">Cumprir a atividade acima (OS/mês, prazo).</p>
            </div>
            <div className="p-4 bg-white/[0.04] border border-white/10 rounded-xl">
              <p className="text-sol font-bold text-sm mb-1">2 · Qualidade de execução</p>
              <p className="text-white/65 text-sm leading-snug">Checklist completo, fotos válidas e zero retrabalho do cliente.</p>
            </div>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            <strong className="text-white">Não basta bater OS.</strong> Se a qualidade cai (reclamação, retrabalho,
            checklist incompleto), a renovação trava. Entregando os dois, seguimos juntos com contrato consolidado.
          </p>
        </div>
      </Secao>

      {/* ===== 08 · FORMATO DE CONTRATAÇÃO ===== */}
      <Secao titulo="Formato de contratação" numero="08">
        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl mb-6">
          <p className="text-white font-bold text-base md:text-lg mb-2">
            📋 Contratação PJ — prestação de serviço
          </p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            Esta é uma <strong className="text-white">contratação como pessoa jurídica (PJ)</strong>: você atua como{' '}
            <strong className="text-white">prestador de serviços de operação e manutenção</strong>, com{' '}
            <strong className="text-white">CNPJ próprio</strong>, zona definida e contrato formal registrado.{' '}
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
              Autonomia de agenda e método, remuneração por produtividade, zona própria com base recorrente
              garantida por contrato, sem desconto de INSS sobre variável.
            </p>
          </div>
          <div className="p-5 bg-coral/[0.06] border border-coral/25 rounded-xl">
            <p className="text-coral font-bold mb-2">Contra</p>
            <p className="text-white/65 text-sm leading-relaxed">
              Não há FGTS, 13º nem férias remuneradas. É necessário CNPJ, veículo e EPI próprios.
            </p>
          </div>
        </div>
      </Secao>

      {/* ===== 09 · COMO E QUANDO RECEBE ===== */}
      <Secao titulo="Como e quando você recebe" numero="09">
        <div className="grid sm:grid-cols-4 gap-3 mb-6">
          {[
            ['Último dia do mês', 'Fecha o ciclo: apuramos suas OS concluídas + aprovadas.'],
            ['Consolidação', 'O sistema consolida base + variável por OS + bônus do período.'],
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
            Em março você bateu a meta de OS e executou <strong className="text-white">todos os serviços com
            qualidade aprovada</strong>. No dia <strong className="text-white">31/03</strong> o ciclo fecha: base +
            variável por OS + bônus consolidados. Você emite a NF e, até{' '}
            <strong className="text-white">05/04</strong>, o valor cai no seu PIX.
          </p>
        </div>
      </Secao>

      {/* ===== POR QUE AGORA ===== */}
      <div className="mb-16 p-6 md:p-8 bg-gradient-to-br from-sol/[0.08] to-transparent border border-sol/20 rounded-2xl">
        <h3 className="text-xl md:text-2xl font-black text-white mb-3">Por que agora</h3>
        <p className="text-white/70 leading-relaxed">
          O boom de instalações de 2021 e 2022 está completando quatro anos — é uma safra inteira de sistemas
          sujos, com fungos, sem manutenção. A SPIN está fechando contratos em ritmo alto e{' '}
          <span className="text-white font-semibold">
            precisa de equipe de campo profissional pra dar conta da demanda que já entra.
          </span>
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

function Card({ titulo, valor, sub, destaque }: { titulo: string; valor: React.ReactNode; sub: string; destaque?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border ${destaque ? 'bg-sol/[0.06] border-sol/25' : 'bg-white/[0.03] border-white/10'}`}>
      <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-1">{titulo}</p>
      <div className="text-2xl md:text-3xl font-black text-white">{valor}</div>
      <p className="text-white/50 text-sm mt-1">{sub}</p>
    </div>
  )
}

/**
 * Marcador visível pros valores comerciais que Kalebe ainda vai definir.
 * Impossível de confundir com um número real — aparece em coral com aviso.
 */
function PlaceholderValor({ rotulo }: { rotulo: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-coral/15 border border-coral/30 text-coral align-middle"
      title="Valor a definir com Kalebe"
    >
      ⚠ {rotulo}
    </span>
  )
}
