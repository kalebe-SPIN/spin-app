'use client'

import { useState, useEffect, useRef } from 'react'

type Estado = 'idle' | 'carregando' | 'falando'

const VOZ_PREFERIDA_KEY = 'bianca_voz_preferida'

// Vozes femininas conhecidas em pt-BR (Windows, macOS, Chrome, Android)
const NOMES_FEMININOS = [
  'maria', 'luciana', 'fernanda', 'camila', 'paulina', 'joana',
  'flora', 'francisca', 'raquel', 'thalita', 'letícia', 'letitia',
]
const NOMES_MASCULINOS = [
  'daniel', 'ricardo', 'felipe', 'antonio', 'antônio', 'jorge',
  'diego', 'joão', 'joao', 'paulo',
]

function escolherVozFeminina(vozes: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const preferida = typeof window !== 'undefined' ? localStorage.getItem(VOZ_PREFERIDA_KEY) : null
  if (preferida) {
    const p = vozes.find(v => v.name === preferida)
    if (p) return p
  }

  const ptVozes = vozes.filter(v => v.lang.toLowerCase().startsWith('pt'))
  if (ptVozes.length === 0) return null

  const nome = (v: SpeechSynthesisVoice) => v.name.toLowerCase()

  // 1. Nome feminino explícito
  const nomeFem = ptVozes.find(v => NOMES_FEMININOS.some(n => nome(v).includes(n)))
  if (nomeFem) return nomeFem

  // 2. "female" no nome
  const female = ptVozes.find(v => nome(v).includes('female'))
  if (female) return female

  // 3. Google pt-BR (padrão feminino no Chrome)
  const google = ptVozes.find(v => nome(v).includes('google') && v.lang === 'pt-BR')
  if (google) return google

  // 4. Qualquer pt-BR que NÃO seja nome masculino conhecido
  const semMasc = ptVozes.find(v =>
    v.lang === 'pt-BR' && !NOMES_MASCULINOS.some(n => nome(v).includes(n)),
  )
  if (semMasc) return semMasc

  // Fallback
  return ptVozes.find(v => v.lang === 'pt-BR') || ptVozes[0]
}

export function BomDiaBotao() {
  const [estado, setEstado] = useState<Estado>('idle')
  const [erro, setErro] = useState<string | null>(null)
  const [suportaFala, setSuportaFala] = useState(false)
  const [textoAtual, setTextoAtual] = useState<string | null>(null)
  const [vozes, setVozes] = useState<SpeechSynthesisVoice[]>([])
  const [mostrarSelector, setMostrarSelector] = useState(false)
  const [vozAtualNome, setVozAtualNome] = useState<string>('')
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setSuportaFala('speechSynthesis' in window)

    function carregar() {
      const vs = window.speechSynthesis.getVoices()
      setVozes(vs)
      const escolhida = escolherVozFeminina(vs)
      if (escolhida) setVozAtualNome(escolhida.name)
    }
    carregar()
    window.speechSynthesis.addEventListener('voiceschanged', carregar)

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', carregar)
      window.speechSynthesis?.cancel()
    }
  }, [])

  function trocarVoz(nome: string) {
    localStorage.setItem(VOZ_PREFERIDA_KEY, nome)
    setVozAtualNome(nome)
    // Fala uma frase de teste
    const synth = window.speechSynthesis
    synth.cancel()
    const utter = new SpeechSynthesisUtterance('Oi Kalebe, essa é minha voz de agora.')
    utter.lang = 'pt-BR'
    utter.rate = 1.05
    const v = vozes.find(x => x.name === nome)
    if (v) utter.voice = v
    synth.speak(utter)
  }

  const vozesPT = vozes.filter(v => v.lang.toLowerCase().startsWith('pt'))

  async function tocar() {
    if (estado !== 'idle') return
    setErro(null)
    setEstado('carregando')

    try {
      const res = await fetch('/api/bianca/resumo-diario', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        const acao = data.error_acao ? ` — ${data.error_acao}` : ''
        throw new Error((data.error || 'Erro na Bianca') + acao)
      }

      const texto = data.resumo as string
      setTextoAtual(texto)

      const synth = window.speechSynthesis
      synth.cancel()

      const utter = new SpeechSynthesisUtterance(texto)
      utter.lang = 'pt-BR'
      utter.rate = 1.05
      utter.pitch = 1.1

      const voz = escolherVozFeminina(vozes)
      if (voz) {
        utter.voice = voz
        setVozAtualNome(voz.name)
      }

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
      <div className="flex items-center gap-2">
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
        {vozesPT.length > 1 && (
          <button
            onClick={() => setMostrarSelector(!mostrarSelector)}
            className="text-[10px] px-2 py-1 bg-white/5 border border-white/10 rounded text-white/60 hover:bg-white/10"
            title="Escolher voz"
          >
            ⚙️
          </button>
        )}
      </div>

      {mostrarSelector && vozesPT.length > 0 && (
        <div className="bg-noite/80 border border-white/10 rounded-lg p-2 space-y-1 max-w-xs">
          <p className="text-[10px] uppercase font-bold text-white/50 mb-1">Escolher voz da Bianca</p>
          {vozesPT.map((v) => (
            <button
              key={v.name}
              onClick={() => trocarVoz(v.name)}
              className={`w-full text-left text-[11px] px-2 py-1 rounded ${
                vozAtualNome === v.name
                  ? 'bg-sol/20 text-sol border border-sol/40'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {vozAtualNome === v.name && '✓ '}{v.name}
            </button>
          ))}
          <p className="text-[9px] text-white/40 pt-1 mt-1 border-t border-white/10">
            Escolha e ela fala uma frase de teste. Fica salvo no navegador.
          </p>
        </div>
      )}

      {textoAtual && estado === 'falando' && (
        <div className="max-w-md text-xs text-white/60 bg-noite/40 border border-sol/20 rounded p-2 leading-relaxed">
          {textoAtual}
        </div>
      )}

      {erro && (
        <div className="max-w-md text-[11px] text-coral bg-coral/10 border border-coral/30 rounded p-2 leading-relaxed">
          ⚠️ {erro}
        </div>
      )}
    </div>
  )
}
