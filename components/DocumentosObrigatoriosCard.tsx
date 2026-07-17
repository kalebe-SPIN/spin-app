'use client'

/**
 * Card com uploads obrigatórios do consultor pra homologação.
 * 3 seções (última só se PJ + sócios variáveis):
 *   1. 🏗️ Infraestrutura: 4 fotos/PDF (disjuntor, padrão, fachada, fatura)
 *   2. 🪪 Cliente: CNH + procuração
 *   3. 🏢 PJ: cartão CNPJ + contrato social + N sócios (cada com CNH + procuração)
 *
 * Só quando TUDO estiver enviado, sistema libera geração dos arquivos das etapas.
 */

import { useState, useTransition } from 'react'
import {
  uploadDocumentoHomologacaoAction,
  removerDocumentoHomologacaoAction,
  adicionarSocioAction,
  removerSocioAction,
  uploadDocumentoSocioAction,
  type TipoDoc,
  type Socio,
} from '@/app/homologacoes/[id]/actions'

// ═══════════════════ DEFINIÇÕES DE SLOTS ═══════════════════

// Fatura NÃO está aqui — vem do Passo 2 do projeto (analise_fatura)
const SLOTS_INFRA: Array<SlotDef> = [
  { chave: 'foto_disjuntor',      emoji: '⚡', label: 'Foto do disjuntor geral',    desc: 'Padrão de entrada, amperagem visível', accept: 'image/*' },
  { chave: 'foto_padrao_entrada', emoji: '🔌', label: 'Foto do padrão de entrada',  desc: 'Completo, caixa + entrada da rede',    accept: 'image/*' },
  { chave: 'foto_fachada',        emoji: '🏠', label: 'Foto da fachada do imóvel', desc: 'Vista frontal — pra homologação',      accept: 'image/*' },
]

const SLOTS_CLIENTE: Array<SlotDef> = [
  { chave: 'cnh_cliente',        emoji: '🪪', label: 'CNH ou RG do cliente/representante', desc: 'Foto ou PDF do documento',      accept: 'application/pdf,image/*' },
  { chave: 'procuracao_cliente', emoji: '✍️', label: 'Procuração assinada digitalmente',   desc: 'PDF com assinatura eletrônica', accept: 'application/pdf' },
]

const SLOTS_PJ: Array<SlotDef> = [
  { chave: 'cartao_cnpj',     emoji: '🏢', label: 'Cartão CNPJ',                        desc: 'Emitido pela Receita Federal', accept: 'application/pdf' },
  { chave: 'contrato_social', emoji: '📜', label: 'Contrato Social (última alteração)', desc: 'Ata mais recente registrada',  accept: 'application/pdf' },
]

type SlotDef = {
  chave: TipoDoc
  emoji: string
  label: string
  desc: string
  accept: string
}

type Props = {
  homologacaoId: string
  ehPJ: boolean
  urls: Record<TipoDoc, string | null | undefined>
  socios: Socio[]
  documentosCompletosEm?: string | null
  faturaOk: boolean         // NOVO: vem do projeto.analise_fatura (Passo 2)
  projetoId?: string        // NOVO: pra montar link "Ver fatura"
}

