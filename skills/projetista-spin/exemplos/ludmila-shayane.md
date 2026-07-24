# Exemplo: Ludmila Shayane Da Luz — 4,26 kWp on-grid mono (production)

**Referência:** primeiro unifilar gerado em produção pelo agente Projetista SPIN em 21/07/2026.

## Contexto

Cliente Spin Solar, primeiro caso real testado end-to-end pelo sistema. Serve de baseline pra qualidade do agente em produção.

## Dados do projeto

| Campo | Valor |
|-------|-------|
| Código projeto | SPIN-2026-0002 |
| Cliente | Ludmila Shayane Da Luz |
| UC geradora | 58018732 |
| Cidade | Gaspar/SC |
| Tipo | On-grid monofásico |
| Tensão | 220V |
| Potência CC | 4,26 kWp |
| Potência CA | 3 kW |
| FCI | 142% (acima do limite típico) |
| Módulos | 6× CHSM66N(DG)/F-BH 710Wp |
| Inversor | 1× SIW200G M030 W1 (3 kW mono 220V) |
| Amperagem padrão | 50A |
| Aterramento | 5x hastes cobreadas 5/8 × 2,4m (não interligadas — corrigir) |
| SPDA | Não há |

## Avisos técnicos gerados na v4 pronto

O agente detectou automaticamente:
1. **FCI de 142% está ACIMA do limite recomendado de 130% (Pcc/Pca)** — reavaliar dimensionamento do inversor ou reduzir potência CC instalada
2. **QGBT do cliente NÃO possui espaço disponível pra disjuntor solar** — necessária adequação física do quadro antes da instalação (conforme informado no padrão de entrada)
3. **Medidor bidirecional ainda não instalado** (medidor_bidirecional=false) — solicitar troca junto à CELESC conforme I-432.0004
4. **Hastes de aterramento informadas (5 unidades) NÃO estão interligadas** — verificar necessidade de interligação conforme norma E-321.0031
5. **Distância string-QGBT de 12m considerada no cálculo de queda de tensão CA** — confirmar em campo antes da execução

## O que ficou bom no v4

### Cadeia elétrica correta ✅
```
REDE CELESC → PADRÃO (Disj. 50A) → M bidirecional (kWh) → QGBT Cliente (sem espaço)
→ QPCA (Disj. 20A + DPS Cl.II) → INVERSOR SIW200G → 6× CHSM66N(DG)/F-BH 710Wp
```

### Blocos laterais ✅
- **ATERRAMENTO:** 5 hastes cobreadas, hastes NÃO interligadas (aviso), SPDA não há, malha E-321.0031
- **MEMÓRIA DE CÁLCULO:** Pcc = 4,26 kWp / Pca = 3 kW; FCI = 142%; Icc = 13,6A × 1,25 = 17A; Disjuntor 20A; Queda tensão CA 1,02% OK
- **NORMAS APLICÁVEIS:** N-321.0001 / I-432.0004 / E-321.0031

### Carimbo SPIN completo ✅
- Logo SPIN desenhado (barras + texto)
- Spin Solar Energias Renováveis Ltda
- CNPJ 22.279.642/0001-04
- Rua Açaí, 17 - Tel: (48) 3263-0182
- kalebe@spinsolar.com.br
- RT: Kalebe Grun - Eletrotécnico Reg. 94312176000
- ART: a definir
- UC 58018732 - Gaspar/SC - ON-GRID Monofásico 220V - 4,26 kWp / 3 kW

## Pontos de melhoria

### Logo e assinatura RT (issues visuais)
- Logo Spin no header aparece como imagem quebrada 📄
- Assinatura RT no rodapé também quebrada
- **Causa:** URLs de imagem no SVG apontam pra local errado, sem base64 inline
- **Fix:** desenhar logo direto no SVG (barras coloridas + texto) em vez de `<image xlink:href>`

### Consistência com Izaias
- Layout ficou similar mas com pequenas diferenças de posicionamento
- Formato A4 (não A3 como o Izaias)
- Notas técnicas idênticas ✅

## Dados pra template

```
TITULO_HEADER = "UNIFILAR ON-GRID - Ludmila Shayane Da Luz"
SUBTITULO = "UC 58018732 - Gaspar/SC - Mono 220V - 4,26 kWp / 3 kW"
UC_GERADORA = "58018732"
CIDADE_UF = "Gaspar/SC"
TENSAO_REDE = "220/380V - 60Hz"
AMPERAGEM_PADRAO = "50A"
BITOLA_PADRAO_MEDIDOR = "10mm² PVC - 3m"
AMPERAGEM_QGBT = "50A"
AVISO_QGBT = "Sem espaço disj. solar"
AMPERAGEM_DISJ_CA = "20A"
DPS_CLASSE = "Cl. II"
INVERSOR_MODELO = "SIW200G M030 W1"
INVERSOR_POTENCIA_KW = "3"
INVERSOR_TENSAO = "220V - Mono"
QTD_MODULOS = "6"
MODULO_MODELO = "CHSM66N(DG)/F-BH 710Wp"
POTENCIA_KWP = "4,26"
TELHADO_INFO = "fibrocimento / madeira - inclinação/orientação"
QTD_HASTES = "5"
SPDA_INFO = "não há"
FCI_PCT = "142"
FCI_STATUS = "ACIMA de 130 - atenção"
ICC_INVERSOR = "13,6"
DISJUNTOR_COMERCIAL = "20"
QUEDA_TENSAO_PCT = "1,02"
DISTANCIA_M = "12"
POTENCIA_FORMATADA = "4,26 kWp / 3 kW"
```

## Lições aprendidas do primeiro deploy

1. **Streaming Anthropic obrigatório** — SDK bloqueia non-stream se `max_tokens > ~20000`
2. **JSON válido no return** — Claude tende a preambular; system prompt precisa ser ESTRITO "APENAS JSON"
3. **Logo desenhado, não `<image>`** — evita URLs quebradas
4. **Auditar antes de entregar** — a v3 anterior (padrão A3) deu erro; v4 A4 saiu limpo
5. **Fluxo end-to-end funciona** — projeto vendido → botão gerar → 30-60s → SVG + PDF + DXF prontos

## Status

- ✅ v4 saiu PRONTO (23/07/2026)
- ✅ Kalebe validou visualmente ("bixão!")
- ⏳ Refinamento de logo/assinatura pendente
- ⏳ Migration 054 (refinar/regenerar/excluir) precisa rodar

## Arquivo de referência

- SVG gerado: `projetos-diagramas/b9c8b258.../unifilar.svg` no Supabase Storage
- PDF baixado: `~/Downloads/unifilar-unifilar_ongrid-v4.pdf`
