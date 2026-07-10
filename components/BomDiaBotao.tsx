'use client'

import { useState, useEffect, useRef } from 'react'

type Estado = 'idle' | 'carregando' | 'falando'

export function BomDiaBotao() {
  const [estado, setEstado] = useState<Estado>('idle')
  const [erro, setErro] = useState<string | null>(null)
  const [suportaFala, setSuportaFala] = useState(false)
  const [textoAtual, setTextoAtual] = useState<string | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSuportaFala('speechSynthesis' in window)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.speechSynthesis?.cancel()
      }
    }
  }, [])

  async function tocar() {
    if (estado !== 'idle') return
    setErro(null)
    setEstado('carregando')

    try {
      const res = await fetch('/api/bianca/resumo-diario', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro')

      const texto = data.resumo as string
      setTextoAtual(texto)

      const synth = window.speechSynthesis
      synth.cancel()

      const utter = new SpeechSynthesisUtterance(texto)
      utter.lang = 'pt-BR'
      utter.rate = 1.05
      utter.pitch = 1.05

      // Tenta escolher voz feminina brasileira
      const vozes = synth.getVoices()
      const vozBR = vozes.find(v =>
        v.lang.startsWith('pt') &&
        (v.name.toLowerCase().includes('female') ||
         v.name.toLowerCase().includes('feminin') ||
         v.name.toLowerCase().includes('luciana') ||
         v.name.toLowerCase().includes('maria') ||
         v.name.toLowerCase().includes('google'))
      ) || vozes.find(v => v.lang.startsWith('pt'))
      if (vozBR) utter.voice = vozBR

      utter.onend = () => {
        setEstado('idle')
        setTimeout(() => setTextoAtual(null), 6000)
      }
      utter.onerror = () => {
        setErro('Erro ao reproduzir áudio')
        setEstado('idle')
      }

      utteranceRef.current = utter
      synth.speak(utter)
      setEstado('falando')
    } catch (e: any) {
      setErro(e.message || 'Erro')
      setEstado('idle')
    }
  }

  function parar() {
    window.speechSynthesis?.cancel()
    setEstado('idle')
  }

  if (!suportaFala) return null

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={estado === 'falando' ? parar : tocar}
        disabled={estado === 'carregando'}
        className={`px-4 py-2 rounded-lg text-sm font-bold transition border ${
          estado === 'falando'
            ? 'bg-coral/20 border-coral/50 text-coral hover:bg-coral/30 animate-pulse'
            : estado === 'carregando'
            ? 'bg-white/5 border-white/20 text-white/40 cursor-wait'
            : 'bg-sol/20 border-sol/50 text-sol hover:bg-sol/30'
        }`}
        title="Bianca lê seu resumo do dia"
      >
        {estado === 'falando' && '⏹ Parar Bianca'}
        {estado === 'carregando' && '⏳ Pensando...'}
        {estado === 'idle' && '🔊 Bom dia Bianca'}
      </button>

      {textoAtual && estado === 'falando' && (
        <div className="max-w-md text-xs text-white/60 bg-noite/40 border border-sol/20 rounded p-2 leading-relaxed">
          {textoAtual}
        </div>
      )}

      {erro && (
        <p className="text-[10px] text-coral">{erro}</p>
      )}
    </div>
  )
}
