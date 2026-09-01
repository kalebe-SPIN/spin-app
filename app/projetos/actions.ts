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
  // Kalebe 2026-08-31: coordenadas do Google Maps salvas pra que
  // o profissional de instalação receba o link pelo WhatsApp.
  lat?: number | null
  lng?: number | null
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
  // Kalebe 2026-08-31: telhado do imóvel cadastrado direto no form
  // do novo projeto. Grava em clientes.telhado_secoes + copia pra
  // projetos_telhado_secoes automaticamente.
  telhado_secoes?: Array<{
    identificador?: string
    tipo_cobertura?: string
    area_m2?: number
    orientacao?: string
    inclinacao_graus?: number | null
    material_estrutura?: string | null
    tem_sombreamento?: boolean
    sombreamento_descricao?: string | null
  }>
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

  const enderecoInstalacao = input.endereco_instalacao || null

  const { data: novoProjeto, error } = await supabase
    .from('projetos')
    .insert({
      consultor_id: user.id,
      cliente_id: clienteId,
      titular_cliente_id: titularId,
      titular_igual_cliente: titularIgual,
      endereco_igual_titular: false,
      endereco_instalacao: enderecoInstalacao,
      // Denormalização — mantém pra compat com código existente
      cliente_razao_social: dadosCliente!.razao_social,
      cliente_cpf_cnpj: dadosCliente!.cpf_cnpj,
      cliente_email: dadosCliente!.email,
      cliente_telefone: dadosCliente!.telefone,
      cliente_endereco: enderecoInstalacao,
      observacoes_consultor: input.observacoes || null,
      status: 'rascunho',
    })
    .select('id')
    .single()

  if (error || !novoProjeto) {
    return { erro: 'Erro ao criar projeto: ' + (error?.message || '') }
  }

  // Kalebe 2026-08-31: também grava/atualiza o endereço no cadastro do
  // cliente pra reuso em propostas futuras + Google Solar identificar
  // o telhado no /crm/clientes/{id}. Só sobrescreve se o cliente não
  // tem endereço ainda (não pisa em edição manual anterior).
  if (clienteId && enderecoInstalacao) {
    const { data: cliAtual } = await supabase
      .from('clientes').select('endereco, telhado_secoes').eq('id', clienteId).maybeSingle()
    const enderecoExistente = (cliAtual as any)?.endereco
    const semEndereco = !enderecoExistente
      || (typeof enderecoExistente === 'object' && Object.keys(enderecoExistente).length === 0)
    if (semEndereco) {
      await supabase
        .from('clientes')
        .update({ endereco: enderecoInstalacao })
        .eq('id', clienteId)
    }

    // Kalebe 2026-08-31: telhado agora vive no cliente (tronco).
    // Prioridade: (1) seções vindas do form novo projeto (input.telhado_secoes)
    // — se veio, atualiza clientes.telhado_secoes; (2) senão herda o
    // que já tinha em clientes.telhado_secoes. Copia pra
    // projetos_telhado_secoes em ambos os casos.
    let secoesCliente: any[] = Array.isArray(input.telhado_secoes) && input.telhado_secoes.length > 0
      ? input.telhado_secoes
      : (Array.isArray((cliAtual as any)?.telhado_secoes) ? (cliAtual as any).telhado_secoes : [])
    // Se veio do input, atualiza o tronco (não sobrescreve se ausente)
    if (Array.isArray(input.telhado_secoes) && input.telhado_secoes.length > 0) {
      await supabase
        .from('clientes')
        .update({ telhado_secoes: input.telhado_secoes, updated_at: new Date().toISOString() })
        .eq('id', clienteId)
    }
    if (secoesCliente.length > 0) {
      const linhas = secoesCliente.map((s: any, i: number) => ({
        projeto_id: novoProjeto.id,
        ordem: i + 1,
        identificador: s.identificador || `Seção ${i + 1}`,
        tipo_cobertura: s.tipo_cobertura || 'fibrocimento',
        idade_anos: s.idade_anos ?? null,
        area_m2: Number(s.area_m2) || 0,
        orientacao: s.orientacao || 'Norte',
        inclinacao_graus: s.inclinacao_graus ?? null,
        tem_sombreamento: !!s.tem_sombreamento,
        sombreamento_descricao: s.sombreamento_descricao || null,
        sombreamento_severidade: s.sombreamento_severidade || null,
        material_estrutura: s.material_estrutura || null,
        altura_telhado_m: s.altura_telhado_m ?? null,
        observacoes: s.observacoes || null,
        url_satelite: s.url_satelite || null,
      }))
      await supabase.from('projetos_telhado_secoes').insert(linhas)
    }
  }

  revalidatePath('/projetos')
  revalidatePath('/crm/clientes')
  if (clienteId) revalidatePath(`/crm/clientes/${clienteId}`)
  redirect(`/projetos/${novoProjeto.id}`)
}

