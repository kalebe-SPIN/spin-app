/**
 * Ícones minimalistas (traço branco) no estilo dos botões do WhatsApp —
 * Kalebe 2026-09-29: substituem os emojis 📎📞📹 da caixa de mensagem.
 * SVG inline (sem biblioteca), herdam a cor via currentColor.
 */

type P = { className?: string; size?: number }

function Svg({ size = 20, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconeClipe = (p: P) => (
  <Svg {...p}>
    <path d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
  </Svg>
)

export const IconeTelefone = (p: P) => (
  <Svg {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  </Svg>
)

export const IconeVideo = (p: P) => (
  <Svg {...p}>
    <path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </Svg>
)

export const IconeMicrofone = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <path d="M12 18v4" />
  </Svg>
)

export const IconeEnviar = (p: P) => (
  <Svg {...p}>
    <path d="M22 2 11 13" />
    <path d="m22 2-7 20-4-9-9-4Z" />
  </Svg>
)

export const IconeAgenda = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M12 14v3l2 1" />
  </Svg>
)

export const IconeLixeira = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </Svg>
)

export const IconeCarregando = (p: P) => (
  <Svg {...p} className={`animate-spin ${p.className || ''}`}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Svg>
)
