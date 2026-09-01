'use client'

/**
 * Card "🗺 Registros do telhado" na ficha do cliente.
 *
 * - Galeria de prints (aérea/rua), medições e análises Solar salvos
 * - Botão pra abrir mapa e capturar novos registros
 * - Botão "Enviar pro campo" abre WhatsApp com todas as fotos
 *
 * Kalebe 2026-09-01: Batch 2 da toolbar do mapa.
 */

import { useState, useTransition } from 'react'
import { VisualizadorMapaMini } from '@/components/VisualizadorMapaMini'
import {
  salvarPrintTelhadoAction,
  salvarMetadadosTelhadoAction,
  excluirRegistroTelhadoAction,
  type RegistroTelhado,
} from '@/app/crm/clientes/telhado-registros/actions'

type Props = {
  clienteId: string
  clienteNome: string
  lat: number | null
  lng: number | null
  registrosIniciais: RegistroTelhado[]
  enderecoResumo?: string
}

export function TelhadoRegistrosCard({
  clienteId, clienteNome, lat, lng, registrosIniciais, enderecoResumo,
}: Props) {
  const [registros, setRegistros] = useState<RegistroTelhado[]>(registrosIniciais)
  const [mapaAberto, setMapaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (!lat || !lng) {
    return (
      <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🗺</span>
          <h3 className="text-xs uppercase tracking-wider font-bold text-sol">Registros do telhado</h3>
        </div>
        <p className="text-xs text-white/60">
          Precisa cadastrar o endereço no mapa primeiro pra capturar registros.
        </p>
      </section>
    )
  }

  async function salvarPrint(dados: { tipo: 'aerea' | 'rua'; dataUrl: string }) {
    setSalvando(true); setErro(null)
    try {
      const blob = await fetch(dados.dataUrl).then((r) => r.blob())
      const fd = new FormData()
      fd.append('cliente_id', clienteId)
      fd.append('tipo', dados.tipo)
      fd.append('lat', String(lat))
      fd.append('lng', String(lng))
      fd.append('arquivo', blob, `${dados.tipo}.png`)
      const r = await salvarPrintTelhadoAction(fd)
      if (r.ok) {
        setRegistros((prev) => [...prev, {
          tipo: dados.tipo, url: r.url, lat: lat!, lng: lng!,
          criado_em: new Date().toISOString(),
        }])
      } else {
        setErro(r.erro)
      }
    } catch (e: any) {
      setErro(e?.message || 'falha')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarPoligono(dados: { areaM2: number; pontos: Array<{ lat: number; lng: number }> }) {
    startTransition(async () => {
      const r = await salvarMetadadosTelhadoAction(clienteId, {
        tipo: 'poligono',
        lat: lat!, lng: lng!,
        area_m2: dados.areaM2,
        poligono: dados.pontos,
      })
      if (r.ok) {
        setRegistros((prev) => [...prev, {
          tipo: 'poligono', lat: lat!, lng: lng!,
          area_m2: dados.areaM2, poligono: dados.pontos,
          criado_em: new Date().toISOString(),
        }])
      } else {
        setErro(r.erro)
      }
    })
  }

  async function salvarSolar(solar: any) {
    startTransition(async () => {
      const r = await salvarMetadadosTelhadoAction(clienteId, {
        tipo: 'solar', lat: lat!, lng: lng!, solar,
      })
      if (r.ok) {
        setRegistros((prev) => [...prev, {
          tipo: 'solar', lat: lat!, lng: lng!, solar,
          criado_em: new Date().toISOString(),
        }])
      } else {
        setErro(r.erro)
      }
    })
  }

  async function excluir(criadoEm: string) {
    if (!confirm('Excluir este registro?')) return
    startTransition(async () => {
      const r = await excluirRegistroTelhadoAction(clienteId, criadoEm)
      if (r.ok) setRegistros((prev) => prev.filter((x) => x.criado_em !== criadoEm))
    })
  }

  function abrirWhatsAppCampo() {
    const linkMaps = `https://www.google.com/maps?q=${lat},${lng}`
    const urls: string[] = registros.filter((r) => !!r.url).map((r) => r.url!).slice(0, 5)
    const linhas: string[] = [
      `Olá! Local de instalação — *${clienteNome}*`,
      '',
    ]
    if (enderecoResumo) linhas.push(`📍 ${enderecoResumo}`, '')
    linhas.push(`🗺 ${linkMaps}`)
    const medida = registros.find((r) => r.tipo === 'poligono')
    if (medida?.area_m2) linhas.push(`📐 Área do telhado: ${medida.area_m2.toFixed(1)} m²`)
    const solar = registros.find((r) => r.tipo === 'solar')?.solar
    if (solar) linhas.push(`🔬 Google Solar: ${solar.maxPlacas} placas máx (${solar.potenciaMaxKwp} kWp)`)
    if (urls.length > 0) {
      linhas.push('', '🖼 Fotos:')
      urls.forEach((u) => linhas.push(u))
    }
    const msg = encodeURIComponent(linhas.join('\n'))
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const prints = registros.filter((r) => r.tipo === 'aerea' || r.tipo === 'rua')
  const medida = registros.find((r) => r.tipo === 'poligono')
  const solar = registros.find((r) => r.tipo === 'solar')?.solar

  return (
    <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗺</span>
          <h3 className="text-xs uppercase tracking-wider font-bold text-sol">Registros do telhado</h3>
          <span className="text-[10px] text-white/40">({registros.length})</span>
        </div>
        <div className="flex gap-2">
          {registros.length > 0 && (
            <button type="button" onClick={abrirWhatsAppCampo}
              className="px-3 py-1.5 text-[11px] font-bold bg-verde/15 border border-verde/40 rounded text-verde hover:bg-verde/25">
              💬 Enviar pro campo
            </button>
          )}
          <button type="button" onClick={() => setMapaAberto((v) => !v)}
            className="px-3 py-1.5 text-[11px] font-bold bg-sol/15 border border-sol/40 rounded text-sol hover:bg-sol/25">
            {mapaAberto ? '✕ Fechar mapa' : '📷 Capturar novo'}
          </button>
        </div>
      </div>

      {erro && (
        <p className="text-[11px] px-3 py-1.5 bg-coral/10 border border-coral/30 rounded text-coral">
          ⚠ {erro}
        </p>
      )}

      {/* Resumo — se tem medida ou solar, mostra */}
      {(medida?.area_m2 || solar) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          {medida?.area_m2 && (
            <div className="px-3 py-2 bg-sol/10 border border-sol/30 rounded">
              <div className="text-white/50 text-[9px] uppercase">Área medida</div>
              <div className="text-sol font-bold">{medida.area_m2.toFixed(1)} m²</div>
            </div>
          )}
          {solar && (
            <>
              <div className="px-3 py-2 bg-verde/10 border border-verde/30 rounded">
                <div className="text-white/50 text-[9px] uppercase">Solar máx</div>
                <div className="text-verde font-bold">{solar.maxPlacas} placas</div>
              </div>
              <div className="px-3 py-2 bg-verde/10 border border-verde/30 rounded">
                <div className="text-white/50 text-[9px] uppercase">kWp máx</div>
                <div className="text-verde font-bold">{solar.potenciaMaxKwp} kWp</div>
              </div>
              <div className="px-3 py-2 bg-verde/10 border border-verde/30 rounded">
                <div className="text-white/50 text-[9px] uppercase">Geração/mês</div>
                <div className="text-verde font-bold">{Math.round(solar.geracaoAnualKwh / 12)} kWh</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Galeria de prints */}
      {prints.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">📸 Fotos ({prints.length})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {prints.map((p) => (
              <div key={p.criado_em} className="relative rounded overflow-hidden border border-white/10">
                <a href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt="" className="w-full h-24 object-cover hover:opacity-80" />
                </a>
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-noite/80 text-[9px] font-bold text-white">
                  {p.tipo === 'aerea' ? '🛰' : '🎥'}
                </div>
                <button type="button" onClick={() => excluir(p.criado_em)}
                  className="absolute top-1 right-1 w-5 h-5 rounded bg-noite/80 hover:bg-coral/80 text-white/80 text-[10px]">
                  ✕
                </button>
                <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-noite/80 text-[9px] text-white/60 text-center">
                  {new Date(p.criado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {registros.length === 0 && !mapaAberto && (
        <p className="text-xs text-white/50 text-center py-4">
          Nenhum registro ainda. Clique em <b>📷 Capturar novo</b> pra começar.
        </p>
      )}

      {/* Mapa embutido pra capturar */}
      {mapaAberto && (
        <div className="pt-2 border-t border-white/10">
          {salvando && (
            <p className="text-[11px] text-sol mb-2">⏳ Salvando registro…</p>
          )}
          <VisualizadorMapaMini
            lat={lat} lng={lng} altura={400} zoom={20}
            onPrintPronto={salvarPrint}
            onAreaMedida={salvarPoligono}
            onSolarPronto={salvarSolar}
          />
          <p className="text-[10px] text-white/40 mt-2">
            💡 Prints, medições e análise Solar são salvos automaticamente no perfil.
          </p>
        </div>
      )}
    </section>
  )
}
