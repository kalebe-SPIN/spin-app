'use client'

import { useEffect, useState } from 'react'
import { dadosUsinaProjetoAction, salvarUsinaProjetoAction, verSenhaUsinaProjetoAction } from '@/app/projetos/[id]/usina/actions'
import type { UsinaTela } from '@/lib/usinas/usina'
import { UsinaCard } from './UsinaCard'

/** Usina na tela do projeto (Kalebe 2026-10-22). */
export function UsinaProjeto({ projetoId }: { projetoId: string }) {
  const [usina, setUsina] = useState<UsinaTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = () => dadosUsinaProjetoAction(projetoId).then((r) => { if ('erro' in r) setErro(r.erro); else { setErro(null); setUsina(r) } })
  useEffect(() => { carregar() }, [projetoId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <p className="mb-6 text-[12px] text-white/70 border border-white/10 rounded-xl px-3 py-2">☀️ Usina: {erro}</p>
  if (!usina) return null
  return (
    <UsinaCard
      key={usina.atualizado_em || 'novo'}
      usina={usina}
      onSalvar={async (dados, senha) => {
        const r = await salvarUsinaProjetoAction(projetoId, dados, senha)
        if ('sucesso' in r) await carregar()
        return r
      }}
      onVerSenha={() => verSenhaUsinaProjetoAction(projetoId)}
    />
  )
}
