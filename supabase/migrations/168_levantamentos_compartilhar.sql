-- =====================================================================
-- Migration 168 — Levantamento: o campo só acessa o que o admin compartilha
-- Kalebe 2026-10-27: "o campo só consegue acessar o formulário a partir do
-- compartilhamento e do formulário que o admin vai conceder".
--
-- - Só o admin (equipe de projeto) cria levantamento.
-- - O admin compartilha o levantamento com um ou mais usuários do setor
--   campo (profissional_campo / instalador); só esses veem, preenchem,
--   enviam e anexam fotos. Quem não recebeu não vê nada.
-- - Automação/servidor e admin continuam vendo tudo.
-- Rodar depois da 164. Pode rodar de novo sem problema.
-- =====================================================================

BEGIN;

create table if not exists public.levantamento_compartilhamentos (
  levantamento_id  uuid not null references public.levantamentos(id) on delete cascade,
  usuario_id       uuid not null references auth.users(id) on delete cascade,
  concedido_por    uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  primary key (levantamento_id, usuario_id)
);
create index if not exists levantamento_compartilhamentos_usuario_idx
  on public.levantamento_compartilhamentos (usuario_id);

-- compartilhado com o usuário atual (e ele é do setor campo e está ativo)
create or replace function public.lev_compartilhado(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.eh_campo() and exists (
    select 1 from public.levantamento_compartilhamentos c
    where c.levantamento_id = p_id and c.usuario_id = auth.uid()
  );
$$;

-- só compartilha com quem é do setor campo e está ativo
create or replace function public.levantamento_compartilhar_antes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.usuario_id and p.ativo
                   and p.role::text in ('profissional_campo', 'instalador')) then
    raise exception 'Só dá para compartilhar com quem é do setor campo e está ativo.';
  end if;
  return new;
end $$;

drop trigger if exists trg_levantamento_compartilhar_antes on public.levantamento_compartilhamentos;
create trigger trg_levantamento_compartilhar_antes
  before insert or update on public.levantamento_compartilhamentos
  for each row execute function public.levantamento_compartilhar_antes();

alter table public.levantamento_compartilhamentos enable row level security;

drop policy if exists lev_comp_ler on public.levantamento_compartilhamentos;
create policy lev_comp_ler on public.levantamento_compartilhamentos for select to authenticated
  using (public.papel_atual() in ('admin', 'projetista') or usuario_id = auth.uid());

drop policy if exists lev_comp_admin on public.levantamento_compartilhamentos;
create policy lev_comp_admin on public.levantamento_compartilhamentos for all to authenticated
  using (public.papel_atual() in ('admin', 'projetista'))
  with check (public.papel_atual() in ('admin', 'projetista'));

-- ---------------------------------------------------------------- quem vê / edita
create or replace function public.pode_ver_levantamento(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.levantamentos l
    where l.id = p_id and l.deleted_at is null
      and (public.eh_equipe_projeto() or public.lev_compartilhado(l.id))
  );
$$;

create or replace function public.pode_editar_levantamento(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.levantamentos l
    where l.id = p_id and l.deleted_at is null
      and ( public.eh_equipe_projeto()
            or (public.lev_compartilhado(l.id) and l.status in ('rascunho', 'com_pendencia')) )
  );
$$;

-- só o admin liga levantamento a projeto (o campo não cria mais)
create or replace function public.pode_vincular_projeto(p_projeto uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select p_projeto is null or public.papel_atual() in ('admin', 'projetista'); $$;

drop policy if exists lev_ler on public.levantamentos;
create policy lev_ler on public.levantamentos for select to authenticated
  using (deleted_at is null and (public.eh_equipe_projeto() or public.lev_compartilhado(id)));

drop policy if exists lev_criar on public.levantamentos;
create policy lev_criar on public.levantamentos for insert to authenticated
  with check (consultor_id = auth.uid() and public.papel_atual() in ('admin', 'projetista'));

drop policy if exists lev_editar on public.levantamentos;
create policy lev_editar on public.levantamentos for update to authenticated
  using (public.eh_equipe_projeto()
         or (public.lev_compartilhado(id) and status in ('rascunho', 'com_pendencia', 'enviado')))
  with check (public.eh_equipe_projeto() or public.lev_compartilhado(id));

-- realtime: a lista do técnico atualiza quando o admin compartilha
do $$ begin
  alter publication supabase_realtime add table public.levantamento_compartilhamentos;
exception when others then null; end $$;

COMMIT;
