-- ============================================================================
-- Migration 074 — Bucket de propostas em PDF de serviços
-- ============================================================================
-- Quando o vendedor clica "Gerar PDF e enviar WhatsApp" no card do CRM,
-- o sistema gera o PDF client-side (html2canvas + jsPDF) e faz upload
-- pra o bucket `propostas-servicos`. A URL pública vai na mensagem WA.
--
-- Não há tabela nova — só o bucket + policies. Bucket precisa ser criado
-- MANUALMENTE no Dashboard (Storage > New bucket > propostas-servicos,
-- MARCAR "Public bucket"). As policies abaixo controlam quem pode
-- escrever/deletar; leitura é livre pra qualquer um com a URL (natureza
-- do bucket público) — necessário pra o WhatsApp conseguir abrir.
--
-- Aplicar via Supabase Dashboard > SQL Editor DEPOIS de criar o bucket.
-- ============================================================================

BEGIN;

-- Qualquer usuário autenticado (vendedor ou admin) pode enviar propostas
CREATE POLICY "propostas_bucket_auth_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'propostas-servicos' AND auth.role() = 'authenticated');

-- Delete só admin — evita vendedor apagar proposta de outro sem querer
CREATE POLICY "propostas_bucket_admin_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'propostas-servicos' AND public.is_admin());

COMMIT;
