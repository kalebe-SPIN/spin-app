'use client'

/**
 * Telhado do cliente — Kalebe 2026-08-31.
 * Substitui a etapa 'Telhado' do fluxo do projeto. Cadastro fica no
 * perfil do cliente, e cada proposta futura herda automaticamente.
 *
 * Guarda uma ou mais seções (área, orientação, inclinação, tipo,
 * material da estrutura, sombreamento). Dados usados pra:
 *   - dimensionar quantidade máxima de placas
 *   - calcular eficiência da geração (orientação + inclinação + sombra)
 *   - escolher tipo de estrutura no kit (fibro / metal / cerâmico / laje)
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { fmtNum } from '@/lib/formatters'
import { salvarTelhadoClienteAction, type SecaoTelhadoCliente } from '@/app/crm/clientes/actions'

const TIPOS_COBERTURA = [
  { v: 'fibrocimento', l: 'Fibrocimento' },
  { v: 'metalico', l: 'Metálico / trapezoidal' },
  { v: 'ceramico', l: 'Cerâmico / colonial' },
  { v: 'laje', l: 'Laje / concreto' },
  { v: 'solo', l: 'Solo (estrutura própria)' },
]

const ORIENTACOES = ['Norte', 'NE', 'Leste', 'SE', 'Sul', 'SO', 'Oeste', 'NO']

const MATERIAIS_ESTRUTURA = [
  { v: '', l: '—' },
  { v: 'madeira', l: 'Madeira' },
  { v: 'metal', l: 'Metálica' },
  { v: 'concreto', l: 'Concreto' },
]

// Eficiência estimada por orientação (norte=100%, sul=70%). Só pra dar
// pro consultor um sinal na hora de cadastrar; cálculo definitivo é no kit.
const EFICIENCIA_ORIENTACAO: Record<string, number> = {
  'Norte': 100, 'NE': 96, 'NO': 96,
  'Leste': 88, 'Oeste': 88,
  'SE': 78, 'SO': 78,
  'Sul': 70,
}

function novoUuid(): string {
  // uuid v4 curtinho — só pra key React, não bate no banco
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function secaoVazia(): SecaoTelhadoCliente {
  return {
    id: novoUuid(),
    identificador: '',
    tipo_cobertura: 'fibrocimento',
    area_m2: 0,
    orientacao: 'Norte',
    inclinacao_graus: 15,
    material_estrutura: 'madeira',
    altura_telhado_m: null,
    tem_sombreamento: false,
    sombreamento_descricao: '',
    sombreamento_severidade: null,
    idade_anos: null,
    observacoes: '',
  }
}

export function TelhadoClienteCard({
  clienteId,
  clienteEnderecoOk,
  secoesIniciais,
}: {
  clienteId: string
  clienteEnderecoOk: boolean
  secoesIniciais: SecaoTelhadoCliente[]
}) {
  const [secoes, setSecoes] = useState<SecaoTelhadoCliente[]>(
    (secoesIniciais || []).map((s) => ({ ...s, id: s.id || novoUuid() })),
  )
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  function addSecao() {
    setSecoes((prev) => [...prev, { ...secaoVazia(), identificador: prev.length === 0 ? 'Telhado principal' : `Seção ${prev.length + 1}` }])
    setOk(false)
  }
  function removerSecao(id: string) {
    setSecoes((prev) => prev.filter((s) => s.id !== id))
    setOk(false)
  }
  function atualizar<K extends keyof SecaoTelhadoCliente>(id: string, campo: K, valor: SecaoTelhadoCliente[K]) {
    setSecoes((prev) => prev.map((s) => (s.id === id ? { ...s, [campo]: valor } : s)))
    setOk(false)
  }
  function salvar() {
    setErro(null)
    startTransition(async () => {
      const r = await salvarTelhadoClienteAction(clienteId, secoes)
      if ('erro' in r && r.erro) setErro(r.erro)
      else setOk(true)
    })
  }

  const areaTotal = secoes.reduce((s, sec) => s + (Number(sec.area_m2) || 0), 0)
  const potenciaEstimadaKwp = areaTotal * 0.14 // ~140 Wp/m² conservador
  const eficienciaMedia = secoes.length > 0
    ? secoes.reduce((s, sec) => s + (EFICIENCIA_ORIENTACAO[sec.orientacao] || 80), 0) / secoes.length
    : 0

  return (
    <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            🏠 Telhado do imóvel
            <span className="text-[10px] uppercase tracking-wider bg-verde/15 text-verde px-1.5 py-0.5 rounded-full">
              tronco
            </span>
          </h2>
          <p className="text-[11px] text-white/50 mt-0.5">
            Toda proposta pro cliente vai herdar essas seções.
          </p>
        </div>
        <div className="flex gap-2">
          {clienteEnderecoOk && (
            <Link
              href={`/crm/clientes/${clienteId}/telhado-mapa`}
              className="text-[10px] font-bold px-3 py-1.5 rounded bg-weg-azul/15 border border-weg-azul/40 text-weg-azul hover:bg-weg-azul/25"
              title="Google Maps satélite + Solar API pra desenhar e capturar área/orientação"
            >
              🗺 Desenhar no mapa
            </Link>
          )}
          <button
            type="button"
            onClick={addSecao}
            className="text-[10px] font-bold px-3 py-1.5 rounded bg-sol/15 border border-sol/40 text-sol hover:bg-sol/25"
          >
            + Adicionar seção
          </button>
        </div>
      </div>

      {!clienteEnderecoOk && (
        <div className="mb-4 p-3 bg-coral/5 border border-coral/30 rounded-lg text-[11px] text-coral">
          ⚠ Cadastre primeiro o <strong>endereço do cliente</strong> abaixo pra habilitar o botão "Desenhar no mapa" (o Google Solar precisa da localização).
        </div>
      )}

      {/* Resumo */}
      {secoes.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Metrica label="Área total" valor={`${fmtNum(areaTotal, 0)} m²`} />
          <Metrica label="Pot. máx estimada" valor={`${fmtNum(potenciaEstimadaKwp, 2)} kWp`} destaque="sol" />
          <Metrica label="Eficiência média" valor={`${fmtNum(eficienciaMedia, 0)}%`}
            destaque={eficienciaMedia >= 90 ? 'verde' : eficienciaMedia >= 78 ? 'sol' : 'coral'} />
        </div>
      )}

      {secoes.length === 0 ? (
        <div className="p-6 border border-dashed border-white/15 rounded-lg text-center text-xs text-white/50">
          Nenhuma seção cadastrada. Clique em "+ Adicionar seção" ou desenhe no mapa.
        </div>
      ) : (
        <div className="space-y-3">
          {secoes.map((s, i) => (
            <SecaoEditor
              key={s.id}
              secao={s}
              onChange={(campo, valor) => atualizar(s.id, campo, valor)}
              onRemover={() => removerSecao(s.id)}
              indice={i + 1}
            />
          ))}
        </div>
      )}

      {erro && (
        <div className="mt-3 p-2 bg-coral/10 border border-coral/30 rounded text-[11px] text-coral">
          ⚠ {erro}
        </div>
      )}
      {ok && (
        <div className="mt-3 p-2 bg-verde/10 border border-verde/30 rounded text-[11px] text-verde">
          ✓ Telhado salvo — propostas novas vão herdar essas seções.
        </div>
      )}

      {secoes.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={salvar}
            disabled={isPending}
            className="px-4 py-2 bg-sol text-noite font-bold text-xs rounded-lg disabled:opacity-40"
          >
            {isPending ? '⏳ Salvando…' : '💾 Salvar telhado'}
          </button>
        </div>
      )}
    </section>
  )
}

