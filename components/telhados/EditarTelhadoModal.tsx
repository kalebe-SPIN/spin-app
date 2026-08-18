'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarTelhadoAction, excluirTelhadoAction } from '@/app/crm/servicos/actions'
import type { TelhadoCard } from './KanbanTelhados'
import { SimuladorPropostaEmbutido, type CidadeOpcao } from './SimuladorPropostaEmbutido'
import type { ParametrosLimpeza } from '@/lib/precificacao/servico-limpeza'
import { EscolherCriativoModal } from '@/components/criativos/EscolherCriativoModal'

/**
 * Modal de edição do card de telhado — abre ao clicar em cima da foto/título.
 * Mostra foto, permite editar todos os campos textuais e a qtd de placas.
 * Coordenadas (lat/lng) não são editadas aqui — só via re-cadastro.
 */
export function EditarTelhadoModal({
  telhado, bucketPublicUrl, onFechar, parametrosLimpeza, cidades, propostaAnterior,
}: {
  telhado: TelhadoCard
  bucketPublicUrl: string
  onFechar: () => void
  parametrosLimpeza?: ParametrosLimpeza | null
  cidades?: CidadeOpcao[]
  propostaAnterior?: { entradas: any; resultado: { subtotal: number }; valor_final: number } | null
}) {
  const mostrarSimulador = (telhado.fase === 'proposta' || telhado.fase === 'fechado')
    && parametrosLimpeza != null
    && cidades != null
  const mostrarCriativos = telhado.fase === 'prospeccao' || telhado.fase === 'contato'
  const [criativosAberto, setCriativosAberto] = useState(false)
  const router = useRouter()
  const [apelido, setApelido] = useState(telhado.apelido || '')
  const [endereco, setEndereco] = useState(telhado.endereco)
  const [cidade, setCidade] = useState(telhado.cidade || '')
  const [qtdPlacas, setQtdPlacas] = useState<number>(telhado.qtd_placas_estimada || 0)
  const [clienteNome, setClienteNome] = useState(telhado.cliente_nome || '')
  const [clienteTel, setClienteTel] = useState(telhado.cliente_telefone || '')
  // Campos que o Kanban não carregava (email, obs) ficam em branco pra edição — dá pra preencher
  const [clienteEmail, setClienteEmail] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const fotoSrc = telhado.foto_url.startsWith('http')
    ? telhado.foto_url
    : `${bucketPublicUrl}/${telhado.foto_url}`

  function salvar() {
    if (!endereco.trim()) { setErro('Endereço obrigatório'); return }
    setErro(null)
    startTransition(async () => {
      const r = await editarTelhadoAction(telhado.id, {
        apelido: apelido.trim() || null,
        endereco: endereco.trim(),
        cidade: cidade.trim() || null,
        qtd_placas_estimada: qtdPlacas > 0 ? qtdPlacas : null,
        cliente_nome: clienteNome.trim() || null,
        cliente_telefone: clienteTel || null,
        cliente_email: clienteEmail.trim() || null,
        observacoes: obs.trim() || null,
      })
      if (r?.erro) { setErro(r.erro); return }
      router.refresh()
      onFechar()
    })
  }

  function excluir() {
    if (!confirm(`Excluir "${telhado.apelido || telhado.endereco}"? Não dá pra desfazer.`)) return
    startTransition(async () => {
      const r = await excluirTelhadoAction(telhado.id)
      if (r?.erro) { alert(r.erro); return }
      router.refresh()
      onFechar()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onFechar}>
      <div className="bg-noite border border-sol/25 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-white font-bold">Editar telhado</p>
            <p className="text-white/40 text-xs mt-0.5">Fase: {telhado.fase}</p>
          </div>
          <button onClick={onFechar} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Foto */}
        <div className="relative h-40 bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoSrc} alt="Telhado" className="w-full h-full object-cover" />
          {telhado.potencia_kwp_estimada && (
            <div className="absolute top-2 right-2 px-2 py-1 bg-noite/90 backdrop-blur text-xs text-white font-bold rounded">
              {telhado.qtd_placas_estimada} placas · {telhado.potencia_kwp_estimada}kWp
            </div>
          )}
        </div>

        {/* BOTÃO CRIATIVOS — só nas 2 primeiras fases */}
        {mostrarCriativos && (
          <div className="p-5 border-b border-white/10">
            <button
              onClick={() => setCriativosAberto(true)}
              className="w-full px-4 py-3 bg-weg-azul/15 border border-weg-azul/40 text-weg-azul font-bold text-sm rounded-lg hover:bg-weg-azul/25 flex items-center justify-center gap-2"
            >
              📚 Enviar criativo pelo WhatsApp
            </button>
            <p className="text-[11px] text-white/40 text-center mt-1">
              Escolhe da biblioteca de vendas e o WhatsApp abre com mensagem pronta.
            </p>
          </div>
        )}

        {/* SIMULADOR EMBUTIDO — só nas fases Proposta e Fechado */}
        {mostrarSimulador && (
          <div className="p-5 bg-gradient-to-br from-sol/[0.06] to-transparent border-b border-sol/25">
            <div className="mb-3">
              <p className="text-sol font-bold text-sm">🧾 Proposta ao vivo</p>
              <p className="text-white/50 text-[11px] mt-0.5">
                Mexe nos campos enquanto fala com o cliente — o valor recalcula na hora.
              </p>
            </div>
            {telhado.qtd_placas_estimada && telhado.qtd_placas_estimada > 0 ? (
              <SimuladorPropostaEmbutido
                telhadoId={telhado.id}
                qtdPlacasInicial={telhado.qtd_placas_estimada}
                parametros={parametrosLimpeza!}
                cidades={cidades!}
                propostaAnterior={propostaAnterior || null}
              />
            ) : (
              <div className="p-3 bg-coral/10 border border-coral/30 rounded-lg text-xs text-coral">
                Preencha a <strong>quantidade estimada de placas</strong> abaixo pra habilitar o simulador.
              </div>
            )}
          </div>
        )}

        <div className="p-5 space-y-4">
          <Field label="Apelido do card">
            <input value={apelido} onChange={(e) => setApelido(e.target.value)}
              placeholder='Ex: "Padaria da esquina"'
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
          </Field>

          <Field label="Endereço / localização" obrigatorio>
            <textarea value={endereco} onChange={(e) => setEndereco(e.target.value)} rows={2}
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
          </Field>

          <Field label="Cidade">
            <input value={cidade} onChange={(e) => setCidade(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
          </Field>

          <Field label="Quantidade estimada de placas">
            <input type="number" min={0} value={qtdPlacas || ''}
              onChange={(e) => setQtdPlacas(Number(e.target.value))}
              placeholder="Deixe vazio se não souber"
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            {qtdPlacas > 0 && (
              <p className="text-[11px] text-white/40 mt-1">
                ~{(qtdPlacas * 0.55).toFixed(1)} kWp
              </p>
            )}
          </Field>

          <div className="pt-2 border-t border-white/10">
            <p className="text-xs uppercase tracking-wider font-bold text-verde mb-3">Dados do cliente</p>

            <Field label="Nome">
              <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
            </Field>

            <div className="mt-3">
              <Field label="Telefone / WhatsApp">
                <input value={clienteTel} onChange={(e) => setClienteTel(e.target.value)}
                  placeholder="(48) 9..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Email">
                <input type="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Observações">
                <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
                  className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white" />
              </Field>
            </div>
          </div>

          {erro && <p className="text-sm text-coral">{erro}</p>}

          {criativosAberto && (
            <EscolherCriativoModal
              clienteNome={clienteNome}
              clienteTelefone={clienteTel}
              onFechar={() => setCriativosAberto(false)}
            />
          )}

          <div className="flex items-center justify-between pt-2 gap-2">
            <button
              onClick={excluir}
              disabled={isPending}
              className="text-sm text-coral hover:text-coral/80 disabled:opacity-40"
            >
              🗑 Excluir
            </button>
            <div className="flex gap-2">
              <button onClick={onFechar} className="px-3 py-2 text-sm text-white/60 hover:text-white">
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={isPending}
                className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro disabled:opacity-50"
              >
                {isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
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
