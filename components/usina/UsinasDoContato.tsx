'use client'

import { useEffect, useState } from 'react'
import { usinasDoContatoAction, salvarUsinaContatoAction, verSenhaUsinaContatoAction } from '@/app/inbox/usina-actions'
import type { UsinaTela } from '@/lib/usinas/usina'
import { UsinaCard } from './UsinaCard'

/** Usinas do cliente no perfil do Spinzap (Kalebe 2026-10-22) — uma por projeto. */
export function UsinasDoContato({ conversaId }: { conversaId: string }) {
  const [usinas, setUsinas] = useState<UsinaTela[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = () => usinasDoContatoAction(conversaId).then((r) => { if ('erro' in r) setErro(r.erro); else { setErro(null); setUsinas(r.usinas) } })
  useEffect(() => { carregar() }, [conversaId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <p className="text-[12px] text-white/70 border border-white/10 rounded-lg px-3 py-2">☀️ Usina: {erro}</p>
  if (!usinas) return <p className="text-[11px] text-white/40">Carregando a usina…</p>
  if (!usinas.length) return <p className="text-[11px] text-white/40">☀️ Usina: nenhum projeto com kit ainda.</p>
  return (
    <div className="space-y-3">
      {usinas.map((u) => (
        <UsinaCard
          key={`${u.projeto_id}-${u.atualizado_em || 'novo'}`}
          usina={u}
          onSalvar={async (dados, senha) => {
            const r = await salvarUsinaContatoAction(conversaId, u.projeto_id, dados, senha)
            if ('sucesso' in r) await carregar()
            return r
          }}
          onVerSenha={() => verSenhaUsinaContatoAction(conversaId, u.projeto_id)}
        />
      ))}
    </div>
  )
}
