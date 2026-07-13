import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { montarKitCompleto } from '@/lib/kit-auto/montar-kit'
import { precificarLista } from '@/lib/kit-auto/precificar-lista'
import { ListaCaForm } from '@/components/ListaCaForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ListaCaPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  const kit = projeto.kit_selecionado
  if (!kit) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-sol/10 border border-sol/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-sol mb-2">⚠️ Kit não escolhido</h1>
          <p className="text-white/70 text-sm mb-4">
            Antes de montar a Lista CA, escolha placa + inversor no Passo 6.
          </p>
          <Link
            href={`/projetos/${projeto.id}/kit`}
            className="inline-block px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg"
          >
            → Ir para escolha de kit
          </Link>
        </div>
      </main>
    )
  }

  // Buscar isopleta da cidade
  let isopletaMs: number | undefined
  const cidade = projeto.cliente_endereco?.cidade
  const uf = projeto.cliente_endereco?.uf || 'SC'
  if (cidade) {
    const { data: cidadeRow } = await supabase
      .from('cidades_isopleta')
      .select('isopleta_ms')
      .eq('municipio', String(cidade).toUpperCase())
      .eq('uf', uf)
      .maybeSingle()
    if (cidadeRow) isopletaMs = Number(cidadeRow.isopleta_ms)
  }

  // Se já foi confirmada antes, usa. Senão, gera automática.
  const listaSalva = projeto.lista_ca_confirmada
  const listaAuto = montarKitCompleto(
    { id: kit.placa.id, potencia_wp: kit.placa.potencia_wp },
    {
      id: kit.inversor.id,
      potencia_kw: kit.inversor.potencia_kw,
      tensao_desc: kit.inversor.tensao_desc || 'Inversor Monofásico 220 V',
      disjuntor_equivalente: kit.inversor.disjuntor_equivalente,
      entradas_mppt: kit.inversor.entradas_mppt || 2,
    },
    {
      qtd_placas: kit.qtd_placas,
      qtd_inversores: kit.qtd_inversores,
      distancia_string_qgbt_m: projeto.padrao_entrada?.distancia_string_qgbt_m || 15,
      tipo_telhado: projeto.telhado_secoes?.[0]?.tipo_cobertura,
      isopleta_ms: isopletaMs,
      spda: projeto.padrao_entrada?.spda,
    }
  )

  // Precifica: busca preços no catálogo pra cada item
  const listaComPrecos = await precificarLista(supabase, listaSalva || listaAuto)

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Passo 7 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Lista CA — Materiais complementares
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Sistema gerou automaticamente com base no kit. Ajuste quantidades ou adicione itens conforme necessário.
          </p>
        </header>

        <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-xl p-4 mb-6">
          <p className="text-sm text-white/80 mb-2">
            <strong>Kit selecionado:</strong> {kit.qtd_placas}× {kit.placa.modelo} ({kit.placa.potencia_wp}Wp)
            + {kit.qtd_inversores}× {kit.inversor.modelo} ({kit.inversor.potencia_kw}kW)
          </p>
          <p className="text-xs text-white/60">
            Potência CC: {kit.potencia_cc_kwp?.toFixed(2)} kWp · Potência CA: {kit.potencia_ca_kw?.toFixed(2)} kW · FCI: {kit.fci_pct?.toFixed(0)}%
          </p>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
          <ListaCaForm
            projetoId={projeto.id}
            itensIniciais={listaComPrecos}
            regeneradoAutomatico={!listaSalva}
          />
        </div>
      </div>
    </main>
  )
}
