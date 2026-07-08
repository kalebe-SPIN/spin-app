'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { atualizarProjetoAction } from '@/app/projetos/[id]/editar/actions'
import {
  maskCpfCnpj,
  maskTelefone,
  isValidCpfCnpj,
  isValidEmail,
  isValidTelefone,
  unmask,
} from '@/lib/utils/masks'

type ProjetoExistente = {
  id: string
  cliente_razao_social: string
  cliente_cpf_cnpj: string | null
  cliente_email: string | null
  cliente_telefone: string
  observacoes_consultor: string | null
}

/**
 * Formulário SIMPLIFICADO do cliente.
 *
 * Passo 1 do fluxo — só dados de contato + observações.
 * Endereço, UC, beneficiárias, tipo de projeto e fatura são coletados
 * nos passos seguintes (2 Fatura, 3 Telhado, 6 Kit).
 */
export function NovoProjetoForm({
  consultorId,
  projetoExistente,
}: {
  consultorId: string
  projetoExistente?: ProjetoExistente
}) {
  const router = useRouter()
  const isEdit = !!projetoExistente
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    cliente_razao_social: projetoExistente?.cliente_razao_social || '',
    cliente_cpf_cnpj: projetoExistente?.cliente_cpf_cnpj
      ? maskCpfCnpj(projetoExistente.cliente_cpf_cnpj)
      : '',
    cliente_sem_documento: projetoExistente ? !projetoExistente.cliente_cpf_cnpj : false,
    cliente_email: projetoExistente?.cliente_email || '',
    cliente_telefone: projetoExistente?.cliente_telefone
      ? maskTelefone(projetoExistente.cliente_telefone)
      : '',
    observacoes: projetoExistente?.observacoes_consultor || '',
  })

  function update<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validações mínimas
    if (!form.cliente_razao_social.trim()) {
      setError('Nome / razão social é obrigatório.')
      return
    }
    if (!form.cliente_sem_documento && !isValidCpfCnpj(form.cliente_cpf_cnpj)) {
      setError('CPF/CNPJ inválido. Se o cliente ainda não tem, marque "Sem documento".')
      return
    }
    if (!isValidTelefone(form.cliente_telefone)) {
      setError('WhatsApp inválido. Formato: (48) 99999-9999')
      return
    }
    if (form.cliente_email && !isValidEmail(form.cliente_email)) {
      setError('E-mail inválido.')
      return
    }

    setLoading(true)

    const payload = {
      cliente_razao_social: form.cliente_razao_social.trim(),
      cliente_cpf_cnpj: form.cliente_sem_documento ? null : unmask(form.cliente_cpf_cnpj),
      cliente_email: form.cliente_email.trim() || null,
      cliente_telefone: unmask(form.cliente_telefone),
      observacoes_consultor: form.observacoes.trim() || null,
    }

    if (isEdit && projetoExistente) {
      const result = await atualizarProjetoAction(projetoExistente.id, payload)
      if (result && 'sucesso' in result && !result.sucesso) {
        setError(result.erro || 'Erro ao atualizar projeto.')
        setLoading(false)
      }
      // Server Action faz redirect
      return
    }

    // Modo CRIAR
    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('projetos')
      .insert({
        ...payload,
        consultor_id: consultorId,
        status: 'rascunho',
      })
      .select('id')
      .single()

    if (insertError || !data) {
      setError(insertError?.message || 'Erro ao criar projeto.')
      setLoading(false)
      return
    }

    router.push(`/projetos/${data.id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-lg p-4 text-sm text-white/80">
        <p><strong className="text-white">Passo 1 de 8:</strong> apenas dados de contato do cliente.</p>
        <p className="text-xs text-white/50 mt-1">
          Endereço, UC, fatura e tipo de sistema serão preenchidos nos próximos passos.
        </p>
      </div>

      {/* Nome / Razão social */}
      <label className="block">
        <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
          Nome completo ou Razão social <span className="text-coral">*</span>
        </span>
        <input
          type="text"
          value={form.cliente_razao_social}
          onChange={e => update('cliente_razao_social', e.target.value)}
          placeholder="Ex: João da Silva OU Padaria Ilhota Ltda"
          className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30"
          required
        />
      </label>

      {/* CPF/CNPJ */}
      <div>
        <label className="block">
          <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
            CPF ou CNPJ {!form.cliente_sem_documento && <span className="text-coral">*</span>}
          </span>
          <input
            type="text"
            value={form.cliente_cpf_cnpj}
            onChange={e => update('cliente_cpf_cnpj', maskCpfCnpj(e.target.value))}
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            disabled={form.cliente_sem_documento}
            className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 disabled:opacity-40"
          />
        </label>
        <label className="flex items-center gap-2 mt-2 text-xs text-white/60 cursor-pointer">
          <input
            type="checkbox"
            checked={form.cliente_sem_documento}
            onChange={e => update('cliente_sem_documento', e.target.checked)}
            className="rounded"
          />
          Cliente ainda não forneceu documento (pode preencher depois)
        </label>
      </div>

      {/* WhatsApp + Email lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
            WhatsApp <span className="text-coral">*</span>
          </span>
          <input
            type="tel"
            value={form.cliente_telefone}
            onChange={e => update('cliente_telefone', maskTelefone(e.target.value))}
            placeholder="(48) 99999-9999"
            className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
            E-mail (opcional)
          </span>
          <input
            type="email"
            value={form.cliente_email}
            onChange={e => update('cliente_email', e.target.value)}
            placeholder="cliente@email.com"
            className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30"
          />
        </label>
      </div>

      {/* Observações do consultor */}
      <label className="block">
        <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
          Observações do consultor (opcional)
        </span>
        <textarea
          value={form.observacoes}
          onChange={e => update('observacoes', e.target.value)}
          rows={3}
          placeholder="Anote qualquer contexto útil: 'cliente indicado por João', 'quer instalar até dezembro', etc"
          className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 resize-y"
        />
      </label>

      {/* Erro */}
      {error && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-4 text-sm text-coral">
          ❌ {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
        >
          {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar projeto → Passo 2 Fatura'}
        </button>
      </div>
    </form>
  )
}
