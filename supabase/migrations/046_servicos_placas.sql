-- Migration 046: 2 novos servicos da Spin
-- Kalebe pediu:
--   1. srv_retirada_recolocacao - Retirada e recolocacao de placas
--      (usado em manutencao de telhado, reforma, mudanca de imovel)
--   2. srv_instalacao_placas - Instalacao de placas em projeto de terceiro
--      (cliente ja tem as placas OU compra separado; Spin faz so mao de obra)
--
-- Postgres nao permite ADD VALUE em enum dentro de transacao — cada um isolado.

ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'srv_retirada_recolocacao';
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'srv_instalacao_placas';
