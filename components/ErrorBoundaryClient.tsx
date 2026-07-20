'use client'

import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; nome?: string; onErro?: ReactNode }
type State = { erro: Error | null }

/**
 * Error boundary client-side genérico pra isolar seções da UI.
 * Se um componente estourar, o resto da página continua renderizando.
 */
export class ErrorBoundaryClient extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error) {
    console.error(`[ErrorBoundary${this.props.nome ? ` ${this.props.nome}` : ''}]`, erro)
  }

  render() {
    if (this.state.erro) {
      return this.props.onErro || (
        <div className="p-4 bg-coral/10 border border-coral/30 rounded-xl">
          <p className="text-xs uppercase font-bold text-coral mb-2">
            ⚠️ {this.props.nome || 'Componente'} não pôde renderizar
          </p>
          <p className="text-xs text-white font-bold">
            {this.state.erro.message || 'Erro sem mensagem'}
          </p>
          {this.state.erro.stack && (
            <details className="mt-2">
              <summary className="text-[10px] text-white/50 cursor-pointer hover:text-white/80">
                Ver stack técnico (pra debug)
              </summary>
              <pre className="mt-1 text-[9px] text-white/40 whitespace-pre-wrap break-all font-mono max-h-40 overflow-y-auto">
                {this.state.erro.stack.slice(0, 800)}
              </pre>
            </details>
          )}
          <p className="text-[10px] text-white/40 mt-3 italic">
            O restante da página continua funcionando.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
