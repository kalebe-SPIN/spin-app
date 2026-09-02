-- Kalebe 2026-09-02: campanhas do mês pra o consultor oferecer proposta
-- pronta a partir do catálogo, sem precisar dimensionar kit do zero.
-- A proposta gerada vem com banner "CONDIÇÃO ESPECIAL DE CAMPANHA".
--
-- Modelo: uma tabela com várias campanhas (histórico), controladas por
-- vigente_de/vigente_ate e ativa. Só admin cria/edita; consultor lê.

create table if not exists public.campanhas_mes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  subtitulo text,
  -- Texto exibido no PDF (aviso de condição especial). Ex:
  -- "Oferta promocional válida pra fechamento até 30/setembro/2026."
  condicao_especial text not null,
  -- Kit pré-configurado (opcional — se vazio, consultor escolhe placa/inv)
  placa_id uuid references public.produtos(id) on delete set null,
  qtd_placas int,
  inversor_id uuid references public.produtos(id) on delete set null,
  qtd_inversores int,
  -- Preço promocional direto (não passa pela fórmula de precificação).
  -- Se null, calcula normalmente e o desconto vira o único diferencial.
  pv_promocional numeric(12,2),
  vigente_de date not null default current_date,
  vigente_ate date,
  ativa boolean not null default true,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_campanhas_mes_ativa on public.campanhas_mes (ativa, vigente_ate);

-- Rastreio de qual campanha o projeto está usando
alter table public.projetos
  add column if not exists campanha_aplicada_id uuid references public.campanhas_mes(id) on delete set null,
  add column if not exists campanha_aplicada_em timestamptz,
  add column if not exists pv_promocional_forcado numeric(12,2);

comment on column public.projetos.pv_promocional_forcado is
  'Preço fechado (fixo) da proposta — usado quando aplicada uma campanha do mês. Se preenchido, PV FINAL exibido = este valor (ignora cálculo normal + desconto admin).';

comment on column public.projetos.campanha_aplicada_id is
  'Se preenchido, a proposta foi gerada a partir dessa campanha do mês — banner "condição especial" aparece no PDF.';

alter table public.campanhas_mes enable row level security;

-- SELECT: qualquer usuário autenticado (consultor precisa listar)
drop policy if exists "campanhas_mes select autenticados" on public.campanhas_mes;
create policy "campanhas_mes select autenticados"
  on public.campanhas_mes for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE: só admin
drop policy if exists "campanhas_mes admin write" on public.campanhas_mes;
create policy "campanhas_mes admin write"
  on public.campanhas_mes for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
