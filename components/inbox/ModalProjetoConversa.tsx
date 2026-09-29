'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarCpfCnpj, formatarCep, formatarTelefone } from '@/lib/formatters'
import { TIPOS_ITEM, type TipoItem } from '@/lib/tipos-projeto'
import {
  prepararProjetoDaConversaAction,
  criarProjetoDaConversaAction,
  type PreparoProjeto,
  type SugestaoProjeto,
} from '@/app/inbox/projeto-actions'
import { salvarAnaliseFaturaAction } from '@/app/projetos/[id]/fatura/actions'

/**
 * Modal "Transformar em projeto" do inbox (Kalebe 2026-09-29).
 * Abre com os dados pré-preenchidos (Laís + IA lendo conversa e fatura),
 * o atendente confere, cria o projeto e — se houver fatura na conversa —
 * roda a mesma análise do passo Fatura, já anexando o arquivo.
 */

const TIPOS_OPCOES = TIPOS_ITEM
  .filter((t) => !t.oculto && t.disponivel)
  .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

const ORIGENS = [
  { v: 'aquecimento_1', l: 'Aquecimento 1' },
  { v: 'aquecimento_2', l: 'Aquecimento 2' },
  { v: 'base_repassada', l: 'Base repassada' },
  { v: 'indicacao', l: 'Indicação' },
  { v: 'lead_spin', l: 'Lead Spin' },
  { v: 'lead_verba', l: 'Lead verba' },
  { v: 'prospeccao', l: 'Prospecção' },
  { v: 'resgate', l: 'Resgate' },
]

const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'

