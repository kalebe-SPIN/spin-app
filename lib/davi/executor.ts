import type { SupabaseClient } from '@supabase/supabase-js'

type Resultado = { sucesso: boolean; dados?: any; erro?: string; _hint?: string }

export async function executarToolDavi(
  supabase: SupabaseClient,
  userId: string,
  toolName: string,
  input: any,
): Promise<Resultado> {
  try {
    switch (toolName) {
      case 'listar_produtos_sem_preco': {
        const limite = input.limite || 20
        // Produtos ativos que NÃO têm preço vigente
        let query = supabase
          .from('produtos')
          .select('id, modelo, categoria, subcategoria, descricao_curta, codigo_weg')
          .eq('ativo', true)
          .eq('descontinuado', false)
          .limit(limite)
        if (input.categoria) query = query.eq('categoria', input.categoria)

        const { data: produtos, error } = await query
        if (error) return { sucesso: false, erro: error.message }

        // Filtra manualmente os que não têm preço vigente
        const ids = (produtos || []).map((p) => p.id)
        const { data: comPreco } = await supabase
          .from('precos_produtos')
          .select('produto_id')
          .in('produto_id', ids)
          .is('vigente_ate', null)
        const idsComPreco = new Set((comPreco || []).map((x) => x.produto_id))
        const semPreco = (produtos || []).filter((p) => !idsComPreco.has(p.id))

        return { sucesso: true, dados: semPreco }
      }

      case 'listar_produtos_desatualizados': {
        const dias = input.dias_minimos || 60
        const limite = input.limite || 20
        const dataCorte = new Date()
        dataCorte.setDate(dataCorte.getDate() - dias)

        const { data, error } = await supabase
          .from('precos_produtos')
          .select(`
            id, preco_venda, vigente_de, unidade,
            produto:produto_id (id, modelo, categoria, codigo_weg, descricao_curta)
          `)
          .is('vigente_ate', null)
          .lt('vigente_de', dataCorte.toISOString().slice(0, 10))
          .order('vigente_de', { ascending: true })
          .limit(limite)
        if (error) return { sucesso: false, erro: error.message }

        return {
          sucesso: true,
          dados: (data || []).map((r: any) => ({
            produto: r.produto,
            preco_atual: r.preco_venda,
            unidade: r.unidade,
            vigente_desde: r.vigente_de,
            dias_sem_atualizacao: Math.floor(
              (Date.now() - new Date(r.vigente_de).getTime()) / 86400000,
            ),
          })),
        }
      }

      case 'buscar_produto': {
        const termo = String(input.termo || '').trim()
        if (!termo) return { sucesso: false, erro: 'Informe o termo de busca' }

        const { data, error } = await supabase
          .from('produtos')
          .select(`
            id, modelo, categoria, subcategoria, codigo_weg, descricao_curta,
            precos:precos_produtos (preco_venda, vigente_de, vigente_ate, unidade)
          `)
          .or(`modelo.ilike.%${termo}%,codigo_weg.ilike.%${termo}%,descricao_curta.ilike.%${termo}%`)
          .eq('ativo', true)
          .limit(10)
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'registrar_cotacao': {
        if (!input.produto_id && !input.descricao_livre) {
          return { sucesso: false, erro: 'Informe produto_id ou descricao_livre' }
        }
        const { data, error } = await supabase
          .from('cotacoes_mercado')
          .insert({
            produto_id: input.produto_id || null,
            descricao_livre: input.descricao_livre || null,
            categoria: input.categoria || null,
            preco_cotado: input.preco_cotado,
            unidade: input.unidade || 'un',
            fornecedor_nome: input.fornecedor_nome,
            cidade: input.cidade || null,
            uf: input.uf || null,
            validade_dias: input.validade_dias || null,
            observacoes: input.observacoes || null,
            fonte: 'davi_ia',
            criado_por: userId,
          })
          .select('id, preco_cotado, fornecedor_nome, created_at')
          .single()
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'atualizar_preco_produto': {
        const { produto_id, novo_preco, fonte } = input
        if (!produto_id || !novo_preco) return { sucesso: false, erro: 'Faltam parâmetros' }

        // Busca preço anterior pra calcular variação
        const { data: anterior } = await supabase
          .from('precos_produtos')
          .select('id, preco_venda, unidade')
          .eq('produto_id', produto_id)
          .is('vigente_ate', null)
          .maybeSingle()

        const hoje = new Date().toISOString().slice(0, 10)

        // Encerra o preço anterior (se existir)
        if (anterior?.id) {
          await supabase
            .from('precos_produtos')
            .update({ vigente_ate: hoje })
            .eq('id', anterior.id)
        }

        // Cria novo vigente
        const { data: novo, error } = await supabase
          .from('precos_produtos')
          .insert({
            produto_id,
            preco_custo: novo_preco * 0.75, // estimativa custo — pode refinar depois
            preco_venda: novo_preco,
            unidade: anterior?.unidade || 'un',
            vigente_de: hoje,
            origem: fonte || 'davi_ia_admin',
            observacoes: `Aplicado via Davi por usuário ${userId}`,
          })
          .select('id, preco_venda, vigente_de')
          .single()

        if (error) return { sucesso: false, erro: error.message }

        const variacaoPerc = anterior?.preco_venda
          ? ((novo_preco - Number(anterior.preco_venda)) / Number(anterior.preco_venda)) * 100
          : null

        return {
          sucesso: true,
          dados: {
            preco_novo: novo.preco_venda,
            preco_anterior: anterior?.preco_venda || null,
            variacao_perc: variacaoPerc,
            vigente_de: novo.vigente_de,
          },
        }
      }

      case 'historico_precos': {
        const { produto_id } = input
        const { data, error } = await supabase
          .from('precos_produtos')
          .select('preco_venda, vigente_de, vigente_ate, unidade, origem')
          .eq('produto_id', produto_id)
          .order('vigente_de', { ascending: false })
          .limit(20)
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'solicitacoes_pendentes': {
        const limite = input.limite || 20
        const { data, error } = await supabase
          .from('solicitacoes_cotacao')
          .select(`
            id, motivo, prioridade, created_at, descricao_livre,
            produto:produto_id (id, modelo, categoria, codigo_weg)
          `)
          .eq('status', 'aberta')
          .order('created_at', { ascending: false })
          .limit(limite)
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'resumo_situacao': {
        const dataCorte = new Date()
        dataCorte.setDate(dataCorte.getDate() - 60)
        const desde7Dias = new Date()
        desde7Dias.setDate(desde7Dias.getDate() - 7)

        const [
          { count: totalProdutos },
          { count: totalPrecosVigentes },
          { count: desatualizados },
          { count: cotacoesRecentes },
          { count: solicitacoesAbertas },
        ] = await Promise.all([
          supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true),
          supabase.from('precos_produtos').select('id', { count: 'exact', head: true }).is('vigente_ate', null),
          supabase.from('precos_produtos').select('id', { count: 'exact', head: true })
            .is('vigente_ate', null)
            .lt('vigente_de', dataCorte.toISOString().slice(0, 10)),
          supabase.from('cotacoes_mercado').select('id', { count: 'exact', head: true })
            .gte('created_at', desde7Dias.toISOString()),
          supabase.from('solicitacoes_cotacao').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
        ])

        return {
          sucesso: true,
          dados: {
            total_produtos_ativos: totalProdutos || 0,
            produtos_com_preco: totalPrecosVigentes || 0,
            produtos_sem_preco: (totalProdutos || 0) - (totalPrecosVigentes || 0),
            precos_desatualizados: desatualizados || 0,
            cotacoes_ultima_semana: cotacoesRecentes || 0,
            solicitacoes_pendentes: solicitacoesAbertas || 0,
          },
        }
      }

      default:
        return { sucesso: false, erro: `Tool desconhecida: ${toolName}` }
    }
  } catch (e: any) {
    return { sucesso: false, erro: e?.message || 'Erro inesperado' }
  }
}
