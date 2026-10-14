'use client'

import { useMemo } from 'react'
import {
  dadosProjetoRecargaAction, calcularProjetoRecargaAction, cadastrarEquipamentoProjetoRecargaAction,
  gerarPdfProjetoRecargaAction, enviarPdfProjetoRecargaAction,
} from '@/app/projetos/[id]/ve/actions'
import { ComposicaoRecarga, type ApiRecarga } from './ComposicaoRecarga'

/** Composição da estação de recarga pela tela do projeto (mesma do Spinzap). */
export function ComposicaoRecargaProjeto({ projetoId, nomeCliente }: { projetoId: string; nomeCliente: string }) {
  const api = useMemo<ApiRecarga>(() => ({
    carregar: () => dadosProjetoRecargaAction(projetoId),
    calcular: (e) => calcularProjetoRecargaAction(projetoId, e),
    cadastrar: (i) => cadastrarEquipamentoProjetoRecargaAction(projetoId, i),
    gerarPdf: (e) => gerarPdfProjetoRecargaAction(projetoId, e),
    enviar: (_projeto, url, legenda) => enviarPdfProjetoRecargaAction(projetoId, url, legenda),
  }), [projetoId])
  return <ComposicaoRecarga api={api} nomeCliente={nomeCliente} />
}
