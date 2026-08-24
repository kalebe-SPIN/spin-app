'use client'

import Link from 'next/link'
import { useState } from 'react'
import { EditorTRT } from '@/components/EditorTRT'
import { ProtocoloCelescEditor } from '@/components/ProtocoloCelescEditor'
import { EditorCampoData } from '@/components/EditorCampoData'
import { EditorCampoTextarea } from '@/components/EditorCampoTextarea'
import { EditorDiagramaOficial } from '@/components/EditorDiagramaOficial'

/**
 * Timeline vertical do fluxo de homologação em 7 fases.
 * Cada fase é um card accordion (expansível). Só a fase "corrente"
 * (primeira pendente) fica interativa por padrão; próximas ficam
 * bloqueadas com aviso pra concluir a anterior primeiro.
 */

type Homologacao = any

type Props = {
  homologacao: Homologacao
  projetoId: string
  fluxo: {
    f1_status: string
    f2_status: string
    f3_status: string
    f4_status: string
    f5_status: string
    f6_status: string
    f7_status: string
  }
  diagramasProjeto: Array<{ id: string; versao: number; tipo_desenho: string; status: string; url_pdf: string | null; created_at: string }>
}

const FASES = [
  {
    ordem: 1,
    titulo: 'Solicitação inicial CELESC',
    resumo: 'Projetista solicita micro/minigeração no site da distribuidora e recebe o protocolo autorizado.',
    responsavel: 'Projetista',
  },
  {
    ordem: 2,
    titulo: 'TRT de Projeto (CFT)',
    resumo: 'Solicita a TRT no CFT, gera boleto, paga e cadastra o número final quando emitida.',
    responsavel: 'Projetista',
  },
  {
    ordem: 3,
    titulo: 'Montagem do Projeto (diagrama)',
    resumo: 'Reúne dados do consultor + kit + protocolo + TRT e monta o diagrama unifilar.',
    responsavel: 'Projetista',
  },
  {
    ordem: 4,
    titulo: 'Submissão à CELESC (aguarda ~15 dias)',
    resumo: 'Envia projeto + procuração + fotos + diagrama pra CELESC e aguarda análise.',
    responsavel: 'Projetista → CELESC',
  },
  {
    ordem: 5,
    titulo: 'Instalação (Ordem de Serviço)',
    resumo: 'Profissional de campo executa a instalação e registra o checklist com fotos.',
    responsavel: 'Profissional de campo',
  },
  {
    ordem: 6,
    titulo: 'TRT de Execução (CFT)',
    resumo: 'Segunda TRT, agora atestando execução. Mesmo fluxo do CFT: boleto → paga → recebe.',
    responsavel: 'Projetista',
  },
  {
    ordem: 7,
    titulo: 'Pedido de Conexão + Ligação',
    resumo: 'Envia TRT execução + fotos pra CELESC. CELESC agenda troca do medidor e libera ligação.',
    responsavel: 'Projetista → CELESC',
  },
] as const

export function TimelineHomologacao({ homologacao, projetoId, fluxo, diagramasProjeto }: Props) {
  const status = [
    fluxo.f1_status, fluxo.f2_status, fluxo.f3_status,
    fluxo.f4_status, fluxo.f5_status, fluxo.f6_status, fluxo.f7_status,
  ]
  const primeiraPendente = status.findIndex(s => s !== 'concluido') // 0-6, -1 se tudo ok
  const concluidas = status.filter(s => s === 'concluido').length

  return (
    <section className="bg-white/[0.03] border border-white/10 rounded-xl p-4 md:p-6">
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-lg font-bold text-white">🔀 Fluxo de homologação · 7 fases</h2>
          <span className="text-xs font-mono text-white/50">{concluidas}/7 concluídas</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-verde transition-all" style={{ width: `${(concluidas / 7) * 100}%` }} />
        </div>
      </header>

      <div className="space-y-2">
        {FASES.map((f, idx) => {
          const st = status[idx]
          const isCorrente = idx === primeiraPendente
          const isBloqueada = primeiraPendente >= 0 && idx > primeiraPendente
          const isConcluida = st === 'concluido'
          const isEmAndamento = st === 'em_andamento'
          return (
            <CardFase
              key={f.ordem}
              fase={f}
              status={st}
              isCorrente={isCorrente}
              isBloqueada={isBloqueada}
              isConcluida={isConcluida}
              isEmAndamento={isEmAndamento}
              faseAnterior={FASES[idx - 1]?.titulo}
              homologacao={homologacao}
              projetoId={projetoId}
              diagramasProjeto={diagramasProjeto}
            />
          )
        })}
      </div>
    </section>
  )
}

