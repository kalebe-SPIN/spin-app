'use client'

import { useState } from 'react'
import {
  adicionarSecaoAction,
  removerSecaoAction,
  concluirTelhadoAction,
  type SecaoTelhadoInput,
} from '@/app/projetos/[id]/telhado/actions'
import { TelhadoMapa, type FaceDesenhada } from './TelhadoMapa'

type Secao = {
  id: string
  ordem: number
  identificador: string | null
  tipo_cobertura: string
  area_m2: number
  orientacao: string
  inclinacao_graus: number | null
  idade_anos: number | null
  tem_sombreamento: boolean
  sombreamento_descricao: string | null
  sombreamento_severidade: string | null
  material_estrutura: string | null
  altura_telhado_m: number | null
  observacoes: string | null
}

const FORM_INICIAL: SecaoTelhadoInput = {
  identificador: '',
  tipo_cobertura: 'fibrocimento',
  idade_anos: null,
  area_m2: 0,
  orientacao: 'N',
  inclinacao_graus: 18,
  tem_sombreamento: false,
  sombreamento_descricao: null,
  sombreamento_severidade: null,
  material_estrutura: null,
  altura_telhado_m: null,
  observacoes: null,
}

export function TelhadoSecoesManager({
  projetoId,
  secoesIniciais,
  enderecoCliente,
}: {
  projetoId: string
  secoesIniciais: Secao[]
  enderecoCliente?: string
}) {
  const [secoes, setSecoes] = useState<Secao[]>(secoesIniciais)
  const [mostrandoForm, setMostrandoForm] = useState(secoesIniciais.length === 0)
  const [mostrandoMapa, setMostrandoMapa] = useState(false)
  const [form, setForm] = useState<SecaoTelhadoInput>(FORM_INICIAL)
  const [salvando, setSalvando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFaceDesenhada(face: FaceDesenhada) {
    // Auto-popula área no formulário
    setForm((prev) => ({ ...prev, area_m2: face.area_m2 }))
    setMostrandoMapa(false)
    setMostrandoForm(true)
  }

  function update<K extends keyof SecaoTelhadoInput>(k: K, v: SecaoTelhadoInput[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  async function handleAdicionar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.area_m2 <= 0) {
      setError('Área disponível deve ser maior que zero.')
      return
    }
    setSalvando(true)
    const res = await adicionarSecaoAction(projetoId, form)
    setSalvando(false)
    if (!res.sucesso) {
      setError(res.erro || 'Erro ao adicionar seção.')
      return
    }
    // Recarrega a página pra pegar nova seção (com id real do banco)
    window.location.reload()
  }

  async function handleRemover(secaoId: string) {
    if (!confirm('Remover essa seção?')) return
    const res = await removerSecaoAction(projetoId, secaoId)
    if (res.sucesso) {
      setSecoes((prev) => prev.filter((s) => s.id !== secaoId))
    }
  }

  async function handleConcluir() {
    setError(null)
    setSalvando(true)
    const res = await concluirTelhadoAction(projetoId)
    setSalvando(false)
    // Se retornou erro, mostra. Se concluiu, redirect já aconteceu server-side
    if (res && !res.sucesso) {
      setError(res.erro || 'Erro ao concluir.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Lista de seções já cadastradas */}
      {secoes.length > 0 && (
        <div className="space-y-3">
          {secoes.map((s) => (
            <SecaoCard key={s.id} secao={s} onRemover={() => handleRemover(s.id)} />
          ))}
        </div>
      )}

      {/* Mapa interativo */}
      {mostrandoMapa && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-sol">
              📍 Desenhar face no mapa
            </h3>
            <button
              type="button"
              onClick={() => setMostrandoMapa(false)}
              className="text-xs text-white/40 hover:text-coral transition-colors"
            >
              ✕ Fechar
            </button>
          </div>
          <TelhadoMapa
            endereco={enderecoCliente}
            onFaceDesenhada={handleFaceDesenhada}
          />
        </div>
      )}

      {/* Botões pra adicionar nova OU formulário */}
      {!mostrandoForm && !mostrandoMapa && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setForm(FORM_INICIAL)
              setMostrandoForm(true)
            }}
            className="p-6 border-2 border-dashed border-white/20 rounded-xl text-white/60 hover:border-sol/40 hover:text-white hover:bg-white/[0.02] transition-all"
          >
            ✏️<br />
            <span className="text-sm font-bold">Preencher manualmente</span>
            <div className="text-xs text-white/40 mt-1">Você sabe a área e orientação</div>
          </button>
          <button
            type="button"
            onClick={() => setMostrandoMapa(true)}
            className="p-6 border-2 border-dashed border-sol/30 rounded-xl text-white hover:border-sol/60 hover:bg-sol/5 transition-all"
          >
            🛰️<br />
            <span className="text-sm font-bold text-sol">Desenhar no mapa satélite</span>
            <div className="text-xs text-white/60 mt-1">Sistema calcula a área pra você</div>
          </button>
        </div>
      )}

      {mostrandoForm && (
        <form onSubmit={handleAdicionar} className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-sol">
            Nova seção de telhado
          </h3>

          <Field label="Identificador (opcional)">
            <input
              type="text"
              value={form.identificador}
              onChange={(e) => update('identificador', e.target.value)}
              className="input-spin"
              placeholder='Ex: "Casa principal" ou "Galpão fundos"'
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo de cobertura *">
              <select
                value={form.tipo_cobertura}
                onChange={(e) => update('tipo_cobertura', e.target.value)}
                className="input-spin"
                required
              >
                {TIPOS_COBERTURA.map((t) => (
                  <option key={t.value} value={t.value} className="bg-noite">
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Idade do telhado (anos)">
              <input
                type="number"
                min={0}
                value={form.idade_anos ?? ''}
                onChange={(e) => update('idade_anos', e.target.value ? Number(e.target.value) : null)}
                className="input-spin"
                placeholder="Ex: 10"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Área disponível (m²) *">
              <input
                type="number"
                min={0}
                step="0.1"
                required
                value={form.area_m2 || ''}
                onChange={(e) => update('area_m2', Number(e.target.value))}
                className="input-spin"
                placeholder="Ex: 80"
              />
            </Field>

            <Field label="Orientação *">
              <select
                value={form.orientacao}
                onChange={(e) => update('orientacao', e.target.value)}
                className="input-spin"
                required
              >
                {ORIENTACOES.map((o) => (
                  <option key={o.value} value={o.value} className="bg-noite">
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Inclinação (graus)">
              <input
                type="number"
                min={0}
                max={90}
                step="0.5"
                value={form.inclinacao_graus ?? ''}
                onChange={(e) => update('inclinacao_graus', e.target.value ? Number(e.target.value) : null)}
                className="input-spin"
                placeholder="Ex: 18"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Material da estrutura">
              <select
                value={form.material_estrutura || ''}
                onChange={(e) => update('material_estrutura', e.target.value || null)}
                className="input-spin"
              >
                <option value="" className="bg-noite">— Selecionar —</option>
                <option value="madeira" className="bg-noite">Madeira</option>
                <option value="metalica" className="bg-noite">Metálica</option>
                <option value="concreto" className="bg-noite">Concreto</option>
              </select>
            </Field>

            <Field label="Altura telhado vs QGBT (m)">
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.altura_telhado_m ?? ''}
                onChange={(e) => update('altura_telhado_m', e.target.value ? Number(e.target.value) : null)}
                className="input-spin"
                placeholder="Ex: 4"
              />
            </Field>
          </div>

          {/* Sombreamento */}
          <div className="pt-4 border-t border-white/10">
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={form.tem_sombreamento}
                onChange={(e) => update('tem_sombreamento', e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-sol focus:ring-sol"
              />
              <span>Há sombreamento neste telhado</span>
            </label>

            {form.tem_sombreamento && (
              <div className="mt-3 space-y-3 pl-6">
                <Field label="Descrição do sombreamento">
                  <textarea
                    value={form.sombreamento_descricao || ''}
                    onChange={(e) => update('sombreamento_descricao', e.target.value || null)}
                    className="input-spin min-h-[60px]"
                    placeholder='Ex: "Árvore lateral oeste, sombra das 15h às 17h"'
                  />
                </Field>
                <Field label="Severidade">
                  <select
                    value={form.sombreamento_severidade || ''}
                    onChange={(e) => update('sombreamento_severidade', e.target.value || null)}
                    className="input-spin"
                  >
                    <option value="" className="bg-noite">— Selecionar —</option>
                    <option value="leve" className="bg-noite">Leve (poucas horas, parcial)</option>
                    <option value="moderada" className="bg-noite">Moderada (várias horas ou + de 30% telhado)</option>
                    <option value="pesada" className="bg-noite">Pesada (impede produção significativa)</option>
                  </select>
                </Field>
              </div>
            )}
          </div>

          <Field label="Observações (opcional)">
            <textarea
              value={form.observacoes || ''}
              onChange={(e) => update('observacoes', e.target.value || null)}
              className="input-spin min-h-[60px]"
              placeholder="Qualquer info relevante (estrutura precisa de reforço, telha quebrada, etc)"
            />
          </Field>

          {error && (
            <div className="p-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => setMostrandoForm(false)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              disabled={salvando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 px-4 py-2 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors disabled:opacity-50"
            >
              {salvando ? 'Adicionando...' : '+ Adicionar seção'}
            </button>
          </div>
        </form>
      )}

      {/* Botão concluir passo */}
      {secoes.length > 0 && !mostrandoForm && (
        <div className="pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleConcluir}
            disabled={salvando}
            className="w-full px-6 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Concluir passo do telhado →'}
          </button>
          {error && (
            <div className="mt-3 p-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SecaoCard({ secao, onRemover }: { secao: Secao; onRemover: () => void }) {
  const tipoLabel = TIPOS_COBERTURA.find((t) => t.value === secao.tipo_cobertura)?.label || secao.tipo_cobertura
  const orientLabel = ORIENTACOES.find((o) => o.value === secao.orientacao)?.label || secao.orientacao

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs uppercase tracking-wider font-bold bg-sol/10 text-sol px-2 py-0.5 rounded-full">
              Seção {secao.ordem}
            </span>
            {secao.identificador && (
              <span className="text-sm font-bold text-white">{secao.identificador}</span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Info label="Cobertura" value={tipoLabel} />
            <Info label="Área" value={`${secao.area_m2} m²`} />
            <Info label="Orientação" value={orientLabel} />
            <Info label="Inclinação" value={secao.inclinacao_graus != null ? `${secao.inclinacao_graus}°` : '—'} />
          </div>
          {secao.tem_sombreamento && (
            <div className="mt-3 text-xs text-coral">
              ⚠️ Sombreamento {secao.sombreamento_severidade || ''}
              {secao.sombreamento_descricao && `: ${secao.sombreamento_descricao}`}
            </div>
          )}
        </div>
        <button
          onClick={onRemover}
          className="text-xs text-white/40 hover:text-coral transition-colors"
          title="Remover seção"
        >
          ✕ Remover
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-white/40 uppercase tracking-wider">{label}</div>
      <div className="text-white font-medium">{value}</div>
    </div>
  )
}

const TIPOS_COBERTURA = [
  { value: 'fibrocimento', label: 'Fibrocimento' },
  { value: 'ceramica_colonial', label: 'Cerâmica Colonial' },
  { value: 'ceramica_francesa', label: 'Cerâmica Francesa' },
  { value: 'metalico_trapezoidal', label: 'Metálico Trapezoidal' },
  { value: 'metalico_onda', label: 'Metálico Onda' },
  { value: 'laje_impermeabilizada', label: 'Laje impermeabilizada' },
  { value: 'solo', label: 'Solo' },
  { value: 'carport', label: 'Carport' },
]

const ORIENTACOES = [
  { value: 'N', label: 'Norte (100% eficiência)' },
  { value: 'NE', label: 'Nordeste (~96%)' },
  { value: 'NO', label: 'Noroeste (~96%)' },
  { value: 'L', label: 'Leste (~85%)' },
  { value: 'O', label: 'Oeste (~85%)' },
  { value: 'SE', label: 'Sudeste (~75%)' },
  { value: 'SO', label: 'Sudoeste (~75%)' },
  { value: 'S', label: 'Sul (~60% — evitar)' },
  { value: 'horizontal', label: 'Horizontal/laje plana' },
]
