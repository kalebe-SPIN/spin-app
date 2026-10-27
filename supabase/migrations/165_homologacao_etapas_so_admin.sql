-- =====================================================================
-- Migration 165 — Etapas da homologação (com os links dos arquivos) só admin
-- Kalebe 2026-10-27: os links dos unifilares/padrão de entrada que o robô e
-- o gerador da homologação gravam em homologacao_etapas (url_arquivo_svg,
-- url_arquivo_pdf) eram lidos por QUALQUER usuário logado
-- (política hom_etapas_auth_read). "Apenas o admin pode."
--
-- A tela /homologacoes/[id] já era só do admin (a tabela homologacoes só
-- abre pro admin/eletrotécnico); o robô e o gerador usam a chave do
-- servidor e não mudam. A política de escrita do admin continua igual.
-- Pode rodar de novo sem problema.
-- =====================================================================

BEGIN;

drop policy if exists "hom_etapas_auth_read" on public.homologacao_etapas;
drop policy if exists hom_etapas_admin_ler on public.homologacao_etapas;
create policy hom_etapas_admin_ler on public.homologacao_etapas
  for select to authenticated using (public.is_admin());

COMMIT;
