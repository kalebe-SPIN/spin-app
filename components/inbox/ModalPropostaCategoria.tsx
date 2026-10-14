'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  dadosBessAction, calcularBessAction, gerarBessAction,
  dadosOMAction, gerarOMAction,
  dadosTecnicoAction, calcularTecnicoAction, gerarTecnicoAction,
  dadosVendaDiretaAction,
} from '@/app/inbox/propostas-categorias-actions'
import { enviarPdfPropostaRapidaAction } from '@/app/inbox/proposta-actions'
import { INFO_CATEGORIA, type CategoriaProposta } from '@/lib/propostas/categorias'
import { ComposicaoBess, type ApiBess } from '@/components/propostas/ComposicaoBess'
import { ComposicaoOM, type ApiOM } from '@/components/propostas/ComposicaoOM'
import { ComposicaoTecnico, type ApiTecnico } from '@/components/propostas/ComposicaoTecnico'
import { VendaDiretaClient } from '@/components/venda-direta/VendaDiretaClient'

/**
 * Proposta das categorias BESS, O&M, projetos técnicos e venda (PDV) dentro
 * do Spinzap (Kalebe 2026-10-14): "mesmo formato do fotovoltaico, em um
 * formulário próprio num popup e não mais abrir uma aba externa".
 */

type Cat = Exclude<CategoriaProposta, 'fotovoltaico' | 'recarga'>

const ARQUIVO: Record<Cat, string> = { bess: 'Proposta-BESS.pdf', om: 'Proposta-OM.pdf', projetos: 'Proposta-Projeto-Tecnico.pdf', venda: 'Proposta-Equipamentos.pdf' }

function VendaDireta({ conversaId }: { conversaId: string }) {
  const [d, setD] = useState<Exclude<Awaited<ReturnType<typeof dadosVendaDiretaAction>>, { erro: string }> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    dadosVendaDiretaAction(conversaId).then((r) => { if ('erro' in r) setErro(r.erro); else setD(r) })
  }, [conversaId])
  if (!d) return erro ? <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p> : <p className="text-sm text-white/50">Abrindo a venda direta…</p>
  return <VendaDiretaClient projeto={d.projeto} dadosIniciais={d.dadosIniciais} catalogo={d.catalogo} params={d.params} configEmpresa={d.configEmpresa} ehAdmin={d.ehAdmin} />
}

export function ModalPropostaCategoria({ categoria, conversaId, nomeCliente, onFechar, onEnviada }: {
  categoria: Cat
  conversaId: string
  nomeCliente: string
  onFechar: () => void
  onEnviada: () => void
}) {
  const enviar = useMemo(() => (projetoId: string, url: string, legenda: string) =>
    enviarPdfPropostaRapidaAction(conversaId, projetoId, url, legenda, ARQUIVO[categoria]), [conversaId, categoria])
  const apiBess = useMemo<ApiBess>(() => ({
    carregar: () => dadosBessAction(conversaId), calcular: (e) => calcularBessAction(conversaId, e), gerar: (e) => gerarBessAction(conversaId, e), enviar,
  }), [conversaId, enviar])
  const apiOM = useMemo<ApiOM>(() => ({ carregar: () => dadosOMAction(conversaId), gerar: (e) => gerarOMAction(conversaId, e), enviar }), [conversaId, enviar])
  const apiTec = useMemo<ApiTecnico>(() => ({
    carregar: () => dadosTecnicoAction(conversaId), calcular: (e) => calcularTecnicoAction(conversaId, e), gerar: (e) => gerarTecnicoAction(conversaId, e), enviar,
  }), [conversaId, enviar])
  const info = INFO_CATEGORIA[categoria]
  const largo = categoria === 'venda'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div className={`relative w-full ${largo ? 'sm:max-w-6xl' : 'sm:max-w-2xl'} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-noite/85 backdrop-blur-2xl shadow-2xl p-5 space-y-4`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">{info.emoji} Proposta · {info.rotulo}</h2>
            <p className="text-[11px] text-white/50">{nomeCliente} · {info.descricao}</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white/[0.06] text-white/70 hover:text-white flex items-center justify-center shrink-0">✕</button>
        </div>
        {categoria === 'bess' && <ComposicaoBess api={apiBess} nomeCliente={nomeCliente} onEnviada={onEnviada} />}
        {categoria === 'om' && <ComposicaoOM api={apiOM} nomeCliente={nomeCliente} onEnviada={onEnviada} />}
        {categoria === 'projetos' && <ComposicaoTecnico api={apiTec} nomeCliente={nomeCliente} onEnviada={onEnviada} />}
        {categoria === 'venda' && <VendaDireta conversaId={conversaId} />}
      </div>
    </div>
  )
}
