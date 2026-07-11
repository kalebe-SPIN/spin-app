'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarClienteAction, atualizarClienteAction, type ClienteFormData } from '@/app/crm/clientes/actions'

type Props = {
  clienteExistente?: any
}

const ORIGENS = [
  'Indicação',
  'Site',
  'Instagram',
  'Facebook',
  'Google Ads',
  'WhatsApp',
  'Feira/Evento',
  'Visita cliente',
  'Prospecção fria',
  'Outros',
]

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function ClienteForm({ clienteExistente }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const enderecoExistente = clienteExistente?.endereco || {}

  const [form, setForm] = useState<ClienteFormData>({
    tipo: clienteExistente?.tipo || 'pj',
    razao_social: clienteExistente?.razao_social || '',
    nome_fantasia: clienteExistente?.nome_fantasia || '',
    cpf_cnpj: clienteExistente?.cpf_cnpj || '',
    email: clienteExistente?.email || '',
    telefone: clienteExistente?.telefone || '',
    whatsapp: clienteExistente?.whatsapp || '',
    origem: clienteExistente?.origem || '',
    observacoes: clienteExistente?.observacoes || '',
    endereco: {
      cep: enderecoExistente.cep || '',
      rua: enderecoExistente.rua || '',
      numero: enderecoExistente.numero || '',
      complemento: enderecoExistente.complemento || '',
      bairro: enderecoExistente.bairro || '',
      cidade: enderecoExistente.cidade || '',
      uf: enderecoExistente.uf || 'SC',
    },
  })

  function set<K extends keyof ClienteFormData>(campo: K, valor: ClienteFormData[K]) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function setEnd(campo: string, valor: string) {
    setForm((f) => ({ ...f, endereco: { ...f.endereco!, [campo]: valor } }))
  }

  async function buscarCep() {
    const cep = form.endereco?.cep?.replace(/\D/g, '')
    if (!cep || cep.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (data.erro) return
      setForm((f) => ({
        ...f,
        endereco: {
          ...f.endereco!,
          rua: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || 'SC',
        },
      }))
    } catch {}
  }

  function salvar() {
    setErro(null)
    if (!form.razao_social.trim()) {
      setErro(form.tipo === 'pj' ? 'Razão social obrigatória' : 'Nome completo obrigatório')
      return
    }

    startTransition(async () => {
      const resultado = clienteExistente
        ? await atualizarClienteAction(clienteExistente.id, form)
        : await criarClienteAction(form)

      if (resultado && 'erro' in resultado && resultado.erro) {
        setErro(resultado.erro)
      } else if (clienteExistente) {
        router.refresh()
      }
    })
  }

  const ehPF = form.tipo === 'pf'
  const labelRazao = ehPF ? 'Nome completo' : 'Razão social'
  const labelDoc = ehPF ? 'CPF' : 'CNPJ'

  return (
    <div className="space-y-6">
      {/* Tipo */}
      <Section title="Identificação">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => set('tipo', 'pj')}
            className={`p-3 rounded-lg border text-sm font-bold transition ${
              form.tipo === 'pj'
                ? 'bg-sol/10 border-sol/40 text-sol'
                : 'bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/5'
            }`}
          >
            🏢 Empresa (PJ)
          </button>
          <button
            type="button"
            onClick={() => set('tipo', 'pf')}
            className={`p-3 rounded-lg border text-sm font-bold transition ${
              form.tipo === 'pf'
                ? 'bg-sol/10 border-sol/40 text-sol'
                : 'bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/5'
            }`}
          >
            👤 Pessoa Física (PF)
          </button>
        </div>
        <Input label={labelRazao + ' *'} value={form.razao_social} onChange={(v) => set('razao_social', v)} />
        {!ehPF && (
          <Input label="Nome fantasia" value={form.nome_fantasia || ''} onChange={(v) => set('nome_fantasia', v)} />
        )}
        <Input label={labelDoc} value={form.cpf_cnpj || ''} onChange={(v) => set('cpf_cnpj', v)} placeholder={ehPF ? '000.000.000-00' : '00.000.000/0000-00'} />
      </Section>

      {/* Contato */}
      <Section title="Contato">
        <Input label="Email" type="email" value={form.email || ''} onChange={(v) => set('email', v)} />
        <Input label="Telefone" value={form.telefone || ''} onChange={(v) => set('telefone', v)} placeholder="(47) 3333-4444" />
        <Input label="WhatsApp" value={form.whatsapp || ''} onChange={(v) => set('whatsapp', v)} placeholder="(47) 99999-8888" />
      </Section>

      {/* Endereço */}
      <Section title="Endereço">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <Input
              label="CEP"
              value={form.endereco?.cep || ''}
              onChange={(v) => setEnd('cep', v)}
              onBlur={buscarCep}
              placeholder="00000-000"
            />
          </div>
          <div className="col-span-2 flex items-end">
            <button
              type="button"
              onClick={buscarCep}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white/70 hover:bg-white/10"
            >
              🔍 Buscar endereço pelo CEP
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="col-span-2">
            <Input label="Rua" value={form.endereco?.rua || ''} onChange={(v) => setEnd('rua', v)} />
          </div>
          <Input label="Número" value={form.endereco?.numero || ''} onChange={(v) => setEnd('numero', v)} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Complemento" value={form.endereco?.complemento || ''} onChange={(v) => setEnd('complemento', v)} />
          <Input label="Bairro" value={form.endereco?.bairro || ''} onChange={(v) => setEnd('bairro', v)} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="col-span-2">
            <Input label="Cidade" value={form.endereco?.cidade || ''} onChange={(v) => setEnd('cidade', v)} />
          </div>
          <div>
            <label className="text-[10px] uppercase text-white/50 font-bold block mb-1">UF</label>
            <select
              value={form.endereco?.uf || 'SC'}
              onChange={(e) => setEnd('uf', e.target.value)}
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white"
            >
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {/* Origem + Obs */}
      <Section title="Origem e observações">
        <label className="text-[10px] uppercase text-white/50 font-bold block mb-1">Origem do cliente</label>
        <select
          value={form.origem || ''}
          onChange={(e) => set('origem', e.target.value)}
          className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white mb-3"
        >
          <option value="">— Não informado —</option>
          {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="text-[10px] uppercase text-white/50 font-bold block mb-1">Observações internas</label>
        <textarea
          value={form.observacoes || ''}
          onChange={(e) => set('observacoes', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30"
          placeholder="Notas gerais sobre esse cliente..."
        />
      </Section>

      {erro && (
        <div className="p-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          ⚠️ {erro}
        </div>
      )}

      <button
        onClick={salvar}
        disabled={isPending}
        className="w-full px-4 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-50 transition"
      >
        {isPending ? '💾 Salvando...' : clienteExistente ? '💾 Salvar alterações' : '➕ Criar cliente'}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <h3 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Input({
  label, value, onChange, onBlur, type = 'text', placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/50 font-bold block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:border-sol/40 focus:outline-none"
      />
    </div>
  )
}
