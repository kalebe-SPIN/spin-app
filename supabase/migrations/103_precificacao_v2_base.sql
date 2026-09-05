-- Prompt 12 — reforma estrutural da precificação de sistemas.
-- Kalebe 2026-09-06: modelo versionado. Orçamentos criados gravam versao_id
-- e NUNCA são recalculados retroativamente.

-- ═══════════════════════════════════════════════════════════
-- 1) FEATURE FLAG — controla qual motor rodar
-- ═══════════════════════════════════════════════════════════
insert into public.parametros_precificacao (chave, valor_numero, unidade, grupo, vigente_de, ativo, descricao)
select 'precificacao_v2', 0, 'flag', 'motor', current_date, true,
       'Feature flag: 1 = usa novo motor (margem sobre nota SPIN + comissão efetiva). 0 = motor legado.'
where not exists (
  select 1 from public.parametros_precificacao where chave = 'precificacao_v2'
);

insert into public.parametros_precificacao (chave, valor_numero, unidade, grupo, vigente_de, ativo, descricao)
select 'comissao_modo', 0, 'flag', 'motor', current_date, true,
       'Modo comissão: 0 = variável real (taxa × acelerador × origem), 1 = referência fixa 7%'
where not exists (
  select 1 from public.parametros_precificacao where chave = 'comissao_modo'
);

