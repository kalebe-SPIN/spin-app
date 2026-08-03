'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { revisarDocumentoAction } from '@/app/admin/vagas/actions'

type Doc = {
  id: string
  tipo: string
  nome_arquivo: string
  status: string
  observacao: string | null
  enviado_em: string
  signedUrl: string | null
}

const ROTULO: Record<string, string> = {
  rg_cpf: 'RG e CPF (ou CNH)',
  comprovante_endereco: 'Comprovante de endereço',
  cnpj: 'CNPJ / Contrato social',
  dados_bancarios: 'Dados bancários / PIX',
}

export function RevisarDocsClient({ docs }: { docs: Doc[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function revisar(id: string, status: 'aprovado' | 'reprovado') {
    let obs: string | undefined
    if (status === 'reprovado') {
      obs = window.prompt('Motivo da reprovação (o candidato verá):') || undefined
    }
    startTransition(async () => {
      await revisarDocumentoAction(id, status, obs)
      router.refresh()
    })
  }

  if (docs.length === 0) {
    return <p className="text-white/40 text-sm">Nenhum documento enviado ainda.</p>
  }

  return (
    <div className="grid gap-3">
      {docs.map((d) => {
        const cor =
          d.status === 'aprovado' ? 'text-verde bg-verde/10 border-verde/25'
          : d.status === 'reprovado' ? 'text-coral bg-coral/10 border-coral/25'
          : 'text-white/50 bg-white/5 border-white/10'
        return (
          <div key={d.id} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">{ROTULO[d.tipo] || d.tipo}</p>
              <p className="text-white/50 text-xs truncate">{d.nome_arquivo}</p>
              {d.observacao && <p className="text-coral text-xs mt-1">Obs: {d.observacao}</p>}
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cor}`}>{d.status}</span>
            <div className="flex items-center gap-2">
              {d.signedUrl && (
                <a href={d.signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/80 hover:bg-white/10 transition-colors">
                  Ver / baixar
                </a>
              )}
              <button onClick={() => revisar(d.id, 'aprovado')} disabled={pending} className="text-xs px-3 py-1.5 bg-verde/15 border border-verde/40 text-verde rounded-lg hover:bg-verde/25 transition-colors disabled:opacity-50">
                Aprovar
              </button>
              <button onClick={() => revisar(d.id, 'reprovado')} disabled={pending} className="text-xs px-3 py-1.5 bg-coral/15 border border-coral/40 text-coral rounded-lg hover:bg-coral/25 transition-colors disabled:opacity-50">
                Reprovar
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
