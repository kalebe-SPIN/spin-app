'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Formulário de criação do projeto (Passo 1 — Cliente).
 *
 * Coleta dados básicos do cliente e UC.
 * Cria registro em `projetos` com status='rascunho' e redireciona pra /projetos/[id].
 */
export function NovoProjetoForm({ consultorId }: { consultorId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    cliente_razao_social: '',
    cliente_cpf_cnpj: '',
    cliente_email: '',
    cliente_telefone: '',
    cliente_logradouro: '',
    cliente_bairro: '',
    cliente_cidade: '',
    cliente_uf: 'SC',
    cliente_cep: '',
    uc_geradora: '',
    ucs_beneficiarias: '',
    tipo_projeto: 'ongrid',
    motivacao_cliente: 'reduzir_conta',
    observacoes: '',
  })

  function update<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    const beneficiarias = form.ucs_beneficiarias
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)

    const { data, error } = await supabase
      .from('projetos')
      .insert({
        cliente_razao_social: form.cliente_razao_social.trim(),
        cliente_cpf_cnpj: form.cliente_cpf_cnpj.trim(),
        cliente_email: form.cliente_email.trim() || null,
        cliente_telefone: form.cliente_telefone.trim(),
        cliente_endereco: {
          logradouro: form.cliente_logradouro,
          bairro: form.cliente_bairro,
          cidade: form.cliente_cidade,
          uf: form.cliente_uf,
          cep: form.cliente_cep,
        },
        uc_geradora: form.uc_geradora.trim(),
        ucs_beneficiarias: beneficiarias,
        tipo_projeto: form.tipo_projeto,
        motivacao_cliente: form.motivacao_cliente,
        observacoes_consultor: form.observacoes.trim() || null,
        consultor_id: consultorId,
        status: 'rascunho',
      })
      .select('id')
      .single()

    setLoading(false)

    if (error) {
      setError(`Erro ao criar projeto: ${error.message}`)
      return
    }

    router.push(`/projetos/${data.id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Bloco: identificação cliente */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Identificação do cliente
        </legend>

        <Field label="Razão social / Nome completo *" required>
          <input
            type="text"
            required
            value={form.cliente_razao_social}
            onChange={(e) => update('cliente_razao_social', e.target.value)}
            className="input-spin"
            placeholder="João Silva ou Empresa LTDA"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="CPF / CNPJ *" required>
            <input
              type="text"
              required
              value={form.cliente_cpf_cnpj}
              onChange={(e) => update('cliente_cpf_cnpj', e.target.value)}
              className="input-spin"
              placeholder="000.000.000-00"
            />
          </Field>

          <Field label="WhatsApp *" required>
            <input
              type="tel"
              required
              value={form.cliente_telefone}
              onChange={(e) => update('cliente_telefone', e.target.value)}
              className="input-spin"
              placeholder="+55 48 99999-9999"
            />
          </Field>
        </div>

        <Field label="Email">
          <input
            type="email"
            value={form.cliente_email}
            onChange={(e) => update('cliente_email', e.target.value)}
            className="input-spin"
            placeholder="cliente@email.com"
          />
        </Field>
      </fieldset>

      {/* Bloco: endereço */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Endereço da instalação
        </legend>

        <Field label="Logradouro">
          <input
            type="text"
            value={form.cliente_logradouro}
            onChange={(e) => update('cliente_logradouro', e.target.value)}
            className="input-spin"
            placeholder="Rua, número, complemento"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Bairro">
            <input
              type="text"
              value={form.cliente_bairro}
              onChange={(e) => update('cliente_bairro', e.target.value)}
              className="input-spin"
            />
          </Field>

          <Field label="Cidade">
            <input
              type="text"
              value={form.cliente_cidade}
              onChange={(e) => update('cliente_cidade', e.target.value)}
              className="input-spin"
            />
          </Field>

          <Field label="UF">
            <select
              value={form.cliente_uf}
              onChange={(e) => update('cliente_uf', e.target.value)}
              className="input-spin"
            >
              {UFS.map((uf) => (
                <option key={uf} value={uf} className="bg-noite">{uf}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="CEP">
          <input
            type="text"
            value={form.cliente_cep}
            onChange={(e) => update('cliente_cep', e.target.value)}
            className="input-spin"
            placeholder="00000-000"
          />
        </Field>
      </fieldset>

      {/* Bloco: UC + Tipo */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Unidade Consumidora (UC) CELESC
        </legend>

        <Field label="UC geradora *" required>
          <input
            type="text"
            required
            value={form.uc_geradora}
            onChange={(e) => update('uc_geradora', e.target.value)}
            className="input-spin"
            placeholder="Número da UC principal (na fatura)"
          />
        </Field>

        <Field label="UCs beneficiárias (separe por vírgula)">
          <input
            type="text"
            value={form.ucs_beneficiarias}
            onChange={(e) => update('ucs_beneficiarias', e.target.value)}
            className="input-spin"
            placeholder="UC1, UC2, UC3"
          />
        </Field>
      </fieldset>

      {/* Bloco: tipo de projeto */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Tipo de projeto desejado
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TIPOS_PROJETO.map((t) => (
            <label key={t.value} className={`
              flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors
              ${form.tipo_projeto === t.value
                ? 'bg-sol/10 border-sol/40'
                : 'bg-white/[0.02] border-white/10 hover:border-white/30'
              }
            `}>
              <input
                type="radio"
                name="tipo_projeto"
                value={t.value}
                checked={form.tipo_projeto === t.value}
                onChange={(e) => update('tipo_projeto', e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="text-sm font-bold text-white">{t.label}</div>
                <div className="text-xs text-white/60 mt-0.5">{t.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <Field label="Motivação principal do cliente">
          <select
            value={form.motivacao_cliente}
            onChange={(e) => update('motivacao_cliente', e.target.value)}
            className="input-spin"
          >
            {MOTIVACOES.map((m) => (
              <option key={m.value} value={m.value} className="bg-noite">{m.label}</option>
            ))}
          </select>
        </Field>
      </fieldset>

      {/* Observações */}
      <fieldset className="pt-4 border-t border-white/10">
        <Field label="Observações livres (opcional)">
          <textarea
            value={form.observacoes}
            onChange={(e) => update('observacoes', e.target.value)}
            className="input-spin min-h-[80px]"
            placeholder="Qualquer informação relevante do cliente ou da visita..."
          />
        </Field>
      </fieldset>

      {/* Error */}
      {error && (
        <div className="p-4 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-6 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Criando...' : 'Criar projeto e continuar →'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5 block">
        {label} {required && <span className="text-coral">*</span>}
      </span>
      {children}
    </label>
  )
}

const TIPOS_PROJETO = [
  { value: 'ongrid', label: 'On-grid puro', desc: 'Gera e injeta excedente na rede. Sem bateria.' },
  { value: 'hibrido_bess', label: 'Híbrido com BESS', desc: 'Gera + bateria + interage com rede.' },
  { value: 'expansao_ongrid', label: 'Expansão on-grid', desc: 'Cliente já tem solar; vai aumentar potência.' },
  { value: 'expansao_hibrido', label: 'Expansão híbrida', desc: 'Expansão existente + adicionar BESS.' },
]

const MOTIVACOES = [
  { value: 'reduzir_conta', label: 'Reduzir conta de luz' },
  { value: 'sustentabilidade', label: 'Sustentabilidade / ESG' },
  { value: 'independencia', label: 'Independência energética (apagão)' },
  { value: 'investimento', label: 'Investimento / valorização imóvel' },
  { value: 'marketing', label: 'Marketing / imagem da empresa' },
  { value: 'licenciamento', label: 'Cumprir exigência ambiental' },
]

const UFS = ['SC', 'RS', 'PR', 'SP', 'RJ', 'MG', 'ES', 'BA', 'GO', 'DF', 'MT', 'MS', 'PA', 'AM', 'CE', 'PE', 'AL', 'PB', 'RN', 'PI', 'MA', 'SE', 'AC', 'RO', 'RR', 'AP', 'TO']
