'use client'

import { useMemo, useState } from 'react'
import {
  salvarLancamentoAction, salvarFornecedorAction, criarCategoriaAction,
} from '@/app/financeiro/fluxo-caixa/actions'
import {
  GRUPOS, TIPOS_IMPOSTO, SUBTIPOS_CAPITAL_GIRO, SUBTIPOS_PESSOAL, FORMAS_PAGAMENTO,
  hojeBR, lerValor, brl, dividirEmParcelas, addMeses, dataBR,
  type Categoria, type Direcao, type Fornecedor, type Grupo, type Lancamento,
} from '@/lib/financeiro/fluxo'
import { Campo, InputValor, Selecao, Modal, Aviso, Botoes, classeInput } from './ui'

/**
 * Cadastro dinâmico (Kalebe 2026-09-29): escolhe o TIPO e o formulário
 * mostra só os campos daquele tipo. Tudo nasce como PREVISTO; o valor
 * efetivamente pago entra depois no "Efetivar" (ou aqui, se já foi pago).
 */

type Tipo = Exclude<Grupo, 'passivo_bancario'>

const TIPOS_SAIDA: Tipo[] = ['fornecedores', 'impostos', 'capital_giro', 'pessoal', 'despesas_operacionais', 'custos_projeto', 'comissoes', 'outras_despesas']
const TIPOS_ENTRADA: Tipo[] = ['outras_receitas', 'receita_vendas', 'capital_giro']

type Props = {
  fornecedores: Fornecedor[]
  categorias: Categoria[]
  projetos: Array<{ id: string; nome: string }>
  equipe: Array<{ id: string; nome: string }>
  editando?: Lancamento | null
  /** Edição: quantos lançamentos em aberto vêm depois deste na mesma série */
  qtdSerie?: number
  onFechar: () => void
  onSalvo: (msg: string) => void
  onAbrirPassivo: () => void
}

