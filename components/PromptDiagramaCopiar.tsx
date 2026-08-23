'use client'

import { useState, useTransition } from 'react'
import { montarPromptDiagramaAction } from '@/app/projetos/[id]/diagrama/actions'

/**
 * Bloco alternativo pra gerar diagrama: em vez de acionar o pipeline no
 * Vercel (que pode dar timeout / erro de modelo / limite), monta o prompt
 * COMPLETO com todos os dados do projeto pro Kalebe copiar e colar no chat
 * (Claude Code local com skill Python, ChatGPT, o que preferir), gerar o
 * PDF lá e voltar aqui pra subir via bloco "Enviar arquivo pronto".
 *
 * Útil como fallback manual quando o pipeline automatizado falha.
 */
export function PromptDiagramaCopiar({
  projetoId,
  tipoDesenho,
}: {
  projetoId: string
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao'
}) {
  const [pending, startTransition] = useTransition()
  const [prompt, setPrompt] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  function gerar() {
    setErro(null)
    setCopiado(false)
    startTransition(async () => {
      const r = await montarPromptDiagramaAction(projetoId, tipoDesenho)
      if ('erro' in r) setErro(r.erro)
      else setPrompt(r.prompt)
    })
  }

  async function copiar() {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 3000)
    } catch {
      setErro('Não consegui copiar. Selecione o texto abaixo manualmente.')
    }
  }

  return (
    <details className="bg-white/[0.02] border border-white/10 rounded-xl">
      <summary className="cursor-pointer p-4 flex items-center gap-2 text-sm text-white/70 hover:bg-white/[0.02] rounded-xl">
        <span>💬</span>
        <span>Preferir gerar em outro chat? Copiar prompt com todos os dados</span>
      </summary>
      <div className="px-6 pb-6 pt-2 space-y-3">
        <p className="text-[11px] text-white/50">
          Monta um texto completo com <strong className="text-white/70">todos os dados do projeto</strong>
          {' '}+ regras SPIN + padrão gráfico. Cola no chat da sua preferência
          (Claude Code local com skill projetista-spin em Python, ChatGPT, Gemini, etc.),
          ele gera o PDF e você sobe aqui usando "Já tem o arquivo pronto?".
        </p>

        {!prompt && (
          <button
            type="button"
            onClick={gerar}
            disabled={pending}
            className="px-4 py-2 bg-white/10 border border-white/20 text-white text-xs font-bold rounded-lg disabled:opacity-40"
          >
            {pending ? '⏳ Montando prompt…' : '📝 Montar prompt'}
          </button>
        )}

        {prompt && (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copiar}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
                  copiado
                    ? 'bg-verde text-noite'
                    : 'bg-sol text-noite hover:bg-sol/90'
                }`}
              >
                {copiado ? '✓ Copiado!' : '📋 Copiar prompt'}
              </button>
              <button
                type="button"
                onClick={() => { setPrompt(null); setCopiado(false) }}
                className="px-3 py-2 text-xs text-white/60 hover:text-white/80"
              >
                Fechar
              </button>
              <span className="text-[10px] text-white/40 ml-auto">
                {prompt.length.toLocaleString('pt-BR')} caracteres
              </span>
            </div>
            <textarea
              readOnly
              value={prompt}
              className="w-full h-64 bg-noite/60 border border-white/10 rounded-lg p-3 text-[10px] text-white/70 font-mono resize-y"
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-[10px] text-white/40 italic">
              💡 Foca no textarea e Ctrl+A / Ctrl+C se o botão copiar falhar (alguns browsers bloqueiam clipboard).
            </p>
          </>
        )}

        {erro && (
          <div className="bg-coral/10 border border-coral/30 rounded-lg p-2 text-xs text-coral">
            ❌ {erro}
          </div>
        )}
      </div>
    </details>
  )
}
