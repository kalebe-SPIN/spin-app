'use client'

import { useState } from 'react'
import { salvarPadraoAction, type PadraoInput } from '@/app/projetos/[id]/padrao/actions'

export function PadraoForm({
  projetoId,
  padraoSalvo,
  tipoLigacaoSugerido,
}: {
  projetoId: string
  padraoSalvo: any
  tipoLigacaoSugerido: string | null
}) {
  const [form, setForm] = useState<PadraoInput>({
    tipo_ligacao: padraoSalvo?.tipo_ligacao || tipoLigacaoSugerido || '',
    tensao_fornecimento: '127_380',  // padrão CELESC sempre
    amperagem_disjuntor_geral_a: padraoSalvo?.amperagem_disjuntor_geral_a || null,
    medidor_bidirecional: padraoSalvo?.medidor_bidirecional ?? false,
    tem_cabine_primaria: padraoSalvo?.tem_cabine_primaria ?? false,
    qgbt_tem_espaco_disjuntor_solar: padraoSalvo?.qgbt_tem_espaco_disjuntor_solar ?? false,
    qtd_hastes_aterramento: padraoSalvo?.qtd_hastes_aterramento || null,
    hastes_interligadas: padraoSalvo?.hastes_interligadas ?? false,
    tem_spda: padraoSalvo?.tem_spda ?? false,
    distancia_string_qgbt_m: padraoSalvo?.distancia_string_qgbt_m || null,
    altura_padrao_entrada_m: padraoSalvo?.altura_padrao_entrada_m || null,
    observacoes: padraoSalvo?.observacoes || '',
  })
  const [salvando, setSalvando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof PadraoInput>(k: K, v: PadraoInput[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSalvando(true)
    const res = await salvarPadraoAction(projetoId, form)
    setSalvando(false)
    if (res && !res.sucesso) setError(res.erro || 'Erro ao salvar.')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* TIPO DE LIGAÇÃO */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Tipo de ligação
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { v: 'monofasico', label: 'Monofásico', desc: '127V, 1 fase + neutro' },
            { v: 'bifasico', label: 'Bifásico', desc: '220V, 2 fases' },
            { v: 'trifasico', label: 'Trifásico', desc: '220V ou 380V, 3 fases' },
          ].map((t) => (
            <label
              key={t.v}
              className={`flex flex-col gap-1 p-4 rounded-lg border cursor-pointer transition-colors
                ${form.tipo_ligacao === t.v
                  ? 'bg-sol/10 border-sol/40'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/30'
                }`}
            >
              <input
                type="radio"
                name="tipo_ligacao"
                value={t.v}
                checked={form.tipo_ligacao === t.v}
                onChange={(e) => update('tipo_ligacao', e.target.value as any)}
                className="sr-only"
              />
              <span className="text-sm font-bold text-white">{t.label}</span>
              <span className="text-xs text-white/60">{t.desc}</span>
              {tipoLigacaoSugerido === t.v && (
                <span className="text-[10px] uppercase font-bold text-verde mt-1">
                  ✨ Da fatura
                </span>
              )}
            </label>
          ))}
        </div>

        <Field label="Tensão fornecida (padrão CELESC)">
          <div className="input-spin opacity-60 cursor-not-allowed">
            127V / 380V — padrão CELESC
          </div>
        </Field>
      </fieldset>

      {/* AMPERAGEM */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Disjuntor geral (padrão de entrada)
        </legend>

        <Field label="Amperagem (A) *">
          <select
            value={form.amperagem_disjuntor_geral_a ?? ''}
            onChange={(e) => update('amperagem_disjuntor_geral_a', e.target.value ? Number(e.target.value) : null)}
            className="input-spin"
            required
          >
            <option value="" className="bg-noite">— Selecionar —</option>
            {[
              16, 20, 25, 32, 40, 50, 60, 63, 70, 80, 90,
              100, 125, 150, 160, 175, 200, 225, 250, 300, 350,
              400, 500, 600, 630, 700, 800, 900, 1000,
            ].map((a) => (
              <option key={a} value={a} className="bg-noite">{a} A</option>
            ))}
          </select>
        </Field>

        <Field label="Altura do padrão de entrada (m)">
          <input
            type="number"
            min={0}
            step="0.1"
            value={form.altura_padrao_entrada_m ?? ''}
            onChange={(e) => update('altura_padrao_entrada_m', e.target.value ? Number(e.target.value) : null)}
            className="input-spin"
            placeholder="Ex: 5"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Checkbox
            label="Medidor já é bidirecional"
            checked={form.medidor_bidirecional}
            onChange={(v) => update('medidor_bidirecional', v)}
          />
          <Checkbox
            label="Cabine primária (Grupo A)"
            checked={form.tem_cabine_primaria}
            onChange={(v) => update('tem_cabine_primaria', v)}
          />
        </div>
      </fieldset>

      {/* QGBT */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Quadro de proteção (QGBT)
        </legend>

        <Checkbox
          label="QGBT tem espaço pra disjuntor solar dedicado"
          checked={form.qgbt_tem_espaco_disjuntor_solar}
          onChange={(v) => update('qgbt_tem_espaco_disjuntor_solar', v)}
        />
      </fieldset>

      {/* ATERRAMENTO + SPDA */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Aterramento + SPDA
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Qtd hastes de aterramento">
            <input
              type="number"
              min={0}
              value={form.qtd_hastes_aterramento ?? ''}
              onChange={(e) => update('qtd_hastes_aterramento', e.target.value ? Number(e.target.value) : null)}
              className="input-spin"
              placeholder="0 = sem aterramento"
            />
          </Field>

          <div className="flex flex-col justify-end">
            <Checkbox
              label="Hastes interligadas (malha)"
              checked={form.hastes_interligadas}
              onChange={(v) => update('hastes_interligadas', v)}
            />
          </div>
        </div>

        <Checkbox
          label="SPDA (para-raios) existente"
          checked={form.tem_spda}
          onChange={(v) => update('tem_spda', v)}
        />
      </fieldset>

      {/* DISTÂNCIA */}
      <fieldset className="space-y-4 pt-4 border-t border-white/10">
        <legend className="text-xs font-bold uppercase tracking-wider text-sol mb-3">
          Distâncias (campo)
        </legend>

        <Field label="Distância da string até o QGBT (m)">
          <input
            type="number"
            min={0}
            step="0.5"
            value={form.distancia_string_qgbt_m ?? ''}
            onChange={(e) => update('distancia_string_qgbt_m', e.target.value ? Number(e.target.value) : null)}
            className="input-spin"
            placeholder="Ex: 15 (cabo percorrido, não linha reta)"
          />
        </Field>
      </fieldset>

      {/* OBSERVAÇÕES */}
      <fieldset className="pt-4 border-t border-white/10">
        <Field label="Observações (opcional)">
          <textarea
            value={form.observacoes}
            onChange={(e) => update('observacoes', e.target.value)}
            className="input-spin min-h-[80px]"
            placeholder="Padrão antigo, espaço apertado, obras adicionais necessárias..."
          />
        </Field>
      </fieldset>

      {error && (
        <div className="p-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          disabled={salvando}
          className="flex-1 px-6 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar padrão e continuar →'}
        </button>
      </div>
    </form>
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

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-white cursor-pointer p-3 rounded-lg bg-white/[0.02] border border-white/10 hover:bg-white/[0.05]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-white/20 bg-white/5 text-sol focus:ring-sol"
      />
      <span>{label}</span>
    </label>
  )
}
