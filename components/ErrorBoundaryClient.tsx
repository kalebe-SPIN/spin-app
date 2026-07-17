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
          <p className="text-xs uppercase font-bold text-coral mb-1">
            ⚠️ {this.props.nome || 'Componente'} não pôde renderizar
          </p>
          <p className="text-[10px] text-white/60">
            {this.state.erro.message || 'Erro desconhecido'}
          </p>
          <p className="text-[9px] text-white/40 mt-2">
            O restante da página continua funcionando.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
