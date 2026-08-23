'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  salvarCampoFaseAction,
  uploadArquivoFaseAction,
  removerArquivoFaseAction,
} from '@/app/homologacoes/[id]/actions'

/**
 * Editor da TRT — reutilizado nas fases 2 (projeto) e 6 (execução).
 * Recebe o prefixo das colunas: 'trt_projeto' ou 'trt_execucao'.
 *
 * 8 campos:
 *   - numero (text)
 *   - valor_boleto (numeric)
 *   - boleto_url (file upload)
 *   - data_pagamento (date)
 *   - comprovante_url (file upload)
 *   - pdf_url (PDF final da TRT emitida)
 *   - data_emissao (date)
 *   - observacoes (textarea)
 *
 * Quando pdf_url + data_emissao estão preenchidos, a TRT é considerada
 * emitida e a fase pode avançar.
 */
export function EditorTRT({
  homologacaoId,
  prefixo,
  valores,
}: {
  homologacaoId: string
  prefixo: 'trt_projeto' | 'trt_execucao'
  valores: {
    numero?: string | null
    valor_boleto?: number | null
    boleto_url?: string | null
    data_pagamento?: string | null
    comprovante_url?: string | null
    pdf_url?: string | null
    data_emissao?: string | null
    observacoes?: string | null
  }
}) {
  const router = useRouter()
  const trtEmitida = !!(valores.pdf_url && valores.data_emissao)

  return (
    <div className="space-y-4">
      {trtEmitida && (
        <div className="p-3 bg-verde/10 border border-verde/30 rounded-lg text-xs text-verde">
          ✓ TRT emitida em {formatarDataBr(valores.data_emissao)} — nº {valores.numero || '—'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CampoTexto
          label="Número da TRT"
          coluna={`${prefixo}_numero`}
          homologacaoId={homologacaoId}
          valorAtual={valores.numero}
          placeholder="Ex: 2026-CFT-01234"
        />
        <CampoTexto
          label="Valor do boleto (R$)"
          coluna={`${prefixo}_valor_boleto`}
          homologacaoId={homologacaoId}
          valorAtual={valores.valor_boleto ? fmtValor(valores.valor_boleto) : ''}
          placeholder="Ex: 250,00"
          inputMode="decimal"
        />
      </div>

      <SlotArquivo
        homologacaoId={homologacaoId}
        coluna={`${prefixo}_boleto_url`}
        label="📄 Boleto de pagamento"
        descricao="PDF ou imagem do boleto do CFT"
        urlAtual={valores.boleto_url}
        accept="application/pdf,image/*"
        onChange={() => router.refresh()}
      />

      <CampoTexto
        label="Data de pagamento"
        coluna={`${prefixo}_data_pagamento`}
        homologacaoId={homologacaoId}
        valorAtual={valores.data_pagamento}
        placeholder="AAAA-MM-DD"
        tipo="date"
      />

      <SlotArquivo
        homologacaoId={homologacaoId}
        coluna={`${prefixo}_comprovante_url`}
        label="🧾 Comprovante de pagamento"
        descricao="Comprovante bancário do pagamento"
        urlAtual={valores.comprovante_url}
        accept="application/pdf,image/*"
        onChange={() => router.refresh()}
      />

      <div className="pt-3 border-t border-white/5">
        <p className="text-[10px] uppercase tracking-wider text-sol/70 font-bold mb-2">
          TRT emitida pelo CFT
        </p>

        <SlotArquivo
          homologacaoId={homologacaoId}
          coluna={`${prefixo}_pdf_url`}
          label="📃 PDF da TRT emitida"
          descricao="Documento final emitido pelo CFT"
          urlAtual={valores.pdf_url}
          accept="application/pdf"
          onChange={() => router.refresh()}
        />

        <div className="mt-3">
          <CampoTexto
            label="Data de emissão"
            coluna={`${prefixo}_data_emissao`}
            homologacaoId={homologacaoId}
            valorAtual={valores.data_emissao}
            placeholder="AAAA-MM-DD"
            tipo="date"
          />
        </div>
      </div>

      <CampoTextarea
        label="Observações"
        coluna={`${prefixo}_observacoes`}
        homologacaoId={homologacaoId}
        valorAtual={valores.observacoes}
        placeholder="Anotações do processo (recurso, alerta CFT, etc.)"
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ══════════════════════════════════════════════════════════════════════

function CampoTexto({
  label, coluna, homologacaoId, valorAtual, placeholder, tipo, inputMode,
}: {
  label: string
  coluna: string
  homologacaoId: string
  valorAtual?: string | number | null
  placeholder?: string
  tipo?: string
  inputMode?: 'text' | 'decimal' | 'numeric'
}) {
  const [valor, setValor] = useState<string>(valorAtual ? String(valorAtual) : '')
  const [pending, startTransition] = useTransition()
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    setErro(null)
    setSalvo(false)
    startTransition(async () => {
      const r = await salvarCampoFaseAction(homologacaoId, coluna, valor || null)
      if ('erro' in r) setErro(r.erro)
      else {
        setSalvo(true)
        setTimeout(() => setSalvo(false), 2000)
      }
    })
  }

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type={tipo || 'text'}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => valor !== (valorAtual ? String(valorAtual) : '') && salvar()}
          placeholder={placeholder}
          inputMode={inputMode}
          className="flex-1 px-3 py-2 bg-noite/60 border border-white/15 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-sol/60"
        />
        {pending && <span className="text-[10px] text-white/50">…</span>}
        {salvo && <span className="text-[10px] text-verde">✓</span>}
      </div>
      {erro && <p className="text-[10px] text-coral mt-1">⚠ {erro}</p>}
    </div>
  )
}

function CampoTextarea({
  label, coluna, homologacaoId, valorAtual, placeholder,
}: {
  label: string
  coluna: string
  homologacaoId: string
  valorAtual?: string | null
  placeholder?: string
}) {
  const [valor, setValor] = useState<string>(valorAtual || '')
  const [pending, startTransition] = useTransition()
  const [salvo, setSalvo] = useState(false)

  function salvar() {
    startTransition(async () => {
      const r = await salvarCampoFaseAction(homologacaoId, coluna, valor || null)
      if (!('erro' in r)) {
        setSalvo(true)
        setTimeout(() => setSalvo(false), 2000)
      }
    })
  }

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">
        {label}
        {pending && <span className="ml-2 text-white/40">…</span>}
        {salvo && <span className="ml-2 text-verde">✓</span>}
      </label>
      <textarea
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => valor !== (valorAtual || '') && salvar()}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 bg-noite/60 border border-white/15 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-sol/60 resize-y"
      />
    </div>
  )
}