function CardFase({
  fase, status, isCorrente, isBloqueada, isConcluida, isEmAndamento,
  faseAnterior, homologacao, projetoId, diagramasProjeto,
}: {
  fase: typeof FASES[number]
  status: string
  isCorrente: boolean
  isBloqueada: boolean
  isConcluida: boolean
  isEmAndamento: boolean
  faseAnterior?: string
  homologacao: any
  projetoId: string
  diagramasProjeto: any[]
}) {
  const [aberto, setAberto] = useState(isCorrente || isEmAndamento)

  const cor = isConcluida
    ? 'border-verde/40 bg-verde/5'
    : isEmAndamento
    ? 'border-sol/40 bg-sol/5'
    : isBloqueada
    ? 'border-white/5 bg-white/[0.01] opacity-60'
    : 'border-white/10 bg-white/[0.02]'

  const emoji = isConcluida ? '✅' : isEmAndamento ? '🚧' : isBloqueada ? '🔒' : '⏳'

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${cor}`}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-white/[0.02]"
      >
        <span className="text-2xl flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-bold text-white text-sm">
              {fase.ordem}. {fase.titulo}
            </p>
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
              isConcluida ? 'text-verde bg-verde/10 border-verde/30'
                : isEmAndamento ? 'text-sol bg-sol/10 border-sol/30'
                : isBloqueada ? 'text-white/40 bg-white/5 border-white/10'
                : 'text-white/60 bg-white/5 border-white/10'
            }`}>
              {status}
            </span>
          </div>
          <p className="text-[11px] text-white/50 mt-0.5">{fase.resumo}</p>
          <p className="text-[10px] text-white/40 mt-0.5">Responsável: {fase.responsavel}</p>
        </div>
        <span className={`text-white/40 flex-shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`}>›</span>
      </button>

      {aberto && (
        <div className="border-t border-white/5 p-4 space-y-3">
          {isBloqueada ? (
            <p className="text-xs text-white/50 italic">
              🔒 Conclua a fase anterior ({faseAnterior}) pra desbloquear esta.
            </p>
          ) : (
            <ConteudoFase fase={fase} homologacao={homologacao} projetoId={projetoId} diagramasProjeto={diagramasProjeto} />
          )}
        </div>
      )}
    </div>
  )
}

