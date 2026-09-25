-- ============================================================================
-- Migration 119 — Avisos internos dos agentes + log de acesso a cadastros
-- ============================================================================
-- Kalebe 2026-09-23: todos os agentes (Bianca, Davi, SDR) acessam cadastro de
-- clientes/usuários/agentes e podem mandar aviso interno pra um usuário.
-- Aviso vai SEMPRE pro sino do portal E pro WhatsApp do usuário.
--
-- Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.avisos_internos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  remetente_agente      text NOT NULL,          -- 'bianca' | 'davi' | 'qualificacao'
  remetente_usuario_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- quem pediu pro agente avisar
  titulo                text,
  mensagem              text NOT NULL,
  urgente               boolean NOT NULL DEFAULT false,
  projeto_id            uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  conversa_id           uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
  whatsapp_status       text,                   -- 'enviado' | 'falhou' | 'sem_telefone'
  whatsapp_erro         text,
  lido_em               timestamptz,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avisos_dest_pendentes
  ON public.avisos_internos(destinatario_id, criado_em DESC) WHERE lido_em IS NULL;

ALTER TABLE public.avisos_internos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avisos_dest_read" ON public.avisos_internos;
CREATE POLICY "avisos_dest_read" ON public.avisos_internos
  FOR SELECT USING (destinatario_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "avisos_dest_update" ON public.avisos_internos;
CREATE POLICY "avisos_dest_update" ON public.avisos_internos
  FOR UPDATE USING (destinatario_id = auth.uid());
-- INSERT só via service_role (os agentes gravam com createAdminClient)

-- Auditoria LGPD: quem (qual agente, a pedido de quem) consultou qual cadastro
CREATE TABLE IF NOT EXISTS public.agentes_acessos_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente                text NOT NULL,
  solicitante_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ferramenta            text NOT NULL,
  parametros            jsonb,
  qtd_resultados        int,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agentes_log_data ON public.agentes_acessos_log(criado_em DESC);

ALTER TABLE public.agentes_acessos_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agentes_log_admin_read" ON public.agentes_acessos_log;
CREATE POLICY "agentes_log_admin_read" ON public.agentes_acessos_log
  FOR SELECT USING (public.is_admin());

COMMIT;
