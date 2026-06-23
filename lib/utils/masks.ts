/**
 * Máscaras + validações de campos brasileiros.
 * Use estas funções como handlers de onChange.
 */

// ===== CPF / CNPJ =====

/**
 * Aplica máscara CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00)
 * conforme o número de dígitos digitados. Auto-detecta.
 */
export function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)

  if (digits.length <= 11) {
    // CPF
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  // CNPJ
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** Tipo de documento detectado pelos dígitos */
export function tipoDocumento(value: string): 'cpf' | 'cnpj' | 'invalido' {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) return 'cpf'
  if (digits.length === 14) return 'cnpj'
  return 'invalido'
}

/** Validação algoritmica de CPF (dígitos verificadores) */
export function isValidCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return false
  if (/^(\d)\1+$/.test(d)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i)
  let rem = (sum * 10) % 11
  if (rem === 10 || rem === 11) rem = 0
  if (rem !== parseInt(d[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i)
  rem = (sum * 10) % 11
  if (rem === 10 || rem === 11) rem = 0
  return rem === parseInt(d[10])
}

/** Validação algoritmica de CNPJ (dígitos verificadores) */
export function isValidCnpj(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return false
  if (/^(\d)\1+$/.test(d)) return false

  // Primeiro dígito
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(d[i]) * weights1[i]
  let rem = sum % 11
  const dv1 = rem < 2 ? 0 : 11 - rem
  if (dv1 !== parseInt(d[12])) return false

  // Segundo dígito
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  sum = 0
  for (let i = 0; i < 13; i++) sum += parseInt(d[i]) * weights2[i]
  rem = sum % 11
  const dv2 = rem < 2 ? 0 : 11 - rem
  return dv2 === parseInt(d[13])
}

/** Validação CPF OU CNPJ (auto-detecta) */
export function isValidCpfCnpj(value: string): boolean {
  const d = value.replace(/\D/g, '')
  if (d.length === 11) return isValidCpf(d)
  if (d.length === 14) return isValidCnpj(d)
  return false
}

// ===== TELEFONE =====

/**
 * Máscara de telefone brasileiro.
 * Aceita:
 *   - Celular  : (48) 99999-9999
 *   - Fixo     : (48) 3333-4444
 *   - Com DDI  : +55 (48) 99999-9999
 */
export function maskTelefone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13)

  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    // (XX) XXXX-XXXX (fixo)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11) {
    // (XX) 9XXXX-XXXX (celular)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 12) {
    // +55 (XX) XXXX-XXXX
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`
  }
  // +55 (XX) 9XXXX-XXXX
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
}

export function isValidTelefone(value: string): boolean {
  const d = value.replace(/\D/g, '')
  return d.length >= 10 && d.length <= 13
}

// ===== CEP =====

export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function isValidCep(value: string): boolean {
  return value.replace(/\D/g, '').length === 8
}

// ===== EMAIL =====

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// ===== UC CELESC (apenas dígitos) =====

export function maskUC(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12)
}

// ===== Limpa máscara — devolve só dígitos =====

export function unmask(value: string): string {
  return value.replace(/\D/g, '')
}
