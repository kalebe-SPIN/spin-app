'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  maskCpfCnpj,
  maskTelefone,
  maskCep,
  maskUC,
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
  cliente_endereco: any
  uc_geradora: string
  ucs_beneficiarias: string[] | null
  tipo_projeto: string
  motivacao_cliente: string | null
  observacoes_consultor: string | null
}

/**
 * Formulário de criação OU edição do projeto.
 *
 * Modo CRIAR (sem projetoExistente):
 *   1. Consultor faz upload da fatura CELESC
 *   2. Sistema chama /api/analisar-fatura → extrai dados
 *   3. Campos pré-preenchidos + completados manualmente
 *   4. INSERT em projetos + redirect /projetos/[id]
 *
 * Modo EDITAR (com projetoExistente):
 *   1. Campos pré-populados com dados do projeto
 *   2. Consultor altera o que precisar
 *   3. UPDATE em projetos + redirect /projetos/[id]
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

  // Estado da análise de fatura
  const [faturaArquivo, setFaturaArquivo] = useState<File | null>(null)
  const [analisandoFatura, setAnalisandoFatura] = useState(false)
  const [faturaAnalisada, setFaturaAnalisada] = useState(false)
  const [analiseStub, setAnaliseStub] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Quais campos foram auto-preenchidos pela análise da fatura
  const [autoPreenchidos, setAutoPreenchidos] = useState<Set<string>>(new Set())

  // Estado do form — inicializa com projeto existente se for edição
  const end = projetoExistente?.cliente_endereco || {}
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
    cliente_logradouro: end.logradouro || '',
    cliente_bairro: end.bairro || '',
    cliente_cidade: end.cidade || '',
    cliente_uf: end.uf || 'SC',
    cliente_cep: end.cep ? maskCep(end.cep) : '',
    uc_geradora: projetoExistente?.uc_geradora || '',
    ucs_beneficiarias: (projetoExistente?.ucs_beneficiarias || []).join(', '),
    tipo_projeto: projetoExistente?.tipo_projeto || 'ongrid',
    motivacao_cliente: projetoExistente?.motivacao_cliente || 'reduzir_conta',
    observacoes: projetoExistente?.observacoes_consultor || '',
  })

  function update<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
    // Se o consultor editou um campo auto-preenchido, remove a marca
    if (autoPreenchidos.has(k as string)) {
      setAutoPreenchidos((prev) => {
        const next = new Set(prev)
        next.delete(k as string)
        return next
      })
    }
  }

  // ===== Upload e análise da fatura =====
  async function handleArquivoSelecionado(file: File) {
    setError(null)
    setFaturaArquivo(file)
    setAnalisandoFatura(true)
    setFaturaAnalisada(false)

    try {
      const formData = new FormData()
      formData.append('arquivo', file)

      const res = await fetch('/api/analisar-fatura', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()

      // Logs pra debug (aparecem no Console do browser)
      console.log('[OCR-FATURA] Resposta:', json)

      if (!res.ok) {
        throw new Error(json.error || json.erro || 'Erro ao analisar fatura')
      }

      if (!json.sucesso) {
        throw new Error(json.error || json.erro || 'Análise não retornou sucesso')
      }

      // Marca se é stub (mock)
      setAnaliseStub(!!json.stub)

      // Safe access — Edge Function pode estar na v1 antiga (sem campo "dados")
      const d = json.dados || {}
      const endereco = d.endereco || {}

      // Detecta formato v1 antigo (só tem "valor" e "mediaConsumoKwh")
      const formatoAntigo = !json.dados && (json.valor != null || json.mediaConsumoKwh != null)
      if (formatoAntigo) {
        setError(
          'Edge Function ocr-fatura ainda está na versão antiga (v1). ' +
          'Deploy a nova versão v2 no Supabase Dashboard para auto-preencher TODOS os campos. ' +
          'Por enquanto, preencha manualmente.'
        )
        setFaturaAnalisada(true)
        setAnalisandoFatura(false)
        return
      }

      // Auto-preenche os campos que vieram preenchidos da análise
      const novos: Partial<typeof form> = {}
      const marcados = new Set<string>()

      if (d.razao_social) {
        novos.cliente_razao_social = d.razao_social
        marcados.add('cliente_razao_social')
      }
      if (d.cpf_cnpj) {
        novos.cliente_cpf_cnpj = maskCpfCnpj(d.cpf_cnpj)
        marcados.add('cliente_cpf_cnpj')
      }
      if (d.uc) {
        novos.uc_geradora = maskUC(d.uc)
        marcados.add('uc_geradora')
      }
      if (endereco.logradouro) {
        novos.cliente_logradouro = endereco.logradouro
        marcados.add('cliente_logradouro')
      }
      if (endereco.bairro) {
        novos.cliente_bairro = endereco.bairro
        marcados.add('cliente_bairro')
      }
      if (endereco.cidade) {
        novos.cliente_cidade = endereco.cidade
        marcados.add('cliente_cidade')
      }
      if (endereco.uf) {
        novos.cliente_uf = endereco.uf
        marcados.add('cliente_uf')
      }
      if (endereco.cep) {
        novos.cliente_cep = maskCep(endereco.cep)
        marcados.add('cliente_cep')
      }

      console.log('[OCR-FATURA] Campos preenchidos:', Array.from(marcados))

      setForm((prev) => ({ ...prev, ...novos }))
      setAutoPreenchidos(marcados)
      setFaturaAnalisada(true)

      // Alerta se NÃO conseguiu extrair nada
      if (marcados.size === 0) {
        setError(
          'Análise concluída mas nenhum campo foi extraído. ' +
          'Pode ser fatura com layout diferente ou regex precisa de ajuste. ' +
          'Preencha manualmente.'
        )
      }
    } catch (err: any) {
      console.error('[OCR-FATURA] Erro:', err)
      setError(`Falha ao analisar fatura: ${err.message}. Você pode preencher manualmente — o arquivo continua anexado.`)
      // ⚠️ NÃO reseta o arquivo — consultor pode tentar de novo ou preencher manual
    } finally {
      setAnalisandoFatura(false)
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleArquivoSelecionado(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleArquivoSelecionado(file)
  }

  // ===== Submit =====
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validações
    if (!form.cliente_razao_social.trim()) {
      setError('Nome / razão social obrigatório.')
      return
    }
    if (!form.cliente_sem_documento) {
      if (!form.cliente_cpf_cnpj.trim()) {
        setError('CPF/CNPJ obrigatório (ou marque "Cliente sem documento informado").')
        return
      }
      if (!isValidCpfCnpj(form.cliente_cpf_cnpj)) {
        setError('CPF/CNPJ inválido (verifique os dígitos).')
        return
      }
    }
    if (!form.cliente_telefone.trim() || !isValidTelefone(form.cliente_telefone)) {
      setError('Telefone WhatsApp inválido. Use formato (XX) 9XXXX-XXXX.')
      return
    }
    if (form.cliente_email && !isValidEmail(form.cliente_email)) {
      setError('Email com formato inválido.')
      return
    }
    if (!form.uc_geradora.trim()) {
      setError('UC geradora obrigatória.')
      return
    }

    setLoading(true)

    const supabase = createClient()

    const beneficiarias = form.ucs_beneficiarias
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)

    const payload = {
      cliente_razao_social: form.cliente_razao_social.trim(),
      cliente_cpf_cnpj: form.cliente_sem_documento ? null : unmask(form.cliente_cpf_cnpj),
      cliente_email: form.cliente_email.trim() || null,
      cliente_telefone: unmask(form.cliente_telefone),
      cliente_endereco: {
        logradouro: form.cliente_logradouro,
        bairro: form.cliente_bairro,
        cidade: form.cliente_cidade,
        uf: form.cliente_uf,
        cep: unmask(form.cliente_cep),
      },
      uc_geradora: form.uc_geradora.trim(),
      ucs_beneficiarias: beneficiarias,
      tipo_projeto: form.tipo_projeto,
      motivacao_cliente: form.motivacao_cliente,
      observacoes_consultor: form.observacoes.trim() || null,
    }

    let resultId: string | undefined
    let dbError: any

    if (isEdit && projetoExistente) {
      // MODO EDITAR — UPDATE
      const { error } = await supabase
        .from('projetos')
        .update(payload)
        .eq('id', projetoExistente.id)
      dbError = error
      resultId = projetoExistente.id
    } else {
      // MODO CRIAR — INSERT
      const { data, error } = await supabase
        .from('projetos')
        .insert({
          ...payload,
          consultor_id: consultorId,
          status: faturaAnalisada ? 'fatura_analisada' : 'rascunho',
        })
        .select('id')
        .single()
      dbError = error
      resultId = data?.id
    }

    setLoading(false)

    if (dbError) {
      console.error('[Projeto] Erro no DB:', dbError)
      setError(`Erro ao ${isEdit ? 'atualizar' : 'criar'} projeto: ${dbError.message}`)
      return
    }

    // Em modo edit, força full page reload (router.push retorna cache stale)
    // Em modo create, router.push funciona pq é primeira visita à URL
    if (isEdit) {
      window.location.href = `/projetos/${resultId}`
    } else {
      router.push(`/projetos/${resultId}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ===== ZONA DE UPLOAD DE FATURA ===== */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          📄 Fatura CELESC (auto-preenche os campos)
        </legend>

        {!faturaArquivo ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-sol/40 hover:bg-white/[0.02] transition-colors"
          >
            <div className="text-4xl mb-2">📎</div>
            <p className="text-sm text-white/80 font-semibold">
              Clique ou arraste a fatura aqui
            </p>
            <p className="text-xs text-white/40 mt-1">
              PDF, JPG ou PNG · máx. 10MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center gap-3">
            <div className="text-2xl">📄</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{faturaArquivo.name}</p>
              <p className="text-xs text-white/40">
                {(faturaArquivo.size / 1024).toFixed(0)} KB
                {analisandoFatura && ' · Analisando...'}
                {faturaAnalisada && ' · ✓ Analisada'}
              </p>
            </div>
            {analisandoFatura ? (
              <div className="text-sol animate-pulse text-sm font-bold">⏳</div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFaturaArquivo(null)
                  setFaturaAnalisada(false)
                  setAutoPreenchidos(new Set())
                }}
                className="text-xs text-white/40 hover:text-coral transition-colors"
              >
                ✕ Remover
              </button>
            )}
          </div>
        )}

        {analiseStub && faturaAnalisada && (
          <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 text-xs text-coral">
            ⚠️ Análise automática ainda em desenvolvimento (stub). Preencha os campos manualmente por enquanto.
          </div>
        )}
      </fieldset>

      {/* ===== IDENTIFICAÇÃO DO CLIENTE ===== */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Identificação do cliente
        </legend>

        <Field label="Razão social / Nome completo *" auto={autoPreenchidos.has('cliente_razao_social')}>
          <input
            type="text"
            required
            value={form.cliente_razao_social}
            onChange={(e) => update('cliente_razao_social', e.target.value)}
            className="input-spin"
            placeholder="João Silva ou Empresa LTDA"
          />
        </Field>

        <div>
          <Field
            label={`${form.cliente_sem_documento ? 'CPF / CNPJ (opcional)' : 'CPF / CNPJ *'}`}
            auto={autoPreenchidos.has('cliente_cpf_cnpj')}
          >
            <input
              type="text"
              required={!form.cliente_sem_documento}
              disabled={form.cliente_sem_documento}
              value={form.cliente_cpf_cnpj}
              onChange={(e) => update('cliente_cpf_cnpj', maskCpfCnpj(e.target.value))}
              className="input-spin"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
            />
          </Field>
          <label className="mt-2 flex items-center gap-2 text-xs text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={form.cliente_sem_documento}
              onChange={(e) => {
                update('cliente_sem_documento', e.target.checked)
                if (e.target.checked) update('cliente_cpf_cnpj', '')
              }}
              className="rounded border-white/20 bg-white/5 text-sol focus:ring-sol"
            />
            <span>Cliente sem documento informado</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="WhatsApp *">
            <input
              type="tel"
              required
              value={form.cliente_telefone}
              onChange={(e) => update('cliente_telefone', maskTelefone(e.target.value))}
              className="input-spin"
              placeholder="(48) 99999-9999"
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={form.cliente_email}
              onChange={(e) => update('cliente_email', e.target.value)}
              className="input-spin"
              placeholder="cliente@email.com"
            />
          </Field>
        </div>
      </fieldset>

      {/* ===== ENDEREÇO ===== */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Endereço da instalação
        </legend>

        <Field label="Logradouro" auto={autoPreenchidos.has('cliente_logradouro')}>
          <input
            type="text"
            value={form.cliente_logradouro}
            onChange={(e) => update('cliente_logradouro', e.target.value)}
            className="input-spin"
            placeholder="Rua, número, complemento"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Bairro" auto={autoPreenchidos.has('cliente_bairro')}>
            <input
              type="text"
              value={form.cliente_bairro}
              onChange={(e) => update('cliente_bairro', e.target.value)}
              className="input-spin"
            />
          </Field>

          <Field label="Cidade" auto={autoPreenchidos.has('cliente_cidade')}>
            <input
              type="text"
              value={form.cliente_cidade}
              onChange={(e) => update('cliente_cidade', e.target.value)}
              className="input-spin"
            />
          </Field>

          <Field label="UF" auto={autoPreenchidos.has('cliente_uf')}>
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

        <Field label="CEP" auto={autoPreenchidos.has('cliente_cep')}>
          <input
            type="text"
            value={form.cliente_cep}
            onChange={(e) => update('cliente_cep', maskCep(e.target.value))}
            className="input-spin"
            placeholder="00000-000"
          />
        </Field>
      </fieldset>

      {/* ===== UC + TIPO ===== */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Unidade Consumidora (UC) CELESC
        </legend>

        <Field label="UC geradora *" auto={autoPreenchidos.has('uc_geradora')}>
          <input
            type="text"
            required
            value={form.uc_geradora}
            onChange={(e) => update('uc_geradora', maskUC(e.target.value))}
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

      {/* ===== TIPO DE PROJETO ===== */}
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

      {/* ===== OBSERVAÇÕES ===== */}
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

      {/* ===== ERROR ===== */}
      {error && (
        <div className="p-4 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          {error}
        </div>
      )}

      {/* ===== SUBMIT ===== */}
      <div className="flex gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-6 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? (isEdit ? 'Salvando...' : 'Criando...')
            : (isEdit ? 'Salvar alterações' : 'Criar projeto e continuar →')}
        </button>
      </div>
    </form>
  )
}

/**
 * Field com indicador visual quando foi auto-preenchido pela análise da fatura.
 */
function Field({
  label,
  auto,
  children,
}: {
  label: string
  auto?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5 flex items-center gap-2">
        {label}
        {auto && (
          <span className="text-[9px] font-bold uppercase bg-verde/20 text-verde px-1.5 py-0.5 rounded">
            ✨ auto-fatura
          </span>
        )}
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
