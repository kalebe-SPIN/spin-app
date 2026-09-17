'use client'

import { useState } from 'react'
import { ChatParEmpresa } from '@/components/agenda/ChatParEmpresa'
import type { Responsavel } from './RelacionamentoDuasColunas'

/**
 * Kalebe 2026-09-17: modal de chat interno entre usuários Spin.
 * Sidebar lista os perfis ativos, área principal abre chat par-a-par
 * (reusa ChatParEmpresa que já existe pra vendedor ↔ campo).
 *
 * Aberto pelo botão "💬 Equipe" no card de Relacionamento.
 * TODO próxima iteração: envio de arquivos + criar tarefa direto
 * do chat (mencionando o par).
 */

type Props = {
  aberto: boolean
  onFechar: () => void
  meuId: string
  meuNome: string
  usuarios: Responsavel[]
}

export function ChatEquipeModal({ aberto, onFechar, meuId, meuNome, usuarios }: Props) {
  const outros = usuarios.filter((u) => u.id !== meuId)
  const [peerId, setPeerId] = useState<string | null>(outros[0]?.id || null)

  if (!aberto) return null
  const peer = outros.find((u) => u.id === peerId)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        className="bg-noite border border-weg-azul/30 rounded-xl w-full max-w-4xl h-[600px] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar de usuários */}
        <aside className="w-56 border-r border-white/10 flex flex-col">
          <header className="p-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">👥 Equipe</p>
              <p className="text-[10px] text-white/50">{outros.length} pessoas</p>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white text-lg leading-none"
              title="Fechar"
            >
              ×
            </button>
          </header>
          <div className="flex-1 overflow-y-auto">
            {outros.length === 0 ? (
              <p className="p-4 text-xs text-white/40">Ninguém mais cadastrado ainda.</p>
            ) : (
              outros.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setPeerId(u.id)}
                  className={`w-full text-left px-3 py-2 border-b border-white/5 hover:bg-white/5 transition ${
                    u.id === peerId ? 'bg-weg-azul/15 border-l-2 border-l-weg-azul' : ''
                  }`}
                >
                  <p className="text-xs font-semibold text-white truncate">{u.nome}</p>
                  <p className="text-[10px] text-white/50 uppercase">{u.role}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Área do chat */}
        <main className="flex-1 flex flex-col">
          {peer ? (
            <>
              <header className="p-3 border-b border-white/10">
                <p className="text-xs font-bold text-white">💬 Conversa com {peer.nome}</p>
                <p className="text-[10px] text-white/50">
                  Chat interno · não passa pelo WhatsApp
                </p>
              </header>
              <div className="flex-1 min-h-0 overflow-hidden p-3">
                {/* ChatParEmpresa se auto-recarrega via polling — não precisa passar msgs */}
                <ChatParEmpresa meuId={meuId} peerId={peer.id} peerNome={peer.nome} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-white/40">
              Escolhe alguém na lista pra conversar.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
