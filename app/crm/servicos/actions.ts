'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type TelhadoFase = 'prospeccao' | 'contato' | 'proposta' | 'fechado' | 'perdido'

// Potência média de placa Spin (kWp por módulo) — usada pra estimar potência
// a partir da quantidade que o vendedor conta na foto do satélite.
const POTENCIA_MEDIA_PLACA_KWP = 0.55

async function verificarPermissao() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'vendedor_servicos' && perfil?.role !== 'admin') {
    return { erro: 'Somente vendedor de serviços ou admin' as const }
  }
  return { userId: user.id, role: perfil.role }
}

export async function criarTelhadoAction(input: {
  latitude: number
  longitude: number
  endereco: string
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null
  qtd_placas_estimada: number
  foto_url: string  // caminho no bucket telhados-fotos (client já fez upload)
  foto_satelite_url?: string | null
  cliente_nome?: string | null
  cliente_telefone?: string | null
  cliente_email?: string | null
  observacoes?: string | null
}) {
  const check = await verificarPermissao()
  if ('erro' in check) return { erro: check.erro }

  if (!input.endereco?.trim()) return { erro: 'Endereço obrigatório' }
  if (!input.foto_url?.trim()) return { erro: 'Foto do telhado obrigatória' }
  if (!input.qtd_placas_estimada || input.qtd_placas_estimada < 1) {
    return { erro: 'Quantidade estimada de placas é obrigatória (mínimo 1)' }
  }

  const supabase = createClient()
  const { data, error } = await supabase.from('telhados').insert({
    vendedor_id: check.userId,
    fase: 'prospeccao',
    latitude: input.latitude,
    longitude: input.longitude,
    endereco: input.endereco.trim(),
    bairro: input.bairro,
    cidade: input.cidade,
    uf: input.uf,
    cep: input.cep,
    qtd_placas_estimada: input.qtd_placas_estimada,
    potencia_kwp_estimada: Number((input.qtd_placas_estimada * POTENCIA_MEDIA_PLACA_KWP).toFixed(2)),
    foto_url: input.foto_url,
    foto_satelite_url: input.foto_satelite_url,
    cliente_nome: input.cliente_nome?.trim() || null,
    cliente_telefone: input.cliente_telefone?.replace(/\D/g, '') || null,
    cliente_email: input.cliente_email?.trim() || null,
    observacoes: input.observacoes?.trim() || null,
    ultima_interacao_em: new Date().toISOString(),
  }).select('id').single()

  if (error) return { erro: error.message }

  revalidatePath('/crm/servicos')
  return { sucesso: true, id: data.id }
}

export async function moverTelhadoFaseAction(telhadoId: string, novaFase: TelhadoFase) {
  const check = await verificarPermissao()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const { error } = await supabase
    .from('telhados')
    .update({ fase: novaFase, ultima_interacao_em: new Date().toISOString() })
    .eq('id', telhadoId)

  if (error) return { erro: error.message }
  revalidatePath('/crm/servicos')
  return { sucesso: true }
}

export async function editarTelhadoAction(telhadoId: string, patch: {
  qtd_placas_estimada?: number
  cliente_nome?: string | null
  cliente_telefone?: string | null
  cliente_email?: string | null
  observacoes?: string | null
}) {
  const check = await verificarPermissao()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const update: Record<string, unknown> = { ultima_interacao_em: new Date().toISOString() }
  if (patch.qtd_placas_estimada !== undefined) {
    if (patch.qtd_placas_estimada < 1) return { erro: 'Qtd de placas deve ser ≥ 1' }
    update.qtd_placas_estimada = patch.qtd_placas_estimada
    update.potencia_kwp_estimada = Number((patch.qtd_placas_estimada * POTENCIA_MEDIA_PLACA_KWP).toFixed(2))
  }
  if (patch.cliente_nome !== undefined) update.cliente_nome = patch.cliente_nome?.trim() || null
  if (patch.cliente_telefone !== undefined) update.cliente_telefone = patch.cliente_telefone?.replace(/\D/g, '') || null
  if (patch.cliente_email !== undefined) update.cliente_email = patch.cliente_email?.trim() || null
  if (patch.observacoes !== undefined) update.observacoes = patch.observacoes?.trim() || null

  const { error } = await supabase.from('telhados').update(update).eq('id', telhadoId)
  if (error) return { erro: error.message }
  revalidatePath('/crm/servicos')
  return { sucesso: true }
}

export async function excluirTelhadoAction(telhadoId: string) {
  const check = await verificarPermissao()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const { error } = await supabase.from('telhados').delete().eq('id', telhadoId)
  if (error) return { erro: error.message }
  revalidatePath('/crm/servicos')
  return { sucesso: true }
}
