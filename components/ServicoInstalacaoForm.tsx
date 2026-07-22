'use client'

import { useState, useMemo, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  calcularInstalacaoPlacas,
  type EntradasInstalacaoPlacas,
  type ParametrosInstalacaoPlacas,
} from '@/lib/precificacao/servico-instalacao-placas'
import {
  OPCOES_TELHADO,
  OPCOES_PAVIMENTO,
  OPCOES_PROGRAMACAO,
} from '@/lib/precificacao/servico-retirada-recolocacao'
import { salvarServicoInstalacaoAction } from '@/app/projetos/[id]/servico-instalacao/actions'

type ItemCatalogo = {
  id: string
  codigo: string
  modelo: string
  potencia_w?: number
  preco: number
}

type Props = {
  projetoId: string
  parametros: ParametrosInstalacaoPlacas
  entradasIniciais: EntradasInstalacaoPlacas | null
  valorFinalInicial: number | null
  placasCatalogo: ItemCatalogo[]
  estruturasCatalogo: ItemCatalogo[]
}

const DEFAULT: EntradasInstalacaoPlacas = {
  qtd_modulos: 12,
  qtd_strings: 1,
  tipo_telhado: 'fibrocimento',
  altura_telhado_m: 4,
  pavimento: 'terreo',
  km_deslocamento: 30,
  programacao: 'normal',
  qtd_instaladores: 2,
  dias_estimados: 2,
  precisa_cabo_novo: true,
  spin_assina_rt: true,
  precisa_padrao_novo: false,
  modo_material_placa: 'nenhum',
  observacoes: '',
}

const OPT: React.CSSProperties = { backgroundColor: '#050B16', color: '#ffffff' }

