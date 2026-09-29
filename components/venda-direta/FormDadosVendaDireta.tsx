'use client'

import { useState } from 'react'
import { formatarCpfCnpj, formatarTelefone, formatarCep } from '@/lib/formatters'
import { type DadosVendaDireta, type EnderecoVD, tipoPessoa } from '@/lib/venda-direta/tipos'

/**
 * Dados pra emitir a NF e enviar a mercadoria (venda direta de equipamentos).
 * Controlado pelo pai: recebe `valor` e devolve cada mudança em `onChange`.
 */
export function FormDadosVendaDireta({
  valor,
  onChange,
  onDocumentoCompleto,
}: {
  valor: DadosVendaDireta
  onChange: (v: DadosVendaDireta) => void
  /** Chamado quando o CPF/CNPJ fica completo — o pai pode buscar o cadastro */
  onDocumentoCompleto?: (documento: string) => void
}) {
  const nf = valor.nf
  const setNf = (patch: Partial<DadosVendaDireta['nf']>) => onChange({ ...valor, nf: { ...nf, ...patch } })
  const pj = tipoPessoa(nf.documento) === 'pj'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Campo rotulo="CPF ou CNPJ" obrigatorio>
          <input
            value={nf.documento}
            onChange={(e) => {
              const v = formatarCpfCnpj(e.target.value)
              setNf({ documento: v })
              const d = v.replace(/\D/g, '')
              if ((d.length === 11 || d.length === 14) && onDocumentoCompleto) onDocumentoCompleto(v)
            }}
            placeholder="000.000.000-00"
            className={inputCls}
          />
        </Campo>
        <Campo rotulo={pj ? 'Razão social' : 'Nome completo'} obrigatorio>
          <input value={nf.nome} onChange={(e) => setNf({ nome: e.target.value })} className={inputCls} />
        </Campo>
        {pj && (
          <Campo rotulo="Inscrição estadual" dica='Deixe vazio ou escreva "ISENTO"'>
            <input value={nf.ie} onChange={(e) => setNf({ ie: e.target.value })} className={inputCls} />
          </Campo>
        )}
        <Campo rotulo="E-mail (recebe a NF-e)" obrigatorio>
          <input type="email" value={nf.email} onChange={(e) => setNf({ email: e.target.value })} className={inputCls} />
        </Campo>
        <Campo rotulo="Telefone / WhatsApp" obrigatorio>
          <input value={nf.telefone} onChange={(e) => setNf({ telefone: formatarTelefone(e.target.value) })} placeholder="(48) 99999-9999" className={inputCls} />
        </Campo>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider font-bold text-white/50 mb-2">Endereço da nota fiscal</p>
        <CamposEndereco valor={nf.endereco} onChange={(endereco) => setNf({ endereco })} />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
          <input
            type="checkbox"
            checked={valor.entrega.mesmo_endereco}
            onChange={(e) => onChange({ ...valor, entrega: { ...valor.entrega, mesmo_endereco: e.target.checked } })}
          />
          Entregar no mesmo endereço da nota
        </label>
        {!valor.entrega.mesmo_endereco && (
          <div className="mt-3">
            <p className="text-xs uppercase tracking-wider font-bold text-white/50 mb-2">Endereço de entrega</p>
            <CamposEndereco
              valor={valor.entrega.endereco}
              onChange={(endereco) => onChange({ ...valor, entrega: { ...valor.entrega, endereco } })}
            />
          </div>
        )}
        <div className="mt-3 max-w-md">
          <Campo rotulo="Quem recebe a mercadoria" dica="Opcional — se for outra pessoa">
            <input
              value={valor.entrega.recebedor}
              onChange={(e) => onChange({ ...valor, entrega: { ...valor.entrega, recebedor: e.target.value } })}
              className={inputCls}
            />
          </Campo>
        </div>
      </div>
    </div>
  )
}

function CamposEndereco({ valor, onChange }: { valor: EnderecoVD; onChange: (v: EnderecoVD) => void }) {
  const [buscando, setBuscando] = useState(false)
  const set = (patch: Partial<EnderecoVD>) => onChange({ ...valor, ...patch })

  async function buscarCep(cepFormatado: string) {
    const cep = cepFormatado.replace(/\D/g, '')
    if (cep.length !== 8) return
    setBuscando(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const d = await res.json()
      if (!d?.erro) {
        onChange({
          ...valor,
          cep: cepFormatado,
          rua: d.logradouro || valor.rua,
          bairro: d.bairro || valor.bairro,
          cidade: d.localidade || valor.cidade,
          uf: d.uf || valor.uf,
        })
      }
    } catch {} finally { setBuscando(false) }
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <div className="col-span-2 md:col-span-1">
        <Campo rotulo={buscando ? 'CEP (buscando…)' : 'CEP'} obrigatorio>
          <input
            value={valor.cep}
            onChange={(e) => {
              const v = formatarCep(e.target.value)
              set({ cep: v })
              if (v.replace(/\D/g, '').length === 8) buscarCep(v)
            }}
            placeholder="00000-000"
            className={inputCls}
          />
        </Campo>
      </div>
      <div className="col-span-2 md:col-span-3">
        <Campo rotulo="Rua" obrigatorio><input value={valor.rua} onChange={(e) => set({ rua: e.target.value })} className={inputCls} /></Campo>
      </div>
      <div className="col-span-1">
        <Campo rotulo="Número" obrigatorio><input value={valor.numero} onChange={(e) => set({ numero: e.target.value })} className={inputCls} /></Campo>
      </div>
      <div className="col-span-1">
        <Campo rotulo="Compl."><input value={valor.complemento} onChange={(e) => set({ complemento: e.target.value })} className={inputCls} /></Campo>
      </div>
      <div className="col-span-2 md:col-span-2">
        <Campo rotulo="Bairro" obrigatorio><input value={valor.bairro} onChange={(e) => set({ bairro: e.target.value })} className={inputCls} /></Campo>
      </div>
      <div className="col-span-1 md:col-span-3">
        <Campo rotulo="Cidade" obrigatorio><input value={valor.cidade} onChange={(e) => set({ cidade: e.target.value })} className={inputCls} /></Campo>
      </div>
      <div className="col-span-1">
        <Campo rotulo="UF" obrigatorio>
          <input value={valor.uf} maxLength={2} onChange={(e) => set({ uf: e.target.value.toUpperCase() })} className={inputCls} />
        </Campo>
      </div>
    </div>
  )
}

function Campo({ rotulo, obrigatorio, dica, children }: {
  rotulo: string; obrigatorio?: boolean; dica?: string; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-white/60 mb-1">
        {rotulo}{obrigatorio && <span className="text-coral ml-0.5">*</span>}
      </span>
      {children}
      {dica && <span className="block text-[10px] text-white/35 mt-0.5">{dica}</span>}
    </label>
  )
}

export const inputCls =
  'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'
