-- =================================================================
-- 161 — Servidor intermediário (IP fixo) do fornecedor de API
-- (Kalebe 2026-10-23: o fornecedor só libera a API pra um IP fixo; o
-- sistema roda na Vercel, sem IP fixo. Decisão: servidor intermediário
-- próprio — um VPS com IP fixo por onde passam só as chamadas ao fornecedor.)
--  - proxy_url: http://usuario:senha@IP:porta — fica junto da chave da API,
--    na tabela que só o servidor lê (sem policy)
-- =================================================================

BEGIN;

ALTER TABLE public.catalogo_fornecedores_credenciais ADD COLUMN IF NOT EXISTS proxy_url text;

COMMENT ON COLUMN public.catalogo_fornecedores_credenciais.proxy_url IS
  'Servidor intermediário com IP fixo (http://usuario:senha@IP:porta) pelas chamadas à API do fornecedor — só o servidor lê.';

COMMIT;