export function ServicoInstalacaoForm({
  projetoId, parametros, entradasIniciais, valorFinalInicial,
  placasCatalogo, estruturasCatalogo,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [e, setE] = useState<EntradasInstalacaoPlacas>(entradasIniciais || DEFAULT)

  // Quando muda placa/estrutura no dropdown WEG, atualiza preco+modelo automaticamente
  function selecionarPlacaWeg(id: string) {
    const p = placasCatalogo.find(x => x.id === id)
    setE({
      ...e,
      placa_id: id,
      placa_modelo: p?.modelo || null,
      placa_preco_unitario: p?.preco || 0,
    })
  }
  function selecionarEstruturaWeg(id: string) {
    const est = estruturasCatalogo.find(x => x.id === id)
    setE({
      ...e,
      estrutura_id: id,
      estrutura_modelo: est?.modelo || null,
      estrutura_preco_unitario: est?.preco || 0,
    })
  }
  const resultado = useMemo(() => calcularInstalacaoPlacas(e, parametros), [e, parametros])
  const [ajuste, setAjuste] = useState<number>(
    valorFinalInicial != null ? valorFinalInicial - (entradasIniciais ? resultado.subtotal : 0) : 0,
  )
  const valorFinal = resultado.subtotal + ajuste

  function set<K extends keyof EntradasInstalacaoPlacas>(k: K, v: EntradasInstalacaoPlacas[K]) {
    setE({ ...e, [k]: v })
  }

  function salvar() {
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await salvarServicoInstalacaoAction(projetoId, e, resultado, valorFinal)
      if ('erro' in res && res.erro) setErro(res.erro)
      else {
        setMsg('✓ Serviço salvo no projeto.')
        setTimeout(() => router.push(`/projetos/${projetoId}`), 800)
      }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form */}
      <div className="lg:col-span-2 space-y-4">
        <Bloco titulo="Módulos e strings">
          <Num label="Qtd módulos" v={e.qtd_modulos} onChange={v => set('qtd_modulos', v)} />
          <Num label="Qtd strings" v={e.qtd_strings} onChange={v => set('qtd_strings', v)}
            hint="Pra calcular MC4 (1 par por string)" />
        </Bloco>

        {/* Materiais das placas — WEG vs outro fornecedor */}
        <Bloco titulo="🌞 Placas e estrutura — quem fornece?">
          <div className="col-span-2 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <ModoBotao
                label="Nenhum"
                hint="Cliente traz kit completo"
                ativo={e.modo_material_placa === 'nenhum'}
                onClick={() => set('modo_material_placa', 'nenhum')}
              />
              <ModoBotao
                label="🌞 WEG (catálogo Spin)"
                hint="Puxa preço automático"
                ativo={e.modo_material_placa === 'weg'}
                onClick={() => set('modo_material_placa', 'weg')}
                destaque="sol"
              />
              <ModoBotao
                label="Outro fornecedor"
                hint="Digita preço manual"
                ativo={e.modo_material_placa === 'outro'}
                onClick={() => set('modo_material_placa', 'outro')}
                destaque="wegazul"
              />
            </div>

            {/* Modo WEG */}
            {e.modo_material_placa === 'weg' && (
              <div className="p-3 bg-sol/5 border border-sol/20 rounded-lg space-y-3">
                <div>
                  <label className="text-[10px] uppercase text-white/50 block mb-1">
                    Placa WEG ({placasCatalogo.length} disponíveis)
                  </label>
                  {placasCatalogo.length === 0 ? (
                    <p className="text-xs text-coral">
                      ⚠️ Nenhuma placa no catálogo. Cadastre em /admin/catalogo.
                    </p>
                  ) : (
                    <select
                      value={e.placa_id || ''}
                      onChange={ev => selecionarPlacaWeg(ev.target.value)}
                      className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
                    >
                      <option style={OPT} value="">Escolha uma placa...</option>
                      {placasCatalogo.map(p => (
                        <option key={p.id} value={p.id} style={OPT}>
                          {p.modelo} {p.potencia_w ? `· ${p.potencia_w}Wp` : ''} · R$ {p.preco.toFixed(2)}/un
                        </option>
                      ))}
                    </select>
                  )}
                  {e.placa_preco_unitario ? (
                    <p className="text-[10px] text-sol mt-1">
                      💡 Total placas: {e.qtd_modulos} × R$ {e.placa_preco_unitario.toFixed(2)} = R$ {(e.qtd_modulos * e.placa_preco_unitario).toFixed(2)}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="text-[10px] uppercase text-white/50 block mb-1">
                    Estrutura WEG (opcional)
                  </label>
                  <select
                    value={e.estrutura_id || ''}
                    onChange={ev => selecionarEstruturaWeg(ev.target.value)}
                    className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
                  >
                    <option style={OPT} value="">Sem estrutura do catálogo</option>
                    {estruturasCatalogo.map(est => (
                      <option key={est.id} value={est.id} style={OPT}>
                        {est.modelo} · R$ {est.preco.toFixed(2)}/un
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Modo outro fornecedor — upload + IA + campos editaveis */}
            {e.modo_material_placa === 'outro' && (
              <UploadOrcamentoConcorrente
                entradas={e}
                setEntradas={setE}
              />
            )}
          </div>
        </Bloco>

        <Bloco titulo="Local da instalação">
          <Select label="Tipo do telhado" v={e.tipo_telhado}
            onChange={v => set('tipo_telhado', v as any)} opcoes={OPCOES_TELHADO} />
          <Select label="Pavimento" v={e.pavimento}
            onChange={v => set('pavimento', v as any)} opcoes={OPCOES_PAVIMENTO} />
          <Num label="Altura telhado (m)" v={e.altura_telhado_m ?? 0} onChange={v => set('altura_telhado_m', v)} step={0.5} />
        </Bloco>

        <Bloco titulo="Logística">
          <Num label="KM base Spin → obra" v={e.km_deslocamento} onChange={v => set('km_deslocamento', v)} />
          <Num label="Qtd instaladores" v={e.qtd_instaladores} onChange={v => set('qtd_instaladores', v)} />
          <Num label="Dias estimados" v={e.dias_estimados} onChange={v => set('dias_estimados', v)} step={0.5} />
          <Select label="Programação" v={e.programacao}
            onChange={v => set('programacao', v as any)} opcoes={OPCOES_PROGRAMACAO} />
        </Bloco>

        <Bloco titulo="Materiais">
          <div className="col-span-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={e.precisa_cabo_novo}
                onChange={ev => set('precisa_cabo_novo', ev.target.checked)}
                className="w-4 h-4 accent-sol"
              />
              <span className="text-sm text-white">Comprar cabo solar novo</span>
            </label>
            <p className="text-[10px] text-white/50 pl-6">
              MC4, mangueira, suportes e parafusos SEMPRE são novos nesse serviço.
            </p>
          </div>
        </Bloco>

        <Bloco titulo="Serviços adicionais (opcionais)">
          <div className="col-span-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={e.spin_assina_rt}
                onChange={ev => set('spin_assina_rt', ev.target.checked)}
                className="w-4 h-4 accent-verde"
              />
              <span className="text-sm text-white">Spin assina o RT/ART (homologação CELESC)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={e.precisa_padrao_novo}
                onChange={ev => set('precisa_padrao_novo', ev.target.checked)}
                className="w-4 h-4 accent-weg-azul"
              />
              <span className="text-sm text-white">Precisa padrão de entrada NOVO</span>
            </label>
          </div>
        </Bloco>

        <Bloco titulo="Observações">
          <div className="col-span-2">
            <textarea
              value={e.observacoes || ''}
              onChange={ev => set('observacoes', ev.target.value)}
              rows={3}
              placeholder="Kit trazido pelo cliente, particularidades da obra, prazo, etc..."
              className="w-full px-3 py-2 bg-noite border border-white/15 rounded text-white text-sm placeholder:text-white/30"
            />
          </div>
        </Bloco>
      </div>

      {/* Painel de calculo */}
      <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
        <div className="bg-sol/5 border border-sol/30 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">Preço calculado</p>

          <div className="space-y-1.5 text-sm text-white/80 mb-4">
            <Linha label="Mão de obra" v={resultado.mao_obra} />
            <Linha label="Deslocamento" v={resultado.deslocamento} />
            <Linha label="Diárias" v={resultado.diarias} />
            <Linha label="Materiais" v={resultado.materiais_total} />
            {resultado.kit_total > 0 && (
              <Linha label="🌞 Kit placas + estrutura" v={resultado.kit_total} />
            )}
            <Linha label="Extras (ART / padrão)" v={resultado.extras_total} />
          </div>

          <div className="border-t border-white/10 pt-3 mb-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-white/60">Subtotal (custo)</span>
              <span className="text-sm font-bold text-white">R$ {resultado.subtotal.toFixed(2)}</span>
            </div>

            <label className="text-[10px] uppercase text-white/50 block mt-3 mb-1">Ajuste manual (R$)</label>
            <input
              type="number"
              step={10}
              value={ajuste}
              onChange={ev => setAjuste(parseFloat(ev.target.value) || 0)}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
              placeholder="Margem / comissão / desconto"
            />
          </div>

          <div className="p-3 bg-sol/20 rounded-lg">
            <p className="text-[10px] uppercase text-noite/80 font-bold">Valor final ao cliente</p>
            <p className="text-2xl font-black text-noite">R$ {valorFinal.toFixed(2)}</p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-[10px] uppercase text-white/50 mb-2">Materiais detalhados</p>
            <div className="space-y-0.5 text-xs">
              <Mini label="MC4" v={resultado.materiais_mc4} />
              <Mini label="Mangueira" v={resultado.materiais_mangueira} />
              <Mini label="Suportes" v={resultado.materiais_suportes} />
              <Mini label="Parafusos" v={resultado.materiais_parafusos} />
              <Mini label={e.precisa_cabo_novo ? 'Cabo NOVO' : 'Cabo (reaproveita)'} v={resultado.materiais_cabo} />
            </div>
            {resultado.extras_total > 0 && (
              <>
                <p className="text-[10px] uppercase text-white/50 mt-3 mb-2">Extras</p>
                <div className="space-y-0.5 text-xs">
                  {resultado.extras_art > 0 && <Mini label="ART/RT" v={resultado.extras_art} />}
                  {resultado.extras_padrao > 0 && <Mini label="Padrão novo" v={resultado.extras_padrao} />}
                </div>
              </>
            )}
          </div>

          <button
            onClick={salvar}
            disabled={pending}
            className="w-full mt-4 px-4 py-3 bg-verde text-noite font-bold text-sm rounded-lg disabled:opacity-40"
          >
            {pending ? '⏳ Salvando...' : '✅ Salvar no projeto'}
          </button>
          {msg && <p className="text-xs text-verde mt-2">{msg}</p>}
          {erro && <p className="text-xs text-coral mt-2">⚠️ {erro}</p>}
        </div>

        <details className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
          <summary className="text-xs font-bold text-white/60 cursor-pointer">
            📐 Memória de cálculo
          </summary>
          <div className="mt-3 space-y-1 text-[10px] font-mono text-white/60">
            {resultado.memoria_calculo.map((linha, i) => <p key={i}>{linha}</p>)}
          </div>
        </details>
      </div>
    </div>
  )
}

/**
 * Upload de PDF/imagem de orcamento de fornecedor concorrente + analise IA.
 * Consultor sobe o arquivo, Claude Sonnet Vision extrai:
 *   marca, modelo, qtd, preco/placa, preco/estrutura, total, confianca
 * Preenche os campos correspondentes em entradas + permite edit manual.
 */
function UploadOrcamentoConcorrente({
  entradas,
  setEntradas,
}: {
  entradas: EntradasInstalacaoPlacas
  setEntradas: (e: EntradasInstalacaoPlacas) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [analisando, setAnalisando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [dadosIa, setDadosIa] = useState<any>(null)

  async function analisar(file: File) {
    setAnalisando(true)
    setErro(null)
    setNomeArquivo(file.name)
    setDadosIa(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      const res = await fetch('/api/analisar-orcamento-fornecedor', {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json.sucesso) {
        throw new Error(json.erro || 'Erro na análise')
      }
      const d = json.dados
      setDadosIa(d)
      // Preenche automaticamente os campos do form
      setEntradas({
        ...entradas,
        outro_marca_placa: [d.marca_fornecedor, d.modelo_placa].filter(Boolean).join(' · '),
        outro_preco_placa_unitario: d.preco_placa_unitario || 0,
        outro_preco_estrutura_por_modulo: d.preco_estrutura_por_modulo || 0,
        // Se qtd_placas do orcamento bate com qtd_modulos do projeto, sugere sobrescrever
        // (mas nao forca — deixa consultor decidir)
      })
    } catch (e: any) {
      setErro(e?.message || 'Falha na análise')
    } finally {
      setAnalisando(false)
    }
  }

  const totalPlacas = entradas.qtd_modulos * (entradas.outro_preco_placa_unitario || 0)
  const totalEstrutura = entradas.qtd_modulos * (entradas.outro_preco_estrutura_por_modulo || 0)

  return (
    <div className="p-3 bg-weg-azul/5 border border-weg-azul/20 rounded-lg space-y-3">
      {/* Upload */}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={ev => {
            const f = ev.target.files?.[0]
            if (f) analisar(f)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />

        {!nomeArquivo && !analisando && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full p-4 border-2 border-dashed border-weg-azul/40 rounded-lg text-center hover:border-weg-azul hover:bg-weg-azul/5 transition"
          >
            <p className="text-sm font-bold text-white">📄 Anexar orçamento do fornecedor</p>
            <p className="text-[10px] text-white/50 mt-1">
              PDF ou imagem (PNG/JPG). Bianca lê e preenche os campos automaticamente.
            </p>
          </button>
        )}

        {analisando && (
          <div className="p-4 bg-sol/10 border border-sol/30 rounded-lg text-center">
            <p className="text-sm text-sol animate-pulse">
              ⏳ Analisando <strong>{nomeArquivo}</strong>... (~10-30s)
            </p>
          </div>
        )}

        {!analisando && nomeArquivo && (
          <div className="flex items-center justify-between gap-2 p-2 bg-noite/40 border border-white/10 rounded">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-verde">✓</span>
              <span className="text-xs text-white truncate">{nomeArquivo}</span>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[10px] text-white/50 hover:text-white shrink-0"
            >
              trocar
            </button>
          </div>
        )}

        {erro && (
          <div className="mt-2 p-2 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
            ⚠️ {erro} — preencha os campos manualmente abaixo.
          </div>
        )}
      </div>

      {/* Resultado da IA + confiança */}
      {dadosIa && (
        <div className={`p-2 rounded border text-xs ${
          dadosIa.confianca === 'alta' ? 'bg-verde/10 border-verde/30 text-verde/90' :
          dadosIa.confianca === 'media' ? 'bg-sol/10 border-sol/30 text-sol/90' :
          'bg-coral/10 border-coral/30 text-coral/90'
        }`}>
          🤖 Confiança da análise: <strong>{dadosIa.confianca}</strong>
          {dadosIa.observacoes && <p className="mt-1 text-[10px] text-white/60">{dadosIa.observacoes}</p>}
          {dadosIa.valor_total_orcamento > 0 && (
            <p className="mt-1 text-[10px]">
              Valor total do orçamento original: <strong>R$ {dadosIa.valor_total_orcamento.toFixed(2)}</strong>
            </p>
          )}
        </div>
      )}

      {/* Campos preenchidos (editaveis) */}
      <div className="pt-2 border-t border-white/10">
        <p className="text-[10px] uppercase font-bold text-white/50 mb-2">
          {dadosIa ? '✏️ Revise e ajuste se necessário' : 'Ou preencha manualmente'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase text-white/50 block mb-1">
              Marca / modelo
            </label>
            <input
              type="text"
              value={entradas.outro_marca_placa || ''}
              onChange={ev => setEntradas({ ...entradas, outro_marca_placa: ev.target.value })}
              placeholder="Ex: Canadian Solar CS7L-580MS"
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm placeholder:text-white/30"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-white/50 block mb-1">
              Preço da placa (R$/un)
            </label>
            <input
              type="number"
              step={10}
              value={entradas.outro_preco_placa_unitario || 0}
              onChange={ev => setEntradas({ ...entradas, outro_preco_placa_unitario: parseFloat(ev.target.value) || 0 })}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
            />
            <p className="text-[9px] text-white/40 mt-1">
              {entradas.qtd_modulos} × R$ {(entradas.outro_preco_placa_unitario || 0).toFixed(2)} = <strong className="text-verde">R$ {totalPlacas.toFixed(2)}</strong>
            </p>
          </div>
          <div>
            <label className="text-[10px] uppercase text-white/50 block mb-1">
              Estrutura (R$/módulo)
            </label>
            <input
              type="number"
              step={5}
              value={entradas.outro_preco_estrutura_por_modulo || 0}
              onChange={ev => setEntradas({ ...entradas, outro_preco_estrutura_por_modulo: parseFloat(ev.target.value) || 0 })}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
            />
            <p className="text-[9px] text-white/40 mt-1">
              Custo médio por módulo · Total: <strong className="text-verde">R$ {totalEstrutura.toFixed(2)}</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModoBotao({
  label, hint, ativo, onClick, destaque,
}: {
  label: string
  hint: string
  ativo: boolean
  onClick: () => void
  destaque?: 'sol' | 'wegazul'
}) {
  const bgAtivo = destaque === 'sol'
    ? 'bg-sol/20 border-sol/50 text-white'
    : destaque === 'wegazul'
      ? 'bg-weg-azul/20 border-weg-azul/50 text-white'
      : 'bg-white/10 border-white/30 text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-2.5 rounded-lg border text-left transition ${
        ativo ? bgAtivo : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-white/70'
      }`}
    >
      <p className="text-xs font-bold">{label}</p>
      <p className="text-[9px] text-white/50 mt-0.5">{hint}</p>
    </button>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">{titulo}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Num({ label, v, onChange, step = 1, hint }: {
  label: string; v: number; onChange: (n: number) => void; step?: number; hint?: string
}) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/50 block mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={v ?? 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
      />
      {hint && <p className="text-[9px] text-white/40 mt-1">{hint}</p>}
    </div>
  )
}

function Select({ label, v, onChange, opcoes }: {
  label: string; v: string; onChange: (v: string) => void; opcoes: Array<{ id: string; label: string; hint?: string }>
}) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/50 block mb-1">{label}</label>
      <select
        value={v}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
      >
        {opcoes.map(o => (
          <option key={o.id} value={o.id} style={OPT}>
            {o.label}{o.hint ? ` (${o.hint})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function Linha({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-white/60">{label}</span>
      <span className="text-white font-mono">R$ {v.toFixed(2)}</span>
    </div>
  )
}

function Mini({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between text-white/70">
      <span>{label}</span>
      <span className={`font-mono ${v === 0 ? 'text-white/30' : ''}`}>R$ {v.toFixed(2)}</span>
    </div>
  )
}
