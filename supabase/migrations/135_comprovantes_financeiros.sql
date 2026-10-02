-- ============================================================================
-- Migration 135 — Comprovantes dos lançamentos financeiros
-- ============================================================================
-- Kalebe 2026-10-02: registrar saída por foto/PDF do comprovante ou da nota.
-- O arquivo fica guardado e ligado ao lançamento (fluxo_lancamentos.detalhes
-- .comprovante = caminho no bucket). Bucket PRIVADO: só o servidor grava e
-- o admin abre por link temporário (assinado). Idempotente.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes', 'comprovantes', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Conferência
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'comprovantes';
