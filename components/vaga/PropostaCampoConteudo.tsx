import { MapaSantaCatarina } from '@/components/vaga/MapaSantaCatarina'
import { SimuladorCampo } from '@/components/vaga/SimuladorCampo'
import { OS_BASE, OS_POR_PLACA, OS_POR_KM, valorOS } from '@/lib/proposta-campo'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Proposta do PROFISSIONAL DE CAMPO — empreitada por ordem de serviço (OS).
 * Estrutura espelha a comercial; condições são as reais do modelo empreitada:
 *   cada OS = R$ 150 + R$ 2/placa + R$ 1/km (ida e volta); NF por serviço.
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
          <img src={empresa.logo_url} alt={empresa.razao_social || 'Spin Solar'} className="h-12 w-auto object-contain mb-6" style={{ filter: 'brightness(0) invert(1)' }} />
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
          sua proposta para <strong className="text-white">executar</strong> a limpeza e a revisão de sistemas
          fotovoltaicos em campo — por empreitada, atendendo as ordens de serviço que a SPIN distribui.
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
          <Destaque>nunca foram limpos nem revisados</Destaque>. A SPIN já está fechando os contratos — o que falta
          é uma equipe de campo profissional pra <strong className="text-white">executar</strong>.
        </p>
        <p className="text-white/70 leading-relaxed">
          Você não precisa vender, prospectar ou cobrar.{' '}
          <span className="text-white font-semibold">A SPIN te entrega as OS já fechadas</span>, com endereço,
          contato e escopo definidos. Você foca no que sabe: entregar o serviço com qualidade.
        </p>
      </Secao>

      {/* ===== 02 · O QUE VOCÊ VAI FAZER ===== */}
      <Secao titulo="O que você vai fazer" numero="02">
        <p className="text-white/70 leading-relaxed mb-6">
          Executar as ordens de serviço (OS) que a SPIN distribui pela sua zona — <Destaque>limpeza técnica</Destaque> e{' '}
          <Destaque>revisão com testes elétricos e mecânicos</Destaque> (aperto das placas). O ciclo de cada OS é seu:
        </p>
        <div className="grid gap-4">
          {[
            ['Receber a OS', 'A SPIN te entrega a OS com cliente, endereço, potência do sistema e quantidade de placas antes da visita.'],
            ['Agendar', 'Você combina com o cliente o melhor dia e horário dentro do prazo do contrato.'],
            ['Executar', 'Limpeza técnica + revisão: testes elétricos e mecânicos, aperto das placas, checklist e fotos antes/depois.'],
            ['Registrar e faturar', 'Envia o laudo pelo app; aprovado, você emite a NF do serviço e recebe.'],
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
            ['OS já fechadas', 'Contratos que a SPIN vendeu — você recebe a demanda pela sua zona'],
            ['Roteirização', 'App agrupa OS próximas no mesmo dia — menos deslocamento, mais serviços/dia'],
            ['Protocolo técnico', 'Checklist padronizado de limpeza e revisão — método testado'],
            ['App SPIN no celular', 'Recebe OS, tira fotos, envia laudo, marca conclusão — tudo por lá'],
            ['Suporte técnico', 'Dúvida em campo? Consulta rápida com o engenheiro pelo WhatsApp'],
            ['Painel de controle', 'Suas OS executadas, ganhos e agenda — em tempo real, no seu login'],
            ['Marca SPIN', 'Você atende pelo nome da SPIN — credibilidade com o cliente'],
            ['Demanda recorrente', 'Contratos anuais geram OS repetidas do mesmo cliente — ganho que volta'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-white font-bold text-sm mb-1">{t}</p>
              <p className="text-white/55 text-sm leading-snug">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 p-5 bg-sol/[0.06] border border-sol/25 rounded-xl">
          <p className="text-white font-bold mb-3">🚐 O que você precisa ter</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ['CNPJ ativo', 'Contratação é PJ (MEI ou empresa)'],
              ['Carro próprio', 'Deslocamento até os telhados da sua zona'],
              ['EPIs completos', 'Equipamentos de proteção individual em dia'],
              ['Certificação NR-35 e NR-10', 'Trabalho em altura e em instalações elétricas'],
              ['Material de limpeza', 'Escova apropriada e detergente para módulos FV'],
              ['Multímetro', 'Para os testes elétricos da revisão'],
              ['Ferramentas elétricas', 'Para aperto das placas e manutenção'],
            ].map(([t, d], i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-sol mt-0.5">✓</span>
                <p className="text-white/75 text-sm leading-snug"><strong className="text-white">{t}</strong> — {d}</p>
              </div>
            ))}
          </div>
          <p className="text-white/50 text-xs mt-3">A SPIN entrega a demanda, o roteiro e o protocolo. A estrutura de execução é sua.</p>
        </div>
      </Secao>

      {/* ===== 04 · REMUNERAÇÃO (EMPREITADA) ===== */}
      <Secao titulo="Remuneração" numero="04">
        <p className="text-white/70 leading-relaxed mb-6">
          Contratação por <Destaque>empreitada</Destaque>: você é pago <strong className="text-white">por ordem de
          serviço executada</strong>. Cada OS vale:
        </p>

        {/* Fórmula */}
        <div className="p-5 md:p-6 bg-sol/[0.08] border border-sol/30 rounded-2xl mb-6">
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="text-center p-4 bg-white/[0.04] border border-white/10 rounded-xl">
              <p className="text-2xl md:text-3xl font-black text-white">{brl(OS_BASE)}</p>
              <p className="text-white/50 text-xs mt-1">de largada por OS</p>
            </div>
            <div className="text-center p-4 bg-white/[0.04] border border-white/10 rounded-xl">
              <p className="text-2xl md:text-3xl font-black text-white">+ {brl(OS_POR_PLACA)}</p>
              <p className="text-white/50 text-xs mt-1">por placa limpa e revisada</p>
            </div>
            <div className="text-center p-4 bg-white/[0.04] border border-white/10 rounded-xl">
              <p className="text-2xl md:text-3xl font-black text-white">+ {brl(OS_POR_KM)}</p>
              <p className="text-white/50 text-xs mt-1">por km rodado (ida e volta)</p>
            </div>
          </div>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            A <strong className="text-white">revisão</strong> inclui testes <strong className="text-white">elétricos e
            mecânicos</strong> e o <strong className="text-white">aperto das placas</strong> — não é só limpeza.
            Quanto maior o sistema e a distância, maior o valor da OS.
          </p>
        </div>

        {/* Exemplo */}
        <div className="p-5 bg-verde/[0.06] border border-verde/25 rounded-2xl mb-8">
          <p className="text-verde font-bold mb-2">Exemplo prático</p>
          <p className="text-white/75 text-sm leading-relaxed">
            Um sistema de <strong className="text-white">24 placas</strong> a <strong className="text-white">40 km</strong>{' '}
            (ida e volta): {brl(OS_BASE)} + {brl(OS_POR_PLACA * 24)} (24 placas) + {brl(OS_POR_KM * 40)} (40 km) ={' '}
            <strong className="text-sol">{brl(valorOS(24, 40))}</strong> nessa OS.
          </p>
        </div>

        <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <p className="text-white font-bold mb-1">NF por serviço · recebe a cada OS</p>
          <p className="text-white/65 text-sm leading-relaxed">
            Você emite a nota fiscal por serviço executado e <strong className="text-white">recebe a cada OS</strong>{' '}
            aprovada — não é salário mensal. Fez, entregou com qualidade, faturou.
          </p>
        </div>
      </Secao>

      {/* ===== 05 · SIMULADOR ===== */}
      <Secao titulo="Simule o seu ganho" numero="05">
        <p className="text-white/60 leading-relaxed mb-6">
          Ajuste o tamanho do sistema, a distância e quantas OS você faz no mês — o cálculo aparece ao vivo.
        </p>
        <SimuladorCampo />
      </Secao>

      {/* ===== 06 · O QUE DÁ PRA GANHAR ===== */}
      <Secao titulo="O que dá para ganhar" numero="06">
        <p className="text-white/60 leading-relaxed mb-4">
          O valor de cada OS depende do porte e da distância. Alguns exemplos:
        </p>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-white/50 text-left">
                <th className="px-4 py-3 font-semibold">Perfil do sistema</th>
                <th className="px-4 py-3 font-semibold text-center">Placas</th>
                <th className="px-4 py-3 font-semibold text-center">Km (ida+volta)</th>
                <th className="px-4 py-3 font-semibold text-right">Valor da OS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['Residencial', 12, 20],
                ['Comercial pequeno', 70, 40],
                ['Comercial médio', 200, 60],
                ['Industrial / usina', 500, 100],
              ].map(([perfil, p, k], i) => (
                <tr key={i} className="text-white/75">
                  <td className="px-4 py-3 font-semibold text-white">{perfil}</td>
                  <td className="px-4 py-3 text-center">{p}</td>
                  <td className="px-4 py-3 text-center">{k}</td>
                  <td className="px-4 py-3 text-right font-bold text-sol">{brl(valorOS(Number(p), Number(k)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-white/45">
          Não é teto: quanto mais OS por dia você executa com qualidade, mais você ganha. Otimizando o roteiro
          (OS próximas no mesmo dia), o ganho por dia sobe.
        </p>
      </Secao>

      {/* ===== 07 · O QUE ESPERAMOS ===== */}
      <Secao titulo="O que esperamos" numero="07">
        <p className="text-white/70 leading-relaxed mb-6">
          Empreitada é liberdade com responsabilidade. Pra continuar recebendo OS, o que importa:
        </p>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          {[
            ['Qualidade', 'Checklist completo, fotos válidas e laudo dos testes elétricos e mecânicos'],
            ['Prazo', 'Atender a OS dentro do prazo combinado com o cliente'],
            ['Segurança', 'Trabalho em altura e elétrica dentro das normas (NR-35 / NR-10)'],
          ].map(([t, d], i) => (
            <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-sol font-bold text-sm mb-1">{t}</p>
              <p className="text-white/60 text-sm leading-snug">{d}</p>
            </div>
          ))}
        </div>
        <p className="text-white/60 text-sm leading-relaxed">
          Entregando com qualidade e no prazo, a SPIN te prioriza na distribuição das próximas OS da sua zona —
          é o que constrói volume e ganho recorrente pra você.
        </p>
      </Secao>

      {/* ===== 08 · FORMATO DE CONTRATAÇÃO ===== */}
      <Secao titulo="Formato de contratação" numero="08">
        <div className="p-5 md:p-6 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl mb-6">
          <p className="text-white font-bold text-base md:text-lg mb-2">📋 Contratação PJ — empreitada por OS</p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            Você atua como <strong className="text-white">pessoa jurídica (PJ)</strong>, prestador de serviços de O&amp;M
            por <strong className="text-white">empreitada</strong> (por ordem de serviço), com <strong className="text-white">CNPJ próprio</strong>.{' '}
            <strong className="text-sol">Não há vínculo empregatício</strong> — não é CLT, não há subordinação, FGTS,
            13º nem férias remuneradas.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-5 bg-verde/[0.06] border border-verde/25 rounded-xl">
            <p className="text-verde font-bold mb-2">A favor</p>
            <p className="text-white/65 text-sm leading-relaxed">
              Autonomia de agenda e ritmo, ganho por produção (fez, faturou), demanda pronta da SPIN e recorrência
              por contrato — sem precisar vender.
            </p>
          </div>
          <div className="p-5 bg-coral/[0.06] border border-coral/25 rounded-xl">
            <p className="text-coral font-bold mb-2">Contra</p>
            <p className="text-white/65 text-sm leading-relaxed">
              Não há FGTS, 13º nem férias. É necessário CNPJ, veículo e EPI próprios, e a renda varia com o volume
              de OS executadas.
            </p>
          </div>
        </div>
      </Secao>

      {/* ===== 09 · COMO E QUANDO RECEBE ===== */}
      <Secao titulo="Como e quando você recebe" numero="09">
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          {[
            ['Executou a OS', 'Serviço feito, laudo com fotos e testes enviado pelo app.'],
            ['Aprovação', 'A SPIN confere o laudo; aprovado, o valor da OS é liberado.'],
            ['NF + pagamento', 'Você emite a NF do serviço e recebe a cada OS — não espera o fim do mês.'],
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
            Você executou uma OS de <strong className="text-white">24 placas</strong> a 40 km. Enviou o laudo com
            fotos e os testes aprovados. Emite a NF de <strong className="text-sol">{brl(valorOS(24, 40))}</strong> e
            recebe por aquele serviço — sem esperar fechar o mês.
          </p>
        </div>
      </Secao>

      {/* ===== POR QUE AGORA ===== */}
      <div className="mb-16 p-6 md:p-8 bg-gradient-to-br from-sol/[0.08] to-transparent border border-sol/20 rounded-2xl">
        <h3 className="text-xl md:text-2xl font-black text-white mb-3">Por que agora</h3>
        <p className="text-white/70 leading-relaxed">
          O boom de instalações de 2021 e 2022 está completando quatro anos — é uma safra inteira de sistemas
          sujos, sem manutenção. A SPIN está fechando contratos em ritmo alto e{' '}
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
