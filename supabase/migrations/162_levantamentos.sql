-- =====================================================================
-- Migration 162 — Levantamentos de campo (checklists)
-- Kalebe 2026-10-26: o consultor ou o técnico de campo preenche o checklist
-- no celular, com fotos, e envia ao projeto; o projetista (Claude) lê os
-- "enviado", gera as pranchas e devolve para o admin aprovar.
-- Finalidades: sistema fotovoltaico, padrão de entrada novo, aumento de carga.
--
-- Veio do pacote HANDOFF_LEVANTAMENTOS_APP_SPIN, com os pontos "ADAPTAR"
-- ajustados ao spin-app:
--   1. papel_atual() lê profiles.role (enum user_role); inativo perde o papel.
--      Papel novo 'automacao' = usuário de serviço do projetista Claude (anon
--      key + JWT, NUNCA a service_role). Não existe papel 'projetista' no app:
--      quem aprova é o admin ('projetista' fica aceito nas regras para o dia
--      em que existir).
--   2. pedido_id → projeto_id (FK public.projetos). O consultor dono do
--      projeto também enxerga os levantamentos feitos para ele (ex.: pelo
--      técnico de campo da OS).
-- Aplicar via Supabase Dashboard > SQL Editor. Depois rodar a 163 (modelos).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- papel novo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'automacao'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'automacao';
  END IF;
END $$;

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type public.levantamento_finalidade as enum ('fv', 'padrao_novo', 'aumento_carga');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.levantamento_status as enum (
    'rascunho',              -- consultor preenchendo
    'enviado',               -- consultor enviou; fila da automação
    'em_projeto',            -- automação/projetista pegou para gerar
    'com_pendencia',         -- faltam dados/fotos ou há inconsistência; volta ao consultor
    'aguardando_aprovacao',  -- pranchas geradas; aguardando o responsável técnico
    'aprovado',              -- liberado para a CELESC
    'cancelado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.levantamento_arquivo_tipo as enum (
    'foto', 'documento', 'prancha_pdf', 'prancha_dxf', 'prancha_svg', 'preview'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- papel do usuário
-- role::text (e não o literal do enum): 'automacao' acabou de entrar no enum e
-- não pode ser usado como valor do tipo na mesma transação.
create or replace function public.papel_atual()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select case when p.ativo then p.role::text else 'inativo' end
       from public.profiles p where p.id = auth.uid()),
    'consultor');
$$;

create or replace function public.eh_equipe_projeto()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.papel_atual() in ('admin', 'projetista', 'automacao'); $$;

