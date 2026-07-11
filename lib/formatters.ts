/**
 * Formatadores de máscara para inputs brasileiros.
 * Aplicar no onChange de inputs: onChange={v => set(campo, formatarCpfCnpj(v))}
 */

export function formatarCpfCnpj(valor: string): string {
  const n = valor.replace(/\D/g, '').slice(0, 14)
  if (n.length <= 11) {
    // CPF: 000.000.000-00
    return n
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  // CNPJ: 00.000.000/0000-00
  return n
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function formatarCpf(valor: string): string {
  const n = valor.replace(/\D/g, '').slice(0, 11)
  return n
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatarCnpj(valor: string): string {
  const n = valor.replace(/\D/g, '').slice(0, 14)
  return n
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function formatarTelefone(valor: string): string {
  const n = valor.replace(/\D/g, '').slice(0, 11)
  if (n.length === 0) return ''
  if (n.length <= 2) return `(${n}`
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`
  if (n.length <= 10) {
    // Telefone fixo: (00) 0000-0000
    return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  }
  // Celular: (00) 00000-0000
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
}

export function formatarCep(valor: string): string {
  const n = valor.replace(/\D/g, '').slice(0, 8)
  if (n.length <= 5) return n
  return `${n.slice(0, 5)}-${n.slice(5)}`
}

export function formatarMoedaBRL(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return 'R$ 0,00'
  const n = typeof valor === 'string' ? parseFloat(valor) : valor
  if (isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Recebe string com máscara ("R$ 1.234,56"), retorna número */
export function desformatarMoeda(valor: string): number {
  const limpo = valor
    .replace(/[R$\s.]/g, '')
    .replace(',', '.')
  return parseFloat(limpo) || 0
}

/** Apenas dígitos — util pra salvar no banco sem máscara */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Valida CPF (algoritmo dos dígitos verificadores) */
export function validarCpf(cpf: string): boolean {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11) return false
  if (/^(\d)\1{10}$/.test(n)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(n[i]) * (10 - i)
  let dv = 11 - (soma % 11)
  if (dv >= 10) dv = 0
  if (dv !== parseInt(n[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(n[i]) * (11 - i)
  dv = 11 - (soma % 11)
  if (dv >= 10) dv = 0
  return dv === parseInt(n[10])
}

/** Valida CNPJ (algoritmo dos dígitos verificadores) */
export function validarCnpj(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14) return false
  if (/^(\d)\1{13}$/.test(n)) return false

  const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2]
  const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2]

  let soma = 0
  for (let i = 0; i < 12; i++) soma += parseInt(n[i]) * pesos1[i]
  let dv = soma % 11 < 2 ? 0 : 11 - (soma % 11)
  if (dv !== parseInt(n[12])) return false

  soma = 0
  for (let i = 0; i < 13; i++) soma += parseInt(n[i]) * pesos2[i]
  dv = soma % 11 < 2 ? 0 : 11 - (soma % 11)
  return dv === parseInt(n[13])
}
