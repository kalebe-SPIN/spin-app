-- Kalebe 2026-09-30: follow-up com a janela de 24h fechada deixa de "morrer"
-- avisando o humano. A Bianca manda o modelo aprovado spin_retomar_atendimento
-- e o follow-up fica 'aguardando_cliente'; quando o cliente responde (janela
-- reabre), ela envia o follow-up de verdade. Sem resposta em 7 dias → avisa.

ALTER TABLE public.wa_followups DROP CONSTRAINT IF EXISTS wa_followups_status_check;
ALTER TABLE public.wa_followups ADD CONSTRAINT wa_followups_status_check
  CHECK (status IN ('agendado', 'enviado', 'cancelado', 'aguardando_humano', 'aguardando_cliente', 'falhou'));

ALTER TABLE public.wa_followups ADD COLUMN IF NOT EXISTS modelo_enviado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_wa_followups_aguardando
  ON public.wa_followups(conversa_id) WHERE status = 'aguardando_cliente';

-- Conferência
SELECT status, count(*) FROM public.wa_followups GROUP BY status ORDER BY status;
