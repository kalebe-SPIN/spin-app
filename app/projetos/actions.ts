'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type EnderecoInstalacao = {
  cep?: string
  rua?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
}

export type NovoProjetoInput = {
  // Cliente comercial (quem paga)
  cliente_id?: string
  novo_cliente?: {
    razao_social: string
    cpf_cnpj?: string | null
    email?: string | null
    telefone?: string | null
    whatsapp?: string | null
    tipo?: 'pf' | 'pj'
  }
  // Titular (pode ser igual ao cliente ou diferente)
  titular_igual_cliente?: boolean
  titular_cliente_id?: string  // se usar existente
  novo_titular?: {
    razao_social: string
    cpf_cnpj?: string | null
    tipo?: 'pf' | 'pj'
  }
  // Endereço da instalação (pode ser igual ao do titular ou diferente)
  endereco_igual_titular?: boolean
  endereco_instalacao?: EnderecoInstalacao
  observacoes?: string | null
}

export async function criarProjetoAction(input: NovoProjetoInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  let clienteId = input.cliente_id
  let dadosCliente: {
    razao_social: string
    cpf_cnpj: string | null
    email: string | null
    telefone: string | null
  } | null = null

  // Caminho 1: cliente novo — reusa cadastro existente com cadeia
  // CPF/CNPJ → telefone → email → endereço → UC. Regra fixa da Spin:
  // um cliente = um cadastro. Se qualquer chave forte bater, agrega o
  // projeto ao card do cliente existente em vez de duplicar.
  if (!clienteId && input.novo_cliente) {
    if (!input.novo_cliente.razao_social?.trim()) {
      return { erro: 'Nome/razão social é obrigatório' }
    }

    const cpfCnpjLimpo = (input.novo_cliente.cpf_cnpj || '').replace(/\D/g, '') || null
    const telLimpo = (input.novo_cliente.telefone || input.novo_cliente.whatsapp || '')
      .replace(/\D/g, '') || null
    const emailLower = (input.novo_cliente.email || '').trim().toLowerCase() || null
    const ucRaw = (input as any).uc_geradora || null

    function aplicar(cli: any) {
      clienteId = cli.id
      dadosCliente = {
        razao_social: cli.razao_social,
        cpf_cnpj: cli.cpf_cnpj,
        email: cli.email,
        telefone: cli.telefone,
      }
    }

    // 1. CPF/CNPJ — chave mais forte
    if (!clienteId && cpfCnpjLimpo) {
      const { data: cli } = await supabase
        .from('clientes')
        .select('id, razao_social, cpf_cnpj, email, telefone')
        .eq('cpf_cnpj', cpfCnpjLimpo)
        .maybeSingle()
      if (cli) aplicar(cli)
    }
    // 2. Telefone (só dígitos)
    if (!clienteId && telLimpo && telLimpo.length >= 10) {
      const { data: cli } = await supabase
        .from('clientes')
        .select('id, razao_social, cpf_cnpj, email, telefone')
        .or(`telefone.eq.${telLimpo},whatsapp.eq.${telLimpo}`)
        .limit(1)
        .maybeSingle()
      if (cli) aplicar(cli)
    }
    // 3. Email
    if (!clienteId && emailLower) {
      const { data: cli } = await supabase
        .from('clientes')
        .select('id, razao_social, cpf_cnpj, email, telefone')
        .ilike('email', emailLower)
        .maybeSingle()
      if (cli) aplicar(cli)
    }
    // 4. UC geradora — se um projeto anterior tem essa UC, reusa o cliente dele
    if (!clienteId && ucRaw) {
      const { data: proj } = await supabase
        .from('projetos')
        .select('cliente_id')
        .eq('uc_geradora', ucRaw)
        .not('cliente_id', 'is', null)
        .limit(1)
        .maybeSingle()
      if (proj?.cliente_id) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('id, razao_social, cpf_cnpj, email, telefone')
          .eq('id', proj.cliente_id)
          .maybeSingle()
        if (cli) aplicar(cli)
      }
    }

    // Nada bateu → cria novo cadastro
    if (!clienteId) {
      const { data: cliCriado, error: erroCli } = await supabase
        .from('clientes')
        .insert({
          tipo: input.novo_cliente.tipo || 'pf',
          razao_social: input.novo_cliente.razao_social.trim(),
          cpf_cnpj: cpfCnpjLimpo,
          email: emailLower,
          telefone: telLimpo,
          whatsapp: (input.novo_cliente.whatsapp || input.novo_cliente.telefone || '').replace(/\D/g, '') || null,
          proprietario_id: user.id,
        })
        .select('id, razao_social, cpf_cnpj, email, telefone')
        .single()

      if (erroCli || !cliCriado) {
        return { erro: 'Erro ao criar cliente: ' + (erroCli?.message || '') }
      }
      clienteId = cliCriado.id
      dadosCliente = {
        razao_social: cliCriado.razao_social,
        cpf_cnpj: cliCriado.cpf_cnpj,
        email: cliCriado.email,
        telefone: cliCriado.telefone,
      }
    }
  }
  // Caminho 2: cliente existente — busca os dados
  else if (clienteId) {
    const { data: cliBusca } = await supabase
      .from('clientes')
      .select('razao_social, cpf_cnpj, email, telefone')
      .eq('id', clienteId)
      .single()
    if (!cliBusca) return { erro: 'Cliente não encontrado' }
    dadosCliente = cliBusca as any
  } else {
    return { erro: 'É preciso escolher ou cadastrar um cliente' }
  }

  // TITULAR — igual ao cliente por padrão, ou pode ser diferente
  const titularIgual = input.titular_igual_cliente !== false
  let titularId: string | null | undefined = titularIgual ? clienteId : input.titular_cliente_id

  if (!titularIgual && !titularId && input.novo_titular?.razao_social?.trim()) {
    const { data: novoTit } = await supabase
      .from('clientes')
      .insert({
        tipo: input.novo_titular.tipo || 'pf',
        razao_social: input.novo_titular.razao_social.trim(),
        cpf_cnpj: input.novo_titular.cpf_cnpj || null,
        proprietario_id: user.id,
      })
      .select('id')
      .single()
    titularId = novoTit?.id || null
  }

  const { data: novoProjeto, error } = await supabase
    .from('projetos')
    .insert({
      consultor_id: user.id,
      cliente_id: clienteId,
      titular_cliente_id: titularId,
      titular_igual_cliente: titularIgual,
      endereco_igual_titular: input.endereco_igual_titular !== false,
      endereco_instalacao: input.endereco_igual_titular === false ? input.endereco_instalacao || null : null,
      // Denormalização — mantém pra compat com código existente
      cliente_razao_social: dadosCliente!.razao_social,
      cliente_cpf_cnpj: dadosCliente!.cpf_cnpj,
      cliente_email: dadosCliente!.email,
      cliente_telefone: dadosCliente!.telefone,
      observacoes_consultor: input.observacoes || null,
      status: 'rascunho',
    })
    .select('id')
    .single()

  if (error || !novoProjeto) {
    return { erro: 'Erro ao criar projeto: ' + (error?.message || '') }
  }

  revalidatePath('/projetos')
  revalidatePath('/crm/clientes')
  if (clienteId) revalidatePath(`/crm/clientes/${clienteId}`)
  redirect(`/projetos/${novoProjeto.id}`)
}
