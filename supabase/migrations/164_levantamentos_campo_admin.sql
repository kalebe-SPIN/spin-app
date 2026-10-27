-- =====================================================================
-- Migration 164 — Levantamento: só admin e setor campo; arquivos só admin
-- Kalebe 2026-10-27: "somente o admin e o campo podem acessar os
-- formulários e editar, responder e atualizar; o vendedor (representante)
-- preenche as informações [do projeto] e o formulário é aberto e preenchido
-- na visita técnica pelo admin ou pelo setor campo; depois de preenchido,
-- apenas o admin segue na geração dos diagramas, desenhos e arquivos".
--
-- 1. Setor campo = papéis profissional_campo e instalador. Campo + equipe
--    de projeto (admin) criam, veem e editam; representante/consultor não
--    acessam mais os levantamentos (os dados dele entram pelo projeto).
-- 2. O servidor do app e o robô de diagramas (chave service_role, sem
--    usuário) contam como 'automacao' no gatilho: avançam o levantamento
--    quando o robô termina, nunca aprovam nem cancelam.
-- 3. Pranchas do levantamento (tabela e bucket): só a equipe de projeto lê.
-- 4. projetos_diagramas.levantamento_id: diagrama gerado a partir do
--    levantamento (o robô avisa o levantamento quando termina).
-- 5. Bucket projetos-diagramas: sai a política que deixava QUALQUER UM
--    (até sem login) listar os arquivos. Os links continuam abrindo para
--    quem já os tem (bucket público); a listagem fica só com o servidor.
-- Rodar depois da 162 e da 163. Pode rodar de novo sem problema.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- papel (servidor = automação)
create or replace function public.papel_atual()
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when auth.uid() is null
     and coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')) = 'service_role'
      then 'automacao'
    else coalesce(
      (select case when p.ativo then p.role::text else 'inativo' end
         from public.profiles p where p.id = auth.uid()),
      'consultor')
  end;
$$;

create or replace function public.eh_campo()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.papel_atual() in ('profissional_campo', 'instalador'); $$;

-- Projeto que dá pra ligar: qualquer um (admin) ou o da OS que o técnico executa.
create or replace function public.pode_vincular_projeto(p_projeto uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_projeto is null
      or public.papel_atual() in ('admin', 'projetista')
      or exists (select 1 from public.execucoes_servicos e
                  where e.projeto_id = p_projeto and e.responsavel_tecnico = auth.uid());
$$;

-- ---------------------------------------------------------------- quem vê / edita
create or replace function public.pode_ver_levantamento(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.levantamentos l
    where l.id = p_id and l.deleted_at is null
      and (public.eh_equipe_projeto() or public.eh_campo())
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
            or (public.eh_campo() and l.status in ('rascunho', 'com_pendencia')) )
  );
$$;

drop policy if exists lev_ler on public.levantamentos;
create policy lev_ler on public.levantamentos for select to authenticated
  using (deleted_at is null and (public.eh_equipe_projeto() or public.eh_campo()));

drop policy if exists lev_criar on public.levantamentos;
create policy lev_criar on public.levantamentos for insert to authenticated
  with check (consultor_id = auth.uid()
              and public.papel_atual() in ('admin', 'projetista', 'profissional_campo', 'instalador'));

drop policy if exists lev_editar on public.levantamentos;
create policy lev_editar on public.levantamentos for update to authenticated
  using (public.eh_equipe_projeto()
         or (public.eh_campo() and status in ('rascunho', 'com_pendencia', 'enviado')))
  with check (public.eh_equipe_projeto() or public.eh_campo());

-- ---------------------------------------------------------------- pranchas só para a equipe
drop policy if exists arq_ler on public.levantamento_arquivos;
create policy arq_ler on public.levantamento_arquivos for select to authenticated
  using (deleted_at is null and public.pode_ver_levantamento(levantamento_id)
         and (tipo in ('foto', 'documento') or public.eh_equipe_projeto()));

drop policy if exists lev_storage_ler on storage.objects;
create policy lev_storage_ler on storage.objects for select to authenticated
  using (bucket_id = 'levantamentos'
         and public.pode_ver_levantamento(public.lev_id_do_caminho(name))
         and ((storage.foldername(name))[2] = 'fotos' or public.eh_equipe_projeto()));

-- ---------------------------------------------------------------- diagrama ↔ levantamento
alter table public.projetos_diagramas
  add column if not exists levantamento_id uuid references public.levantamentos(id) on delete set null;
create index if not exists idx_diagramas_levantamento
  on public.projetos_diagramas (levantamento_id) where levantamento_id is not null;

-- ---------------------------------------------------------------- sem listagem pública
drop policy if exists "projetos_diagramas_read_all" on storage.objects;

COMMIT;
