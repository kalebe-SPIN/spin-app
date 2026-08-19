import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarToken, corsHeaders, jsonCors, BUCKET_PROPOSTAS } from '@/lib/menu-handoff'

export const dynamic = 'force-dynamic'

type ClienteInput = {
  nome?: string
  doc?: string
  email?: string
  tel?: string
  rua?: string
  numero?: string
  bairro?: string
  cidade?: string
  cep?: string
  enderecoInstalacao?: string
}

/** Só dígitos — CPF/CNPJ chega mascarado do form do menu. */
function soDigitos(v?: string): string {
  return (v || '').replace(/\D/g, '')
}

/** 11 dígitos = pessoa física, 14 = jurídica. */
function tipoPorDocumento(doc: string): 'pf' | 'pj' {
  return doc.length > 11 ? 'pj' : 'pf'
}

/**
 * POST /api/menu/proposta
 *
 * Chamada pelo catálogo quando o consultor emite uma proposta em PDF.
 * Cria (ou reaproveita) o cliente, abre um projeto em "Proposta enviada" no
 * CRM do consultor dono do token, e devolve uma signed upload URL pro menu
 * subir o PDF direto no Storage — sem passar o arquivo pelo Vercel, que
 * limita o corpo da requisição a 4,5 MB.
 *
 * O anexo só é registrado depois, em POST /api/menu/proposta/anexo.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonCors({ ok: false, erro: 'Body inválido' }, origin, 400)
  }

  const sessao = await validarToken(String(body?.token || ''))
  if (!sessao) {
    return jsonCors(
      { ok: false, erro: 'Sessão inválida ou expirada. Abra o catálogo de novo pelo portal.' },
      origin,
      401
    )
  }

  const cliente: ClienteInput = body?.cliente || {}
  const kit = body?.kit || {}
  const credito = body?.credito || null
  const tag = String(body?.tag || '').slice(0, 40)

  // ===== Validação mínima — mesmos campos que o form do menu exige =====
  const nome = String(cliente.nome || '').trim()
  const doc = soDigitos(cliente.doc)
  const tel = String(cliente.tel || '').trim()

  if (!nome) return jsonCors({ ok: false, erro: 'Nome do titular é obrigatório' }, origin, 400)
  if (doc.length !== 11 && doc.length !== 14) {
    return jsonCors({ ok: false, erro: 'CPF ou CNPJ inválido' }, origin, 400)
  }
  if (!tel) return jsonCors({ ok: false, erro: 'Telefone é obrigatório' }, origin, 400)

  const supabase = createAdminClient()
  const tipo = tipoPorDocumento(doc)

  try {
    // ===== 1. Cliente — reaproveita se o consultor já atende esse CPF/CNPJ =====
    const { data: existente } = await supabase
      .from('clientes')
      .select('id')
      .eq('cpf_cnpj', doc)
      .eq('proprietario_id', sessao.consultorId)
      .maybeSingle()

    let clienteId = existente?.id as string | undefined

    const endereco = {
      logradouro: cliente.rua || null,
      numero: cliente.numero || null,
      bairro: cliente.bairro || null,
      cidade: cliente.cidade || null,
      uf: 'SC',
      cep: cliente.cep || null,
    }

    if (!clienteId) {
      const { data: novoCliente, error: erroCliente } = await supabase
        .from('clientes')
        .insert({
          tipo,
          razao_social: nome,
          cpf_cnpj: doc,
          email: cliente.email || null,
          telefone: tel,
          whatsapp: tel,
          endereco,
          origem: 'menu_catalogo',
          proprietario_id: sessao.consultorId,
        })
        .select('id')
        .single()

      if (erroCliente || !novoCliente) {
        console.error('[menu/proposta] erro ao criar cliente:', erroCliente?.message)
        return jsonCors({ ok: false, erro: 'Erro ao registrar o cliente' }, origin, 500)
      }
      clienteId = novoCliente.id
    }

    // ===== 2. Projeto — nasce direto na fase Negócio =====
    const agora = new Date()
    const validade = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data: projeto, error: erroProjeto } = await supabase
      .from('projetos')
      .insert({
        consultor_id: sessao.consultorId,
        cliente_id: clienteId,
        cliente_razao_social: nome,
        cliente_cpf_cnpj: doc,
        cliente_email: cliente.email || null,
        cliente_telefone: tel,
        cliente_endereco: endereco,
        // Catálogo não coleta UC — o consultor completa no portal antes de homologar
        uc_geradora: '',
        tipo_projeto: 'ongrid',
        status: 'proposta_enviada',
        origem: 'menu_catalogo',
        kit_selecionado: kit,
        orcamento_final: {
          proposta_tag: tag,
          preco_cheio: kit?.precoCheio ?? null,
          super_preco: kit?.superPreco ?? null,
          desconto: kit?.desconto ?? null,
          credito,
          emitido_em: agora.toISOString(),
          fonte: 'menu.spinsolar.com.br',
        },
        data_orcamento_gerado: agora.toISOString(),
        data_validade: validade.toISOString().slice(0, 10),
        observacoes_consultor:
          `Proposta ${tag} emitida pelo catálogo (menu.spinsolar.com.br) em ` +
          `${agora.toLocaleDateString('pt-BR')}.\n` +
          `Kit ${kit?.nomeCompleto || kit?.nome || '—'} · ${kit?.kwp ?? '—'} kWp.\n` +
          `Instalação: ${cliente.enderecoInstalacao || '—'}\n` +
          `⚠ Falta o workflow técnico: UC geradora, fatura CELESC, telhado e lista CA.`,
      })
      .select('id, codigo')
      .single()

    if (erroProjeto || !projeto) {
      console.error('[menu/proposta] erro ao criar projeto:', erroProjeto?.message)
      return jsonCors(
        { ok: false, erro: 'Erro ao criar o projeto no CRM: ' + (erroProjeto?.message || '') },
        origin,
        500
      )
    }

    // ===== 3. Signed upload URL pro PDF =====
    const nomeArquivo = `Proposta-Spin-${projeto.codigo}.pdf`
    const path = `${sessao.consultorId}/${projeto.id}/${nomeArquivo}`

    const { data: upload, error: erroUpload } = await supabase.storage
      .from(BUCKET_PROPOSTAS)
      .createSignedUploadUrl(path)

    if (erroUpload) {
      // Projeto já existe e é útil mesmo sem o anexo — não derruba a operação
      console.error('[menu/proposta] signed upload url falhou:', erroUpload.message)
    }

    return jsonCors(
      {
        ok: true,
        projetoId: projeto.id,
        codigo: projeto.codigo,
        clienteId,
        consultor: sessao.nome,
        upload: upload
          ? { signedUrl: upload.signedUrl, path, nomeArquivo }
          : null,
        urlPortal: `https://app.spinsolar.com.br/projetos/${projeto.id}`,
      },
      origin
    )
  } catch (err: any) {
    console.error('[menu/proposta] erro inesperado:', err?.message || err)
    return jsonCors({ ok: false, erro: 'Erro inesperado ao registrar a proposta' }, origin, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}
