/**
 * Perfil do lead no Spinzap (Kalebe 2026-10-10) — "cada sessão de dados fica
 * acessível na linha do perfil, pra acesso rápido e edição; cada uma tem seu
 * formulário próprio". Sem import de servidor: a tela e as actions usam igual.
 * Valores das opções = os mesmos do projeto (telhado, estrutura, ligação),
 * pra passar direto pra proposta.
 */

export type Opcao = { valor: string; rotulo: string }

export const TIPOS_TELHADO: Opcao[] = [
  { valor: 'ceramica_colonial', rotulo: 'Cerâmica colonial' },
  { valor: 'ceramica_francesa', rotulo: 'Cerâmica francesa' },
  { valor: 'fibrocimento', rotulo: 'Fibrocimento' },
  { valor: 'metalico_trapezoidal', rotulo: 'Metálico trapezoidal' },
  { valor: 'metalico_onda', rotulo: 'Metálico ondulado' },
  { valor: 'laje_impermeabilizada', rotulo: 'Laje' },
  { valor: 'solo', rotulo: 'Solo' },
  { valor: 'carport', rotulo: 'Carport' },
]
export const MATERIAIS_ESTRUTURA: Opcao[] = [
  { valor: 'concreto', rotulo: 'Concreto' },
  { valor: 'madeira', rotulo: 'Madeira' },
  { valor: 'metalica', rotulo: 'Metálica' },
]
export const QTD_AGUAS: Opcao[] = [
  { valor: '1', rotulo: '1 água' },
  { valor: '2', rotulo: '2 águas' },
  { valor: '3', rotulo: '3 águas' },
  { valor: '4', rotulo: '4 águas' },
  { valor: '5', rotulo: '5 ou mais' },
]
export const TIPOS_REDE: Opcao[] = [
  { valor: 'monofasico', rotulo: 'Monofásica' },
  { valor: 'bifasico', rotulo: 'Bifásica' },
  { valor: 'trifasico', rotulo: 'Trifásica' },
]
/** Sugestões do campo de disjuntor (o valor é livre, em A). */
export const DISJUNTORES_COMUNS = [32, 40, 50, 63, 70, 80, 100, 125]

export type PerfilContato = {
  primeiro_nome?: string | null
  email?: string | null
  endereco?: { cep?: string; rua?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string } | null
}
export type PerfilCivil = {
  laje?: boolean | null
  tipo_telhado?: string | null
  aguas?: number | null
  material_estrutura?: string | null
  area_m2?: number | null
  /** Faixa que o lead escolheu no WhatsApp (ex.: "De 100 a 200 m²"); area_m2 = meio da faixa */
  area_faixa?: string | null
}
export type PerfilEletrica = { tipo_rede?: string | null; disjuntor_a?: number | null }
export type PerfilPeculiaridades = {
  titular_fatura?: boolean | null
  titular_nome?: string | null
  sombreamento?: boolean | null
  sombreamento_descricao?: string | null
}
export type Pendencia = { id: string; texto: string; criada_em: string; resolvida_em?: string | null; origem?: string | null }

export type PerfilLead = {
  contato: PerfilContato
  infra_civil: PerfilCivil
  infra_eletrica: PerfilEletrica
  peculiaridades: PerfilPeculiaridades
  pendencias: Pendencia[]
}
export type SecaoDados = 'contato' | 'infra_civil' | 'infra_eletrica' | 'peculiaridades'

export const CATEGORIAS_IMAGEM: Opcao[] = [
  { valor: 'padrao_entrada', rotulo: 'Padrão de entrada' },
  { valor: 'disjuntor_geral', rotulo: 'Disjuntor geral' },
  { valor: 'fachada', rotulo: 'Fachada do imóvel' },
]
export const CATEGORIAS_ARQUIVO: Opcao[] = [
  { valor: 'fatura', rotulo: 'Fatura (PDF)' },
  { valor: 'doc_digital', rotulo: 'Documento digital' },
  { valor: 'orcamento', rotulo: 'Orçamento' },
]
export const CATEGORIAS = [...CATEGORIAS_IMAGEM, ...CATEGORIAS_ARQUIVO, { valor: 'outro', rotulo: 'Outro' }]

export type ArquivoPerfil = {
  id: string
  categoria: string
  url: string
  nome: string | null
  mime: string | null
  origem: 'cliente' | 'gerado' | 'equipe'
  criado_em: string
}

/** Sessões da linha do perfil, na ordem do roteiro. */
export const SECOES = [
  { chave: 'contato', rotulo: 'Contato', emoji: '👤' },
  { chave: 'infra_civil', rotulo: 'Infra civil', emoji: '🏠' },
  { chave: 'infra_eletrica', rotulo: 'Infra elétrica', emoji: '⚡' },
  { chave: 'peculiaridades', rotulo: 'Peculiaridades', emoji: '📌' },
  { chave: 'imagens', rotulo: 'Imagens', emoji: '🖼️' },
  { chave: 'arquivos', rotulo: 'Arquivos', emoji: '📎' },
] as const
export type Secao = (typeof SECOES)[number]['chave']

const tem = (v: unknown) => v !== null && v !== undefined && v !== ''

/** Quantos itens de cada sessão estão preenchidos (pra linha do perfil). */
export function progressoSecao(secao: Secao, p: PerfilLead, arquivos: ArquivoPerfil[]): { feitos: number; total: number } {
  if (secao === 'contato') {
    const e = p.contato.endereco || {}
    return { feitos: [p.contato.primeiro_nome, p.contato.email, e.rua && e.numero && e.cidade].filter(tem).length, total: 3 }
  }
  if (secao === 'infra_civil') {
    const c = p.infra_civil
    return { feitos: [c.laje, c.tipo_telhado, c.aguas, c.material_estrutura, c.area_m2].filter(tem).length, total: 5 }
  }
  if (secao === 'infra_eletrica') return { feitos: [p.infra_eletrica.tipo_rede, p.infra_eletrica.disjuntor_a].filter(tem).length, total: 2 }
  if (secao === 'peculiaridades') return { feitos: [p.peculiaridades.titular_fatura, p.peculiaridades.sombreamento].filter(tem).length, total: 2 }
  const cats = secao === 'imagens' ? CATEGORIAS_IMAGEM : CATEGORIAS_ARQUIVO
  return { feitos: cats.filter((c) => arquivos.some((a) => a.categoria === c.valor)).length, total: cats.length }
}

export const rotuloDe = (lista: Opcao[], v: string | null | undefined) => lista.find((o) => o.valor === v)?.rotulo || v || ''

export const PERFIL_VAZIO: PerfilLead = { contato: {}, infra_civil: {}, infra_eletrica: {}, peculiaridades: {}, pendencias: [] }