function SecaoEditor({
  secao, onChange, onRemover, indice,
}: {
  secao: SecaoTelhadoCliente
  onChange: <K extends keyof SecaoTelhadoCliente>(campo: K, valor: SecaoTelhadoCliente[K]) => void
  onRemover: () => void
  indice: number
}) {
  const eficiencia = EFICIENCIA_ORIENTACAO[secao.orientacao] || 80
  const [expandido, setExpandido] = useState(true)

  return (
    <div className="p-3 bg-noite/40 border border-white/10 rounded-lg">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider font-bold text-white/40">Seção {indice}</span>
          <input
            type="text"
            value={secao.identificador}
            onChange={(e) => onChange('identificador', e.target.value)}
            placeholder="Nome (ex: Telhado principal)"
            className="flex-1 min-w-0 px-2 py-1 bg-transparent border-0 text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold ${eficiencia >= 90 ? 'text-verde' : eficiencia >= 78 ? 'text-sol' : 'text-coral'}`}>
            {eficiencia}%
          </span>
          <button
            type="button"
            onClick={() => setExpandido(!expandido)}
            className="text-white/40 hover:text-white text-xs"
          >
            {expandido ? '▲' : '▼'}
          </button>
          <button
            type="button"
            onClick={onRemover}
            className="text-coral/60 hover:text-coral text-xs"
            title="Remover seção"
          >
            ✕
          </button>
        </div>
      </div>

      {expandido && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-white/5">
          <Campo label="Tipo de cobertura">
            <select value={secao.tipo_cobertura} onChange={(e) => onChange('tipo_cobertura', e.target.value)} className="inp">
              {TIPOS_COBERTURA.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </Campo>
          <Campo label="Área (m²)">
            <input type="number" step={1} value={secao.area_m2 || ''}
              onChange={(e) => onChange('area_m2', Number(e.target.value))} className="inp" />
          </Campo>
          <Campo label="Orientação">
            <select value={secao.orientacao} onChange={(e) => onChange('orientacao', e.target.value)} className="inp">
              {ORIENTACOES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Campo>
          <Campo label="Inclinação (°)">
            <input type="number" step={1} value={secao.inclinacao_graus ?? ''}
              onChange={(e) => onChange('inclinacao_graus', e.target.value ? Number(e.target.value) : null)}
              className="inp" placeholder="15" />
          </Campo>
          <Campo label="Material estrutura">
            <select value={secao.material_estrutura || ''}
              onChange={(e) => onChange('material_estrutura', e.target.value || null)} className="inp">
              {MATERIAIS_ESTRUTURA.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </Campo>
          <Campo label="Altura (m)">
            <input type="number" step={0.5} value={secao.altura_telhado_m ?? ''}
              onChange={(e) => onChange('altura_telhado_m', e.target.value ? Number(e.target.value) : null)}
              className="inp" />
          </Campo>
          <Campo label="Idade telhado">
            <input type="number" step={1} value={secao.idade_anos ?? ''}
              onChange={(e) => onChange('idade_anos', e.target.value ? Number(e.target.value) : null)}
              className="inp" placeholder="anos" />
          </Campo>
          <Campo label="Sombreamento">
            <label className="flex items-center gap-2 h-full px-2 py-1 bg-white/[0.03] border border-white/10 rounded cursor-pointer text-xs">
              <input type="checkbox" checked={!!secao.tem_sombreamento}
                onChange={(e) => onChange('tem_sombreamento', e.target.checked)}
                className="accent-sol" />
              {secao.tem_sombreamento ? 'Sim' : 'Não'}
            </label>
          </Campo>
          {secao.tem_sombreamento && (
            <div className="col-span-2 md:col-span-4">
              <Campo label="Descrição do sombreamento">
                <input type="text" value={secao.sombreamento_descricao || ''}
                  onChange={(e) => onChange('sombreamento_descricao', e.target.value)}
                  className="inp" placeholder="Ex: prédio ao sul, árvore alta a oeste, etc" />
              </Campo>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .inp {
          width: 100%;
          padding: 0.35rem 0.5rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.35rem;
          color: white;
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-0.5">{label}</label>
      {children}
    </div>
  )
}

function Metrica({ label, valor, destaque }: { label: string; valor: string; destaque?: 'sol' | 'verde' | 'coral' }) {
  const cor = destaque === 'verde' ? 'text-verde' : destaque === 'coral' ? 'text-coral' : destaque === 'sol' ? 'text-sol' : 'text-white'
  return (
    <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
      <p className="text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`text-sm font-bold ${cor}`}>{valor}</p>
    </div>
  )
}
