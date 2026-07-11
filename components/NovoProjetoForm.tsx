'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { atualizarProjetoAction } from '@/app/projetos/[id]/editar/actions'
import { criarProjetoAction } from '@/app/projetos/actions'
import { SeletorCliente } from '@/components/SeletorCliente'
import {
  maskCpfCnpj,
  maskTelefone,
  isValidCpfCnpj,
  isValidEmail,
  isValidTelefone,
  unmask,
} from '@/lib/utils/masks'
import { formatarCep } from '@/lib/formatters'

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

type ProjetoExistente = {
  id: string
  cliente_id?: string | null
  cliente_razao_social: string
  cliente_cpf_cnpj: string | null
  cliente_email: string | null
  cliente_telefone: string
  observacoes_consultor: string | null
}

/**
 * Passo 1: escolhe cliente (existente ou novo) + observações.
 */
export function NovoProjetoForm({
  projetoExistente,
}: {
  consultorId?: string  // não usa mais mas mantém pra compat
  projetoExistente?: ProjetoExistente
}) {
  const router = useRouter()
  const isEdit = !!projetoExistente
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [modo, setModo] = useState<'existente' | 'novo'>(
    projetoExistente?.cliente_id ? 'existente' : 'novo',
  )
  const [clienteEscolhido, setClienteEscolhido] = useState<any>(null)

  const [formNovo, setFormNovo] = useState({
    tipo: 'pf' as 'pf' | 'pj',
    razao_social: projetoExistente?.cliente_razao_social || '',
    cpf_cnpj: projetoExistente?.cliente_cpf_cnpj
      ? maskCpfCnpj(projetoExistente.cliente_cpf_cnpj)
      : '',
    cliente_sem_documento: projetoExistente ? !projetoExistente.cliente_cpf_cnpj : false,
    email: projetoExistente?.cliente_email || '',
    telefone: projetoExistente?.cliente_telefone
      ? maskTelefone(projetoExistente.cliente_telefone)
      : '',
  })

  const [observacoes, setObservacoes] = useState(projetoExistente?.observacoes_consultor || '')

  // Titular do projeto (pode ser diferente do cliente)
  const [titularIgual, setTitularIgual] = useState(true)
  const [titularEscolhido, setTitularEscolhido] = useState<any>(null)
  const [novoTitular, setNovoTitular] = useState({
    tipo: 'pf' as 'pf' | 'pj',
    razao_social: '',
    cpf_cnpj: '',
  })
  const [modoTitular, setModoTitular] = useState<'existente' | 'novo'>('novo')

  // Endereço da instalação
  const [enderecoIgual, setEnderecoIgual] = useState(true)
  const [enderecoInst, setEnderecoInst] = useState({
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: 'SC',
  })

  async function buscarCepInstalacao() {
    const cep = enderecoInst.cep.replace(/\D/g, '')
    if (cep.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (data.erro) return
      setEnderecoInst((e) => ({
        ...e,
        rua: data.logradouro || '',
        bairro: data.bairro || '',
        cidade: data.localidade || '',
        uf: data.uf || 'SC',
      }))
    } catch {}
  }

  function updateNovo<K extends keyof typeof formNovo>(k: K, v: typeof formNovo[K]) {
    setFormNovo((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (isEdit && projetoExistente) {
      // Edit — mantém fluxo antigo (só campos denormalizados)
      if (!formNovo.razao_social.trim()) {
        setErro('Nome/razão social é obrigatório')
        return
      }
      if (!formNovo.cliente_sem_documento && !isValidCpfCnpj(formNovo.cpf_cnpj)) {
        setErro('CPF/CNPJ inválido')
        return
      }
      if (!isValidTelefone(formNovo.telefone)) {
        setErro('WhatsApp inválido')
        return
      }

      startTransition(async () => {
        const result = await atualizarProjetoAction(projetoExistente.id, {
          cliente_razao_social: formNovo.razao_social.trim(),
          cliente_cpf_cnpj: formNovo.cliente_sem_documento ? null : unmask(formNovo.cpf_cnpj),
          cliente_email: formNovo.email.trim() || null,
          cliente_telefone: unmask(formNovo.telefone),
          observacoes_consultor: observacoes.trim() || null,
        })
        if (result && 'sucesso' in result && !result.sucesso) {
          setErro((result as any).erro || 'Erro ao atualizar')
        }
      })
      return
    }

    // Criar novo projeto
    if (modo === 'existente') {
      if (!clienteEscolhido) {
        setErro('Escolha um cliente da lista ou troque para "Novo cliente"')
        return
      }
      startTransition(async () => {
        const result = await criarProjetoAction({
          cliente_id: clienteEscolhido.id,
          titular_igual_cliente: titularIgual,
          titular_cliente_id: !titularIgual && modoTitular === 'existente' ? titularEscolhido?.id : undefined,
          novo_titular: !titularIgual && modoTitular === 'novo' ? {
            razao_social: novoTitular.razao_social.trim(),
            cpf_cnpj: novoTitular.cpf_cnpj || null,
            tipo: novoTitular.tipo,
          } : undefined,
          endereco_igual_titular: enderecoIgual,
          endereco_instalacao: !enderecoIgual ? enderecoInst : undefined,
          observacoes: observacoes.trim() || null,
        })
        if (result && 'erro' in result) setErro(result.erro)
      })
    } else {
      // Cliente novo
      if (!formNovo.razao_social.trim()) {
        setErro('Nome/razão social é obrigatório')
        return
      }
      if (!formNovo.cliente_sem_documento && formNovo.cpf_cnpj && !isValidCpfCnpj(formNovo.cpf_cnpj)) {
        setErro('CPF/CNPJ inválido. Marque "sem documento" se ainda não tem.')
        return
      }
      if (!isValidTelefone(formNovo.telefone)) {
        setErro('WhatsApp inválido. Formato: (48) 99999-9999')
        return
      }
      if (formNovo.email && !isValidEmail(formNovo.email)) {
        setErro('E-mail inválido')
        return
      }

      startTransition(async () => {
        const result = await criarProjetoAction({
          novo_cliente: {
            tipo: formNovo.tipo,
            razao_social: formNovo.razao_social.trim(),
            cpf_cnpj: formNovo.cliente_sem_documento ? null : unmask(formNovo.cpf_cnpj),
            email: formNovo.email.trim() || null,
            telefone: unmask(formNovo.telefone),
            whatsapp: unmask(formNovo.telefone),
          },
          titular_igual_cliente: titularIgual,
          titular_cliente_id: !titularIgual && modoTitular === 'existente' ? titularEscolhido?.id : undefined,
          novo_titular: !titularIgual && modoTitular === 'novo' ? {
            razao_social: novoTitular.razao_social.trim(),
            cpf_cnpj: novoTitular.cpf_cnpj || null,
            tipo: novoTitular.tipo,
          } : undefined,
          endereco_igual_titular: enderecoIgual,
          endereco_instalacao: !enderecoIgual ? enderecoInst : undefined,
          observacoes: observacoes.trim() || null,
        })
        if (result && 'erro' in result) setErro(result.erro)
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-lg p-4 text-sm text-white/80">
        <p><strong className="text-white">Passo 1 de 8:</strong> escolhe o cliente.</p>
        <p className="text-xs text-white/50 mt-1">
          Endereço, UC, fatura e kit serão preenchidos nos próximos passos.
        </p>
      </div>

      {/* Toggle novo vs existente (só na criação) */}
      {!isEdit && (
        <div className="grid grid-cols-2 gap-2 p-1 bg-white/[0.03] border border-white/10 rounded-lg">
          <button
            type="button"
            onClick={() => setModo('existente')}
            className={`px-3 py-2 rounded text-sm font-bold transition ${
              modo === 'existente'
                ? 'bg-sol/20 border border-sol/40 text-sol'
                : 'text-white/60 hover:bg-white/5'
            }`}
          >
            🔍 Cliente já cadastrado
          </button>
          <button
            type="button"
            onClick={() => setModo('novo')}
            className={`px-3 py-2 rounded text-sm font-bold transition ${
              modo === 'novo'
                ? 'bg-sol/20 border border-sol/40 text-sol'
                : 'text-white/60 hover:bg-white/5'
            }`}
          >
            ➕ Cadastrar cliente novo
          </button>
        </div>
      )}

      {/* Modo: escolher existente */}
      {!isEdit && modo === 'existente' && (
        <div>
          <label className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
            Buscar cliente
          </label>
          <SeletorCliente onEscolher={setClienteEscolhido} />
          <p className="text-[10px] text-white/40 mt-2">
            Não achou? <Link href="/crm/clientes/novo" className="text-sol hover:underline">
              Cadastra no CRM →
            </Link>{' '}
            ou clica em "Cadastrar cliente novo" acima.
          </p>
        </div>
      )}

      {/* Modo: novo cliente (form inline) OU edit */}
      {(isEdit || modo === 'novo') && (
        <>
          {/* Tipo PF/PJ (só criação) */}
          {!isEdit && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateNovo('tipo', 'pf')}
                className={`px-3 py-2 rounded-lg border text-sm font-bold transition ${
                  formNovo.tipo === 'pf'
                    ? 'bg-sol/10 border-sol/40 text-sol'
                    : 'bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/5'
                }`}
              >
                👤 Pessoa Física
              </button>
              <button
                type="button"
                onClick={() => updateNovo('tipo', 'pj')}
                className={`px-3 py-2 rounded-lg border text-sm font-bold transition ${
                  formNovo.tipo === 'pj'
                    ? 'bg-sol/10 border-sol/40 text-sol'
                    : 'bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/5'
                }`}
              >
                🏢 Empresa (PJ)
              </button>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
              {formNovo.tipo === 'pj' ? 'Razão social' : 'Nome completo'} <span className="text-coral">*</span>
            </span>
            <input
              type="text"
              value={formNovo.razao_social}
              onChange={e => updateNovo('razao_social', e.target.value)}
              placeholder={formNovo.tipo === 'pj' ? 'Ex: Padaria Ilhota Ltda' : 'Ex: João da Silva'}
              className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30"
              required
            />
          </label>

          <div>
            <label className="block">
              <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
                {formNovo.tipo === 'pj' ? 'CNPJ' : 'CPF'} {!formNovo.cliente_sem_documento && <span className="text-coral">*</span>}
              </span>
              <input
                type="text"
                value={formNovo.cpf_cnpj}
                onChange={e => {
                  const masked = maskCpfCnpj(e.target.value)
                  setFormNovo(prev => ({
                    ...prev,
                    cpf_cnpj: masked,
                    cliente_sem_documento: masked.length > 0 ? false : prev.cliente_sem_documento,
                  }))
                }}
                placeholder={formNovo.tipo === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
                className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30"
              />
            </label>
            <label className="flex items-center gap-2 mt-2 text-xs text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={formNovo.cliente_sem_documento}
                onChange={e => {
                  const marcado = e.target.checked
                  setFormNovo(prev => ({
                    ...prev,
                    cliente_sem_documento: marcado,
                    cpf_cnpj: marcado ? '' : prev.cpf_cnpj,
                  }))
                }}
                className="rounded"
              />
              Cliente ainda não forneceu documento
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
                WhatsApp <span className="text-coral">*</span>
              </span>
              <input
                type="tel"
                value={formNovo.telefone}
                onChange={e => updateNovo('telefone', maskTelefone(e.target.value))}
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
                value={formNovo.email}
                onChange={e => updateNovo('email', e.target.value)}
                placeholder="cliente@email.com"
                className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30"
              />
            </label>
          </div>
        </>
      )}

      {/* Titular do projeto (só na criação) */}
      {!isEdit && (
        <section className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          <h3 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
            📋 Titular do projeto
          </h3>
          <p className="text-[10px] text-white/50 mb-3">
            Titular = quem consta na UC/fatura CELESC (importante pra homologação).
          </p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setTitularIgual(true)}
              className={`px-3 py-2 rounded text-xs font-bold transition border ${
                titularIgual
                  ? 'bg-sol/20 border-sol/40 text-sol'
                  : 'bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/5'
              }`}
            >
              ✓ É o próprio cliente
            </button>
            <button
              type="button"
              onClick={() => setTitularIgual(false)}
              className={`px-3 py-2 rounded text-xs font-bold transition border ${
                !titularIgual
                  ? 'bg-sol/20 border-sol/40 text-sol'
                  : 'bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/5'
              }`}
            >
              ✗ Outra pessoa (PF/PJ)
            </button>
          </div>

          {!titularIgual && (
            <div className="space-y-3 mt-3 p-3 bg-noite/40 border border-white/5 rounded">
              <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.03] border border-white/10 rounded">
                <button
                  type="button"
                  onClick={() => setModoTitular('existente')}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${
                    modoTitular === 'existente' ? 'bg-sol/20 text-sol' : 'text-white/50'
                  }`}
                >
                  Já cadastrado
                </button>
                <button
                  type="button"
                  onClick={() => setModoTitular('novo')}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${
                    modoTitular === 'novo' ? 'bg-sol/20 text-sol' : 'text-white/50'
                  }`}
                >
                  Cadastrar novo
                </button>
              </div>

              {modoTitular === 'existente' ? (
                <SeletorCliente onEscolher={setTitularEscolhido} />
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNovoTitular((t) => ({ ...t, tipo: 'pf' }))}
                      className={`px-2 py-1 rounded text-[10px] font-bold border ${
                        novoTitular.tipo === 'pf' ? 'bg-sol/10 border-sol/40 text-sol' : 'border-white/10 text-white/50'
                      }`}
                    >
                      👤 PF
                    </button>
                    <button
                      type="button"
                      onClick={() => setNovoTitular((t) => ({ ...t, tipo: 'pj' }))}
                      className={`px-2 py-1 rounded text-[10px] font-bold border ${
                        novoTitular.tipo === 'pj' ? 'bg-sol/10 border-sol/40 text-sol' : 'border-white/10 text-white/50'
                      }`}
                    >
                      🏢 PJ
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder={novoTitular.tipo === 'pj' ? 'Razão social' : 'Nome completo'}
                    value={novoTitular.razao_social}
                    onChange={(e) => setNovoTitular((t) => ({ ...t, razao_social: e.target.value }))}
                    className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
                  />
                  <input
                    type="text"
                    placeholder={novoTitular.tipo === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
                    value={novoTitular.cpf_cnpj}
                    onChange={(e) => setNovoTitular((t) => ({ ...t, cpf_cnpj: maskCpfCnpj(e.target.value) }))}
                    className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Endereço da instalação (só na criação) */}
      {!isEdit && (
        <section className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          <h3 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
            📍 Endereço da instalação
          </h3>
          <p className="text-[10px] text-white/50 mb-3">
            Onde vai instalar o sistema — pra visita técnica e entrega dos equipamentos.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setEnderecoIgual(true)}
              className={`px-3 py-2 rounded text-xs font-bold transition border ${
                enderecoIgual
                  ? 'bg-sol/20 border-sol/40 text-sol'
                  : 'bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/5'
              }`}
            >
              ✓ Mesmo endereço do titular
            </button>
            <button
              type="button"
              onClick={() => setEnderecoIgual(false)}
              className={`px-3 py-2 rounded text-xs font-bold transition border ${
                !enderecoIgual
                  ? 'bg-sol/20 border-sol/40 text-sol'
                  : 'bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/5'
              }`}
            >
              ✗ Endereço diferente
            </button>
          </div>

          {!enderecoIgual && (
            <div className="space-y-2 p-3 bg-noite/40 border border-white/5 rounded">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="CEP"
                  value={enderecoInst.cep}
                  onChange={(e) => setEnderecoInst((s) => ({ ...s, cep: formatarCep(e.target.value) }))}
                  onBlur={buscarCepInstalacao}
                  className="w-32 px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={buscarCepInstalacao}
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-white/70 hover:bg-white/10"
                >
                  🔍 Buscar CEP
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Rua"
                  value={enderecoInst.rua}
                  onChange={(e) => setEnderecoInst((s) => ({ ...s, rua: e.target.value }))}
                  className="col-span-2 px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
                />
                <input
                  type="text"
                  placeholder="Nº"
                  value={enderecoInst.numero}
                  onChange={(e) => setEnderecoInst((s) => ({ ...s, numero: e.target.value }))}
                  className="px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Complemento"
                  value={enderecoInst.complemento}
                  onChange={(e) => setEnderecoInst((s) => ({ ...s, complemento: e.target.value }))}
                  className="px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
                />
                <input
                  type="text"
                  placeholder="Bairro"
                  value={enderecoInst.bairro}
                  onChange={(e) => setEnderecoInst((s) => ({ ...s, bairro: e.target.value }))}
                  className="px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Cidade"
                  value={enderecoInst.cidade}
                  onChange={(e) => setEnderecoInst((s) => ({ ...s, cidade: e.target.value }))}
                  className="col-span-2 px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
                />
                <select
                  value={enderecoInst.uf}
                  onChange={(e) => setEnderecoInst((s) => ({ ...s, uf: e.target.value }))}
                  className="px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white"
                >
                  {UFS.map(uf => <option key={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Observações comuns */}
      <label className="block">
        <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
          Observações do consultor (opcional)
        </span>
        <textarea
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
          rows={3}
          placeholder="'cliente indicado por João', 'quer instalar até dezembro', etc"
          className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 resize-y"
        />
      </label>

      {erro && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-4 text-sm text-coral">
          ❌ {erro}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
        >
          {isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar projeto → Passo 2 Fatura'}
        </button>
      </div>
    </form>
  )
}