-- Projeto que o usuário pode ligar a um levantamento: o dele (consultor), o da
-- OS que ele executa (técnico de campo) ou qualquer um (equipe de projeto).
create or replace function public.pode_vincular_projeto(p_projeto uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_projeto is null
      or public.papel_atual() in ('admin', 'projetista')
      or exists (select 1 from public.projetos p where p.id = p_projeto and p.consultor_id = auth.uid())
      or exists (select 1 from public.execucoes_servicos e
                  where e.projeto_id = p_projeto and e.responsavel_tecnico = auth.uid());
$$;

-- ---------------------------------------------------------------- modelos de checklist
create table if not exists public.checklist_modelos (
  id          uuid primary key default gen_random_uuid(),
  codigo      public.levantamento_finalidade not null,
  versao      integer not null,
  nome        text not null,
  definicao   jsonb not null,               -- seções, campos, fotos (ver lib/levantamentos/modelos/*.json)
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid(),
  unique (codigo, versao)
);
-- só um modelo ativo por finalidade
create unique index if not exists checklist_modelos_um_ativo
  on public.checklist_modelos (codigo) where ativo;

-- ---------------------------------------------------------------- levantamentos
create table if not exists public.levantamentos (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity unique,   -- exibir como LEV-000123
  finalidade      public.levantamento_finalidade not null,
  modelo_id       uuid not null references public.checklist_modelos(id),
  modelo_versao   integer not null,
  projeto_id      uuid references public.projetos(id) on delete set null,
  cliente_nome    text not null default '',
  cidade          text not null default '',
  status          public.levantamento_status not null default 'rascunho',
  respostas       jsonb not null default '{}'::jsonb,   -- { "<campo_id>": valor }
  progresso       smallint not null default 0 check (progresso between 0 and 100),
  pendencias      jsonb not null default '[]'::jsonb,   -- [{ "campo": "...", "mensagem": "...", "origem": "app|projetista" }]
  observacao_projetista text,
  consultor_id    uuid not null references auth.users(id) default auth.uid(),
  projetista_id   uuid references auth.users(id),
  enviado_em      timestamptz,
  processado_em   timestamptz,
  aprovado_em     timestamptz,
  aprovado_por    uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) default auth.uid(),
  updated_by      uuid references auth.users(id) default auth.uid(),
  deleted_at      timestamptz
);
create index if not exists levantamentos_status_idx      on public.levantamentos (status) where deleted_at is null;
create index if not exists levantamentos_consultor_idx   on public.levantamentos (consultor_id);
create index if not exists levantamentos_projeto_idx     on public.levantamentos (projeto_id);
create index if not exists levantamentos_finalidade_idx  on public.levantamentos (finalidade, updated_at desc);

-- Levantamento ligado a um projeto do usuário (consultor dono do projeto).
create or replace function public.lev_do_meu_projeto(p_projeto uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_projeto is not null
     and exists (select 1 from public.projetos p where p.id = p_projeto and p.consultor_id = auth.uid());
$$;

-- ---------------------------------------------------------------- arquivos (fotos, documentos, pranchas)
create table if not exists public.levantamento_arquivos (
  id               uuid primary key default gen_random_uuid(),
  levantamento_id  uuid not null references public.levantamentos(id) on delete cascade,
  tipo             public.levantamento_arquivo_tipo not null,
  slot             text,            -- id da foto no modelo (ex.: 'fatura', 'poste'); null para pranchas
  storage_path     text not null unique,   -- bucket 'levantamentos': <levantamento_id>/fotos/<slot>/<uuid>.jpg | <levantamento_id>/pranchas/v<n>/<arquivo>
  nome_original    text,
  mime             text not null,
  tamanho_bytes    bigint,
  versao_prancha   integer,         -- 1, 2, 3... a cada nova geração
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) default auth.uid(),
  deleted_at       timestamptz
);
create index if not exists levantamento_arquivos_lev_idx on public.levantamento_arquivos (levantamento_id, tipo);

-- ---------------------------------------------------------------- histórico
create table if not exists public.levantamento_eventos (
  id               uuid primary key default gen_random_uuid(),
  levantamento_id  uuid not null references public.levantamentos(id) on delete cascade,
  tipo             text not null,             -- 'status', 'pendencias', 'pranchas', 'comentario'
  de_status        public.levantamento_status,
  para_status      public.levantamento_status,
  mensagem         text,
  dados            jsonb not null default '{}'::jsonb,
  autor_id         uuid references auth.users(id) default auth.uid(),
  autor_papel      text default public.papel_atual(),
  created_at       timestamptz not null default now()
);
create index if not exists levantamento_eventos_lev_idx on public.levantamento_eventos (levantamento_id, created_at desc);

-- ---------------------------------------------------------------- gatilhos
create or replace function public.levantamentos_antes_gravar()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  papel text := public.papel_atual();
  equipe boolean := papel in ('admin', 'projetista', 'automacao');
  ok boolean;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.projeto_id is not null
     and (tg_op = 'INSERT' or new.projeto_id is distinct from old.projeto_id)
     and not public.pode_vincular_projeto(new.projeto_id) then
    raise exception 'Você não tem acesso a esse projeto para ligar o levantamento.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then
      raise exception 'Um levantamento novo começa como rascunho.';
    end if;
    return new;
  end if;

  -- a finalidade e o modelo ficam os do momento da criação
  new.finalidade    := old.finalidade;
  new.modelo_id     := old.modelo_id;
  new.modelo_versao := old.modelo_versao;
  new.consultor_id  := old.consultor_id;
  new.created_at    := old.created_at;
  new.created_by    := old.created_by;

  -- exclusão (soft delete): admin sempre; o autor só em rascunho ou com pendência
  if new.deleted_at is distinct from old.deleted_at and papel <> 'admin' then
    if papel = 'automacao' or old.consultor_id is distinct from auth.uid()
       or old.status not in ('rascunho', 'com_pendencia') or new.deleted_at is null then
      raise exception 'Só dá para excluir um levantamento seu em rascunho ou com pendência.';
    end if;
  end if;

  -- consultor não mexe em campos da equipe de projeto
  if not equipe then
    if new.pendencias is distinct from old.pendencias and new.status <> 'enviado' then
      -- consultor só pode limpar pendências ao reenviar
      new.pendencias := old.pendencias;
    end if;
    new.projetista_id         := old.projetista_id;
    new.observacao_projetista := old.observacao_projetista;
    new.aprovado_em           := old.aprovado_em;
    new.aprovado_por          := old.aprovado_por;
    new.processado_em         := old.processado_em;
  end if;

  if new.status is distinct from old.status then
    ok := case
      when old.status = 'rascunho'      and new.status = 'enviado'      then true
      when old.status = 'com_pendencia' and new.status = 'enviado'      then true
      when old.status = 'enviado'       and new.status = 'rascunho'     then not equipe or papel = 'admin'
      when old.status = 'enviado'       and new.status = 'em_projeto'   then equipe
      when old.status = 'em_projeto'    and new.status in ('aguardando_aprovacao', 'com_pendencia', 'enviado') then equipe
      when old.status = 'aguardando_aprovacao' and new.status in ('aprovado', 'com_pendencia', 'em_projeto')
                                                                         then papel in ('admin', 'projetista')
      when new.status = 'cancelado'                                      then papel = 'admin'
      else false
    end;
    if not ok then
      raise exception 'Mudança de status não permitida: % → % (papel %).', old.status, new.status, papel;
    end if;

    if new.status = 'enviado'              then new.enviado_em := now(); end if;
    if new.status = 'em_projeto'           then new.projetista_id := coalesce(new.projetista_id, auth.uid()); end if;
    if new.status in ('aguardando_aprovacao', 'com_pendencia') and equipe then new.processado_em := now(); end if;
    if new.status = 'aprovado'             then new.aprovado_em := now(); new.aprovado_por := auth.uid(); end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_levantamentos_antes_gravar on public.levantamentos;
create trigger trg_levantamentos_antes_gravar
  before insert or update on public.levantamentos
  for each row execute function public.levantamentos_antes_gravar();

create or replace function public.levantamentos_depois_gravar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.levantamento_eventos (levantamento_id, tipo, para_status, mensagem)
    values (new.id, 'status', new.status, 'Levantamento criado');
  elsif new.status is distinct from old.status then
    insert into public.levantamento_eventos (levantamento_id, tipo, de_status, para_status, dados)
    values (new.id, 'status', old.status, new.status, jsonb_build_object('pendencias', new.pendencias));
  elsif new.deleted_at is not null and old.deleted_at is null then
    insert into public.levantamento_eventos (levantamento_id, tipo, mensagem)
    values (new.id, 'comentario', 'Levantamento excluído');
  end if;
  return null;
end $$;

drop trigger if exists trg_levantamentos_depois_gravar on public.levantamentos;
create trigger trg_levantamentos_depois_gravar
  after insert or update on public.levantamentos
  for each row execute function public.levantamentos_depois_gravar();

-- ---------------------------------------------------------------- visibilidade
create or replace function public.pode_ver_levantamento(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.levantamentos l
    where l.id = p_id and l.deleted_at is null
      and (l.consultor_id = auth.uid() or public.eh_equipe_projeto() or public.lev_do_meu_projeto(l.projeto_id))
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
            or (l.consultor_id = auth.uid() and l.status in ('rascunho', 'com_pendencia')) )
  );
$$;

-- Primeira pasta do caminho no bucket = id do levantamento. Devolve null em vez
-- de dar erro de conversão (as políticas de storage.objects valem para todos
-- os buckets, e o Postgres não garante a ordem de avaliação do AND).
create or replace function public.lev_id_do_caminho(p_nome text)
returns uuid
language sql immutable
as $$
  select case when split_part(p_nome, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nome, '/', 1)::uuid end;
$$;

-- ---------------------------------------------------------------- RLS
alter table public.checklist_modelos      enable row level security;
alter table public.levantamentos          enable row level security;
alter table public.levantamento_arquivos  enable row level security;
alter table public.levantamento_eventos   enable row level security;

drop policy if exists modelos_ler on public.checklist_modelos;
create policy modelos_ler on public.checklist_modelos for select to authenticated using (true);
drop policy if exists modelos_admin on public.checklist_modelos;
create policy modelos_admin on public.checklist_modelos for all to authenticated
  using (public.papel_atual() = 'admin') with check (public.papel_atual() = 'admin');

drop policy if exists lev_ler on public.levantamentos;
create policy lev_ler on public.levantamentos for select to authenticated
  using (deleted_at is null and (consultor_id = auth.uid() or public.eh_equipe_projeto()
                                 or public.lev_do_meu_projeto(projeto_id)));

drop policy if exists lev_criar on public.levantamentos;
create policy lev_criar on public.levantamentos for insert to authenticated
  with check (consultor_id = auth.uid()
              and public.papel_atual() not in ('inativo', 'candidato', 'automacao'));

drop policy if exists lev_editar on public.levantamentos;
create policy lev_editar on public.levantamentos for update to authenticated
  using (public.eh_equipe_projeto()
         or (consultor_id = auth.uid() and status in ('rascunho', 'com_pendencia', 'enviado')))
  with check (public.eh_equipe_projeto() or consultor_id = auth.uid());
-- sem DELETE físico: exclusão = update deleted_at (regras no gatilho)

drop policy if exists arq_ler on public.levantamento_arquivos;
create policy arq_ler on public.levantamento_arquivos for select to authenticated
  using (deleted_at is null and public.pode_ver_levantamento(levantamento_id));

drop policy if exists arq_criar on public.levantamento_arquivos;
create policy arq_criar on public.levantamento_arquivos for insert to authenticated
  with check (
    (tipo in ('foto', 'documento') and public.pode_editar_levantamento(levantamento_id))
    or (tipo in ('prancha_pdf', 'prancha_dxf', 'prancha_svg', 'preview') and public.eh_equipe_projeto())
  );

drop policy if exists arq_remover on public.levantamento_arquivos;
create policy arq_remover on public.levantamento_arquivos for update to authenticated
  using (public.pode_editar_levantamento(levantamento_id))
  with check (public.pode_editar_levantamento(levantamento_id));

-- Exclusão lógica pelas funções abaixo: um UPDATE direto em deleted_at bate no
-- RLS de leitura (a linha nova some do SELECT) e o Postgres recusa. As
-- funções conferem o acesso e o gatilho continua aplicando as regras.
create or replace function public.excluir_levantamento(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.pode_ver_levantamento(p_id) then
    raise exception 'Levantamento não encontrado.';
  end if;
  update public.levantamentos set deleted_at = now() where id = p_id and deleted_at is null;
end $$;

create or replace function public.remover_arquivo_levantamento(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare a public.levantamento_arquivos;
begin
  select * into a from public.levantamento_arquivos where id = p_id and deleted_at is null;
  if a.id is null or not public.pode_editar_levantamento(a.levantamento_id)
     or (a.tipo not in ('foto', 'documento') and not public.eh_equipe_projeto()) then
    raise exception 'Este arquivo não pode mais ser removido.';
  end if;
  update public.levantamento_arquivos set deleted_at = now() where id = p_id;
end $$;

revoke all on function public.excluir_levantamento(uuid) from public, anon;
revoke all on function public.remover_arquivo_levantamento(uuid) from public, anon;
grant execute on function public.excluir_levantamento(uuid) to authenticated;
grant execute on function public.remover_arquivo_levantamento(uuid) to authenticated;

drop policy if exists ev_ler on public.levantamento_eventos;
create policy ev_ler on public.levantamento_eventos for select to authenticated
  using (public.pode_ver_levantamento(levantamento_id));

drop policy if exists ev_criar on public.levantamento_eventos;
create policy ev_criar on public.levantamento_eventos for insert to authenticated
  with check (public.pode_ver_levantamento(levantamento_id) and tipo in ('comentario', 'pendencias', 'pranchas'));

-- ---------------------------------------------------------------- Storage (bucket privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('levantamentos', 'levantamentos', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
              'application/dxf', 'image/vnd.dxf', 'application/octet-stream', 'image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists lev_storage_ler on storage.objects;
create policy lev_storage_ler on storage.objects for select to authenticated
  using (bucket_id = 'levantamentos'
         and public.pode_ver_levantamento(public.lev_id_do_caminho(name)));

drop policy if exists lev_storage_enviar on storage.objects;
create policy lev_storage_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'levantamentos' and (
       ((storage.foldername(name))[2] = 'fotos'    and public.pode_editar_levantamento(public.lev_id_do_caminho(name)))
    or ((storage.foldername(name))[2] = 'pranchas' and public.eh_equipe_projeto()
                                                   and public.pode_ver_levantamento(public.lev_id_do_caminho(name)))
  ));

-- ---------------------------------------------------------------- realtime (lista atualiza sozinha)
do $$ begin
  alter publication supabase_realtime add table public.levantamentos;
exception when others then null; end $$;

COMMIT;
