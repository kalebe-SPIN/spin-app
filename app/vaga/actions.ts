'use server'

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Server actions da área do candidato (/vaga).
 *
 * Regra de acesso pedida pelo Kalebe:
 *   1 login por candidato, que funciona SÓ 2 vezes — depois expira.
 * O contador vive em convites_trabalho.entradas_usadas e sobe a cada
 * signInWithPassword bem-sucedido.
 */

// ---------------------------------------------------------------------------
// LOGIN — valida convite, autentica, consome 1 das 2 entradas
// ---------------------------------------------------------------------------
export async function entrarComoCandidatoAction(input: {
  email: string
  senha: string
}): Promise<{ sucesso: true; entradasRestantes: number } | { erro: string }> {
  const email = input.email.trim().toLowerCase()
  if (!email || !input.senha) return { erro: 'Informe email e senha.' }

  const admin = createAdminClient()

  // 1. Localiza o convite pelo email
  const { data: convite } = await admin
    .from('convites_trabalho')
    .select('id, entradas_usadas, max_entradas, bloqueado')
    .eq('email_candidato', email)
    .maybeSingle()

  if (!convite) {
    return { erro: 'Credencial não encontrada. Confira o email que você recebeu no convite.' }
  }

  // 2. Já esgotou as 2 entradas?
  if (convite.bloqueado || convite.entradas_usadas >= convite.max_entradas) {
    return {
      erro: 'Este acesso já foi usado 2 vezes e expirou. Fale com a Spin pela WhatsApp para liberar um novo acesso.',
    }
  }

  // 3. Autentica (seta cookies de sessão via server client)
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: input.senha })
  if (error) {
    return { erro: 'Email ou senha incorretos. Confira e tente novamente.' }
  }

  // 4. Consome 1 entrada; se chegou no limite, bloqueia próximas
  const novasEntradas = convite.entradas_usadas + 1
  await admin
    .from('convites_trabalho')
    .update({
      entradas_usadas: novasEntradas,
      bloqueado: novasEntradas >= convite.max_entradas,
      ultimo_acesso_em: new Date().toISOString(),
    })
    .eq('id', convite.id)

  return { sucesso: true, entradasRestantes: convite.max_entradas - novasEntradas }
}

// ---------------------------------------------------------------------------
// ACEITAR / RECUSAR proposta
// ---------------------------------------------------------------------------
async function conviteDoUsuario() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('convites_trabalho')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  return data
}

export async function aceitarPropostaAction(): Promise<{ sucesso: true } | { erro: string }> {
  const convite = await conviteDoUsuario()
  if (!convite) return { erro: 'Convite não encontrado.' }

  const admin = createAdminClient()
  // Só avança se ainda estava em 'enviado' (não retrocede etapas já cumpridas)
  const novoStatus = convite.status === 'enviado' ? 'proposta_aceita' : convite.status
  const { error } = await admin
    .from('convites_trabalho')
    .update({
      status: novoStatus,
      proposta_aceita_em: convite.proposta_aceita_em || new Date().toISOString(),
    })
    .eq('id', convite.id)
  if (error) return { erro: error.message }

  revalidatePath('/vaga')
  return { sucesso: true }
}

