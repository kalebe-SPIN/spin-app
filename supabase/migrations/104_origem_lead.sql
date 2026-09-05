-- Kalebe 2026-09-06: origem_lead automática baseada em quem cadastrou.
-- Regra: se o representante cadastra o lead, é 'prospeccao'. Se admin/SDR
-- cadastra, escolhe a origem no cadastro (dropdown). Consultor não vê
-- o campo. Isso resolve a inflação artificial de "prospecção" (que hoje
-- rende multiplicador 1,35× sobre a comissão).
--
-- Origens (do prompt 12):
--   base_repassada 0.85  · lead_spin 1.00
--   aquecimento_1  1.15  · lead_verba 1.15
--   aquecimento_2  1.25  · indicacao  1.25
--   prospeccao     1.35  · resgate    1.35

alter table public.projetos
  add column if not exists origem_lead text
    check (origem_lead in (
      'base_repassada','lead_spin','aquecimento_1','aquecimento_2',
      'lead_verba','indicacao','prospeccao','resgate'
    )),
  add column if not exists origem_lead_travada boolean not null default false,
  add column if not exists criado_por_role text
    check (criado_por_role in ('admin','consultor','sdr','representante'));

comment on column public.projetos.origem_lead is
  'Origem do lead. Determina multiplicador da comissão. Consultor só grava "prospeccao" (travado pelo trigger).';
comment on column public.projetos.origem_lead_travada is
  'Se true, origem foi setada pelo consultor/representante e não pode mais mudar. Admin pode override com log.';

-- Trigger: força origem_lead = 'prospeccao' quando quem cria é consultor/representante.
-- Se admin/SDR não passar origem_lead, default é 'lead_spin' (neutra).
create or replace function public.set_origem_lead_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role in ('consultor','representante') then
    -- Consultor/representante SEMPRE grava como prospecção
    new.origem_lead := 'prospeccao';
    new.origem_lead_travada := true;
    new.criado_por_role := 'representante';
  elsif v_role = 'admin' then
    -- Admin escolhe (dropdown na UI). Default se veio null: lead_spin
    if new.origem_lead is null then new.origem_lead := 'lead_spin'; end if;
    new.origem_lead_travada := false;
    new.criado_por_role := 'admin';
  elsif v_role = 'sdr' then
    if new.origem_lead is null then new.origem_lead := 'lead_spin'; end if;
    new.origem_lead_travada := false;
    new.criado_por_role := 'sdr';
  else
    -- Fallback (sem role ou role desconhecido): trata como lead_spin travado
    if new.origem_lead is null then new.origem_lead := 'lead_spin'; end if;
    new.origem_lead_travada := true;
    new.criado_por_role := coalesce(new.criado_por_role, v_role);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_origem_lead_default on public.projetos;
create trigger trg_origem_lead_default
  before insert on public.projetos
  for each row execute function public.set_origem_lead_default();

-- Trigger de UPDATE: bloqueia alteração de origem_lead se travada,
-- exceto quando quem faz update é admin (com log)
create or replace function public.protege_origem_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if old.origem_lead is distinct from new.origem_lead then
    select role into v_role from public.profiles where id = auth.uid();
    if v_role != 'admin' and old.origem_lead_travada then
      raise exception 'Origem do lead está travada. Só admin pode alterar.';
    end if;
    -- Se admin alterou, poderia gravar em log_alteracoes (fica pra fase 3)
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_origem_lead on public.projetos;
create trigger trg_protege_origem_lead
  before update on public.projetos
  for each row execute function public.protege_origem_lead();

-- Backfill: projetos antigos sem origem_lead recebem 'lead_spin' (neutro)
update public.projetos set origem_lead = 'lead_spin' where origem_lead is null;

create index if not exists idx_projetos_origem_lead on public.projetos(origem_lead) where excluida_em is null;
create index if not exists idx_projetos_consultor_mes
  on public.projetos(consultor_id, created_at desc) where excluida_em is null;

notify pgrst, 'reload schema';