-- ═══════════════════════════════════════════════════════════
-- 2) MARGENS ALVO — sobre nota SPIN, com piso R$/Wp
-- ═══════════════════════════════════════════════════════════
create table if not exists public.margens_alvo (
  id uuid primary key default gen_random_uuid(),
  linha text not null check (linha in ('residencial','comercial','usina','carregador','om')),
  potencia_min_kwp numeric(10,2) not null default 0,
  potencia_max_kwp numeric(10,2) not null default 9999,
  margem_alvo_nota_spin numeric(5,4) not null,
  piso_reais_por_wp numeric(10,2) not null default 0,
  vigente_de date not null default current_date,
  vigente_ate date,
  ativo boolean not null default true,
  descricao text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_margens_alvo_ativo on public.margens_alvo(linha, ativo, vigente_ate);
alter table public.margens_alvo enable row level security;
drop policy if exists "margens_alvo select" on public.margens_alvo;
create policy "margens_alvo select" on public.margens_alvo for select to authenticated using (true);
drop policy if exists "margens_alvo admin write" on public.margens_alvo;
create policy "margens_alvo admin write" on public.margens_alvo for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

insert into public.margens_alvo (linha, potencia_min_kwp, potencia_max_kwp, margem_alvo_nota_spin, piso_reais_por_wp, descricao) values
  ('residencial', 0,   10,  0.48, 3.40, 'Residencial até 10 kWp'),
  ('residencial', 10,  20,  0.45, 3.10, 'Residencial 10-20 kWp'),
  ('comercial',   20,  75,  0.42, 2.90, 'Comercial 20-75 kWp'),
  ('comercial',   75,  200, 0.38, 2.60, 'Comercial 75-200 kWp'),
  ('usina',       200, 9999,0.33, 2.20, 'Usina 200+ kWp')
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════
-- 3) ALÍQUOTAS SIMPLES — Anexos III e V (defaults 2024/2025)
-- ═══════════════════════════════════════════════════════════
create table if not exists public.aliquotas_simples (
  id uuid primary key default gen_random_uuid(),
  anexo text not null check (anexo in ('III','V')),
  faixa int not null,
  rbt12_min numeric(14,2) not null,
  rbt12_max numeric(14,2) not null,
  aliquota_nominal numeric(6,4) not null,
  parcela_deduzir numeric(14,2) not null,
  vigente_de date not null default current_date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists idx_aliquotas_simples_anexo on public.aliquotas_simples(anexo, ativo);
alter table public.aliquotas_simples enable row level security;
drop policy if exists "aliquotas_simples select" on public.aliquotas_simples;
create policy "aliquotas_simples select" on public.aliquotas_simples for select to authenticated using (true);
drop policy if exists "aliquotas_simples admin write" on public.aliquotas_simples;
create policy "aliquotas_simples admin write" on public.aliquotas_simples for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Anexo III — comércio/serviços com fator R alcançável
insert into public.aliquotas_simples (anexo, faixa, rbt12_min, rbt12_max, aliquota_nominal, parcela_deduzir) values
  ('III', 1,       0.00,   180000.00, 0.0600,       0.00),
  ('III', 2,  180000.01,   360000.00, 0.1120,    9360.00),
  ('III', 3,  360000.01,   720000.00, 0.1350,   17640.00),
  ('III', 4,  720000.01,  1800000.00, 0.1600,   35640.00),
  ('III', 5, 1800000.01,  3600000.00, 0.2100,  125640.00),
  ('III', 6, 3600000.01,  4800000.00, 0.3300,  648000.00),
-- Anexo V — serviços sem fator R
  ('V',   1,       0.00,   180000.00, 0.1550,       0.00),
  ('V',   2,  180000.01,   360000.00, 0.1800,    4500.00),
  ('V',   3,  360000.01,   720000.00, 0.1950,    9900.00),
  ('V',   4,  720000.01,  1800000.00, 0.2050,   17100.00),
  ('V',   5, 1800000.01,  3600000.00, 0.2300,   62100.00),
  ('V',   6, 3600000.01,  4800000.00, 0.3050,  540000.00)
on conflict do nothing;

-- Parâmetros globais da empresa pra alíquota
insert into public.parametros_precificacao (chave, valor_numero, unidade, grupo, vigente_de, ativo, descricao)
select 'simples_anexo_atual', 3, 'III|V', 'tributacao', current_date, true, 'Anexo Simples atual (3 = III, 5 = V)'
where not exists (select 1 from public.parametros_precificacao where chave = 'simples_anexo_atual');

insert into public.parametros_precificacao (chave, valor_numero, unidade, grupo, vigente_de, ativo, descricao)
select 'rbt12_atual', 1200000, 'R$', 'tributacao', current_date, true, 'RBT12 corrente estimado (apenas nota SPIN — não inclui pass-through do kit)'
where not exists (select 1 from public.parametros_precificacao where chave = 'rbt12_atual');

-- ═══════════════════════════════════════════════════════════
-- 4) MULTIPLICADORES DE COMPLEXIDADE — checkboxes sobre nota SPIN
-- ═══════════════════════════════════════════════════════════
create table if not exists public.multiplicadores_complexidade (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  tipo text not null check (tipo in ('percentual','valor_fixo','por_km','orcar_parte')),
  valor numeric(12,4) not null default 0,
  aplica_sobre text not null default 'nota_spin' check (aplica_sobre in ('nota_spin')),
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.multiplicadores_complexidade enable row level security;
drop policy if exists "multiplicadores select" on public.multiplicadores_complexidade;
create policy "multiplicadores select" on public.multiplicadores_complexidade for select to authenticated using (true);
drop policy if exists "multiplicadores admin write" on public.multiplicadores_complexidade;
create policy "multiplicadores admin write" on public.multiplicadores_complexidade for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

insert into public.multiplicadores_complexidade (codigo, nome, tipo, valor, descricao) values
  ('inclinacao_altura',      'Inclinação >25° ou altura >6m',      'percentual', 0.12, 'Acréscimo sobre nota SPIN'),
  ('telha_dificil',          'Fibrocimento/barro/shingle',          'percentual', 0.08, 'Acréscimo sobre nota SPIN'),
  ('distancia',              'Distância acima de 60 km',            'por_km',     2.50, 'R$ por km excedente'),
  ('prazo_curto',            'Execução em menos de 15 dias',        'percentual', 0.15, 'Acréscimo sobre nota SPIN'),
  ('solo_estrutura',         'Solo/carport/laje técnica',           'percentual', 0.18, 'Acréscimo sobre nota SPIN'),
  ('padrao_entrada',         'Adequação de padrão',                 'orcar_parte',0.00, 'Orçar à parte'),
  ('rede_trifasica_ausente', 'Rede trifásica ausente',              'orcar_parte',0.00, 'Orçar à parte')
on conflict (codigo) do nothing;

-- ═══════════════════════════════════════════════════════════
-- 5) SNAPSHOT DA COMPOSIÇÃO DO ORÇAMENTO — versionado
-- ═══════════════════════════════════════════════════════════
create table if not exists public.orcamentos_composicao (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  versao_motor text not null,
  -- Componentes de custo
  kit_fornecedor numeric(14,2) not null default 0,
  lista_ca numeric(14,2) not null default 0,
  frete numeric(14,2) not null default 0,
  projeto_art numeric(14,2) not null default 0,
  instalacao numeric(14,2) not null default 0,
  extras numeric(14,2) not null default 0,
  multiplicadores_valor numeric(14,2) not null default 0,
  custo_total numeric(14,2) not null default 0,
  -- Parâmetros usados
  margem_alvo_nota_spin numeric(6,4) not null,
  piso_reais_por_wp numeric(10,2),
  aliquota_nominal numeric(6,4) not null,
  aliquota_efetiva numeric(6,4) not null,
  comissao_taxa_base numeric(6,4) not null,
  comissao_acelerador numeric(6,4) not null,
  comissao_origem numeric(6,4) not null,
  comissao_efetiva numeric(6,4) not null,
  comissao_modo text not null,
  origem_lead text not null,
  -- Resultado
  pv_total numeric(14,2) not null,
  nota_spin numeric(14,2) not null,
  margem_spin numeric(14,2) not null,
  fatia_spin numeric(6,4) not null,
  reais_por_wp numeric(10,2),
  piso_aplicado boolean not null default false,
  desconto_max numeric(14,2) not null default 0,
  -- Auditoria
  multiplicadores_aplicados jsonb not null default '[]'::jsonb,
  parametros_snapshot jsonb not null default '{}'::jsonb,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_orcamentos_composicao_projeto on public.orcamentos_composicao(projeto_id, criado_em desc);
alter table public.orcamentos_composicao enable row level security;
drop policy if exists "orcamentos_composicao select" on public.orcamentos_composicao;
create policy "orcamentos_composicao select" on public.orcamentos_composicao for select to authenticated using (true);
drop policy if exists "orcamentos_composicao insert" on public.orcamentos_composicao;
create policy "orcamentos_composicao insert" on public.orcamentos_composicao for insert to authenticated with check (true);

notify pgrst, 'reload schema';
