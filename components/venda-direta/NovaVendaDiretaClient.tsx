'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FormDadosVendaDireta, inputCls } from './FormDadosVendaDireta'
import { dadosVazios, validarDadosVendaDireta, type DadosVendaDireta } from '@/lib/venda-direta/tipos'
import { buscarClienteVendaDiretaAction, criarVendaDiretaAction } from '@/app/venda-direta/actions'

export function NovaVendaDiretaClient({
  usuarioId,
  vendedores,
}: {
  usuarioId: string
  vendedores: Array<{ id: string; nome: string; papel: string }>
}) {
  const router = useRouter()
  const [dados, setDados] = useState<DadosVendaDireta>(dadosVazios())
  const [vendedorId, setVendedorId] = useState(usuarioId)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function preencherDoCadastro(documento: string) {
    const r = await buscarClienteVendaDiretaAction(documento)
    if (!r.encontrado) { setAviso(null); return }
    const e = r.endereco || {}
    setDados((atual) => ({
      ...atual,
      nf: {
        ...atual.nf,
        nome: atual.nf.nome || r.nome,
        email: atual.nf.email || r.email,
        telefone: atual.nf.telefone || r.telefone,
        endereco: atual.nf.endereco.rua ? atual.nf.endereco : {
          cep: e.cep || '', rua: e.rua || e.logradouro || '', numero: e.numero || '',
          complemento: e.complemento || '', bairro: e.bairro || '', cidade: e.cidade || '', uf: e.uf || 'SC',
        },
      },
    }))
    setAviso(`✓ Cliente já cadastrado — dados preenchidos (${r.nome}). Confira antes de criar.`)
  }

  function criar() {
    setErro(null)
    const invalido = validarDadosVendaDireta(dados)
    if (invalido) { setErro(invalido); return }
    startTransition(async () => {
      const r = await criarVendaDiretaAction({ dados, vendedor_id: vendedorId })
      if ('erro' in r) setErro(r.erro)
      else router.push(`/projetos/${r.projeto_id}/venda-direta`)
    })
  }

  return (
    <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Nova venda direta</h2>
        <p className="text-xs text-white/50 mt-0.5">
          Só os dados pra emitir a NF e enviar a mercadoria. Os equipamentos você escolhe no próximo passo.
        </p>
      </div>

      <FormDadosVendaDireta valor={dados} onChange={setDados} onDocumentoCompleto={preencherDoCadastro} />

      {aviso && <p className="text-xs text-verde">{aviso}</p>}

      <div className="flex flex-wrap items-end justify-between gap-4 pt-4 border-t border-white/5">
        <label className="block min-w-[260px]">
          <span className="block text-[11px] font-bold text-white/60 mb-1">Vendedor (recebe a comissão)</span>
          <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className={inputCls}>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id} className="bg-noite">{v.nome} · {v.papel}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={criar}
          disabled={pending}
          className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
        >
          {pending ? '⏳ Criando…' : 'Criar e escolher equipamentos →'}
        </button>
      </div>

      {erro && <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 text-sm text-coral">❌ {erro}</div>}
    </section>
  )
}