export function ModalLancamento({ fornecedores, categorias, projetos, equipe, editando, qtdSerie = 0, onFechar, onSalvo, onAbrirPassivo }: Props) {
  const d = editando?.detalhes || {}
  const [tipo, setTipo] = useState<Tipo | null>((editando?.grupo as Tipo) || null)
  const [direcaoCg, setDirecaoCg] = useState<Direcao>(editando?.direcao || 'saida')

  // Campos dinâmicos
  const [fornecedorId, setFornecedorId] = useState(editando?.fornecedor_id || '')
  const [nf, setNf] = useState<string>(d.nf || '')
  const [tipoImposto, setTipoImposto] = useState<string>(d.tipo_imposto || 'DAS — Simples Nacional')
  const [competencia, setCompetencia] = useState<string>(d.competencia || hojeBR().slice(0, 7))
  const [subtipoCg, setSubtipoCg] = useState<string>(d.subtipo || '')
  const [subtipoPessoal, setSubtipoPessoal] = useState<string>(d.subtipo || 'Salário')
  const [favorecido, setFavorecido] = useState<string>(d.favorecido || '')
  const [categoriaId, setCategoriaId] = useState(editando?.categoria_id || '')
  const [projetoId, setProjetoId] = useState(editando?.projeto_id || '')
  const [vendedorId, setVendedorId] = useState<string>(d.vendedor_id || '')
  const [cliente, setCliente] = useState<string>(d.cliente || '')

  // Comuns
  const [descricao, setDescricao] = useState(editando?.descricao || '')
  const [descricaoMexida, setDescricaoMexida] = useState(!!editando)
  const [valor, setValor] = useState(editando ? String(editando.valor_previsto).replace('.', ',') : '')
  const [data, setData] = useState(editando?.data_prevista || hojeBR())
  const [repeticao, setRepeticao] = useState<'unica' | 'parcelado' | 'recorrente'>('unica')
  const [vezes, setVezes] = useState('2')
  const [forma, setForma] = useState(editando?.forma_pagamento || '')
  const [jaPago, setJaPago] = useState(false)
  const [valorPago, setValorPago] = useState('')
  const [dataPago, setDataPago] = useState(hojeBR())
  const [obs, setObs] = useState(editando?.observacoes || '')
  const [aplicarSerie, setAplicarSerie] = useState(false)

  // Cadastros inline
  const [listaFornec, setListaFornec] = useState(fornecedores)
  const [novoFornec, setNovoFornec] = useState<{ razao: string; cnpj: string } | null>(null)
  const [listaCat, setListaCat] = useState(categorias)
  const [novaCat, setNovaCat] = useState<string | null>(null)

  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const subCg = SUBTIPOS_CAPITAL_GIRO.find((s) => s.chave === subtipoCg)
  const direcao: Direcao = tipo === 'capital_giro' ? (subCg?.direcao || direcaoCg)
    : tipo && GRUPOS[tipo].direcao === 'entrada' ? 'entrada' : 'saida'
  const tipoCategoria = direcao === 'entrada' ? 'receita' : 'despesa'
  const usaCategoria = tipo === 'despesas_operacionais' || tipo === 'outras_despesas' || tipo === 'outras_receitas'

  const nomeFornec = listaFornec.find((f) => f.id === fornecedorId)
  const nomeProjeto = projetos.find((p) => p.id === projetoId)?.nome
  const nomeVendedor = equipe.find((p) => p.id === vendedorId)?.nome
  const nomeCat = listaCat.find((c) => c.id === categoriaId)?.nome

  // Descrição sugerida pelo tipo (até o admin digitar a dele)
  const sugerida = useMemo(() => {
    switch (tipo) {
      case 'fornecedores': return [nomeFornec?.nome_fantasia || nomeFornec?.razao_social || 'Fornecedor', nf && `NF ${nf}`].filter(Boolean).join(' — ')
      case 'impostos': return `${tipoImposto} · competência ${competencia.split('-').reverse().join('/')}`
      case 'capital_giro': return subCg?.rotulo.replace(/ \(.*\)$/, '') || 'Capital de giro'
      case 'pessoal': return [subtipoPessoal, favorecido].filter(Boolean).join(' — ')
      case 'custos_projeto': return `Custo de projeto${nomeProjeto ? ` — ${nomeProjeto}` : ''}`
      case 'comissoes': return `Comissão${nomeVendedor ? ` — ${nomeVendedor}` : ''}${nomeProjeto ? ` (${nomeProjeto})` : ''}`
      case 'receita_vendas': return `Venda${cliente ? ` — ${cliente}` : nomeProjeto ? ` — ${nomeProjeto}` : ''}`
      default: return nomeCat || ''
    }
  }, [tipo, nomeFornec, nf, tipoImposto, competencia, subCg, subtipoPessoal, favorecido, nomeProjeto, nomeVendedor, cliente, nomeCat])
  const descricaoFinal = descricaoMexida ? descricao : sugerida

  const valorNum = lerValor(valor)
  const vezesNum = Math.max(1, Math.floor(Number(vezes) || 1))
  const previa = repeticao === 'parcelado' ? dividirEmParcelas(valorNum, vezesNum)
    : repeticao === 'recorrente' ? Array(vezesNum).fill(valorNum) : []

  async function cadastrarFornecedor() {
    if (!novoFornec?.razao.trim()) return
    const r = await salvarFornecedorAction({ razao_social: novoFornec.razao, cnpj: novoFornec.cnpj })
    if ('erro' in r) { setErro(r.erro); return }
    const novo: Fornecedor = { id: r.id, razao_social: novoFornec.razao.trim(), nome_fantasia: null, cnpj: novoFornec.cnpj || null, categoria: null, contato_telefone: null, ativo: true }
    setListaFornec([...listaFornec, novo].sort((a, b) => a.razao_social.localeCompare(b.razao_social, 'pt-BR')))
    setFornecedorId(r.id); setNovoFornec(null)
  }

  async function cadastrarCategoria() {
    if (!novaCat?.trim()) return
    const r = await criarCategoriaAction(novaCat, tipoCategoria)
    if ('erro' in r) { setErro(r.erro); return }
    if (!listaCat.some((c) => c.id === r.id)) {
      const nova: Categoria = { id: r.id, nome: novaCat.trim(), tipo: tipoCategoria }
      setListaCat([...listaCat, nova].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    }
    setCategoriaId(r.id); setNovaCat(null)
  }

  async function salvar() {
    setErro(null)
    if (!tipo) return
    if (tipo === 'capital_giro' && !subCg) { setErro('Escolha o tipo de movimentação de capital de giro'); return }
    if (tipo === 'fornecedores' && !fornecedorId) { setErro('Escolha o fornecedor (ou cadastre um novo)'); return }
    if (!(valorNum > 0)) { setErro('Informe o valor previsto'); return }
    if (!descricaoFinal.trim()) { setErro('Informe a descrição'); return }

    const detalhes: Record<string, any> = {}
    if (tipo === 'fornecedores' && nf) detalhes.nf = nf
    if (tipo === 'impostos') { detalhes.tipo_imposto = tipoImposto; detalhes.competencia = competencia }
    if (tipo === 'capital_giro') detalhes.subtipo = subtipoCg
    if (tipo === 'pessoal') { detalhes.subtipo = subtipoPessoal; if (favorecido) detalhes.favorecido = favorecido }
    if (tipo === 'comissoes' && vendedorId) { detalhes.vendedor_id = vendedorId; detalhes.vendedor = nomeVendedor }
    if (tipo === 'receita_vendas' && cliente) detalhes.cliente = cliente

    setSalvando(true)
    try {
      const r = await salvarLancamentoAction({
        id: editando?.id,
        direcao, grupo: tipo,
        categoria_id: usaCategoria ? categoriaId || null : null,
        descricao: descricaoFinal,
        valor_previsto: valorNum,
        data_prevista: data,
        forma_pagamento: forma || null,
        fornecedor_id: tipo === 'fornecedores' || tipo === 'custos_projeto' ? fornecedorId || null : null,
        projeto_id: projetoId || null,
        detalhes,
        observacoes: obs,
        repeticao, vezes: vezesNum,
        realizado: repeticao === 'unica' && jaPago ? { valor: lerValor(valorPago) || valorNum, data: dataPago } : null,
        aplicar_serie: !!editando && aplicarSerie,
      })
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo(editando
        ? (aplicarSerie && r.criados > 0 ? `Lançamento e mais ${r.criados} da série atualizados` : 'Lançamento atualizado')
        : r.criados > 1 ? `${r.criados} lançamentos previstos criados` : 'Lançamento criado')
    } finally { setSalvando(false) }
  }

  // ─── Passo 1: escolher o tipo ─────────────────────────────────────────────
  if (!tipo) {
    const Cartao = ({ t, dir }: { t: Tipo; dir: Direcao }) => (
      <button type="button" onClick={() => { setTipo(t); if (t === 'capital_giro') setDirecaoCg(dir) }}
        className="p-3 rounded-lg border border-white/10 bg-white/[0.03] hover:border-sol/50 hover:bg-sol/5 text-left transition">
        <span className="text-xl">{GRUPOS[t].emoji}</span>
        <span className="block text-sm font-bold text-white mt-1">{GRUPOS[t].rotulo}</span>
      </button>
    )
    return (
      <Modal titulo="➕ Novo lançamento" subtitulo="Escolha o tipo — o formulário se ajusta a ele." onFechar={onFechar}>
        <p className="text-[11px] uppercase font-bold text-coral/80 tracking-wider">Saídas (custos e despesas)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TIPOS_SAIDA.map((t) => <Cartao key={t} t={t} dir="saida" />)}
          <button type="button" onClick={onAbrirPassivo}
            className="p-3 rounded-lg border border-white/10 bg-white/[0.03] hover:border-sol/50 hover:bg-sol/5 text-left transition">
            <span className="text-xl">🏦</span>
            <span className="block text-sm font-bold text-white mt-1">Passivo bancário</span>
            <span className="block text-[10px] text-white/45">contrato com parcelas</span>
          </button>
        </div>
        <p className="text-[11px] uppercase font-bold text-verde/80 tracking-wider pt-1">Entradas</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TIPOS_ENTRADA.map((t) => <Cartao key={`e-${t}`} t={t} dir="entrada" />)}
        </div>
        <p className="text-[10px] text-white/40">
          Recebimentos das vendas do sistema entram pela aba <strong>“A programar”</strong>, com os custos do orçamento já previstos.
        </p>
      </Modal>
    )
  }

  // ─── Passo 2: campos do tipo ──────────────────────────────────────────────
  const opcoesProjetos = projetos.map((p) => ({ valor: p.id, rotulo: p.nome }))
  return (
    <Modal
      titulo={`${GRUPOS[tipo].emoji} ${editando ? 'Editar' : 'Novo'} — ${GRUPOS[tipo].rotulo}`}
      subtitulo={direcao === 'entrada' ? 'Entrada de caixa (previsto)' : 'Saída de caixa (previsto)'}
      onFechar={onFechar}
    >
      {!editando && (
        <button type="button" onClick={() => setTipo(null)} className="text-xs text-white/50 hover:text-white">← trocar tipo</button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Fornecedor */}
        {(tipo === 'fornecedores' || tipo === 'custos_projeto') && (
          <Campo rotulo={tipo === 'fornecedores' ? 'Fornecedor *' : 'Fornecedor (opcional)'} className="sm:col-span-2">
            {novoFornec ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input className={classeInput} placeholder="Razão social / nome" value={novoFornec.razao} autoFocus
                  onChange={(e) => setNovoFornec({ ...novoFornec, razao: e.target.value })} />
                <input className={classeInput} placeholder="CNPJ (opcional)" value={novoFornec.cnpj}
                  onChange={(e) => setNovoFornec({ ...novoFornec, cnpj: e.target.value })} />
                <button type="button" onClick={cadastrarFornecedor} className="px-3 py-2 bg-verde text-noite text-xs font-bold rounded-md shrink-0">Salvar</button>
                <button type="button" onClick={() => setNovoFornec(null)} className="px-3 py-2 bg-white/5 text-white/60 text-xs rounded-md shrink-0">✕</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Selecao valor={fornecedorId} onChange={setFornecedorId} vazio="Selecione…"
                  opcoes={listaFornec.filter((f) => f.ativo || f.id === fornecedorId).map((f) => ({ valor: f.id, rotulo: f.nome_fantasia ? `${f.razao_social} (${f.nome_fantasia})` : f.razao_social }))} />
                <button type="button" onClick={() => setNovoFornec({ razao: '', cnpj: '' })}
                  className="px-3 py-2 bg-white/5 border border-white/15 text-white/80 text-xs rounded-md shrink-0 hover:bg-white/10">+ novo</button>
              </div>
            )}
          </Campo>
        )}
        {tipo === 'fornecedores' && (
          <Campo rotulo="Nº da nota fiscal"><input className={classeInput} value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Opcional" /></Campo>
        )}

        {/* Imposto */}
        {tipo === 'impostos' && (
          <>
            <Campo rotulo="Imposto *"><Selecao valor={tipoImposto} onChange={setTipoImposto} opcoes={TIPOS_IMPOSTO.map((t) => ({ valor: t, rotulo: t }))} /></Campo>
            <Campo rotulo="Competência *"><input type="month" className={classeInput} value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></Campo>
          </>
        )}

        {/* Capital de giro */}
        {tipo === 'capital_giro' && (
          <Campo rotulo="Movimentação *" className="sm:col-span-2"
            dica={subCg ? (subCg.direcao === 'entrada' ? '↑ Entra no caixa' : '↓ Sai do caixa') : undefined}>
            <Selecao valor={subtipoCg} onChange={setSubtipoCg} vazio="Selecione…"
              opcoes={SUBTIPOS_CAPITAL_GIRO.filter((s) => s.direcao === direcaoCg)
                .map((s) => ({ valor: s.chave, rotulo: `${s.direcao === 'entrada' ? '↑' : '↓'} ${s.rotulo}` }))} />
          </Campo>
        )}

        {/* Pessoal */}
        {tipo === 'pessoal' && (
          <>
            <Campo rotulo="Tipo *"><Selecao valor={subtipoPessoal} onChange={setSubtipoPessoal} opcoes={SUBTIPOS_PESSOAL.map((t) => ({ valor: t, rotulo: t }))} /></Campo>
            <Campo rotulo="Favorecido">
              <input className={classeInput} list="fluxo-equipe" value={favorecido} onChange={(e) => setFavorecido(e.target.value)} placeholder="Nome" />
              <datalist id="fluxo-equipe">{equipe.map((p) => <option key={p.id} value={p.nome} />)}</datalist>
            </Campo>
          </>
        )}

        {/* Comissão */}
        {tipo === 'comissoes' && (
          <Campo rotulo="Vendedor"><Selecao valor={vendedorId} onChange={setVendedorId} vazio="Selecione…" opcoes={equipe.map((p) => ({ valor: p.id, rotulo: p.nome }))} /></Campo>
        )}

        {/* Receita de venda avulsa */}
        {tipo === 'receita_vendas' && (
          <Campo rotulo="Cliente"><input className={classeInput} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" /></Campo>
        )}

        {/* Projeto vinculado */}
        {(tipo === 'custos_projeto' || tipo === 'comissoes' || tipo === 'fornecedores' || tipo === 'receita_vendas') && (
          <Campo rotulo={tipo === 'custos_projeto' ? 'Projeto' : 'Projeto (opcional)'}>
            <Selecao valor={projetoId} onChange={setProjetoId} vazio="—" opcoes={opcoesProjetos} />
          </Campo>
        )}

        {/* Categoria (dinâmica: cria na hora) */}
        {usaCategoria && (
          <Campo rotulo="Categoria" className="sm:col-span-2">
            {novaCat !== null ? (
              <div className="flex gap-2">
                <input className={classeInput} autoFocus value={novaCat} onChange={(e) => setNovaCat(e.target.value)} placeholder="Nome da nova categoria" />
                <button type="button" onClick={cadastrarCategoria} className="px-3 py-2 bg-verde text-noite text-xs font-bold rounded-md shrink-0">Criar</button>
                <button type="button" onClick={() => setNovaCat(null)} className="px-3 py-2 bg-white/5 text-white/60 text-xs rounded-md shrink-0">✕</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Selecao valor={categoriaId} onChange={setCategoriaId} vazio="Sem categoria"
                  opcoes={listaCat.filter((c) => c.tipo === tipoCategoria).map((c) => ({ valor: c.id, rotulo: c.nome }))} />
                <button type="button" onClick={() => setNovaCat('')}
                  className="px-3 py-2 bg-white/5 border border-white/15 text-white/80 text-xs rounded-md shrink-0 hover:bg-white/10">+ nova</button>
              </div>
            )}
          </Campo>
        )}

        {/* Comuns */}
        <Campo rotulo="Descrição *" className="sm:col-span-2">
          <input className={classeInput} value={descricaoFinal}
            onChange={(e) => { setDescricao(e.target.value); setDescricaoMexida(true) }} />
        </Campo>
        <Campo rotulo={repeticao === 'parcelado' ? 'Valor total previsto *' : 'Valor previsto *'}>
          <InputValor valor={valor} onChange={setValor} />
        </Campo>
        <Campo rotulo={repeticao === 'unica' ? 'Vencimento / data prevista *' : '1º vencimento *'}>
          <input type="date" className={classeInput} value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Forma de pagamento">
          <Selecao valor={forma} onChange={setForma} vazio="—" opcoes={FORMAS_PAGAMENTO.map((f) => ({ valor: f, rotulo: f }))} />
        </Campo>

        {!editando && (
          <Campo rotulo="Repetição">
            <div className="flex gap-2">
              <Selecao valor={repeticao} onChange={(v) => setRepeticao(v as any)} opcoes={[
                { valor: 'unica', rotulo: 'Única' },
                { valor: 'parcelado', rotulo: 'Parcelado (divide o total)' },
                { valor: 'recorrente', rotulo: 'Todo mês (repete o valor)' },
              ]} />
              {repeticao !== 'unica' && (
                <input type="number" min={2} max={120} className={`${classeInput} w-20`} value={vezes} onChange={(e) => setVezes(e.target.value)} title="Quantas vezes" />
              )}
            </div>
          </Campo>
        )}
      </div>

      {previa.length > 1 && valorNum > 0 && (
        <p className="text-[11px] text-white/55">
          {previa.length}× — {previa.slice(0, 3).map((v, i) => `${dataBR(addMeses(data, i))}: ${brl(v)}`).join(' · ')}
          {previa.length > 3 && ` … último ${dataBR(addMeses(data, previa.length - 1))}`}
          {repeticao === 'recorrente' && ` · total ${brl(valorNum * previa.length)}`}
        </p>
      )}

      {!editando && repeticao === 'unica' && (
        <div className="rounded-lg border border-white/10 p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
            <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
            {direcao === 'entrada' ? 'Já foi recebido' : 'Já foi pago'} (efetivar agora)
          </label>
          {jaPago && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo rotulo="Valor efetivamente pago" dica="Vazio = igual ao previsto">
                <InputValor valor={valorPago} onChange={setValorPago} placeholder={valor || '0,00'} />
              </Campo>
              <Campo rotulo="Data do pagamento"><input type="date" className={classeInput} value={dataPago} onChange={(e) => setDataPago(e.target.value)} /></Campo>
            </div>
          )}
        </div>
      )}

      <Campo rotulo="Observações">
        <textarea className={`${classeInput} resize-none`} rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>

      {/* Kalebe 2026-09-30: corrigir a série inteira (ex.: salário recorrente lançado errado) */}
      {editando && qtdSerie > 0 && (
        <label className="flex items-start gap-2 text-sm text-white/80 cursor-pointer rounded-lg border border-sol/30 bg-sol/5 p-3">
          <input type="checkbox" className="mt-1" checked={aplicarSerie} onChange={(e) => setAplicarSerie(e.target.checked)} />
          <span>Aplicar o valor e os dados também aos <strong>próximos {qtdSerie}</strong> lançamento(s) em aberto desta série
            <span className="block text-[10px] text-white/45">As datas de cada um continuam as mesmas; os já efetivados não mudam.</span>
          </span>
        </label>
      )}

      {erro && <Aviso tipo="erro">⚠️ {erro}</Aviso>}
      <Botoes onCancelar={onFechar} onConfirmar={salvar} processando={salvando} rotulo={editando ? 'Salvar alterações' : 'Lançar previsto'} />
    </Modal>
  )
}