export function ModalProjetoConversa({
  conversaId,
  onFechar,
  onCriado,
}: {
  conversaId: string
  onFechar: () => void
  onCriado: () => void
}) {
  const [preparo, setPreparo] = useState<PreparoProjeto | null>(null)
  const [dados, setDados] = useState<SugestaoProjeto | null>(null)
  const [faturaUrl, setFaturaUrl] = useState<string>('')
  const [completar, setCompletar] = useState(false)
  const [origem, setOrigem] = useState('lead_spin')
  const [etapa, setEtapa] = useState<'carregando' | 'form' | 'criando' | 'analisando' | 'pronto'>('carregando')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [criado, setCriado] = useState<{ projeto_id: string; codigo: string } | null>(null)

  useEffect(() => {
    let vivo = true
    prepararProjetoDaConversaAction(conversaId).then((r) => {
      if (!vivo) return
      if ('erro' in r) { setErro(r.erro); setEtapa('form'); return }
      setPreparo(r)
      setDados(r.sugestao)
      setFaturaUrl(r.faturas[0]?.url || '')
      setCompletar(!!r.projeto_existente?.pode_completar)
      setEtapa('form')
    })
    return () => { vivo = false }
  }, [conversaId])

  const set = (patch: Partial<SugestaoProjeto>) => setDados((d) => (d ? { ...d, ...patch } : d))

  async function buscarCep(cep: string) {
    const c = cep.replace(/\D/g, '')
    if (c.length !== 8) return
    try {
      const j = await (await fetch(`https://viacep.com.br/ws/${c}/json/`)).json()
      if (!j?.erro) set({ rua: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', uf: j.uf || 'SC' })
    } catch {}
  }

  async function criar() {
    if (!dados) return
    setErro(null); setAviso(null); setEtapa('criando')
    const r = await criarProjetoDaConversaAction({
      conversa_id: conversaId, dados, completar_existente: completar, origem_lead: origem,
    })
    if ('erro' in r) { setErro(r.erro); setEtapa('form'); return }
    setCriado(r)

    // Fatura da conversa → mesma análise do passo Fatura, já anexada ao projeto
    const fatura = preparo?.faturas.find((f) => f.url === faturaUrl)
    if (fatura) {
      setEtapa('analisando')
      try {
        const blob = await (await fetch(fatura.url)).blob()
        const mime = fatura.mime.includes('pdf') ? 'application/pdf' : (blob.type || 'image/jpeg')
        const ext = mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : 'jpg'
        const arquivo = new File([blob], `fatura-whatsapp.${ext}`, { type: mime })

        const fd = new FormData()
        fd.append('arquivo', arquivo)
        const res = await fetch('/api/analisar-fatura', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || json.erro || 'Falha na análise')
        const analise = json.dados || json

        const supabase = createClient()
        const caminho = `${r.projeto_id}/principal_${Date.now()}.${ext}`
        const up = await supabase.storage.from('faturas').upload(caminho, arquivo, { contentType: mime, upsert: false })
        const arquivoUrl = up.error ? fatura.url : supabase.storage.from('faturas').getPublicUrl(caminho).data.publicUrl

        const s = await salvarAnaliseFaturaAction(r.projeto_id, {
          ...analise, arquivo_url: arquivoUrl, arquivo_nome: arquivo.name, arquivo_tipo: mime,
        })
        if (!s?.sucesso) throw new Error((s as any)?.erro || 'Falha ao salvar a análise')
      } catch (e: any) {
        setAviso(`Projeto criado, mas a fatura não foi analisada (${e?.message || 'erro'}). Faça no passo Fatura.`)
      }
    }
    setEtapa('pronto')
    onCriado()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-noite border border-white/15 rounded-xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">📁 Transformar em projeto</h2>
            <p className="text-xs text-white/50 mt-0.5">
              Dados tirados da conversa{preparo?.extraido_por_ia ? ' e da fatura pela IA' : ''}. Confira antes de criar.
            </p>
          </div>
          <button onClick={onFechar} className="text-white/40 hover:text-white/80 text-lg leading-none">✕</button>
        </div>

        {etapa === 'carregando' && (
          <p className="text-sm text-white/60 py-8 text-center">
            <span className="animate-pulse">⏳</span> Lendo a conversa e a fatura…
          </p>
        )}

        {etapa === 'pronto' && criado && (
          <div className="space-y-3 py-4 text-center">
            <p className="text-verde font-bold">✓ Projeto {criado.codigo} pronto e ligado a esta conversa</p>
            {aviso && <p className="text-xs text-sol">{aviso}</p>}
            <div className="flex justify-center gap-2">
              <a href={`/projetos/${criado.projeto_id}`} target="_blank" rel="noreferrer"
                className="px-5 py-2 bg-sol text-noite font-bold text-sm rounded-lg">Abrir projeto →</a>
              <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">
                Voltar à conversa
              </button>
            </div>
          </div>
        )}

        {(etapa === 'form' || etapa === 'criando' || etapa === 'analisando') && dados && (
          <>
            {preparo?.projeto_existente && (
              <div className="p-3 rounded-lg bg-weg-azul/10 border border-weg-azul/30 text-xs text-white/80 space-y-2">
                <p>
                  Esta conversa já tem o projeto <strong>{preparo.projeto_existente.codigo}</strong>
                  {' '}({preparo.projeto_existente.status.replace(/_/g, ' ')}).{' '}
                  <a href={`/projetos/${preparo.projeto_existente.id}`} target="_blank" rel="noreferrer" className="text-sol underline">abrir</a>
                </p>
                {preparo.projeto_existente.pode_completar ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={completar} onChange={(e) => setCompletar(e.target.checked)} />
                    Completar esse projeto em vez de criar outro
                  </label>
                ) : (
                  <p className="text-white/50">Ele já andou ou é de outro consultor — será criado um projeto novo.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Campo rotulo="Nome / razão social *">
                <input value={dados.nome} onChange={(e) => set({ nome: e.target.value })} className={inputCls} />
              </Campo>
              <Campo rotulo="CPF / CNPJ">
                <input value={dados.cpf_cnpj} onChange={(e) => set({ cpf_cnpj: formatarCpfCnpj(e.target.value) })} className={inputCls} />
              </Campo>
              <Campo rotulo="Telefone">
                <input value={dados.telefone} onChange={(e) => set({ telefone: formatarTelefone(e.target.value) })} className={inputCls} />
              </Campo>
              <Campo rotulo="E-mail">
                <input value={dados.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} />
              </Campo>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="col-span-2 md:col-span-2">
                <Campo rotulo="CEP">
                  <input value={dados.cep} onChange={(e) => { const v = formatarCep(e.target.value); set({ cep: v }); buscarCep(v) }} className={inputCls} />
                </Campo>
              </div>
              <div className="col-span-2 md:col-span-3">
                <Campo rotulo="Rua"><input value={dados.rua} onChange={(e) => set({ rua: e.target.value })} className={inputCls} /></Campo>
              </div>
              <div className="col-span-1">
                <Campo rotulo="Nº"><input value={dados.numero} onChange={(e) => set({ numero: e.target.value })} className={inputCls} /></Campo>
              </div>
              <div className="col-span-1 md:col-span-2">
                <Campo rotulo="Bairro"><input value={dados.bairro} onChange={(e) => set({ bairro: e.target.value })} className={inputCls} /></Campo>
              </div>
              <div className="col-span-1 md:col-span-3">
                <Campo rotulo="Cidade"><input value={dados.cidade} onChange={(e) => set({ cidade: e.target.value })} className={inputCls} /></Campo>
              </div>
              <div className="col-span-1">
                <Campo rotulo="UF"><input value={dados.uf} maxLength={2} onChange={(e) => set({ uf: e.target.value.toUpperCase() })} className={inputCls} /></Campo>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Campo rotulo="Tipo de projeto *">
                <select value={dados.tipo_item} onChange={(e) => set({ tipo_item: e.target.value as TipoItem })} className={inputCls}>
                  {TIPOS_OPCOES.map((t) => <option key={t.chave} value={t.chave} className="bg-noite">{t.label}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Consumo médio (kWh/mês)">
                <input type="number" value={dados.consumo_kwh_mes ?? ''} onChange={(e) => set({ consumo_kwh_mes: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </Campo>
              <Campo rotulo="Conta média (R$)">
                <input type="number" value={dados.valor_conta_media ?? ''} onChange={(e) => set({ valor_conta_media: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </Campo>
            </div>

            <Campo rotulo="Resumo pro consultor">
              <textarea rows={2} value={dados.resumo} onChange={(e) => set({ resumo: e.target.value })} className={inputCls} />
            </Campo>

            {(preparo?.faturas.length || 0) > 0 && (
              <Campo rotulo="Fatura recebida na conversa (vai anexada e analisada)">
                <select value={faturaUrl} onChange={(e) => setFaturaUrl(e.target.value)} className={inputCls}>
                  <option value="" className="bg-noite">Não anexar</option>
                  {preparo!.faturas.map((f) => (
                    <option key={f.url} value={f.url} className="bg-noite">
                      {f.nome} · {new Date(f.criada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </option>
                  ))}
                </select>
              </Campo>
            )}

            {preparo?.eh_admin && !completar && (
              <Campo rotulo="Origem do lead (comissão)">
                <select value={origem} onChange={(e) => setOrigem(e.target.value)} className={inputCls}>
                  {ORIGENS.map((o) => <option key={o.v} value={o.v} className="bg-noite">{o.l}</option>)}
                </select>
              </Campo>
            )}

            {erro && <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 text-sm text-coral">❌ {erro}</div>}

            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
              <button onClick={onFechar} disabled={etapa !== 'form'}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg disabled:opacity-40">Cancelar</button>
              <button onClick={criar} disabled={etapa !== 'form'}
                className="px-5 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-60">
                {etapa === 'criando' ? '⏳ Criando projeto…'
                  : etapa === 'analisando' ? '⏳ Analisando a fatura…'
                  : completar ? 'Completar projeto' : 'Criar projeto'}
              </button>
            </div>
          </>
        )}

        {etapa === 'form' && !dados && erro && (
          <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 text-sm text-coral">❌ {erro}</div>
        )}
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-white/60 mb-1">{rotulo}</span>
      {children}
    </label>
  )
}
