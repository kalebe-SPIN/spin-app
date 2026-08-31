'use client'

/**
 * Colar link do Google Maps (do WhatsApp) → extrai lat/lng + endereço.
 * Kalebe 2026-08-31: cliente sem numeração manda a localização; o
 * consultor cola o link aqui e o sistema descobre o endereço.
 *
 * Uso: passa onResolvido — recebe { lat, lng, logradouro, numero, ... }
 * e você aplica no seu form.
 */

import { useState, useTransition } from 'react'
import {
  resolverLinkGoogleMapsAction,
  type EnderecoResolvido,
} from '@/app/crm/clientes/resolver-link-mapa/action'
import { VisualizadorMapaMini } from '@/components/VisualizadorMapaMini'

export function ColarLinkMapaBotao({
  onResolvido,
  className,
}: {
  onResolvido: (endereco: EnderecoResolvido) => void
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<EnderecoResolvido | null>(null)
  const [isPending, startTransition] = useTransition()

  function resolver() {
    setErro(null); setOk(null)
    startTransition(async () => {
      const r = await resolverLinkGoogleMapsAction(texto)
      if (r.ok) {
        // Fallback: se não veio logradouro estruturado (área rural,
        // API sem key etc), copia a descrição completa pra o campo Rua
        // pra o consultor pelo menos ter uma base pra editar.
        const enderecoParaAplicar = { ...r.endereco }
        if (!enderecoParaAplicar.logradouro && enderecoParaAplicar.descricao_completa) {
          // Extrai só a parte antes da primeira vírgula (normalmente é a rua)
          enderecoParaAplicar.logradouro = enderecoParaAplicar.descricao_completa
            .split(' - ')[0].split(',')[0].trim()
        }
        setOk(enderecoParaAplicar)
        onResolvido(enderecoParaAplicar)
        // Não fecha automático — deixa admin ver o que veio antes de fechar
      } else {
        setErro(r.erro)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setAberto(true); setErro(null); setOk(null) }}
        className={className || 'text-[10px] font-bold px-3 py-1.5 rounded bg-verde/15 border border-verde/40 text-verde hover:bg-verde/25'}
        title="Cliente sem número? Cole o link do Google Maps (WhatsApp)"
      >
        📍 Colar link do Maps
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setAberto(false)}>
          <div className="bg-noite border border-verde/40 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-white">📍 Link do Google Maps</p>
                <p className="text-[11px] text-white/50">Peça pra o cliente enviar a localização no WhatsApp e cole aqui.</p>
              </div>
              <button onClick={() => setAberto(false)} className="text-white/50 hover:text-white text-xl">×</button>
            </div>

            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Cole aqui: https://maps.app.goo.gl/... ou https://www.google.com/maps/@-27.5,-48.5,17z"
              rows={3}
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-verde/60"
            />

            <div className="flex items-center justify-end gap-2 mt-3">
              <button type="button" onClick={() => setAberto(false)}
                className="px-3 py-1.5 text-xs text-white/60 hover:text-white">
                Cancelar
              </button>
              <button type="button" onClick={resolver} disabled={isPending || !texto.trim()}
                className="px-4 py-1.5 bg-verde text-noite font-bold text-xs rounded disabled:opacity-40">
                {isPending ? '⏳ Buscando…' : '🔍 Buscar endereço'}
              </button>
            </div>

            {erro && (
              <div className="mt-3 p-3 bg-coral/10 border border-coral/30 rounded text-[11px] text-coral space-y-2">
                <p>⚠ {erro}</p>
                {/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)/i.test(texto.trim()) && (
                  <div className="pt-2 border-t border-coral/20 text-white/70 space-y-1.5">
                    <p className="font-bold text-white">💡 Como resolver:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-[10px]">
                      <li>
                        Abra o link no navegador:{' '}
                        <a href={texto.trim()} target="_blank" rel="noreferrer"
                          className="text-sol hover:underline">
                          {texto.trim().slice(0, 40)}… ↗
                        </a>
                      </li>
                      <li>Aguarde carregar (aparece o pino no mapa)</li>
                      <li>Copie a URL da barra do navegador (agora tem coordenadas)</li>
                      <li>Cole aqui de novo — vai extrair certo</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
            {ok && (
              <div className="mt-3 space-y-2">
                <div className="p-3 bg-verde/10 border border-verde/40 rounded text-[11px] text-verde space-y-1">
                  <p className="font-bold">✓ Localização encontrada</p>
                  {ok.descricao_completa && <p className="text-white/80">{ok.descricao_completa}</p>}
                  <p className="text-white/40">
                    Lat {ok.lat.toFixed(6)} · Lng {ok.lng.toFixed(6)}
                  </p>
                  {(!ok.logradouro && !ok.descricao_completa) && (
                    <p className="text-sol">⚠ Endereço estruturado não veio (área rural ou API sem chave server). Coordenadas foram salvas — complete rua/bairro/cidade manualmente.</p>
                  )}
                </div>

                {/* Preview visual satélite — Google Maps JS API (mesma
                    tech do MapaTelhadoEditor). Mostra pino em zoom
                    agressivo (20) pra ver o telhado do imóvel. */}
                <VisualizadorMapaMini lat={ok.lat} lng={ok.lng} altura={280} zoom={20} />

                <div className="flex gap-2 justify-end">
                  <a
                    href={`https://www.google.com/maps?q=${ok.lat},${ok.lng}`}
                    target="_blank" rel="noreferrer"
                    className="text-[10px] font-bold text-sol hover:underline"
                  >
                    📍 Abrir no Google Maps
                  </a>
                  <button type="button" onClick={() => setAberto(false)}
                    className="text-[10px] font-bold text-verde hover:underline">
                    Aplicar e fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
