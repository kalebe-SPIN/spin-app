import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Usina do cliente (Kalebe 2026-10-22 — migration 160): potências,
 * equipamentos (modelo, quantidade, número de série) e o acesso ao
 * monitoramento (plataforma, link, login e senha). Uma por projeto; vale pra
 * cliente da Spin ou da outra empresa do sistema. Sem cadastro ainda, vem
 * preenchida com o kit vendido. A senha fica em usinas_senhas (só o
 * servidor lê) e cada vez que alguém abre fica registrado.
 * Quem chama confere antes o acesso ao projeto (ou à conversa).
 */

type Admin = ReturnType<typeof createAdminClient>

export type TipoEquipamentoUsina = 'bateria' | 'inversor' | 'outro' | 'placa'
export const TIPOS_EQUIPAMENTO_USINA: Array<{ tipo: TipoEquipamentoUsina; rotulo: string }> = [
  { tipo: 'bateria', rotulo: 'Bateria' }, { tipo: 'inversor', rotulo: 'Inversor' }, { tipo: 'outro', rotulo: 'Outro' }, { tipo: 'placa', rotulo: 'Placa' },
]

export type EquipamentoUsina = {
  tipo: TipoEquipamentoUsina
  modelo: string
  qtd: number
  /** Wp (placa), kW (inversor) ou kWh (bateria) */
  potencia: number | null
  numeros_serie: string | null
}

export type DadosUsina = {
  potencia_cc_kwp: number | null
  potencia_ca_kw: number | null
  data_conexao: string | null
  uc: string | null
  equipamentos: EquipamentoUsina[]
  monitoramento_plataforma: string | null
  monitoramento_link: string | null
  monitoramento_login: string | null
  observacoes: string | null
}

export type UsinaTela = DadosUsina & {
  projeto_id: string
  projeto_codigo: string | null
  cliente: string | null
  empresa: string | null
  tem_senha: boolean
  /** false = ainda não cadastrada (veio do kit vendido) */
  salva: boolean
  atualizado_em: string | null
  atualizado_por: string | null
}

const num = (v: unknown) => (Number(v) > 0 ? Number(v) : null)
const txt = (v: unknown, max = 300) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null }

/** Kit vendido → equipamentos da usina (pré-preenchimento). */
function equipamentosDoKit(k: any): EquipamentoUsina[] {
  if (!k) return []
  const lista: EquipamentoUsina[] = []
  if (k.placa?.modelo && Number(k.qtd_placas) > 0) {
    lista.push({ tipo: 'placa', modelo: String(k.placa.modelo), qtd: Number(k.qtd_placas), potencia: num(k.placa.potencia_wp), numeros_serie: null })
  }
  const invs: any[] = Array.isArray(k.inversores) && k.inversores.length
    ? k.inversores
    : k.inversor?.modelo ? [{ ...k.inversor, qtd: k.qtd_inversores || 1 }] : []
  for (const i of invs) {
    if (!i?.modelo) continue
    lista.push({ tipo: 'inversor', modelo: String(i.modelo), qtd: Number(i.qtd) || 1, potencia: num(i.potencia_kw), numeros_serie: null })
  }
  return lista
}

export function normalizarDadosUsina(d: Partial<DadosUsina>): DadosUsina {
  const tipos = TIPOS_EQUIPAMENTO_USINA.map((t) => t.tipo)
  const link = txt(d.monitoramento_link, 500)
  return {
    potencia_cc_kwp: num(d.potencia_cc_kwp),
    potencia_ca_kw: num(d.potencia_ca_kw),
    data_conexao: d.data_conexao && /^\d{4}-\d{2}-\d{2}$/.test(d.data_conexao) ? d.data_conexao : null,
    uc: txt(d.uc, 40),
    equipamentos: (Array.isArray(d.equipamentos) ? d.equipamentos : [])
      .map((e) => ({
        tipo: (tipos.includes(e?.tipo as TipoEquipamentoUsina) ? e.tipo : 'outro') as TipoEquipamentoUsina,
        modelo: String(e?.modelo || '').trim().slice(0, 120),
        qtd: Math.max(1, Math.round(Number(e?.qtd) || 1)),
        potencia: num(e?.potencia),
        numeros_serie: txt(e?.numeros_serie, 2000),
      }))
      .filter((e) => e.modelo)
      .slice(0, 50),
    monitoramento_plataforma: txt(d.monitoramento_plataforma, 120),
    // Só link web (nada de javascript: etc.)
    monitoramento_link: link && /^https?:\/\//i.test(link) ? link : link ? `https://${link.replace(/^\/+/, '')}` : null,
    monitoramento_login: txt(d.monitoramento_login, 200),
    observacoes: txt(d.observacoes, 2000),
  }
}

