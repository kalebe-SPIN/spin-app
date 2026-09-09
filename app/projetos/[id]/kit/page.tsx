import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { KitPorUcClient } from '@/components/KitPorUcClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function KitPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Consumo consolidado: UC principal + soma das beneficiárias
  const consumoPrincipal =
    projeto.analise_fatura?.consumo_medio_12m_kwh ||
    projeto.analise_fatura?.consumo_mes_kwh ||
    projeto.analise_fatura?.consumo_medio_kwh ||
    0
  const consumoBeneficiarias = (projeto.beneficiarias || []).reduce(
    (sum: number, b: any) => sum + (b.analise?.consumo_medio_12m_kwh || b.analise?.consumo_mes_kwh || 0),
    0
  )
  const consumoMedio = consumoPrincipal + consumoBeneficiarias
  const horasSol = 4.5
  const perdas = 0.20
  const potCcAlvoAuto = consumoMedio > 0
    ? consumoMedio / (30 * horasSol * (1 - perdas))
    : 5.0

  // Padrão CELESC do cliente
  const padrao = projeto.padrao_entrada
  if (!padrao || !padrao.tipo_ligacao) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral mb-2">⚠️ Padrão CELESC não preenchido</h1>
          <p className="text-white/70 text-sm mb-4">
            Precisamos saber o tipo de ligação (mono/bi/tri) e amperagem do padrão de entrada
            do cliente pra sugerir kits compatíveis com a rede CELESC dele.
          </p>
          <Link
            href={`/projetos/${projeto.id}/padrao`}
            className="inline-block px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg"
          >
            → Ir para Passo 4 (Padrão CELESC)
          </Link>
        </div>
      </main>
    )
  }

  // Buscar todas as placas ativas do catálogo
  const { data: placas } = await supabase
    .from('produtos')
    .select(`
      id, codigo_weg, modelo, fabricante, descricao_curta, specs, disponivel_estoque, url_datasheet,
      precos_produtos(preco_venda, vigente_de, vigente_ate)
    `)
    .eq('categoria', 'placa')
    .eq('ativo', true)
    .order('specs->potencia_wp', { ascending: false })

  // Buscar todos os inversores solares (string + micro).
  // A planilha WEG cataloga CFW como inversor_bombeamento (bombas d'água)
  // e a linha industrial também cai em 'inversor' — precisamos EXCLUIR
  // esses do gerador de kit solar. Só string e microinversor entram.
  const { data: inversores } = await supabase
    .from('produtos')
    .select(`
      id, codigo_weg, modelo, subcategoria, descricao_curta, specs, disponivel_estoque,
      precos_produtos(preco_venda, vigente_de, vigente_ate)
    `)
    .eq('categoria', 'inversor')
    .in('subcategoria', ['inversor_string', 'microinversor'])
    .eq('ativo', true)

  // Kalebe 2026-09-09 (v3): filtrar por categoria não estava confiável — os
  // SIW200H/SIW400H, DTSU666 etc podem estar cadastrados sob subcategorias
  // variadas. Estratégia agora: 1 QUERY GRANDE trazendo todo produto ativo,
  // classificação em buckets pelo NOME DO MODELO (regex) — não depende
  // do enum categoria estar certo. Se um SIW200H foi cadastrado como
  // 'monitoramento' por engano, ainda cai na bucket controladora pelo nome.
  const { data: todosProdutosAtivos } = await supabase
    .from('produtos')
    .select('id, marca:fabricante, modelo, categoria, subcategoria, specs, disponivel_estoque, ativo, precos_produtos(preco_venda, vigente_de, vigente_ate)')
    .eq('ativo', true)
    .order('modelo')

  // Classifica em buckets por padrão de modelo (defensivo) + fallback categoria.
  // Um mesmo produto pode aparecer em opcionais se não bater com bucket específico.
  const todos = todosProdutosAtivos || []
  const modeloRe = (r: RegExp) => (p: any) => r.test(String(p.modelo || '').toUpperCase())
  const catIn = (...cs: string[]) => (p: any) => cs.includes(String(p.categoria || ''))

  const bateriasSlice     = todos.filter(p => modeloRe(/LUNA|SBW|BESS|PLW|BATERIA/)(p)      || catIn('bateria')(p))
  const controladorasSlice = todos.filter(p => modeloRe(/^SIW\s?\d{3}H|SIW200H|SIW400H|HIBRID|INVERSOR.*HIBRID|CONTROLADOR/)(p) || catIn('controlador','inversor_hibrido')(p))
  const medidoresSlice     = todos.filter(p => modeloRe(/DTSU|DTS\d|MMW|SMART.*METER|MEDIDOR/)(p) || catIn('multimedidor','smart_meter','monitoramento')(p))
  const caixasSlice        = todos.filter(p => modeloRe(/EMBOX|CAIXA.*JUN|STRING\s?BOX/)(p)       || catIn('caixa_juncao')(p))
  // Opcionais: qualquer complemento (frete, cabo, conector, DPS, disjuntor, etc)
  // — inclui produtos que não caíram em nenhum dos buckets acima.
  const idsClassificados = new Set([
    ...bateriasSlice, ...controladorasSlice, ...medidoresSlice, ...caixasSlice,
  ].map(p => p.id))
  const opcionaisSlice = todos.filter(p =>
    !idsClassificados.has(p.id) &&
    (catIn('frete','conector','acessorio','cabo','monitoramento','protecao','dps','disjuntor')(p)
     || modeloRe(/FRETE|CABO|CONECTOR|DPS|DISJUNTOR|MC4|SUPORT/)(p))
  )

  // Aplaina preços vigentes (o mesmo padrão que o resto da /kit usa)
  const hojeIso = new Date().toISOString().slice(0, 10)
  function normalizar(rows: any[] | null): any[] {
    return (rows || []).map(r => {
      const precos = (r.precos_produtos || []) as any[]
      const vigentes = precos.filter(p => (!p.vigente_de || p.vigente_de <= hojeIso) && (!p.vigente_ate || p.vigente_ate >= hojeIso))
      const preco = (vigentes[0] || precos[0])?.preco_venda ?? 0
      return {
        id: r.id, marca: r.marca, modelo: r.modelo,
        categoria: r.categoria, subcategoria: r.subcategoria,
        potencia_kw: r.specs?.potencia_kw || r.specs?.capacidade_kwh || null,
        preco_venda: Number(preco) || 0,
        disponivel_estoque: !!r.disponivel_estoque,
      }
    })
  }
  const bateriasBess      = normalizar(bateriasSlice)
  const controladorasBess = normalizar(controladorasSlice)
  const medidoresBess     = normalizar(medidoresSlice)
  const caixasBess        = normalizar(caixasSlice)
  const extrasBess        = normalizar(opcionaisSlice)

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Passo 6 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Composição automática do kit
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Escolha a placa e o sistema sugere kits compatíveis
          </p>
        </header>

        <KitPorUcClient
          projetoId={projeto.id}
          projetoCodigo={projeto.codigo}
          placas={(placas || []) as any}
          inversores={(inversores || []) as any}
          catalogoBess={{
            baterias: bateriasBess,
            controladoras: controladorasBess,
            medidores: medidoresBess,
            caixasJuncao: caixasBess,
            opcionais: extrasBess,
          }}
          padraoPrincipal={padrao}
          tipoTelhadoPrincipal={projeto.telhado_secoes?.[0]?.tipo_cobertura}
          potCcAlvoAutoCentralizado={potCcAlvoAuto}
          consumoMedioCentralizado={consumoMedio}
          kitSalvoCentralizado={projeto.kit_selecionado}
          modoComposicao={(projeto.modo_composicao as any) || 'centralizado'}
          ucs={[
            {
              uc_ref: 'principal',
              label: 'UC principal',
              titular: projeto.analise_fatura?.titular || projeto.cliente_razao_social || '—',
              consumo_kwh_mes: consumoPrincipal,
            },
            ...(projeto.beneficiarias || []).map((b: any) => ({
              uc_ref: String(b.uc || b.ordem || Math.random()),
              label: `UC ${b.uc || ''}`,
              titular: b.titular || '—',
              consumo_kwh_mes: b.analise?.consumo_medio_12m_kwh || b.analise?.consumo_mes_kwh || 0,
            })),
          ]}
          kitsPorUc={(projeto.kits_por_uc as any) || []}
        />
      </div>
    </main>
  )
}
