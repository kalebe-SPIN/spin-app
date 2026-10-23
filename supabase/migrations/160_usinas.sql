-- =================================================================
-- 160 — Dados da usina do cliente (Kalebe 2026-10-22)
-- "Pro cliente da Spin ou de outra empresa vinculada no sistema, ter o campo
--  com os dados cadastrais da sua usina (projeto): login e senhas, potências
--  e modelos de equipamentos." Aparece no projeto e no perfil do Spinzap.
-- Decisão: toda a equipe vê a senha, com registro de quem viu.
--
--  - usinas: 1 por projeto — potências, conexão, UC, equipamentos (modelo,
--    quantidade, número de série) e monitoramento (plataforma, link, login)
--  - usinas_senhas: a senha do monitoramento, separada (só o servidor lê)
--  - usinas_senhas_acessos: quem abriu a senha e quando
-- Sem policy nas três: tudo passa pelo servidor, que confere o acesso ao
-- projeto ou à conversa antes. Tudo numa transação.
-- =================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.usinas (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id                uuid NOT NULL UNIQUE REFERENCES public.projetos(id) ON DELETE CASCADE,
  potencia_cc_kwp           numeric,
  potencia_ca_kw            numeric,
  data_conexao              date,
  uc                        text,
  equipamentos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  monitoramento_plataforma  text,
  monitoramento_link        text,
  monitoramento_login       text,
  observacoes               text,
  criado_em                 timestamptz NOT NULL DEFAULT now(),
  atualizado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_por            uuid REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.usinas_senhas (
  usina_id        uuid PRIMARY KEY REFERENCES public.usinas(id) ON DELETE CASCADE,
  senha           text,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.usinas_senhas_acessos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usina_id    uuid NOT NULL REFERENCES public.usinas(id) ON DELETE CASCADE,
  usuario_id  uuid REFERENCES public.profiles(id),
  visto_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usinas_senhas_acessos ON public.usinas_senhas_acessos (usina_id, visto_em DESC);

ALTER TABLE public.usinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usinas_senhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usinas_senhas_acessos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.usinas IS 'Usina do cliente por projeto (Kalebe 2026-10-22): potências, equipamentos e monitoramento. Acesso só pelo servidor.';
COMMENT ON TABLE public.usinas_senhas IS 'Senha do monitoramento da usina — só o servidor lê; cada leitura vai pra usinas_senhas_acessos.';

COMMIT;