function SlotArquivo({
  homologacaoId, coluna, label, descricao, urlAtual, accept, onChange,
}: {
  homologacaoId: string
  coluna: string
  label: string
  descricao: string
  urlAtual?: string | null
  accept: string
  onChange?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(file: File) {
    setErro(null)
    if (file.size > 10 * 1024 * 1024) { setErro('Arquivo > 10MB'); return }
    const base64 = await lerBase64(file)
    startTransition(async () => {
      const r = await uploadArquivoFaseAction({
        homologacaoId, coluna, arquivoBase64: base64, nomeOriginal: file.name,
      })
      if ('erro' in r) setErro(r.erro)
      else onChange?.()
    })
  }

  function remover() {
    if (!confirm(`Remover ${label}?`)) return
    startTransition(async () => {
      await removerArquivoFaseAction(homologacaoId, coluna)
      onChange?.()
    })
  }

  const enviado = !!urlAtual
  return (
    <div className={`p-3 rounded-lg border ${enviado ? 'bg-verde/5 border-verde/30' : 'bg-noite/40 border-white/10 border-dashed'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{label}</p>
          <p className="text-[10px] text-white/50">{descricao}</p>
        </div>
        {enviado && <span className="text-verde font-bold text-xs">✓</span>}
      </div>
      {enviado ? (
        <div className="mt-2 flex gap-2">
          <a href={urlAtual!} target="_blank" rel="noreferrer" className="text-[10px] px-3 py-1.5 bg-verde/20 border border-verde/40 rounded text-verde font-bold">
            📥 Abrir
          </a>
          <button type="button" onClick={remover} disabled={pending}
            className="text-[10px] px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white/60 hover:text-coral">
            ✕ Remover
          </button>
        </div>
      ) : (
        <label className={`mt-2 block cursor-pointer text-center px-3 py-2 bg-sol/10 border border-sol/30 border-dashed rounded text-xs font-bold text-sol hover:bg-sol/20 ${pending ? 'opacity-40 cursor-wait' : ''}`}>
          {pending ? '⏳ Enviando…' : '+ Escolher arquivo'}
          <input type="file" accept={accept} onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
            disabled={pending} className="hidden" />
        </label>
      )}
      {erro && <p className="text-[10px] text-coral mt-2">⚠ {erro}</p>}
    </div>
  )
}

function lerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Falha ao ler'))
    r.readAsDataURL(file)
  })
}

function fmtValor(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatarDataBr(d: any): string {
  if (!d) return '—'
  const s = String(d)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}
