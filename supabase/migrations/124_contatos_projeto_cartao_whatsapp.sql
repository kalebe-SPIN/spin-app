-- Kalebe 2026-09-29: cliente repassa no meio da conversa o contato do
-- decisor (cartão de contato do WhatsApp ou número digitado) → fica salvo
-- vinculado ao mesmo projeto.
--
-- Bug junto: wa_mensagens só aceitava text/audio/image/video/document/
-- template/system/interactive — cartão de contato, localização, figurinha
-- e resposta de botão de modelo eram DESCARTADOS em silêncio pelo webhook.

-- 1) Tipos de mensagem que o WhatsApp manda e o banco recusava
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.wa_mensagens'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.wa_mensagens DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.wa_mensagens
  ADD CONSTRAINT wa_mensagens_tipo_check CHECK (tipo IN (
    'text', 'audio', 'image', 'video', 'document', 'template', 'system', 'interactive',
    'contacts', 'location', 'sticker', 'button', 'unsupported'
  ));

-- Conteúdo estruturado (cartão de contato, localização)
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS dados jsonb;

-- 2) Contatos do projeto (decisor, financeiro, técnico…)
CREATE TABLE IF NOT EXISTS public.projeto_contatos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  telefone        text,                 -- só dígitos, com 55
  email           text,
  papel           text NOT NULL DEFAULT 'decisor'
                    CHECK (papel IN ('decisor', 'financeiro', 'tecnico', 'outro')),
  observacao      text,
  origem          text NOT NULL DEFAULT 'manual'
                    CHECK (origem IN ('whatsapp_cartao', 'whatsapp_texto', 'manual')),
  wa_mensagem_id  uuid REFERENCES public.wa_mensagens(id) ON DELETE SET NULL,
  criado_por      uuid REFERENCES public.profiles(id),
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_projeto_contatos_tel
  ON public.projeto_contatos(projeto_id, telefone) WHERE telefone IS NOT NULL;

-- Quem enxerga o projeto (RLS de projetos vale dentro do EXISTS) mexe nos contatos dele
ALTER TABLE public.projeto_contatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projeto_contatos_acesso" ON public.projeto_contatos;
CREATE POLICY "projeto_contatos_acesso" ON public.projeto_contatos
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_contatos.projeto_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_contatos.projeto_id));

-- 3) A agente de recepção do inbox se chama Laís (era "Assistente Spin")
UPDATE public.wa_agentes
SET nome = 'Laís',
    system_prompt = replace(system_prompt, 'Você é o Assistente da Spin Solar', 'Você é a Laís, do atendimento da Spin Solar'),
    atualizado_em = now()
WHERE chave LIKE 'qualificacao%';

-- Conferência
SELECT pg_get_constraintdef(oid) AS tipos_aceitos
FROM pg_constraint WHERE conname = 'wa_mensagens_tipo_check';
SELECT chave, nome, left(system_prompt, 60) AS inicio_prompt FROM public.wa_agentes WHERE chave LIKE 'qualificacao%';
