# Exemplo: Januário Darcio Zatelli — 3,51 kWp micro-geração mono BT

**Referência:** DIAGRAMA (5).pdf (fornecido por Kalebe em 24/07/2026)
**RT:** José Henrique dos Santos da Silva
**Data emissão:** 11/04/2024
**Tamanho:** A3 - Folha 01

## Contexto

Sistema **residencial pequeno** em BT — padrão CELESC "micro-geração" (≤ 75 kW). É o padrão gráfico SPIN oficial pra sistemas pequenos.

Título específico: **"DIAGRAMA UNIFILAR DE LIGACAO DE MICROGERACAO"** (nomenclatura regulatória CELESC).

## Dados do projeto

| Campo | Valor |
|-------|-------|
| Cliente | JANUARIO DARCIO ZATELLI |
| UC geradora | 55170622 |
| Tipo | On-grid micro-geração mono |
| Tensão | BT (220V) |
| Potência CC | **3,51 kWp** |
| Potência CA | 3.000 W |
| Inversor | 1× SOLIS S6-GR1P 3K-M (3 kW mono) |
| Módulos | 6× HELIUSHMB144T10 - 585W |
| Amperagem entrada | 40 A |
| Amperagem micro-gerador | 40 A |
| DPS | Cl II - 40kA/275V |

## Arquitetura elétrica

```
REDE CELESC (BT)
   │
   ● (ponto de conexão)
   │
[ENTRADA DE ENERGIA - caixa tracejada]
   ├─ MEDIDOR CELESC (kWh bidirecional)
   ├─ DISJUNTOR 40A + DPS 40kA/275V + aterramento
   └─ PLACA CUIDADO amarela (a instalar no padrão)
   │
   ├──→ CARGAS (comuns do QDG)
   │
   DISJUNTOR 40A + DPS 40kA/275V
   │
   ● (barramento micro-gerador)
   │
   [27][59]         ← Sub/Sobretensão
   [81U][81O]       ← Sub/Sobrefrequência
   [25][78]         ← Sincronismo / Salto de vetor
   │  (ANSI monitorados pela proteção do inversor)
   │
   [G] CENTRAL GERADORA (3000 W)
   │
   ▼
[MICRO-GERADOR FOVOLTAICO - caixa tracejada]
   ├─ INVERSOR: 1× SOLIS S6-GR1P 3K-M (3000 W) [MPPTs]
   └─ MÓDULOS: 6× HELIUSHMB144T10 585W = 3,51 kWp
   
   ***Nota: Demais detalhes, verificar diagrama multifilar da central geradora
```

## O que faz esse desenho ser "bom"

### Estrutura característica do padrão CELESC micro-geração ✅
1. **Título específico** — "DIAGRAMA UNIFILAR DE LIGACAO DE MICROGERACAO" (não "on-grid")
2. **Ponto de conexão** com seta clara + label "PONTO DE CONEXAO"
3. **Cruz separadora N/F** logo abaixo do ponto de conexão (Neutro+Fase separados)
4. **Entrada de energia** com PLACA CUIDADO **ao lado da caixa** (não dentro)
5. **CARGAS** como saída lateral do barramento intermediário
6. **Quadros ANSI destacados** em pares (27/59 / 81U/81O / 25/78) — proteção regulamentada
7. **CENTRAL GERADORA (G)** identificada com potência CA em Watts
8. **Caixa MICRO-GERADOR FOVOLTAICO** engloba inversor + módulos como bloco único
9. **Nota final:** "***Demais detalhes, verificar diagrama multifilar"
10. **Layout A3** — mesmo pra sistema pequeno, mantém A3 padrão SPIN

### Símbolos-chave ✅
- **Medidor kWh bidirecional** com setas duplas
- **Disjuntor** com aterramento na saída
- **DPS Classe II** (retângulo amarelo com diagonal + aterramento)
- **Placa CUIDADO** 180×250mm amarelo epóxi
- **Gerador G** (círculo grande com "G")
- **ANSI codes** como quadradinhos numerados
- **Módulos FV** com grade 3×3 células + diagonal
- **Inversor** (retângulo com ~ e = + label MPPTs)

### Notas técnicas ✅
7 notas exatamente iguais ao Izaias (padrão CELESC oficial):
1. Fornecedor garante desconexão durante manutenção
2. NBR IEC 62116 e especif. nº 122
3. Aterramento conectado à UC
4. Identificar "Cuidado GD no Circuito" no QDG
5. Seccionamento NR-10
6. Inversores acessíveis IP adequado
7. NR-10 + ABNT

### Diferenças chave vs. template on-grid genérico
- **Título:** "DE LIGACAO DE MICROGERACAO" (não "ON-GRID")
- **Amperagem:** 40A típica (residencial), não 50A/100A
- **ANSI destacado:** 6 quadros em 3 pares (27/59, 81U/81O, 25/78)
- **CENTRAL GERADORA:** identificada com potência CA em W
- **MICRO-GERADOR:** caixa englobante única (inversor + módulos juntos)
- **Placa CUIDADO:** externa à caixa entrada, não dentro

## Dados pra template

```
TITULO_HEADER = "DIAGRAMA UNIFILAR DE LIGACAO DE MICROGERACAO"
SUBTITULO = "UC 55170622 - Cidade/SC - Mono BT - 3,51 kWp / 3 kW"
CLIENTE_NOME = "JANUARIO DARCIO ZATELLI"
UC_GERADORA = "55170622"
CIDADE_UF = "Gaspar/SC"
POTENCIA_KWP = "3,51"
POTENCIA_CA_W = "3000"
DISJ_ENTRADA_A = "40 A"
DISJ_MICROGERADOR_A = "40 A"
DPS_CLASSE = "40kA/275V"
INVERSOR_QTD = "1"
INVERSOR_MODELO = "SOLIS S6-GR1P 3K-M"
INVERSOR_W = "3000"
QTD_MODULOS = "6"
MODULO_MODELO = "HELIUSHMB144T10 - 585W"
CODIGO_PROJETO = "55170622 - SUNGROW SG 5.0 RS RS 5K"
DATA_EMISSAO = "11/04/2024"
RT_NOME = "JOSÉ HENRIQUE DOS SANTOS DA SILVA"
RT_TITULO = "Eletrotécnico"
RT_CREA = "..."
RT_ART = "a definir"
```

## Avisos técnicos esperados (auto)

- ✅ "Sistema mono BT dentro do limite micro-geração CELESC (≤ 75 kW)"
- ✅ "FCI 117% dentro do limite recomendado 100-130%"
- ✅ "Disjuntor 40A adequado pra Icc 13,6A × 1,25 = 17A"
- ✅ "ANSI 27/59/81U/81O/25/78 configurados no inversor SOLIS"
- ✅ "Aterramento conforme NBR 5410 + N-321.0001"

## Quando usar esse template

Escolher `unifilar-microgeracao-mono` quando:
- Sistema on-grid **monofásico** (BT)
- Potência ≤ ~10 kWp (residencial pequeno/médio)
- Padrão CELESC micro-geração
- 1 inversor central (não microinversor)

Usar `unifilar-ongrid-mono` quando:
- Sistema on-grid mono mais simples/menor
- Formato A4 (não A3)
- Layout compacto

Usar `unifilar-hibrido-bess` quando:
- Sistema híbrido com baterias
- Cargas críticas EPS

Usar `unifilar-ongrid-tri` quando:
- Sistema trifásico
- MT ou BT trifásico

## Arquivo de referência

PDF original: `~/Downloads/DIAGRAMA (5).pdf`
