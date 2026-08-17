'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { MapaSelecionarTelhado, type PontoTelhado } from './MapaSelecionarTelhado'
import { criarTelhadoAction } from '@/app/crm/servicos/actions'

type Passo = 'escolha' | 'mapa' | 'imovel' | 'cliente' | 'manual'

/**
 * Wizard de cadastro de telhado prospectado.
 *
 * Dois caminhos:
 *   • Mapa (Google Maps satélite + reverse geocoding + Solar API)
 *   • Manual (vendedor usa Google Earth externo pra medir, salva screenshot
 *     e anexa aqui). Usado enquanto o Google Maps não está configurado
 *     no Vercel; também serve pra casos rurais sem cobertura do Solar API.
 */
export function NovoTelhadoModal({ onFechar }: { onFechar: () => void }) {
  const router = useRouter()
  const [passo, setPasso] = useState<Passo>('escolha')

  // Dados do modo mapa
  const [ponto, setPonto] = useState<PontoTelhado | null>(null)

  // Dados comuns
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoExtra, setFotoExtra] = useState<File | null>(null)
  const [qtdPlacas, setQtdPlacas] = useState<number>(0)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTel, setClienteTel] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [obs, setObs] = useState('')

  // Modo manual — localização em texto livre
  const [localizacaoManual, setLocalizacaoManual] = useState('')

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

  async function salvarComMapa() {
    if (!ponto) { setErro('Selecione o telhado no mapa'); return }
    if (!foto) { setErro('Foto do telhado obrigatória'); return }

    setErro(null)
    setUploading(true)
    const fotoPath = await uploadFoto(foto)
    const fotoExtraPath = fotoExtra ? await uploadFoto(fotoExtra) : null
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
        qtd_placas_estimada: qtdPlacas > 0 ? qtdPlacas : null,
        foto_url: fotoPath,
        foto_satelite_url: fotoExtraPath,
        cliente_nome: clienteNome || null,
        cliente_telefone: clienteTel || null,
        cliente_email: clienteEmail || null,
        observacoes: obs || null,
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

  async function salvarManual() {
    if (!clienteNome.trim()) { setErro('Nome do cliente obrigatório'); return }
    if (!localizacaoManual.trim()) { setErro('Localização obrigatória'); return }
    if (!foto) { setErro('Foto do telhado obrigatória'); return }

    setErro(null)
    setUploading(true)
    const fotoPath = await uploadFoto(foto)
    const fotoExtraPath = fotoExtra ? await uploadFoto(fotoExtra) : null
    setUploading(false)
    if (!fotoPath) return

    startTransition(async () => {
      const r = await criarTelhadoAction({
        // sem coordenadas (Google Earth externo)
        endereco: localizacaoManual.trim(),
        qtd_placas_estimada: qtdPlacas > 0 ? qtdPlacas : null,
        foto_url: fotoPath,
        foto_satelite_url: fotoExtraPath,
        cliente_nome: clienteNome.trim(),
        cliente_telefone: clienteTel || null,
        cliente_email: clienteEmail || null,
        observacoes: obs || null,
      })
      if (r?.erro) { setErro(r.erro); return }
      router.refresh()
      onFechar()
    })
  }

  // ── PASSO ESCOLHA ──
  if (passo === 'escolha') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onFechar}>
        <div className="bg-noite border border-sol/25 rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-white font-bold text-lg">Novo telhado prospectado</p>
            <button onClick={onFechar} className="text-white/50 hover:text-white text-xl leading-none">×</button>
          </div>
          <p className="text-white/50 text-sm mb-5">Como você quer cadastrar?</p>

          <div className="space-y-3">
            <button
              onClick={() => setPasso('mapa')}
              className="w-full p-4 bg-sol/10 border border-sol/30 rounded-xl text-left hover:bg-sol/20 transition"
            >
              <p className="text-sol font-bold flex items-center gap-2">🗺 Selecionar no mapa</p>
              <p className="text-white/60 text-xs mt-1 leading-snug">
                Clica em cima do telhado no Google Maps satélite. Endereço preenchido automático + Solar API estima quantidade de placas. Depende da chave do Google Maps estar configurada.
              </p>
            </button>

            <button
              onClick={() => setPasso('manual')}
              className="w-full p-4 bg-weg-azul/10 border border-weg-azul/30 rounded-xl text-left hover:bg-weg-azul/20 transition"
            >
              <p className="text-weg-azul font-bold flex items-center gap-2">✍ Cadastro manual</p>
              <p className="text-white/60 text-xs mt-1 leading-snug">
                Você mediu o telhado no Google Earth (externo), salvou o print, e anexa aqui. Preenche endereço, cliente e foto. Sem depender de mapa integrado — funciona sempre.
              </p>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── PASSO MAPA (delega pro componente Google Maps) ──
  if (passo === 'mapa') {
    return (
      <MapaSelecionarTelhado
        onSelecionar={(p) => {
          setPonto(p)
          if (p.solar?.maxPlacas && !qtdPlacas) setQtdPlacas(p.solar.maxPlacas)
          setPasso('imovel')
        }}
        onFechar={() => setPasso('escolha')}
      />
    )
  }

  // ── SHELL COMUM ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onFechar}>
      <div
        className="bg-noite border border-sol/25 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-white font-bold">Novo telhado</p>
            <p className="text-white/40 text-xs mt-0.5">
              {passo === 'imovel' ? 'Mapa · 2/3 · imóvel' :
               passo === 'cliente' ? 'Mapa · 3/3 · cliente' :
               'Manual · dados + foto'}
            </p>
          </div>
          <button onClick={onFechar} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Resumo do ponto (só no fluxo mapa) */}
        {ponto && passo !== 'manual' && (
          <div className="px-5 py-3 bg-verde/[0.06] border-b border-verde/20">
            <p className="text-verde text-xs font-bold uppercase tracking-wider mb-1">📍 Localização</p>
            <p className="text-white text-sm">{ponto.endereco}</p>
            {(ponto.cidade || ponto.uf) && (
              <p className="text-white/50 text-xs mt-0.5">
                {ponto.bairro && `${ponto.bairro} · `}{ponto.cidade}{ponto.uf ? '/' + ponto.uf : ''}
              </p>
            )}
            <button onClick={() => setPasso('mapa')} className="mt-2 text-[11px] text-verde hover:underline">
              ↺ Escolher outro ponto
            </button>
          </div>
        )}

        {/* ── PASSO IMOVEL (fluxo mapa) ── */}
        {passo === 'imovel' && (
          <div className="p-5 space-y-4">
            <UploadFoto label="Foto do telhado" foto={foto} setFoto={setFoto} obrigatorio />
            <UploadFoto label="Foto adicional (opcional)" foto={fotoExtra} setFoto={setFotoExtra} />

            <Field label="Quantidade estimada de placas">
              <input
                type="number" min={1} value={qtdPlacas || ''}
                onChange={(e) => setQtdPlacas(Number(e.target.value))}
                placeholder="Ex: 12 (opcional)"
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white"
              />
              {ponto?.solar && (
                <p className="text-[11px] text-sol mt-1">
                  ☀️ Google Solar diz que cabem <strong>{ponto.solar.maxPlacas}</strong> placas
                  ({ponto.solar.potenciaMaxKwp} kWp máx). Ajuste se contar diferente na foto.
                </p>
              )}
              {qtdPlacas > 0 && (
                <p className="text-[11px] text-white/40 mt-1">
                  ~{(qtdPlacas * 0.55).toFixed(1)} kWp (0,55 kWp/placa média SPIN)
                </p>
              )}
            </Field>

            {erro && <p className="text-sm text-coral">{erro}</p>}
            <div className="flex justify-between pt-2">
              <button onClick={() => setPasso('mapa')} className="text-sm text-white/50 hover:text-white">← Mapa</button>
              <button
                disabled={!foto}
                onClick={() => setPasso('cliente')}
                className="px-4 py-2 bg-sol/20 border border-sol/40 text-sol font-bold text-sm rounded-lg hover:bg-sol/30 disabled:opacity-40"
              >
                Próximo →
              </button>
            </div>
          </div>
        )}

        {/* ── PASSO CLIENTE (fluxo mapa) ── */}
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
              <button onClick={() => setPasso('imovel')} className="text-sm text-white/50 hover:text-white">← Voltar</button>
              <button
                disabled={isPending || uploading}
                onClick={salvarComMapa}
                className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro disabled:opacity-50"
              >
                {uploading ? 'Enviando fotos...' : isPending ? 'Salvando...' : 'Salvar prospecção'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASSO MANUAL (fluxo sem mapa) ── */}
        {passo === 'manual' && (
          <div className="p-5 space-y-4">
            <div className="p-3 bg-weg-azul/[0.06] border border-weg-azul/25 rounded-lg text-xs text-white/70 leading-relaxed">
              <strong className="text-weg-azul">💡 Como usar:</strong> abra o Google Earth, ache o telhado do cliente, mede a área,
              salva um print (ou 2) e anexa aqui. Só nome + localização + foto são obrigatórios — o resto preenche se souber.
            </div>

            <Field label="Nome do cliente" obrigatorio>
              <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>

            <Field label="Localização" obrigatorio>
              <textarea value={localizacaoManual} onChange={(e) => setLocalizacaoManual(e.target.value)} rows={2}
                placeholder="Endereço, bairro, cidade, ou ponto de referência. Ex: Rua das Palmeiras 120, Centro, Tijucas/SC"
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>

            <UploadFoto label="Foto do telhado (print do Google Earth ou foto real)" foto={foto} setFoto={setFoto} obrigatorio />
            <UploadFoto label="Foto adicional (opcional)" foto={fotoExtra} setFoto={setFotoExtra} />

            <Field label="Quantidade estimada de placas">
              <input type="number" min={1} value={qtdPlacas || ''}
                onChange={(e) => setQtdPlacas(Number(e.target.value))}
                placeholder="Ex: 12 (opcional — preenche depois se não souber)"
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
              {qtdPlacas > 0 && (
                <p className="text-[11px] text-white/40 mt-1">
                  ~{(qtdPlacas * 0.55).toFixed(1)} kWp (0,55 kWp/placa média SPIN)
                </p>
              )}
            </Field>

            <Field label="Telefone / WhatsApp">
              <input value={clienteTel} onChange={(e) => setClienteTel(e.target.value)}
                placeholder="(48) 9... — opcional"
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>

            <Field label="Email">
              <input type="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)}
                placeholder="opcional"
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>

            <Field label="Observações">
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
                placeholder="Área medida no Earth, sombreamento, obstáculos, condomínio X..."
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>

            {erro && <p className="text-sm text-coral">{erro}</p>}
            <div className="flex justify-between pt-2">
              <button onClick={() => setPasso('escolha')} className="text-sm text-white/50 hover:text-white">← Voltar</button>
              <button
                disabled={isPending || uploading || !clienteNome.trim() || !localizacaoManual.trim() || !foto}
                onClick={salvarManual}
                className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro disabled:opacity-50"
              >
                {uploading ? 'Enviando fotos...' : isPending ? 'Salvando...' : 'Salvar prospecção'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, obrigatorio, children }: { label: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-2">
        {label} {obrigatorio && <span className="text-coral">*</span>}
      </label>
      {children}
    </div>
  )
}

function UploadFoto({ label, foto, setFoto, obrigatorio }: {
  label: string
  foto: File | null
  setFoto: (f: File | null) => void
  obrigatorio?: boolean
}) {
  return (
    <Field label={label} obrigatorio={obrigatorio}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setFoto(e.target.files?.[0] || null)}
        className="w-full text-sm text-white/70 file:mr-3 file:px-3 file:py-1.5 file:bg-sol/20 file:border file:border-sol/40 file:text-sol file:font-bold file:rounded file:cursor-pointer"
      />
      {foto && <p className="text-[11px] text-verde mt-1">✓ {foto.name}</p>}
    </Field>
  )
}
