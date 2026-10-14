'use client'

import { useEffect, useRef, useState } from 'react'

export const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none'
export const lerNum = (s: string) => Number(String(s).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0

/** Campo numérico em pt-BR (vírgula decimal) que só devolve número. */
export function CampoNumero({ valor, onChange, casas = 0, className = inputCls, ...resto }: {
  valor: number; onChange: (n: number) => void; casas?: number; className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const fmt = (n: number) => (n ? n.toLocaleString('pt-BR', { maximumFractionDigits: Math.max(casas, 2) }) : '')
  const [txt, setTxt] = useState(fmt(valor))
  const editando = useRef(false)
  useEffect(() => { if (!editando.current) setTxt(fmt(valor)) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])
  return (
    <input {...resto} value={txt} inputMode="decimal" className={className}
      onFocus={() => { editando.current = true }}
      onBlur={() => { editando.current = false; setTxt(fmt(valor)) }}
      onChange={(e) => { setTxt(e.target.value); onChange(lerNum(e.target.value)) }} />
  )
}
