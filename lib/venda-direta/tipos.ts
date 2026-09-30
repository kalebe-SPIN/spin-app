import { validarCpf, validarCnpj } from '@/lib/formatters'
import type { CupomAplicado, ItemVendaDireta } from '@/lib/precificacao/venda-direta'

/**
 * Venda direta de equipamentos — dados guardados em projeto_itens.dados
 * (tipo 'venda_equipamentos'). Kalebe 2026-09-29: pra emitir a proposta
 * bastam os dados de NF e de entrega (frete).
 */

export type EnderecoVD = {
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export type DadosNF = {
  nome: string          // nome completo ou razão social
  documento: string     // CPF ou CNPJ
  ie: string            // inscrição estadual (PJ) — vazio ou "ISENTO"
  email: string
  telefone: string
  endereco: EnderecoVD
}

export type DadosEntrega = {
  mesmo_endereco: boolean
  endereco: EnderecoVD
  recebedor: string     // quem recebe a mercadoria (opcional)
}

export type DadosVendaDireta = { nf: DadosNF; entrega: DadosEntrega }

export type ItemDadosVendaDireta = DadosVendaDireta & {
  itens: ItemVendaDireta[]
  frete: number
  cupom?: CupomAplicado | null      // Kalebe 2026-09-30: só o admin aplica
  calculo?: any
  url_pdf?: string | null
}

export const ENDERECO_VAZIO: EnderecoVD = {
  cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SC',
}

export function dadosVazios(): DadosVendaDireta {
  return {
    nf: { nome: '', documento: '', ie: '', email: '', telefone: '', endereco: { ...ENDERECO_VAZIO } },
    entrega: { mesmo_endereco: true, endereco: { ...ENDERECO_VAZIO }, recebedor: '' },
  }
}

const dig = (s: string) => String(s || '').replace(/\D/g, '')

function erroEndereco(e: EnderecoVD, rotulo: string): string | null {
  if (dig(e.cep).length !== 8) return `${rotulo}: CEP com 8 dígitos`
  if (!e.rua.trim()) return `${rotulo}: rua`
  if (!e.numero.trim()) return `${rotulo}: número (use "S/N" se não tiver)`
  if (!e.bairro.trim()) return `${rotulo}: bairro`
  if (!e.cidade.trim()) return `${rotulo}: cidade`
  if (!/^[A-Za-z]{2}$/.test(e.uf.trim())) return `${rotulo}: UF com 2 letras`
  return null
}

/** Retorna o primeiro campo faltando/errado, ou null se está tudo certo. */
export function validarDadosVendaDireta(d: DadosVendaDireta): string | null {
  const doc = dig(d.nf.documento)
  if (!d.nf.nome.trim()) return 'Informe o nome completo ou a razão social'
  if (doc.length === 11 ? !validarCpf(doc) : doc.length === 14 ? !validarCnpj(doc) : true) {
    return 'CPF ou CNPJ inválido'
  }
  if (!/^\S+@\S+\.\S+$/.test(d.nf.email.trim())) return 'E-mail inválido (a NF-e vai pra ele)'
  if (dig(d.nf.telefone).length < 10) return 'Telefone com DDD'
  const eNf = erroEndereco(d.nf.endereco, 'Endereço da NF')
  if (eNf) return eNf
  if (!d.entrega.mesmo_endereco) {
    const eEnt = erroEndereco(d.entrega.endereco, 'Endereço de entrega')
    if (eEnt) return eEnt
  }
  return null
}

export function enderecoEntrega(d: DadosVendaDireta): EnderecoVD {
  return d.entrega.mesmo_endereco ? d.nf.endereco : d.entrega.endereco
}

export function tipoPessoa(documento: string): 'pf' | 'pj' {
  return dig(documento).length === 14 ? 'pj' : 'pf'
}