// ═══════════════════════════════════════════════════════════════════════
// Nova proposta pro mesmo cliente — herda dados cadastrais do tronco
// Kalebe 2026-08-29: 'para cada cliente deve ter só uma trilha que pode
// se bifurcar em várias propostas — o que muda é kit em diante, o
// restante permanece num só cadastro'.
// Cria projeto novo com cliente_id + snapshot inicial preenchido dos
// dados cadastrais que ficam em clientes (analise_fatura, padrao_entrada,
// beneficiarias, telhado_secoes). Salta direto pra escolha do kit.
// ═══════════════════════════════════════════════════════════════════════
export async function criarNovaPropostaMesmoClienteAction(clienteId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (!clienteId) return { erro: 'cliente_id obrigatório' }

  // 1. Busca o tronco de dados cadastrais (do cliente ou da última proposta)
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, razao_social, cpf_cnpj, email, telefone, whatsapp, endereco, analise_fatura, padrao_entrada, beneficiarias, telhado_secoes')
    .eq('id', clienteId)
    .maybeSingle()
  if (!cliente) return { erro: 'Cliente não encontrado' }

  // 2. Se o cliente ainda não tem os campos preenchidos (projetos antigos
  //    que rodaram antes da migration 094), busca da proposta mais recente
  //    como fallback.
  const { data: ultimaProposta } = await supabase
    .from('projetos')
    .select('analise_fatura, padrao_entrada, beneficiarias, tipo_projeto, uc_geradora, conta_contrato, endereco_instalacao, endereco_igual_titular, titular_cliente_id, titular_igual_cliente')
    .eq('cliente_id', clienteId)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const analiseFatura = (cliente as any).analise_fatura || ultimaProposta?.analise_fatura || null
  const padraoEntrada = (cliente as any).padrao_entrada || ultimaProposta?.padrao_entrada || null
  const beneficiarias = (cliente as any).beneficiarias?.length > 0
    ? (cliente as any).beneficiarias
    : (ultimaProposta?.beneficiarias || [])

  // 3. Cria a nova proposta
  const { data: novoProjeto, error } = await supabase
    .from('projetos')
    .insert({
      consultor_id: user.id,
      cliente_id: cliente.id,
      titular_cliente_id: ultimaProposta?.titular_cliente_id || cliente.id,
      titular_igual_cliente: ultimaProposta?.titular_igual_cliente ?? true,
      endereco_igual_titular: ultimaProposta?.endereco_igual_titular ?? true,
      endereco_instalacao: ultimaProposta?.endereco_instalacao || null,
      // Snapshot cliente (denormalização — mantém compat)
      cliente_razao_social: cliente.razao_social,
      cliente_cpf_cnpj: cliente.cpf_cnpj,
      cliente_email: cliente.email,
      cliente_telefone: cliente.telefone,
      // Dados cadastrais herdados do tronco
      analise_fatura: analiseFatura,
      padrao_entrada: padraoEntrada,
      beneficiarias: beneficiarias,
      tipo_projeto: ultimaProposta?.tipo_projeto || null,
      uc_geradora: ultimaProposta?.uc_geradora || null,
      conta_contrato: ultimaProposta?.conta_contrato || null,
      status: 'dimensionado',   // pula fatura/telhado/padrão — vai direto pra kit
    })
    .select('id')
    .single()

  if (error || !novoProjeto) {
    return { erro: 'Erro ao criar nova proposta: ' + (error?.message || '') }
  }

  // 4. Copia seções de telhado da última proposta (tabela separada)
  const telhadoSecoesCli = Array.isArray((cliente as any).telhado_secoes)
    ? (cliente as any).telhado_secoes
    : []
  let secoesPraCopiar: any[] = telhadoSecoesCli
  if (secoesPraCopiar.length === 0 && ultimaProposta) {
    // Fallback: pega da última proposta
    const { data: sec } = await supabase
      .from('projetos_telhado_secoes')
      .select('*')
      .eq('projeto_id', (ultimaProposta as any).id || '')
    secoesPraCopiar = sec || []
  }
  if (secoesPraCopiar.length > 0) {
    const linhas = secoesPraCopiar.map((s: any) => ({
      ...s,
      id: undefined,               // deixa o banco gerar
      projeto_id: novoProjeto.id,
      created_at: undefined,
      updated_at: undefined,
    }))
    await supabase.from('projetos_telhado_secoes').insert(linhas)
  }

  revalidatePath('/projetos')
  revalidatePath(`/crm/clientes/${clienteId}`)
  redirect(`/projetos/${novoProjeto.id}/kit`)
}

