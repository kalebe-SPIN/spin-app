-- ============================================================================
-- Migration 134 — Setor que aparece nas mensagens do WhatsApp
-- ============================================================================
-- Kalebe 2026-10-01: mensagens identificam o usuário por "primeiro nome ·
-- setor" (ex.: *Luciane · Financeiro:*). Quem está em um setor só usa ele
-- automaticamente; quem está em vários (admins estão em todos) escolhe aqui,
-- no cadastro de usuários. Vazio = só o primeiro nome. Idempotente.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS setor_mensagens text
  REFERENCES public.grupos_internos(chave) ON UPDATE CASCADE ON DELETE SET NULL;

-- Kalebe (diretor comercial) já sai como Comercial; os demais admins o
-- Kalebe escolhe em /admin/usuarios
UPDATE public.profiles
SET setor_mensagens = 'comercial'
WHERE id = '036b2ba7-a523-4529-9189-1818b4a2f025' AND setor_mensagens IS NULL;

-- Conferência
SELECT nome_completo, role::text AS papel, setor_mensagens
FROM public.profiles
WHERE ativo AND role::text <> 'candidato'
ORDER BY nome_completo;