export function DocumentosObrigatoriosCard({
  homologacaoId, ehPJ, urls, socios, documentosCompletosEm, faturaOk, projetoId,
}: Props) {
  // Contagem total (inclui fatura como slot informativo, contada se ok)
  const totalEnviados =
    SLOTS_INFRA.filter((s) => urls[s.chave]).length +
    (faturaOk ? 1 : 0) +
    SLOTS_CLIENTE.filter((s) => urls[s.chave]).length +
    (ehPJ ? SLOTS_PJ.filter((s) => urls[s.chave]).length : 0) +
    (ehPJ ? socios.reduce((n, s) => n + (s.cnh_url ? 1 : 0) + (s.procuracao_url ? 1 : 0), 0) : 0)

  const totalRequeridos =
    SLOTS_INFRA.length + 1 + // +1 = fatura (obrigatória, vem do Passo 2)
    SLOTS_CLIENTE.length +
    (ehPJ ? SLOTS_PJ.length + socios.length * 2 : 0)

  const completos = !!documentosCompletosEm
  const progresso = totalRequeridos > 0 ? (totalEnviados / totalRequeridos) * 100 : 0

  return (
    <section className={`p-5 rounded-xl border ${completos ? 'bg-verde/5 border-verde/30' : 'bg-sol/5 border-sol/30'}`}>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className={`text-xs uppercase tracking-wider font-bold ${completos ? 'text-verde' : 'text-sol'}`}>
            📸 Documentos obrigatórios do consultor
          </h2>
          <p className="text-[10px] text-white/50 mt-0.5">
            {completos
              ? `✓ Completo — arquivos das etapas gerados automaticamente`
              : `Envie tudo pra liberar geração · Cliente ${ehPJ ? 'PJ' : 'PF'}`}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black ${completos ? 'text-verde' : 'text-sol'}`}>
            {totalEnviados}/{totalRequeridos}
          </p>
          <div className="w-24 h-1.5 bg-white/10 rounded-full mt-1 overflow-hidden">
            <div className={`h-full ${completos ? 'bg-verde' : 'bg-sol'} transition-all`}
              style={{ width: `${progresso}%` }} />
          </div>
        </div>
      </div>

      {/* Seção 1: Infraestrutura */}
      <SecaoDocs
        titulo="🏗️ Infraestrutura do imóvel"
        subtitulo="Fotos do local"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SLOTS_INFRA.map((slot) => (
            <SlotUpload key={slot.chave} homologacaoId={homologacaoId} slot={slot} urlAtual={urls[slot.chave] || null} />
          ))}
          {/* Fatura CELESC — informativo (vem do Passo 2 do projeto) */}
          <div className={`p-3 rounded-lg border ${faturaOk ? 'bg-verde/5 border-verde/30' : 'bg-coral/5 border-coral/30 border-dashed'}`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">PDF da fatura CELESC</p>
                <p className="text-[10px] text-white/50">
                  {faturaOk
                    ? '✓ Já anexada no Passo 2 do projeto'
                    : '⚠ Falta anexar — volte ao Passo 2'}
                </p>
              </div>
              {faturaOk && <span className="text-verde font-bold text-xs">✓</span>}
            </div>
            {projetoId && (
              <a
                href={`/projetos/${projetoId}/fatura`}
                className="mt-3 block text-center px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-white/70 hover:bg-white/10"
              >
                {faturaOk ? '👁️ Ver fatura no projeto' : '→ Anexar fatura no Passo 2'}
              </a>
            )}
          </div>
        </div>
      </SecaoDocs>

      {/* Seção 2: Cliente */}
      <SecaoDocs
        titulo={ehPJ ? '🪪 Documentos do representante' : '🪪 Documentos do cliente'}
        subtitulo={ehPJ ? 'Pessoa que assinará pela empresa' : 'CNH + procuração assinada digital'}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SLOTS_CLIENTE.map((slot) => (
            <SlotUpload key={slot.chave} homologacaoId={homologacaoId} slot={slot} urlAtual={urls[slot.chave] || null} />
          ))}
        </div>
      </SecaoDocs>

      {/* Seção 3: PJ (só se cliente for PJ) */}
      {ehPJ && (
        <>
          <SecaoDocs
            titulo="🏢 Documentos da empresa"
            subtitulo="Cartão CNPJ + contrato social"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SLOTS_PJ.map((slot) => (
                <SlotUpload key={slot.chave} homologacaoId={homologacaoId} slot={slot} urlAtual={urls[slot.chave] || null} />
              ))}
            </div>
          </SecaoDocs>

          <SecaoDocs
            titulo="👥 Sócios que precisam assinar"
            subtitulo="Cada sócio: documento (CNH/RG) + procuração assinada"
          >
            <SociosGerenciador
              homologacaoId={homologacaoId}
              socios={socios}
            />
          </SecaoDocs>
        </>
      )}

      {!completos && (
        <p className="mt-4 text-[10px] text-white/40 italic">
          🔒 Enquanto os documentos não estiverem completos, os arquivos das etapas ficam bloqueados.
        </p>
      )}
    </section>
  )
}

// ═══════════════════ SEÇÃO CONTAINER ═══════════════════
function SecaoDocs({ titulo, subtitulo, children }: {
  titulo: string; subtitulo: string; children: React.ReactNode
}) {
  return (
    <div className="mb-4 pb-4 border-b border-white/5 last:border-b-0 last:pb-0 last:mb-0">
      <div className="mb-2">
        <p className="text-xs uppercase font-bold text-white/70">{titulo}</p>
        <p className="text-[10px] text-white/40">{subtitulo}</p>
      </div>
      {children}
    </div>
  )
}

// ═══════════════════ SLOT DE UPLOAD ═══════════════════
function SlotUpload({
  homologacaoId, slot, urlAtual,
}: {
  homologacaoId: string
  slot: SlotDef
  urlAtual: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(file: File) {
    setErro(null)
    if (file.size > 10 * 1024 * 1024) { setErro('Arquivo > 10MB'); return }
    const base64 = await lerBase64(file)
    startTransition(async () => {
      const res = await uploadDocumentoHomologacaoAction({
        homologacaoId, tipo: slot.chave, arquivoBase64: base64, nomeOriginal: file.name,
      })
      if ('erro' in res && res.erro) setErro(res.erro)
    })
  }

  function remover() {
    if (!window.confirm(`Remover ${slot.label}?`)) return
    startTransition(async () => {
      await removerDocumentoHomologacaoAction({ homologacaoId, tipo: slot.chave })
    })
  }

  const eImagem = slot.accept.startsWith('image')
  const ePdfOuImg = slot.accept.includes('image/*') && slot.accept.includes('application/pdf')
  const enviado = !!urlAtual

  return (
    <div className={`p-3 rounded-lg border ${enviado ? 'bg-verde/5 border-verde/30' : 'bg-noite/40 border-white/10 border-dashed'}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{slot.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{slot.label}</p>
          <p className="text-[10px] text-white/50">{slot.desc}</p>
        </div>
        {enviado && <span className="text-verde font-bold text-xs">✓</span>}
      </div>

      {enviado ? (
        <div className="mt-3 space-y-2">
          {(eImagem || ePdfOuImg) && urlAtual?.match(/\.(jpg|jpeg|png|webp|heic)/i) && (
            <a href={urlAtual} target="_blank" rel="noreferrer" className="block">
              <img src={urlAtual} alt={slot.label} className="w-full h-32 object-cover rounded border border-white/10 hover:border-verde/40" />
            </a>
          )}
          <div className="flex gap-2 text-[10px]">
            <a href={urlAtual!} target="_blank" rel="noreferrer"
              className="flex-1 text-center px-2 py-1 bg-verde/20 border border-verde/40 rounded text-verde font-bold hover:bg-verde/30">
              📥 Ver
            </a>
            <button type="button" onClick={remover} disabled={isPending}
              className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white/60 hover:text-coral hover:border-coral/40" title="Remover">
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <label className={`block cursor-pointer text-center px-3 py-2 bg-sol/10 border border-sol/30 border-dashed rounded text-xs font-bold text-sol hover:bg-sol/20 ${isPending ? 'opacity-40 cursor-wait' : ''}`}>
            {isPending ? '⏳ Enviando...' : '+ Escolher arquivo'}
            <input type="file" accept={slot.accept} onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
              disabled={isPending} className="hidden" />
          </label>
        </div>
      )}
      {erro && <p className="text-[10px] text-coral mt-2">⚠️ {erro}</p>}
    </div>
  )
}

// ═══════════════════ GERENCIADOR DE SÓCIOS ═══════════════════
function SociosGerenciador({ homologacaoId, socios }: {
  homologacaoId: string
  socios: Socio[]
}) {
  const [novoNome, setNovoNome] = useState('')
  const [novoCpf, setNovoCpf] = useState('')
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function adicionar() {
    setErro(null)
    if (!novoNome.trim()) { setErro('Nome obrigatório'); return }
    startTransition(async () => {
      const res = await adicionarSocioAction({
        homologacaoId, nome: novoNome, cpf: novoCpf || undefined,
      })
      if ('erro' in res && res.erro) setErro(res.erro)
      else { setNovoNome(''); setNovoCpf('') }
    })
  }

  function remover(socioId: string) {
    if (!window.confirm('Remover este sócio?')) return
    startTransition(async () => {
      await removerSocioAction({ homologacaoId, socioId })
    })
  }

  return (
    <div className="space-y-3">
      {/* Lista dos sócios */}
      {socios.length === 0 && (
        <p className="text-xs text-white/40 italic text-center py-4 bg-noite/40 border border-dashed border-white/10 rounded">
          Nenhum sócio adicionado. Adicione pelo menos 1 abaixo.
        </p>
      )}
      {socios.map((s) => (
        <SocioCard key={s.id} homologacaoId={homologacaoId} socio={s} onRemover={() => remover(s.id)} />
      ))}

      {/* Form pra adicionar */}
      <div className="p-3 bg-noite/40 border border-white/10 rounded">
        <p className="text-[10px] uppercase text-white/50 mb-2">+ Adicionar sócio</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome do sócio *"
            className="col-span-2 px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40" />
          <input type="text" value={novoCpf} onChange={(e) => setNovoCpf(e.target.value)}
            placeholder="CPF (opcional)"
            className="px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button type="button" onClick={adicionar} disabled={isPending || !novoNome.trim()}
            className="px-3 py-1.5 bg-sol text-noite text-xs font-bold rounded hover:bg-sol/90 disabled:opacity-40">
            {isPending ? '⏳' : '+ Adicionar sócio'}
          </button>
          {erro && <p className="text-[10px] text-coral">⚠️ {erro}</p>}
        </div>
      </div>
    </div>
  )
}

function SocioCard({ homologacaoId, socio, onRemover }: {
  homologacaoId: string
  socio: Socio
  onRemover: () => void
}) {
  const cnhOk = !!socio.cnh_url
  const procOk = !!socio.procuracao_url
  const completo = cnhOk && procOk

  return (
    <div className={`p-3 rounded border ${completo ? 'bg-verde/5 border-verde/30' : 'bg-noite/40 border-white/10'}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-bold text-white flex items-center gap-2">
            👤 {socio.nome}
            {completo && <span className="text-verde">✓</span>}
          </p>
          {socio.cpf && <p className="text-[10px] text-white/50">CPF: {socio.cpf}</p>}
        </div>
        <button type="button" onClick={onRemover}
          className="text-[10px] text-coral/60 hover:text-coral">Remover</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <SlotSocio homologacaoId={homologacaoId} socioId={socio.id} campo="cnh_url"
          label="🪪 CNH/RG" urlAtual={socio.cnh_url} accept="application/pdf,image/*" />
        <SlotSocio homologacaoId={homologacaoId} socioId={socio.id} campo="procuracao_url"
          label="✍️ Procuração" urlAtual={socio.procuracao_url} accept="application/pdf" />
      </div>
    </div>
  )
}

function SlotSocio({ homologacaoId, socioId, campo, label, urlAtual, accept }: {
  homologacaoId: string
  socioId: string
  campo: 'cnh_url' | 'procuracao_url'
  label: string
  urlAtual?: string | null
  accept: string
}) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(file: File) {
    setErro(null)
    if (file.size > 10 * 1024 * 1024) { setErro('> 10MB'); return }
    const base64 = await lerBase64(file)
    startTransition(async () => {
      const res = await uploadDocumentoSocioAction({
        homologacaoId, socioId, campo, arquivoBase64: base64,
      })
      if ('erro' in res && res.erro) setErro(res.erro)
    })
  }

  return (
    <div className="text-xs">
      <p className="text-[10px] uppercase font-bold text-white/60 mb-1">{label}</p>
      {urlAtual ? (
        <a href={urlAtual} target="_blank" rel="noreferrer"
          className="inline-block px-2 py-1 bg-verde/20 border border-verde/40 rounded text-verde font-bold text-[10px] hover:bg-verde/30">
          📥 Enviado — ver
        </a>
      ) : (
        <label className={`block cursor-pointer text-center px-2 py-1.5 bg-sol/10 border border-sol/30 border-dashed rounded text-[10px] font-bold text-sol hover:bg-sol/20 ${isPending ? 'opacity-40' : ''}`}>
          {isPending ? '⏳' : '+ Enviar'}
          <input type="file" accept={accept} onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
            disabled={isPending} className="hidden" />
        </label>
      )}
      {erro && <p className="text-[9px] text-coral mt-1">⚠️ {erro}</p>}
    </div>
  )
}

// ═══════════════════ HELPERS ═══════════════════
function lerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Falha ao ler'))
    reader.readAsDataURL(file)
  })
}