// ═══════════════════════════════════════════════════════════════════════
// Soft-delete de proposta (Kalebe 2026-08-29)
// Marca excluida_em = now(). A proposta some das listas mas fica no
// banco pra auditoria. Reverter é só limpar excluida_em manual.
// ═══════════════════════════════════════════════════════════════════════
export async function excluirPropostaAction(
  projetoId: string,
  motivo: 'manual' | 'auto_aceita' = 'manual',
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (!projetoId) return { erro: 'projeto_id obrigatório' }

  const { data: proj } = await supabase
    .from('projetos').select('id, cliente_id, excluida_em').eq('id', projetoId).maybeSingle()
  if (!proj) return { erro: 'Projeto não encontrado' }
  if ((proj as any).excluida_em) return { erro: 'Proposta já está excluída' }

  const { error } = await supabase
    .from('projetos')
    .update({
      excluida_em: new Date().toISOString(),
      excluida_motivo: motivo,
      excluida_por: user.id,
    })
    .eq('id', projetoId)
  if (error) return { erro: 'Erro ao excluir: ' + error.message }

  revalidatePath('/projetos')
  if ((proj as any).cliente_id) revalidatePath(`/crm/clientes/${(proj as any).cliente_id}`)
  return { sucesso: true }
}

/**
 * Marca as outras propostas ATIVAS do mesmo cliente como excluídas
 * quando uma é aceita. Kalebe 2026-08-29.
 * Ignora propostas que já estão em pós-venda (vendido/homologação/etc)
 * — só apaga as que ainda estavam em prospecção.
 */
export async function excluirOutrasPropostasDoClienteAction(
  projetoAceitoId: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { data: aceito } = await supabase
    .from('projetos').select('cliente_id, codigo').eq('id', projetoAceitoId).maybeSingle()
  if (!aceito?.cliente_id) return { sucesso: true, excluidas: 0 }

  // Status que representam "proposta em andamento" (não fechada). Só essas
  // podem ser excluídas automaticamente. Vendido/aceito/homologação/etc
  // ficam intocáveis pra proteger histórico.
  const STATUS_EM_ANDAMENTO = [
    'rascunho', 'fatura_analisada', 'telhado', 'dimensionado',
    'kit_selecionado', 'lista_ca', 'orcamento', 'proposta_enviada',
    'em_negociacao',
  ]

  const { data: outras, error: errBusca } = await supabase
    .from('projetos')
    .select('id, codigo')
    .eq('cliente_id', aceito.cliente_id)
    .neq('id', projetoAceitoId)
    .is('excluida_em', null)
    .in('status', STATUS_EM_ANDAMENTO)
  if (errBusca) return { erro: 'Erro ao buscar outras: ' + errBusca.message }

  const ids = (outras || []).map(o => o.id)
  if (ids.length === 0) return { sucesso: true, excluidas: 0 }

  const motivo = `auto_aceita: ${(aceito as any).codigo} vendida`
  await supabase
    .from('projetos')
    .update({
      excluida_em: new Date().toISOString(),
      excluida_motivo: motivo,
      excluida_por: user.id,
    })
    .in('id', ids)

  revalidatePath('/projetos')
  revalidatePath(`/crm/clientes/${aceito.cliente_id}`)
  return { sucesso: true, excluidas: ids.length }
}
