-- Kalebe 2026-09-07: Card do cliente vira uma "ficha comercial":
--   valor_referencia = valor da proposta gerada (pra CRM)
--   etiquetas        = tipos de projeto já propostos (on_grid, hibrido, limpeza, om, ve)
--   pdfs_propostas   = histórico de PDFs gerados (URLs do bucket)
--
-- Painel admin agrega essas etiquetas pra ver "perfil dos negócios".

-- ═══════════════════════════════════════════════════════════
-- 1) Colunas novas em clientes
-- ═══════════════════════════════════════════════════════════
alter table public.clientes
  add column if not exists valor_referencia numeric(14,2) not null default 0,
  add column if not exists etiquetas text[] not null default '{}'::text[],
  add column if not exists pdfs_propostas jsonb not null default '[]'::jsonb;

comment on column public.clientes.valor_referencia is
  'Soma dos pv_total dos projetos deste cliente que geraram proposta (referência comercial).';
comment on column public.clientes.etiquetas is
  'Tipos únicos de itens já propostos (on_grid, hibrido, bess, limpeza, om, ve_recarga, servico). Agregado a partir de projeto_itens.tipo.';
comment on column public.clientes.pdfs_propostas is
  'Array de { projeto_id, projeto_codigo, url, valor, criado_em } — histórico de PDFs gerados.';

create index if not exists idx_clientes_etiquetas on public.clientes using gin (etiquetas);

-- ═══════════════════════════════════════════════════════════
-- 2) Função que recalcula tudo pra 1 cliente
-- ═══════════════════════════════════════════════════════════
create or replace function public.recalcular_ficha_cliente(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric(14,2);
  v_etiquetas text[];
  v_pdfs jsonb;
begin
  -- Valor referência = soma pv_total dos projetos com proposta gerada (url_pdf_proposta preenchido)
  select coalesce(sum(coalesce(p.pv_total, (p.orcamento_final->>'pv_total')::numeric, 0)), 0)
    into v_valor
    from public.projetos p
   where p.cliente_id = p_cliente_id
     and p.excluida_em is null
     and p.url_pdf_proposta is not null;

  -- Etiquetas = UNION dos 2 sistemas de tipo:
  --   1) projeto_itens.tipo (novo, modular — projetos com múltiplos itens)
  --   2) projetos.tipo_projeto (legado singular — projetos antigos)
  -- Kalebe 2026-09-07: cast pra text pra distinct + coalesce funcionar.
  select coalesce(array_agg(distinct tipo order by tipo), '{}'::text[])
    into v_etiquetas
    from (
      select pi.tipo::text as tipo
        from public.projeto_itens pi
        join public.projetos p on p.id = pi.projeto_id
       where p.cliente_id = p_cliente_id
         and p.excluida_em is null
         and pi.status != 'removido'
         and pi.tipo is not null
      union
      select p.tipo_projeto::text as tipo
        from public.projetos p
       where p.cliente_id = p_cliente_id
         and p.excluida_em is null
         and p.tipo_projeto is not null
    ) t
    where tipo is not null;

  -- PDFs = array de { projeto_id, projeto_codigo, url, valor, criado_em }
  select coalesce(jsonb_agg(jsonb_build_object(
             'projeto_id', p.id,
             'projeto_codigo', p.codigo,
             'url', p.url_pdf_proposta,
             'valor', coalesce(p.pv_total, (p.orcamento_final->>'pv_total')::numeric, 0),
             'criado_em', p.updated_at
           ) order by p.updated_at desc), '[]'::jsonb)
    into v_pdfs
    from public.projetos p
   where p.cliente_id = p_cliente_id
     and p.excluida_em is null
     and p.url_pdf_proposta is not null;

  update public.clientes
     set valor_referencia = v_valor,
         etiquetas = v_etiquetas,
         pdfs_propostas = v_pdfs
   where id = p_cliente_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3) Triggers — mantêm em sincronia
-- ═══════════════════════════════════════════════════════════

-- projetos: mudou url_pdf_proposta, pv_total, orcamento_final, excluida_em ou cliente_id
create or replace function public.trg_atualizar_ficha_por_projeto()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.cliente_id is not null then
      perform public.recalcular_ficha_cliente(old.cliente_id);
    end if;
    return old;
  end if;
  if new.cliente_id is not null then
    perform public.recalcular_ficha_cliente(new.cliente_id);
  end if;
  if tg_op = 'UPDATE' and old.cliente_id is distinct from new.cliente_id and old.cliente_id is not null then
    perform public.recalcular_ficha_cliente(old.cliente_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projetos_ficha_cliente on public.projetos;
create trigger trg_projetos_ficha_cliente
  after insert or update of url_pdf_proposta, pv_total, orcamento_final, excluida_em, cliente_id
  or delete on public.projetos
  for each row execute function public.trg_atualizar_ficha_por_projeto();

-- projeto_itens: mudou tipo ou status
create or replace function public.trg_atualizar_ficha_por_item()
returns trigger language plpgsql as $$
declare
  v_cliente_id uuid;
begin
  select cliente_id into v_cliente_id from public.projetos
   where id = coalesce(new.projeto_id, old.projeto_id);
  if v_cliente_id is not null then
    perform public.recalcular_ficha_cliente(v_cliente_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_itens_ficha_cliente on public.projeto_itens;
create trigger trg_itens_ficha_cliente
  after insert or update of tipo, status or delete on public.projeto_itens
  for each row execute function public.trg_atualizar_ficha_por_item();

-- ═══════════════════════════════════════════════════════════
-- 4) BACKFILL — atualiza TODOS os clientes existentes
-- ═══════════════════════════════════════════════════════════
do $$
declare
  r record;
begin
  for r in select id from public.clientes loop
    perform public.recalcular_ficha_cliente(r.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
