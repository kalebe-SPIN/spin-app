'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  criarCriativoAction,
  editarCriativoAction,
  toggleAtivoCriativoAction,
  excluirCriativoAction,
  type CriativoTipo,
} from '@/app/admin/criativos/actions'

export type CriativoRow = {
  id: string
  tipo: CriativoTipo
  titulo: string
  descricao: string | null
  categoria: string | null
  arquivo_url: string | null
  texto: string | null
  mensagem_whatsapp_template: string | null
  ativo: boolean
  criado_em: string
}

const TIPOS: { id: CriativoTipo; label: string; emoji: string; accept: string }[] = [
  { id: 'imagem', label: 'Imagem', emoji: '🖼', accept: 'image/*' },
  { id: 'video',  label: 'Vídeo',  emoji: '🎬', accept: 'video/*' },
  { id: 'pdf',    label: 'PDF',    emoji: '📄', accept: 'application/pdf' },
  { id: 'texto',  label: 'Texto',  emoji: '💬', accept: '' },
]

export function CriativosAdminClient({
  criativos, bucketPublicUrl,
}: {
  criativos: CriativoRow[]
  bucketPublicUrl: string
}) {
  const [modoNovo, setModoNovo] = useState(false)

  return (
    <div className="space-y-6">
      {!modoNovo && (
        <button
          onClick={() => setModoNovo(true)}
          className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro"
        >
          + Novo criativo
        </button>
      )}

      {modoNovo && (
        <FormNovo onFechar={() => setModoNovo(false)} />
      )}

      <div>
        <h2 className="text-sm uppercase tracking-wider font-bold text-white/60 mb-3">
          Criativos cadastrados ({criativos.length})
        </h2>
        {criativos.length === 0 ? (
          <p className="text-sm text-white/40 italic">Nenhum criativo ainda. Clica em "Novo criativo".</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {criativos.map((c) => (
              <CardCriativo key={c.id} criativo={c} bucketPublicUrl={bucketPublicUrl} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FormNovo({ onFechar }: { onFechar: () => void }) {
  const router = useRouter()
  const [tipo, setTipo] = useState<CriativoTipo>('imagem')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [texto, setTexto] = useState('')
  const [msgWa, setMsgWa] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  async function uploadArquivo(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${tipo}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('criativos-vendas').upload(path, file, {
      cacheControl: '3600', upsert: false,
    })
    if (error) { setErro(`Upload falhou: ${error.message}`); return null }
    return path
  }

  async function salvar() {
    setErro(null)
    if (!titulo.trim()) { setErro('Título obrigatório'); return }
    if (tipo === 'texto' && !texto.trim()) { setErro('Escreve o conteúdo do texto'); return }
    if (tipo !== 'texto' && !arquivo) { setErro('Escolhe o arquivo'); return }

    let arquivoPath: string | null = null
    if (tipo !== 'texto' && arquivo) {
      setUploading(true)
      arquivoPath = await uploadArquivo(arquivo)
      setUploading(false)
      if (!arquivoPath) return
    }

    startTransition(async () => {
      const r = await criarCriativoAction({
        tipo,
        titulo,
        descricao: descricao || null,
        categoria: categoria || null,
        arquivo_url: arquivoPath,
        texto: tipo === 'texto' ? texto : null,
        mensagem_whatsapp_template: msgWa || null,
      })
      if (r?.erro) { setErro(r.erro); return }
      router.refresh()
      onFechar()
    })
  }

  const tipoInfo = TIPOS.find((t) => t.id === tipo)!

  return (
    <div className="p-5 bg-white/[0.03] border border-sol/25 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white font-bold">Novo criativo</p>
        <button onClick={onFechar} className="text-white/50 hover:text-white text-xl">×</button>
      </div>

      <Field label="Tipo">
        <div className="grid grid-cols-4 gap-2">
          {TIPOS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTipo(t.id)}
              className={`px-2 py-2 text-xs font-bold border rounded transition ${
                tipo === t.id ? 'bg-sol text-noite-0 border-sol' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
              }`}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Título" obrigatorio>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex: Antes/Depois — telhado Marmoraria Tijucas"
          className="input" />
      </Field>

      <Field label="Categoria (opcional)">
        <input value={categoria} onChange={(e) => setCategoria(e.target.value)}
          placeholder="Ex: prospeccao · case · depoimento · limpeza · revisao"
          className="input" />
      </Field>

      <Field label="Descrição (opcional)">
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2}
          className="input" />
      </Field>

      {tipo === 'texto' ? (
        <Field label="Conteúdo do texto" obrigatorio>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
            placeholder="A mensagem que o vendedor vai enviar."
            className="input" />
        </Field>
      ) : (
        <Field label={`Arquivo (${tipoInfo.label})`} obrigatorio>
          <input type="file" accept={tipoInfo.accept}
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            className="w-full text-sm text-white/70 file:mr-3 file:px-3 file:py-1.5 file:bg-sol/20 file:border file:border-sol/40 file:text-sol file:font-bold file:rounded file:cursor-pointer" />
          {arquivo && <p className="text-[11px] text-verde mt-1">✓ {arquivo.name}</p>}
        </Field>
      )}

      <Field label="Mensagem WhatsApp (opcional)">
        <textarea value={msgWa} onChange={(e) => setMsgWa(e.target.value)} rows={3}
          placeholder="Ex: Oi {cliente_nome}! Olha esse case da SPIN: {link}. Faz sentido pra você?"
          className="input" />
        <p className="text-[11px] text-white/40 mt-1">
          Variáveis: <code className="text-sol">{'{cliente_nome}'}</code> e <code className="text-sol">{'{link}'}</code>.
          Se ficar vazio, o vendedor edita na hora.
        </p>
      </Field>

      {erro && <p className="text-sm text-coral">{erro}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onFechar} className="px-3 py-2 text-sm text-white/60 hover:text-white">Cancelar</button>
        <button onClick={salvar} disabled={isPending || uploading}
          className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro disabled:opacity-50">
          {uploading ? 'Enviando arquivo...' : isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 0.5rem;
          color: white;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  )
}

function CardCriativo({ criativo, bucketPublicUrl }: { criativo: CriativoRow; bucketPublicUrl: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState(criativo.titulo)
  const [msgWa, setMsgWa] = useState(criativo.mensagem_whatsapp_template || '')
  const [texto, setTexto] = useState(criativo.texto || '')

  const url = criativo.arquivo_url ? `${bucketPublicUrl}/${criativo.arquivo_url}` : null

  function toggle() {
    startTransition(async () => {
      await toggleAtivoCriativoAction(criativo.id, !criativo.ativo)
      router.refresh()
    })
  }

  function excluir() {
    if (!confirm(`Excluir "${criativo.titulo}"? Isso não apaga o arquivo do Storage.`)) return
    startTransition(async () => {
      await excluirCriativoAction(criativo.id)
      router.refresh()
    })
  }

  function salvarEdicao() {
    startTransition(async () => {
      await editarCriativoAction(criativo.id, {
        titulo,
        mensagem_whatsapp_template: msgWa || null,
        texto: criativo.tipo === 'texto' ? texto : undefined,
      })
      setEditando(false)
      router.refresh()
    })
  }

  const tipoInfo = TIPOS.find((t) => t.id === criativo.tipo)

  return (
    <div className={`bg-noite/60 border rounded-lg overflow-hidden ${criativo.ativo ? 'border-white/10' : 'border-white/5 opacity-50'}`}>
      {/* Preview */}
      {criativo.tipo === 'imagem' && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={criativo.titulo} className="w-full h-40 object-cover bg-black/40" />
      )}
      {criativo.tipo === 'video' && url && (
        <video src={url} controls className="w-full h-40 object-cover bg-black/40" />
      )}
      {criativo.tipo === 'pdf' && url && (
        <div className="h-40 bg-white/5 relative">
          <embed src={`${url}#page=1&view=Fit&toolbar=0&navpanes=0`} type="application/pdf" className="w-full h-full pointer-events-none" />
          <a href={url} target="_blank" rel="noopener" className="absolute inset-0 opacity-0 hover:opacity-100 bg-noite/60 flex items-center justify-center text-xs text-sol font-bold transition">
            🔗 Abrir em nova aba
          </a>
        </div>
      )}
      {criativo.tipo === 'texto' && (
        <div className="h-40 p-3 bg-white/[0.03] overflow-y-auto text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
          {criativo.texto}
        </div>
      )}

      <div className="p-3 space-y-1">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-bold text-white truncate">{tipoInfo?.emoji} {criativo.titulo}</p>
          <button onClick={toggle} disabled={isPending}
            className={`text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0 ${
              criativo.ativo ? 'bg-verde/15 text-verde border border-verde/30' : 'bg-white/5 text-white/40 border border-white/10'
            }`}>
            {criativo.ativo ? 'ativo' : 'inativo'}
          </button>
        </div>
        {criativo.categoria && (
          <p className="text-[10px] text-sol">🏷 {criativo.categoria}</p>
        )}
        {criativo.mensagem_whatsapp_template && (
          <p className="text-[10px] text-white/40 truncate">💬 {criativo.mensagem_whatsapp_template}</p>
        )}

        {editando ? (
          <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full px-2 py-1 bg-white/5 border border-white/15 rounded text-xs text-white" />
            {criativo.tipo === 'texto' && (
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} className="w-full px-2 py-1 bg-white/5 border border-white/15 rounded text-xs text-white" />
            )}
            <textarea value={msgWa} onChange={(e) => setMsgWa(e.target.value)} rows={2}
              placeholder="Mensagem WhatsApp"
              className="w-full px-2 py-1 bg-white/5 border border-white/15 rounded text-xs text-white" />
            <div className="flex gap-1">
              <button onClick={() => setEditando(false)} className="flex-1 text-[10px] px-2 py-1 bg-white/5 rounded text-white/70">Cancelar</button>
              <button onClick={salvarEdicao} disabled={isPending} className="flex-1 text-[10px] px-2 py-1 bg-sol text-noite-0 font-bold rounded">Salvar</button>
            </div>
          </div>
        ) : (
          <div className="mt-2 pt-2 border-t border-white/10 flex gap-1">
            <button onClick={() => setEditando(true)} className="flex-1 text-[10px] px-2 py-1 bg-white/5 border border-white/10 rounded text-white/70 hover:bg-white/10">
              ✏ Editar
            </button>
            <button onClick={excluir} disabled={isPending} className="text-[10px] px-2 py-1 bg-coral/10 border border-coral/25 rounded text-coral hover:bg-coral/20">
              🗑
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, obrigatorio, children }: { label: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-1">
        {label} {obrigatorio && <span className="text-coral">*</span>}
      </label>
      {children}
    </div>
  )
}
