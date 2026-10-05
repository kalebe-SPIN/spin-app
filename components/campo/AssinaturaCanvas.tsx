'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

/**
 * Quadro de assinatura (dedo ou caneta) — pointer events, nítido em tela
 * retina. Sempre fundo branco/traço escuro, independente do tema: é o que
 * vai pro registro da OS.
 */
export type AssinaturaRef = { limpar: () => void; paraBlob: () => Promise<Blob | null>; vazio: () => boolean }

export const AssinaturaCanvas = forwardRef<AssinaturaRef, { onMudou?: (vazio: boolean) => void }>(function AssinaturaCanvas({ onMudou }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  const tracos = useRef(0)

  function preparar() {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, r.width, r.height)
    ctx.strokeStyle = '#0B1B2B'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    tracos.current = 0
    onMudou?.(true)
  }

  useEffect(() => { preparar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    limpar: preparar,
    vazio: () => tracos.current < 8,
    paraBlob: () => new Promise((ok) => {
      const c = canvasRef.current
      if (!c || tracos.current < 8) return ok(null)
      c.toBlob((b) => ok(b), 'image/png')
    }),
  }))

  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  return (
    <canvas
      ref={canvasRef}
      className="tema-fixo w-full h-44 rounded-lg border-2 border-dashed border-white/25 bg-white touch-none cursor-crosshair"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        desenhando.current = true
        ultimo.current = ponto(e)
      }}
      onPointerMove={(e) => {
        if (!desenhando.current || !ultimo.current) return
        const ctx = e.currentTarget.getContext('2d')!
        const p = ponto(e)
        ctx.beginPath()
        ctx.moveTo(ultimo.current.x, ultimo.current.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ultimo.current = p
        tracos.current++
        if (tracos.current === 8) onMudou?.(false)
      }}
      onPointerUp={() => { desenhando.current = false; ultimo.current = null }}
      onPointerCancel={() => { desenhando.current = false; ultimo.current = null }}
    />
  )
})
