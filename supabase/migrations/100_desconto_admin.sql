-- Kalebe 2026-09-02: desconto do admin no fechamento da proposta.
-- Persiste no projeto pra o PDF e o WhatsApp refletirem o valor negociado.
-- Campos:
--   desconto_admin_pct: percentual (0-100). Prioritário sobre valor.
--   desconto_admin_valor: valor absoluto em R$ (usado se pct for null).
--   desconto_admin_motivo: nota livre pra rastreio ("cliente VIP", "fechamento").
--   desconto_admin_por: uuid do usuário que aplicou.
--   desconto_admin_em: timestamp.

alter table public.projetos
  add column if not exists desconto_admin_pct numeric(5,2),
  add column if not exists desconto_admin_valor numeric(12,2),
  add column if not exists desconto_admin_motivo text,
  add column if not exists desconto_admin_por uuid references public.profiles(id) on delete set null,
  add column if not exists desconto_admin_em timestamptz;

comment on column public.projetos.desconto_admin_pct is
  'Desconto aplicado pelo admin no fechamento (0-100). Se preenchido, tem prioridade sobre desconto_admin_valor.';
comment on column public.projetos.desconto_admin_valor is
  'Desconto absoluto em R$ (usado quando desconto_admin_pct é null).';
