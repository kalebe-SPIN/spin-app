'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarConfigEmpresaAction, type EmpresaInput } from '@/app/admin/empresa/actions'

type Props = {
  configSalva: Partial<EmpresaInput> | null
}

export function EmpresaForm({ configSalva }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const [form, setForm] = useState<EmpresaInput>({
    razao_social: configSalva?.razao_social || 'Spin Solar Energias Renováveis Ltda',
    cnpj: configSalva?.cnpj || '',
    endereco: configSalva?.endereco || '',
    telefone: configSalva?.telefone || '',
    email: configSalva?.email || '',
    site: configSalva?.site || '',
    logo_url: configSalva?.logo_url || '',
    rt_nome: configSalva?.rt_nome || '',
    rt_titulo: configSalva?.rt_titulo || 'Eletrotécnico',
    rt_crea: configSalva?.rt_crea || '',
    rt_art_padrao: configSalva?.rt_art_padrao || '',
    rt_telefone: configSalva?.rt_telefone || '',
    rt_email: configSalva?.rt_email || '',
    rt_assinatura_url: configSalva?.rt_assinatura_url || '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(false)

    startTransition(async () => {
      const result = await salvarConfigEmpresaAction(form)
      if (result.sucesso) {
        setSucesso(true)
        router.refresh()
      } else {
        setErro(result.erro || 'Erro ao salvar')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Bloco Empresa */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-sol">🏢</span> Dados da empresa
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Razão social" value={form.razao_social} onChange={v => setForm({ ...form, razao_social: v })} required />
          <Field label="CNPJ" value={form.cnpj || ''} onChange={v => setForm({ ...form, cnpj: v })} placeholder="00.000.000/0001-00" />
          <Field label="Endereço" value={form.endereco || ''} onChange={v => setForm({ ...form, endereco: v })} className="md:col-span-2" />
          <Field label="Telefone" value={form.telefone || ''} onChange={v => setForm({ ...form, telefone: v })} />
          <Field label="E-mail" value={form.email || ''} onChange={v => setForm({ ...form, email: v })} />
          <Field label="Site" value={form.site || ''} onChange={v => setForm({ ...form, site: v })} className="md:col-span-2" />
          <Field
            label="URL do logo (selo Spin)"
            value={form.logo_url || ''}
            onChange={v => setForm({ ...form, logo_url: v })}
            placeholder="https://... (PNG transparente, min 300px)"
            className="md:col-span-2"
          />
        </div>
      </section>

      {/* Bloco Responsável técnico */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-verde">👷</span> Responsável técnico (aparece no selo do diagrama)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome completo" value={form.rt_nome} onChange={v => setForm({ ...form, rt_nome: v })} required />
          <Field
            label="Título profissional"
            value={form.rt_titulo}
            onChange={v => setForm({ ...form, rt_titulo: v })}
            placeholder="Eletrotécnico / Engenheiro Eletricista"
            required
          />
          <Field label="Registro CREA" value={form.rt_crea || ''} onChange={v => setForm({ ...form, rt_crea: v })} placeholder="SC-123456" />
          <Field label="Nº ART padrão (opcional)" value={form.rt_art_padrao || ''} onChange={v => setForm({ ...form, rt_art_padrao: v })} />
          <Field label="Telefone" value={form.rt_telefone || ''} onChange={v => setForm({ ...form, rt_telefone: v })} />
          <Field label="E-mail" value={form.rt_email || ''} onChange={v => setForm({ ...form, rt_email: v })} />
          <Field
            label="URL da assinatura digital"
            value={form.rt_assinatura_url || ''}
            onChange={v => setForm({ ...form, rt_assinatura_url: v })}
            placeholder="https://... (PNG assinatura escaneada)"
            className="md:col-span-2"
          />
        </div>
      </section>

      {/* Feedback */}
      {erro && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-4 text-sm text-coral">
          ❌ {erro}
        </div>
      )}
      {sucesso && (
        <div className="bg-verde/10 border border-verde/30 rounded-lg p-4 text-sm text-verde">
          ✅ Configurações salvas. Serão usadas em todos diagramas gerados a partir de agora.
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-50"
        >
          {isPending ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
        {label} {required && <span className="text-coral">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sol/50 placeholder:text-white/30"
      />
    </label>
  )
}
