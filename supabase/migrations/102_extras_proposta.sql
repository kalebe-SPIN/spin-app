-- Kalebe 2026-09-02: itens livres adicionados à proposta pelo admin —
-- coisas fora do dimensionamento/catálogo (brinde, consultoria extra,
-- serviço adicional a pedido do cliente etc). Somam ao PV bruto ANTES
-- do ajuste final (desconto/acréscimo).
--
-- Estrutura de cada elemento:
--   { descricao: string, valor: number, criado_em: iso-string }

alter table public.projetos
  add column if not exists extras_proposta jsonb not null default '[]'::jsonb;

comment on column public.projetos.extras_proposta is
  'Array de itens livres adicionados manualmente pelo admin à proposta.';

notify pgrst, 'reload schema';
