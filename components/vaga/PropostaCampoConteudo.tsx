import { MapaSantaCatarina } from '@/components/vaga/MapaSantaCatarina'

/**
 * Proposta do PROFISSIONAL DE CAMPO (prestador PJ com equipe própria).
 * Estrutura reaproveita a jornada do comercial; o conteúdo de remuneração
 * (modelo de pagamento + valores) está EM PREPARAÇÃO até o Kalebe definir.
 */
export function PropostaCampoConteudo({
  nomeCandidato,
  zona,
  cidades = [],
  empresa,
}: {
  nomeCandidato: string
  zona?: string | null
  cidades?: string[]
  empresa?: { razao_social?: string | null; logo_url?: string | null } | null
}) {
  const primeiroNome = nomeCandidato?.split(' ')[0] || ''

  return (
    <>
      <header className="mb-12">
        {empresa?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={empresa.logo_url} alt={empresa.razao_social || 'Spin Solar'} className="h-12 w-auto object-contain mb-6" />
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
          sua proposta de parceria para <strong className="text-white">executar</strong> a limpeza e a manutenção
          de sistemas fotovoltaicos em campo — como prestador com CNPJ e equipe própria.
        </p>
      </header>

      {cidades.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl md:text-2xl font-black text-white mb-4">Sua área de atuação</h2>
          <MapaSantaCatarina cidades={cidades} />
        </section>
      )}

      <div className="p-6 md:p-8 bg-weg-azul/10 border border-weg-azul/40 rounded-2xl">
        <p className="text-white font-bold text-lg mb-2">🚧 Proposta em preparação</p>
        <p className="text-white/75 leading-relaxed">
          Estamos finalizando os detalhes desta parceria — modelo de pagamento, valores, o que a Spin fornece e o
          que você precisa ter. Em breve você verá aqui a apresentação completa, o simulador de ganhos e o
          contrato para assinatura.
        </p>
      </div>
    </>
  )
}
