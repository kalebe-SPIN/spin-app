# Exemplo: Izaias José Vieck — 7,28 kWp on-grid mono

**Referência:** DIAGRAMA UNIFILAR.pdf (fornecido pelo Kalebe em 21/07/2026)

## Contexto

Cliente residencial em SC, sistema fotovoltaico monofásico simples. UC 55912610.

Este é o **modelo aprovado** que serve de padrão gráfico pra todos os unifilares residenciais similares.

## Dados do projeto

| Campo | Valor |
|-------|-------|
| Cliente | Izaias José Vieck |
| UC geradora | 55912610 |
| Tipo | On-grid monofásico |
| Tensão | 220V |
| Potência CC | 7,28 kWp |
| Potência CA | 5 kW |
| FCI | 145,6% (acima do ideal, mas dentro da tolerância) |
| Módulos | 13× RS81-M HC-560W |
| Inversor | 1× S6-GR1P5K-S |
| Amperagem padrão | 50A |
| Cabo padrão→medidor | não especificado (usar 10mm² default) |
| Aterramento | Múltiplas hastes cobreadas (não interligadas na versão original — melhorar) |

## O que faz esse desenho ser "bom"

### Estrutura ✅
- **Grid ABCDEF × 1-8** (referência CAD profissional)
- **Layout A3 paisagem** (~1580×1120) — mas o padrão Spin atual é A4 (1190×842). Adaptar.
- **Área esquerda:** desenho técnico do unifilar
- **Coluna direita:** LEGENDA + NOTAS + Placa CUIDADO + Carimbo SPIN

### Simbologia oficial ✅
- Módulo FV como retângulo com célula + diagonal
- DPS 40kA/275V (retângulo com diagonal + aterramento)
- Disjuntor 50A com aterramento
- Medidor kWh com setas bidirecionais
- Central Geradora (G) — círculo grande
- Relé de proteção com códigos ANSI (27, 59, 81U, 81O, 25CS, 78, 67, 32, 81R)
- Inversor com "~" e "="
- Ponto de conexão (dot preto)

### Notas obrigatórias ✅
7 notas numeradas cobrindo:
1. Desconexão do inversor durante manutenção
2. NBR IEC 62116 e especif. nº 122
3. Aterramento interligado
4. Placa "Cuidado — GD no Circuito" no QDG
5. Seccionamento NR-10
6. Inversores em local acessível IP adequado
7. NR-10 + normas técnicas segurança ABNT

### Placa de advertência ✅
- Dimensões: 180 × 250 mm
- Espessura: 2 mm
- Cor fundo: amarelo epóxi
- Letras: pretas, tinta eletrostática em pó
- Texto: "CUIDADO — RISCO DE CHOQUE ELÉTRICO — GERAÇÃO PRÓPRIA"

### Carimbo ✅
Todos os campos:
- TÍTULO: "DIAGRAMA UNIFILAR DE LIGAÇÃO DE MICROGERAÇÃO"
- PROJETO: "UC 55912610 - IZAIAS JOSE VIECK"
- POTÊNCIA: 7,28 KW
- PROPRIETÁRIO: IZAIAS JOSE VIECK
- RESP. TÉCNICO: MURILO RIBEIRO GOMES
- DATA: 20/06/2024
- TAMANHO: A3
- FOLHA: 01

## O que replicar em outros projetos

### Padrões a MANTER
1. **Simbologia consistente** — usar exatamente os símbolos de `references/simbolos.md`
2. **Cadeia CA clara:** Ponto conexão → Padrão → Medidor → QGBT → QPCA → Inversor → Gerador
3. **Notas 1-8 numeradas** referenciando normas
4. **Placa CUIDADO 180×250mm** amarela sempre
5. **Carimbo com todos campos** (mesmo em projetos pequenos)
6. **Códigos ANSI** desenhados no relé de proteção (Grupo A) ou omitidos (Grupo B simples)

### Padrões a EVOLUIR
1. **Aterramento interligado** — o desenho original não mostrava interligação, mas norma pede. Sempre mostrar hastes conectadas.
2. **FCI destacado** — se ≥ 130%, notar como AVISO (não erro fatal)
3. **QPCA explícito** — como caixa tracejada rotulada, não implícito
4. **Layout A4** — nossos deploys usam A4 por padrão, redimensionar tudo proporcionalmente

## Dados pra template

Ao gerar unifilar similar, usar:

```
TITULO_HEADER = "UNIFILAR ON-GRID - IZAIAS JOSE VIECK"
SUBTITULO = "UC 55912610 - Cidade/SC - Mono 220V - 7,28 kWp / 5 kW"
UC_GERADORA = "55912610"
TENSAO_REDE = "220/380V - 60Hz"
AMPERAGEM_PADRAO = "50A"
BITOLA_PADRAO_MEDIDOR = "10mm² PVC - 3m"
AMPERAGEM_QGBT = "50A"
AVISO_QGBT = ""  (se aplicável)
AMPERAGEM_DISJ_CA = "32A"
DPS_CLASSE = "Cl. II - 40kA/275V"
INVERSOR_MODELO = "S6-GR1P5K-S"
INVERSOR_POTENCIA_KW = "5"
INVERSOR_TENSAO = "220V - Mono"
QTD_MODULOS = "13"
MODULO_MODELO = "RS81-M HC-560W"
POTENCIA_KWP = "7,28"
TELHADO_INFO = "fibrocimento / madeira - 18° - N"
QTD_HASTES = "3"
SPDA_INFO = "Não instalado"
FCI_PCT = "145,6"
FCI_STATUS = "ACIMA de 130 - atenção"
ICC_INVERSOR = "22,7"
DISJUNTOR_COMERCIAL = "32"
QUEDA_TENSAO_PCT = "1,06"
DISTANCIA_M = "30"
POTENCIA_FORMATADA = "7,28 kWp / 5 kW"
```

## Avisos técnicos esperados

O agente deve gerar automaticamente:
- ⚠️ "FCI 145,6% acima do recomendado (130-145%) — revisar dimensionamento CC vs CA"
- ✅ "Hastes de aterramento interligadas conforme NBR 5410"
- ✅ "Disjuntor CA 32A adequado pra Icc 22,7A × 1,25 = 28,4A"
- ✅ "Queda de tensão CA 1,06% dentro do limite 2% (NBR 5410)"

## Arquivo de referência

PDF original: `~/Documents/DIAGRAMA UNIFILAR.pdf` (fora do repo)