export async function recusarPropostaAction(motivo: string): Promise<{ sucesso: true } | { erro: string }> {
  const convite = await conviteDoUsuario()
  if (!convite) return { erro: 'Convite não encontrado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('convites_trabalho')
    .update({
      status: 'recusado',
      recusado_em: new Date().toISOString(),
      motivo_recusa: motivo?.trim() || null,
    })
    .eq('id', convite.id)
  if (error) return { erro: error.message }

  revalidatePath('/vaga')
  return { sucesso: true }
}

// ---------------------------------------------------------------------------
// ASSINAR contrato (assinatura eletrônica simples com trilha de auditoria)
// ---------------------------------------------------------------------------
export async function assinarContratoAction(input: {
  nome: string
  cpf: string
  textoContrato: string
  aceite: boolean
}): Promise<{ sucesso: true } | { erro: string }> {
  const convite = await conviteDoUsuario()
  if (!convite) return { erro: 'Convite não encontrado.' }
  if (convite.status === 'enviado') return { erro: 'Aceite a proposta antes de assinar o contrato.' }

  const nome = input.nome.trim()
  const cpf = (input.cpf || '').replace(/\D/g, '')
  if (nome.length < 5) return { erro: 'Informe seu nome completo como no documento.' }
  if (cpf.length !== 11) return { erro: 'CPF inválido — informe os 11 dígitos.' }
  if (!input.aceite) return { erro: 'Marque a caixa de aceite para assinar.' }

  const aceiteTexto =
    'Declaro que li e concordo integralmente com os termos deste Contrato de Representação ' +
    'Comercial e assino eletronicamente, nos termos da MP 2.200-2/2001 e da Lei 14.063/2020.'

  const documentoHash = createHash('sha256').update(input.textoContrato).digest('hex')

  const hdrs = headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = hdrs.get('user-agent') || null

  const admin = createAdminClient()

  const { error: erroAssinatura } = await admin.from('assinaturas_contrato').insert({
    convite_id: convite.id,
    nome_assinante: nome,
    cpf,
    aceite_texto: aceiteTexto,
    documento_hash: documentoHash,
    ip,
    user_agent: userAgent,
  })
  if (erroAssinatura) return { erro: erroAssinatura.message }

  const novoStatus = ['contrato_assinado', 'docs_enviados', 'concluido'].includes(convite.status)
    ? convite.status
    : 'contrato_assinado'
  await admin
    .from('convites_trabalho')
    .update({
      status: novoStatus,
      contrato_assinado_em: convite.contrato_assinado_em || new Date().toISOString(),
    })
    .eq('id', convite.id)

  revalidatePath('/vaga')
  return { sucesso: true }
}

// ---------------------------------------------------------------------------
// ENVIAR documento (upload pro bucket privado documentos-candidatos)
// ---------------------------------------------------------------------------
export async function enviarDocumentoAction(
  formData: FormData
): Promise<{ sucesso: true } | { erro: string }> {
  const convite = await conviteDoUsuario()
  if (!convite) return { erro: 'Convite não encontrado.' }

  const tipo = String(formData.get('tipo') || '').trim()
  const file = formData.get('arquivo') as File | null
  if (!tipo) return { erro: 'Tipo de documento não informado.' }
  if (!file || file.size === 0) return { erro: 'Selecione um arquivo.' }
  if (file.size > 10 * 1024 * 1024) return { erro: 'Arquivo maior que 10 MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${convite.id}/${tipo}-${Date.now()}.${ext}`

  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: erroUpload } = await admin.storage
    .from('documentos-candidatos')
    .upload(path, bytes, { contentType: file.type || undefined, upsert: true })
  if (erroUpload) return { erro: `Falha no upload: ${erroUpload.message}` }

  const { error: erroInsert } = await admin.from('documentos_candidato').insert({
    convite_id: convite.id,
    tipo,
    nome_arquivo: file.name,
    arquivo_path: path,
  })
  if (erroInsert) return { erro: erroInsert.message }

  revalidatePath('/vaga/documentos')
  return { sucesso: true }
}

/** Marca o envio de documentos como concluído (candidato terminou de enviar). */
export async function concluirEnvioDocsAction(): Promise<{ sucesso: true } | { erro: string }> {
  const convite = await conviteDoUsuario()
  if (!convite) return { erro: 'Convite não encontrado.' }
  if (convite.status === 'enviado' || convite.status === 'proposta_aceita') {
    return { erro: 'Assine o contrato antes de finalizar o envio de documentos.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('convites_trabalho')
    .update({
      status: convite.status === 'concluido' ? 'concluido' : 'docs_enviados',
      docs_enviados_em: convite.docs_enviados_em || new Date().toISOString(),
    })
    .eq('id', convite.id)
  if (error) return { erro: error.message }

  revalidatePath('/vaga')
  return { sucesso: true }
}
