-- Kalebe 2026-09-25: bucket wa_midia recusava arquivo de cliente acima de
-- 10 MB (catálogo PDF de 18 MB) e qualquer Word/Excel (tipo fora da lista).
-- Sobe o teto pra 50 MB e aceita qualquer tipo — escrita continua só pelo
-- service_role (webhook/servidor), então não abre upload pra ninguém.
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = NULL
WHERE id = 'wa_midia';

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'wa_midia';
