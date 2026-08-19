import { createHash, randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Handoff Portal → Catálogo (menu.spinsolar.com.br).
 *
 * O menu é estático, em outro domínio, sem sessão Supabase. Pra liberar a
 * geração de proposta só pra quem tem acesso ao portal, o portal emite um
 * token opaco de curta duração e o menu troca esse token por identidade.
 *
 * Guardamos apenas o SHA-256 do token no banco (tabela menu_sessoes).
 */

/** Bucket público onde ficam os PDFs de proposta emitidos pelo catálogo. */
export const BUCKET_PROPOSTAS = 'propostas-menu'

/** Quanto tempo o link do catálogo continua valendo. */
export const HANDOFF_TTL_HORAS = 8

/** Origens autorizadas a chamar as rotas /api/menu/* (CORS). */
const ORIGENS_PERMITIDAS = [
  'https://menu.spinsolar.com.br',
  'https://www.menu.spinsolar.com.br',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function gerarToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Cabeçalhos CORS — só ecoa a origem se ela estiver na allowlist. */
export function corsHeaders(origin: string | null): Record<string, string> {
  const permitida = origin && ORIGENS_PERMITIDAS.includes(origin)
  return {
    'Access-Control-Allow-Origin': permitida ? origin : ORIGENS_PERMITIDAS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** Resposta JSON já com CORS aplicado. */
export function jsonCors(
  body: unknown,
  origin: string | null,
  status = 200
): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) })
}

export type ConsultorSessao = {
  sessaoId: string
  consultorId: string
  nome: string
  role: string
  telefone: string | null
  expiraEm: string
}

/**
 * Valida o token vindo do menu e devolve quem é o consultor.
 * Retorna null se o token não existe, expirou, foi revogado ou o perfil
 * está inativo. Registra o uso (contador + timestamp) quando válido.
 */
export async function validarToken(token: string): Promise<ConsultorSessao | null> {
  if (!token || token.length < 20) return null

  const supabase = createAdminClient()

  const { data: sessao } = await supabase
    .from('menu_sessoes')
    .select('id, consultor_id, expira_em, revogado, usos')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!sessao) return null
  if (sessao.revogado) return null
  if (new Date(sessao.expira_em).getTime() < Date.now()) return null

  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, nome_completo, role, telefone, ativo')
    .eq('id', sessao.consultor_id)
    .single()

  if (!perfil || !perfil.ativo) return null

  // Registra o uso — não bloqueia a resposta se falhar
  await supabase
    .from('menu_sessoes')
    .update({ ultimo_uso_em: new Date().toISOString(), usos: (sessao.usos || 0) + 1 })
    .eq('id', sessao.id)

  return {
    sessaoId: sessao.id,
    consultorId: perfil.id,
    nome: perfil.nome_completo || 'Consultor Spin',
    role: perfil.role,
    telefone: perfil.telefone,
    expiraEm: sessao.expira_em,
  }
}
