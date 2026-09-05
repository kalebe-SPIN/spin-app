-- Kalebe 2026-09-06: colunas de métrica em profiles pra dashboard do representante

alter table public.profiles
  add column if not exists mrr_carteira_atual numeric(14,2) not null default 0,
  add column if not exists credenciados_formados int not null default 0,
  add column if not exists fechador_mes_count int not null default 0,
  add column if not exists nivel_representante text default 'Credenciado'
    check (nivel_representante in ('Credenciado','Sênior','Master'));

comment on column public.profiles.mrr_carteira_atual is 'Soma da mensalidade dos planos O&M ativos vendidos por este representante';
comment on column public.profiles.credenciados_formados is 'Quantos representantes este user formou (contam pra Master)';
comment on column public.profiles.fechador_mes_count is 'Quantas vezes foi Fechador do Mês na Semana de Fechamento';

-- Adiciona 'representante' e 'sdr' aos roles válidos
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and check_clause like '%representante%'
  ) then
    -- Não força alteração de constraint que pode não existir. profiles.role é
    -- geralmente text livre — só documenta os valores esperados no comment.
    null;
  end if;
end$$;

comment on column public.profiles.role is
  'admin | consultor | representante | vendedor_servicos | profissional_campo | sdr';

notify pgrst, 'reload schema';