export async function usinaDoProjeto(admin: Admin, projetoId: string): Promise<UsinaTela | { erro: string }> {
  const [{ data: pj }, { data: u, error }] = await Promise.all([
    admin.from('projetos').select('id, codigo, cliente_razao_social, kit_selecionado, analise_fatura, empresa_id').eq('id', projetoId).maybeSingle(),
    admin.from('usinas').select('*, autor:atualizado_por(nome_completo)').eq('projeto_id', projetoId).maybeSingle(),
  ])
  if (!pj) return { erro: 'Projeto não encontrado' }
  if (error && /usinas/.test(error.message)) return { erro: 'Falta rodar a migration 160 (dados da usina) no Supabase.' }
  const p = pj as any
  let empresa: string | null = null
  if (p.empresa_id) {
    const { data: e } = await admin.from('empresas').select('nome').eq('id', p.empresa_id).maybeSingle()
    empresa = (e as any)?.nome || null
  }
  const base = { projeto_id: p.id, projeto_codigo: p.codigo || null, cliente: p.cliente_razao_social || null, empresa }
  if (u) {
    const x = u as any
    const { data: s } = await admin.from('usinas_senhas').select('senha').eq('usina_id', x.id).maybeSingle()
    return {
      ...base, ...normalizarDadosUsina(x), tem_senha: !!(s as any)?.senha, salva: true,
      atualizado_em: x.atualizado_em || null, atualizado_por: String(x.autor?.nome_completo || '').split(' ')[0] || null,
    }
  }
  const k = p.kit_selecionado || null
  return {
    ...base,
    ...normalizarDadosUsina({
      potencia_cc_kwp: k?.potencia_cc_kwp, potencia_ca_kw: k?.potencia_ca_kw,
      uc: p.analise_fatura?.uc || null, equipamentos: equipamentosDoKit(k),
    }),
    tem_senha: false, salva: false, atualizado_em: null, atualizado_por: null,
  }
}

/** Grava os dados; senha só muda quando vem preenchida (vazio = mantém). */
export async function salvarUsina(admin: Admin, projetoId: string, dados: Partial<DadosUsina>, senha: string | null | undefined, usuarioId: string): Promise<{ sucesso: true } | { erro: string }> {
  const d = normalizarDadosUsina(dados)
  const { data, error } = await admin.from('usinas')
    .upsert({ projeto_id: projetoId, ...d, atualizado_em: new Date().toISOString(), atualizado_por: usuarioId }, { onConflict: 'projeto_id' })
    .select('id').single()
  if (error || !data) return { erro: /usinas/.test(error?.message || '') ? 'Falta rodar a migration 160 (dados da usina) no Supabase.' : error?.message || 'Falha ao salvar' }
  const s = String(senha ?? '')
  if (s.trim()) {
    const { error: e2 } = await admin.from('usinas_senhas')
      .upsert({ usina_id: (data as any).id, senha: s, atualizado_em: new Date().toISOString(), atualizado_por: usuarioId }, { onConflict: 'usina_id' })
    if (e2) return { erro: `Dados salvos, mas a senha não: ${e2.message}` }
  }
  return { sucesso: true }
}

/** Abre a senha do monitoramento e registra quem viu. */
export async function senhaDaUsina(admin: Admin, projetoId: string, usuarioId: string): Promise<{ senha: string } | { erro: string }> {
  const { data: u } = await admin.from('usinas').select('id').eq('projeto_id', projetoId).maybeSingle()
  if (!u) return { erro: 'Usina sem cadastro' }
  const { data: s } = await admin.from('usinas_senhas').select('senha').eq('usina_id', (u as any).id).maybeSingle()
  if (!(s as any)?.senha) return { erro: 'Senha não cadastrada' }
  await admin.from('usinas_senhas_acessos').insert({ usina_id: (u as any).id, usuario_id: usuarioId })
  return { senha: String((s as any).senha) }
}
