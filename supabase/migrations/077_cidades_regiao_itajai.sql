-- ============================================================================
-- Migration 077 — Cidades da microrregião de Itajaí + Vale do Itajaí
-- ============================================================================
-- CONTEXTO
-- Kalebe pediu 21/08/2026 pra ampliar a cobertura de cidades atendidas
-- pra fechar a região próxima de Itajaí (AMFRI + Vale). Já existiam:
-- Itapema, Balneário Camboriú, Camboriú, Porto Belo, Itajaí, Navegantes,
-- Penha. Faltavam Ilhota, Luiz Alves, Bombinhas, Balneário Piçarras,
-- Barra Velha e Gaspar. Itapoá e São Francisco do Sul ficam fora — muito
-- longe pra a operação de limpeza sair rentável (>130km).
--
-- Distâncias rodoviárias aproximadas partindo de Tijucas/SC via BR-101 e
-- ramificações (Google Maps, agosto/2026). São referência pro parâmetro
-- min_por_km da fórmula de limpeza — Kalebe pode ajustar em
-- /admin/precificacao/cidades.
--
-- Idempotente: ON CONFLICT DO NOTHING preserva o que já foi cadastrado
-- pelo Kalebe (com distância personalizada ou observação).
-- ============================================================================

INSERT INTO public.cidades_distancia (cidade, uf, km, observacao) VALUES
  ('Ilhota',              'SC', 45,  'Via BR-101 → SC-470'),
  ('Luiz Alves',          'SC', 55,  'Via BR-470 (interior AMFRI)'),
  ('Bombinhas',           'SC', 45,  'Via BR-101 → SC-412 (Porto Belo)'),
  ('Balneário Piçarras',  'SC', 75,  'BR-101 sentido norte'),
  ('Barra Velha',         'SC', 85,  'BR-101 sentido norte (limite prático)'),
  ('Gaspar',              'SC', 75,  'Vale do Itajaí, via BR-470')
ON CONFLICT (cidade, uf) DO NOTHING;