function ConteudoFase({
  fase, homologacao, projetoId, diagramasProjeto,
}: {
  fase: typeof FASES[number]
  homologacao: any
  projetoId: string
  diagramasProjeto: any[]
}) {
  const homId = homologacao.id

  if (fase.ordem === 1) {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">
            Protocolo CELESC
          </label>
          <ProtocoloCelescEditor homologacaoId={homId} valorAtual={homologacao.protocolo_celesc} />
        </div>
        <EditorCampoTextarea
          label="Observações da solicitação"
          homologacaoId={homId}
          coluna="fase1_observacoes"
          valorAtual={homologacao.fase1_observacoes}
          placeholder="Anote peculiaridades da solicitação (número interno CELESC, atendente, etc.)"
        />
      </div>
    )
  }

  if (fase.ordem === 2) {
    return (
      <EditorTRT
        homologacaoId={homId}
        prefixo="trt_projeto"
        valores={{
          numero: homologacao.trt_projeto_numero,
          valor_boleto: homologacao.trt_projeto_valor_boleto,
          boleto_url: homologacao.trt_projeto_boleto_url,
          data_pagamento: homologacao.trt_projeto_data_pagamento,
          comprovante_url: homologacao.trt_projeto_comprovante_url,
          pdf_url: homologacao.trt_projeto_pdf_url,
          data_emissao: homologacao.trt_projeto_data_emissao,
          observacoes: homologacao.trt_projeto_observacoes,
        }}
      />
    )
  }

  if (fase.ordem === 3) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-white/70">
          Monte o diagrama unifilar e escolha qual versão é a oficial da homologação.
        </p>
        <Link
          href={`/projetos/${projetoId}/diagrama`}
          className="inline-block px-4 py-2 bg-sol text-noite text-xs font-bold rounded"
        >
          🖨️ Ir pra tela do diagrama →
        </Link>
        <EditorDiagramaOficial
          homologacaoId={homId}
          projetoId={projetoId}
          diagramas={diagramasProjeto}
          diagramaIdSelecionado={homologacao.diagrama_unifilar_id}
        />
        <EditorCampoTextarea
          label="Observações da montagem"
          homologacaoId={homId}
          coluna="fase3_observacoes"
          valorAtual={homologacao.fase3_observacoes}
          placeholder="Notas técnicas do diagrama (versão, revisão, particularidades)"
        />
      </div>
    )
  }

  if (fase.ordem === 4) {
    const submissao = homologacao.data_submissao_projeto
    const autorizacao = homologacao.data_autorizacao_projeto
    return (
      <div className="space-y-3">
        <p className="text-xs text-white/70">
          Envie projeto de microgeração + procuração + fotos disjuntor/padrão + diagrama pra CELESC.
          Análise leva ~15 dias.
        </p>
        <EditorCampoData
          label="Data de submissão à CELESC"
          homologacaoId={homId}
          coluna="data_submissao_projeto"
          valorAtual={submissao}
        />
        {submissao && (
          <ContagemAguardo dataInicio={submissao} diasEsperados={15} />
        )}
        <EditorCampoData
          label="Data de autorização (retorno CELESC)"
          homologacaoId={homId}
          coluna="data_autorizacao_projeto"
          valorAtual={autorizacao}
        />
        <EditorCampoTextarea
          label="Observações da submissão"
          homologacaoId={homId}
          coluna="fase4_observacoes"
          valorAtual={homologacao.fase4_observacoes}
        />
      </div>
    )
  }

  if (fase.ordem === 5) {
    return (
      <div className="space-y-3">
        <div className="p-3 bg-white/[0.02] border border-dashed border-white/20 rounded-lg">
          <p className="text-xs text-white/70">
            🚧 <strong className="text-white">Módulo Ordem de Serviço pendente</strong>
          </p>
          <p className="text-[11px] text-white/50 mt-1">
            Quando ficar pronto, o profissional de campo vai executar a instalação seguindo um
            checklist ponta a ponta com as 5 fotos obrigatórias:
          </p>
          <ul className="text-[11px] text-white/60 mt-2 pl-4 list-disc space-y-0.5">
            <li>Painéis instalados (visão total)</li>
            <li>Etiqueta do painel</li>
            <li>Etiqueta do inversor</li>
            <li>Padrão com placa "GERAÇÃO PRÓPRIA"</li>
            <li>Parede com inversor instalado</li>
          </ul>
          <p className="text-[10px] text-white/40 mt-2 italic">
            Por enquanto marque manualmente a data de conclusão pra desbloquear a Fase 6.
          </p>
        </div>
        <EditorCampoData
          label="Data de conclusão da instalação (manual)"
          homologacaoId={homId}
          coluna="data_instalacao_concluida"
          valorAtual={homologacao.data_instalacao_concluida}
        />
        <EditorCampoTextarea
          label="Observações da instalação"
          homologacaoId={homId}
          coluna="fase5_observacoes"
          valorAtual={homologacao.fase5_observacoes}
        />
      </div>
    )
  }

  if (fase.ordem === 6) {
    return (
      <EditorTRT
        homologacaoId={homId}
        prefixo="trt_execucao"
        valores={{
          numero: homologacao.trt_execucao_numero,
          valor_boleto: homologacao.trt_execucao_valor_boleto,
          boleto_url: homologacao.trt_execucao_boleto_url,
          data_pagamento: homologacao.trt_execucao_data_pagamento,
          comprovante_url: homologacao.trt_execucao_comprovante_url,
          pdf_url: homologacao.trt_execucao_pdf_url,
          data_emissao: homologacao.trt_execucao_data_emissao,
          observacoes: homologacao.trt_execucao_observacoes,
        }}
      />
    )
  }

  if (fase.ordem === 7) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-white/70">
          Envie o pedido de conexão à CELESC (TRT execução + 5 fotos + protocolo).
          CELESC agenda troca do medidor e libera ligação.
        </p>
        <EditorCampoData
          label="Data do pedido de conexão"
          homologacaoId={homId}
          coluna="data_pedido_conexao"
          valorAtual={homologacao.data_pedido_conexao}
        />
        <EditorCampoData
          label="Data agendada da troca do medidor"
          homologacaoId={homId}
          coluna="data_troca_medidor"
          valorAtual={homologacao.data_troca_medidor}
        />
        <EditorCampoData
          label="Data da ligação (sistema ativo)"
          homologacaoId={homId}
          coluna="data_ligacao"
          valorAtual={homologacao.data_ligacao}
        />
        <EditorCampoTextarea
          label="Observações do pedido de conexão"
          homologacaoId={homId}
          coluna="fase7_observacoes"
          valorAtual={homologacao.fase7_observacoes}
        />
      </div>
    )
  }

  return null
}

function ContagemAguardo({ dataInicio, diasEsperados }: { dataInicio: string; diasEsperados: number }) {
  const inicio = new Date(dataInicio + 'T12:00:00-03:00')
  const hoje = new Date()
  const dias = Math.floor((hoje.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))
  const restantes = diasEsperados - dias
  const atrasado = restantes < 0

  return (
    <div className={`p-2 rounded text-xs ${atrasado ? 'bg-coral/10 text-coral border border-coral/30' : 'bg-sol/10 text-sol border border-sol/30'}`}>
      {atrasado
        ? `⚠️ Aguardando há ${dias} dias (${Math.abs(restantes)} dias além do esperado). Cheque status na CELESC.`
        : `⏳ Aguardando há ${dias} dias (esperado até ~${diasEsperados} dias, restam ${restantes}).`}
    </div>
  )
}
