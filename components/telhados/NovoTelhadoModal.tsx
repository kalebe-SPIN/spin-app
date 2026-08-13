'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { MapaSelecionarTelhado, type PontoTelhado } from './MapaSelecionarTelhado'
import { criarTelhadoAction } from '@/app/crm/servicos/actions'

/**
 * Wizard de cadastro de telhado prospectado.
 * 3 passos: (1) selecionar ponto no mapa → (2) foto + qtd placas → (3) cliente.
 */
export function NovoTelhadoModal({ onFechar }: { onFechar: () => void }) {
  const router = useRouter()
  const [passo, setPasso] = useState<'mapa' | 'imovel' | 'cliente'>('mapa')
  const [ponto, setPonto] = useState<PontoTelhado | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [qtdPlacas, setQtdPlacas] = useState<number>(0)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTel, setClienteTel] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  async function uploadFoto(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `telhados/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('telhados-fotos').upload(path, file, {
      cacheControl: '3600', upsert: false,
    })
    if (error) { setErro(`Falha no upload: ${error.message}`); return null }
    return path
  }

  async function salvar() {
    if (!ponto) { setErro('Selecione o telhado no mapa'); return }
    if (!foto) { setErro('Foto do telhado obrigatória'); return }
    if (!qtdPlacas || qtdPlacas < 1) { setErro('Informe a quantidade estimada de placas'); return }

    setErro(null)
    setUploading(true)
    const fotoPath = await uploadFoto(foto)
    setUploading(false)
    if (!fotoPath) return

    startTransition(async () => {
      const r = await criarTelhadoAction({
        latitude: ponto.latitude,
        longitude: ponto.longitude,
        endereco: ponto.endereco,
        bairro: ponto.bairro,
        cidade: ponto.cidade,
        uf: ponto.uf,
        cep: ponto.cep,
        qtd_placas_estimada: qtdPlacas,
        foto_url: fotoPath,
        cliente_nome: clienteNome || null,
        cliente_telefone: clienteTel || null,
        cliente_email: clienteEmail || null,
        observacoes: obs || null,
        // Dados da Google Solar API (opcionais — null se fora da cobertura)
        google_max_placas: ponto.solar?.maxPlacas ?? null,
        area_util_m2: ponto.solar?.areaUtilM2 ?? null,
        geracao_anual_kwh: ponto.solar?.geracaoAnualKwh ?? null,
        imagery_quality: ponto.solar?.qualidade ?? null,
      })
      if (r?.erro) { setErro(r.erro); return }
      router.refresh()
      onFechar()
    })
  }

  if (passo === 'mapa') {
    return (
      <MapaSelecionarTelhado
        onSelecionar={(p) => {
          setPonto(p)
          // Pré-preenche qtd_placas com o valor do Google Solar (se disponível)
          if (p.solar?.maxPlacas && !qtdPlacas) setQtdPlacas(p.solar.maxPlacas)
          setPasso('imovel')
        }}
        onFechar={onFechar}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onFechar}>
      <div
        className="bg-noite border border-sol/25 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-white font-bold">Novo telhado prospectado</p>
            <p className="text-white/40 text-xs mt-0.5">
              {passo === 'imovel' ? '2/3 · imóvel' : '3/3 · cliente'}
            </p>
          </div>
          <button onClick={onFechar} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Resumo do ponto selecionado (sempre visível) */}
        {ponto && (
          <div className="px-5 py-3 bg-verde/[0.06] border-b border-verde/20">
            <p className="text-verde text-xs font-bold uppercase tracking-wider mb-1">📍 Localização</p>
            <p className="text-white text-sm">{ponto.endereco}</p>
            {(ponto.cidade || ponto.uf) && (
              <p className="text-white/50 text-xs mt-0.5">
                {ponto.bairro && `${ponto.bairro} · `}{ponto.cidade}{ponto.uf ? '/' + ponto.uf : ''}
              </p>
            )}
            <button
              onClick={() => setPasso('mapa')}
              className="mt-2 text-[11px] text-verde hover:underline"
            >
              ↺ Escolher outro ponto
            </button>
          </div>
        )}

        {passo === 'imovel' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-2">
                Foto do telhado <span className="text-coral">*</span>
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setFoto(e.target.files?.[0] || null)}
                className="w-full text-sm text-white/70 file:mr-3 file:px-3 file:py-1.5 file:bg-sol/20 file:border file:border-sol/40 file:text-sol file:font-bold file:rounded file:cursor-pointer"
              />
              {foto && <p className="text-[11px] text-verde mt-1">✓ {foto.name}</p>}
              <p className="text-[11px] text-white/40 mt-1">
                Tira do celular quando passar — o número de placas deve dar pra ver na foto.
              </p>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-2">
                Quantidade estimada de placas <span className="text-coral">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={qtdPlacas || ''}
                onChange={(e) => setQtdPlacas(Number(e.target.value))}
                placeholder="Ex: 12"
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white"
              />
              {ponto?.solar && (
                <p className="text-[11px] text-sol mt-1">
                  ☀️ Google Solar diz que cabem <strong>{ponto.solar.maxPlacas}</strong> placas
                  ({ponto.solar.potenciaMaxKwp} kWp máx, {ponto.solar.geracaoAnualKwh.toLocaleString('pt-BR')} kWh/ano estimado).
                  Ajuste se contar diferente na foto.
                </p>
              )}
              {qtdPlacas > 0 && (
                <p className="text-[11px] text-white/40 mt-1">
                  ~{(qtdPlacas * 0.55).toFixed(1)} kWp (0,55 kWp/placa média SPIN)
                </p>
              )}
            </div>

            {erro && <p className="text-sm text-coral">{erro}</p>}

            <div className="flex justify-between pt-2">
              <button onClick={() => setPasso('mapa')} className="text-sm text-white/50 hover:text-white">
                ← Mapa
              </button>
              <button
                disabled={!foto || qtdPlacas < 1}
                onClick={() => setPasso('cliente')}
                className="px-4 py-2 bg-sol/20 border border-sol/40 text-sol font-bold text-sm rounded-lg hover:bg-sol/30 disabled:opacity-40"
              >
                Próximo →
              </button>
            </div>
          </div>
        )}

        {passo === 'cliente' && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-white/50 leading-relaxed">
              Se você já tem contato do dono, preenche agora. Se não, pula — dá pra completar depois no card.
            </p>

            <Field label="Nome do cliente">
              <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input value={clienteTel} onChange={(e) => setClienteTel(e.target.value)}
                placeholder="(48) 9..."
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>
            <Field label="Email">
              <input type="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>
            <Field label="Observações">
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
                placeholder="Sistema aparentemente sujo, condomínio X, etc."
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>

            {erro && <p className="text-sm text-coral">{erro}</p>}

            <div className="flex justify-between pt-2">
              <button onClick={() => setPasso('imovel')} className="text-sm text-white/50 hover:text-white">
                ← Voltar
              </button>
              <button
                disabled={isPending || uploading}
                onClick={salvar}
                className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro disabled:opacity-50"
              >
                {uploading ? 'Enviando foto...' : isPending ? 'Salvando...' : 'Salvar prospecção'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-2">{label}</label>
      {children}
    </div>
  )
}
