'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { assinarContratoAction } from '@/app/vaga/actions'

function formatarCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/**
 * Bloco de assinatura eletrônica do contrato.
 * Captura nome + CPF + aceite e envia o texto do contrato pro server (que
 * gera o hash e grava a trilha de auditoria).
 */
export function AssinaturaContrato({
  textoContrato,
  nomeSugerido,
}: {
  textoContrato: string
  nomeSugerido: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [nome, setNome] = useState(nomeSugerido || '')
  const [cpf, setCpf] = useState('')
  const [aceite, setAceite] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function assinar() {
    setErro(null)
    startTransition(async () => {
      const res = await assinarContratoAction({ nome, cpf, textoContrato, aceite })
      if ('erro' in res) { setErro(res.erro); return }
      router.push('/vaga/documentos')
      router.refresh()
    })
  }

  return (
    <div className="p-6 md:p-8 bg-white/[0.03] border border-white/10 rounded-2xl">
      <h3 className="text-xl font-black text-white mb-1">Assinar contrato</h3>
      <p className="text-white/55 text-sm mb-6">
        Assinatura eletrônica com trilha de auditoria (nome, CPF, data/hora, IP e hash do documento).
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="nome" className="text-sm font-semibold text-white/80">Nome completo</label>
          <input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Como está no seu documento"
            className="input-spin"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="cpf" className="text-sm font-semibold text-white/80">CPF</label>
          <input
            id="cpf"
            value={cpf}
            onChange={(e) => setCpf(formatarCpf(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            className="input-spin"
          />
        </div>
      </div>

      <label className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/10 rounded-xl cursor-pointer mb-4">
        <input
          type="checkbox"
          checked={aceite}
          onChange={(e) => setAceite(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#F5B400]"
        />
        <span className="text-sm text-white/70 leading-relaxed">
          Declaro que li e concordo integralmente com os termos deste Contrato de Representação Comercial e
          assino eletronicamente, nos termos da MP 2.200-2/2001 e da Lei 14.063/2020.
        </span>
      </label>

      {erro && (
        <div className="px-4 py-3 mb-4 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">{erro}</div>
      )}

      <button
        onClick={assinar}
        disabled={pending}
        className="w-full px-8 py-4 bg-sol text-noite-0 font-black text-lg rounded-xl hover:bg-sol-claro transition-colors disabled:opacity-50 shadow-lg shadow-sol/20"
      >
        {pending ? 'Registrando assinatura...' : 'Assinar e seguir para os documentos →'}
      </button>
    </div>
  )
}
