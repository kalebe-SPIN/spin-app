# Exemplo: Panificação Daiana da Silva EPP — 113,4 kWp híbrido MT

**Referência:** DIAGRAMA UNIFILAR HIBRIDO.pdf (fornecido por Kalebe em 24/07/2026)
**RT:** José Henrique dos Santos da Silva Masschmann
**Data emissão:** 20/10/2025
**Tamanho:** A3 - Folha 05

## Contexto

Sistema **híbrido comercial** (padaria), conectado em **média tensão** com transformador próprio. 3 inversores híbridos SIW400H em paralelo, com baterias e cargas críticas EPS separadas.

Este é o **modelo aprovado** que serve de padrão gráfico pra todos os unifilares híbridos comerciais / industriais.

## Dados do projeto

| Campo | Valor |
|-------|-------|
| Cliente | DAIANA DA SILVA PANIFICACAO EPP |
| Ligação | Média Tensão (MT) via transformador |
| Potência CC | **113,4 kWp** |
| Potência CA | 75 kW (2×30 + 1×15) |
| Armazenamento total | **40,28 kWh** (4 baterias × 10,07 kWh) |
| Disj. entrada | 175A |
| Disj. micro-gerador | 125A |
| DPS entrada | 40kA/275V (Cl II) |
| Multimedidor | MMW03-M22CH (Energy Analyzer) |

## Arquitetura elétrica

```
REDE CELESC (MT)
   │
   ▼
[ENTRADA DE ENERGIA - caixa tracejada]
   ├─ TRANSFORMADOR MT (3Ø Δ→Y)
   ├─ MEDIDOR CELESC (kWh bidirecional)
   ├─ DISJUNTOR 175A + DPS 40kA/275V + aterramento
   └─ PLACA CUIDADO instalada no QM
   │
   ▼
[QGBT]
   ├─ CARGAS COMUNS DO QD (não conectadas à bateria) ─→ saída lateral
   ├─ CONTATOR
   └─ DISJUNTOR 125A alimenta micro-gerador
   │
   ▼
[MICRO-GERADOR FV HÍBRIDO ON-GRID - caixa tracejada grande]
   │
   ├─ RAMO 1: Disj 50A → DPS → SIW400H T030 W10 (30 kW) → 65 mód RSM132-8-700-725BHDG (45,5 kWp) + 2× BAT SBW CB100 W00 (20,14 kWh) + MM
   ├─ RAMO 2: Disj 50A → DPS → SIW400H T030 W10 (30 kW) → 65 mód RSM132-8-700-725BHDG (45,5 kWp) + 1× BAT (10,07 kWh) + MM
   └─ RAMO 3: Disj 30A → DPS → SIW400H T015 W10 (15 kW) → 32 mód RSM132-8-700-725BHDG (22,4 kWp) + 1× BAT (10,07 kWh) + MM
   │
   ▼ (saída EPS de cada inversor)
CARGAS CRÍTICAS EPS
(circuitos isolados conectados à bateria)
```

## O que faz esse desenho ser "bom"

### Estrutura característica de híbrido ✅
1. **Ponto de conexão em MT** (topo esquerdo) — não LT como on-grid comum
2. **Transformador MT** desenhado com 2 círculos entrelaçados + 3Ø + Δ→Y
3. **Entrada de energia** com placa CUIDADO **dentro** da caixa tracejada
4. **QGBT com contator** entre entrada e micro-gerador
5. **Cargas comuns** saem do QGBT **antes** do micro-gerador (não passam pela bateria)
6. **N ramos paralelos** de inversores híbridos (aqui 3)
7. **Cada ramo tem seu próprio:** disjuntor + DPS + inversor + módulos + baterias + multimedidor
8. **Cabo REDE / CIRCUITOS EPS** identificados na saída do inversor
9. **ISOLADO** marcado entre inversor e baterias (chave seccionadora DC)
10. **CARGAS CRÍTICAS EPS** saem por baixo, conectadas à bateria

### Símbolos exclusivos híbrido ✅
- **Transformador MT** (2 círculos)
- **Multimedidor MM** (Energy Analyzer) — quadrado com "MM"
- **Baterias** — barras verticais alternadas
- **Contator** — quadrado pequeno na linha
- **ANSI 81O/81U/27/59** anotados nos inversores
- **RS485** — comunicação entre inversores

### Cores ✅
- Vermelho: linha CA da rede
- Azul claro/tracejado: cabos EPS (emergência)
- Preto: linhas principais / módulos / equipamentos
- Amarelo: placa CUIDADO
- Cinza: separadores entre ramos

### Notas técnicas ✅
7 originais + 5 específicas de híbrido:
1-7. Idênticas ao on-grid (NBR 62116, aterramento, placa, NR-10, IP, ABNT)
8. Baterias com BMS + RS485 entre inversores/analyzer
9. Circuitos EPS isolados (cargas críticas)
10. Setpoints ANSI 27/59/81U/81O/25/78
11. Multimedidor de Grandezas responsável por controle/medição import/export
12. Placa CUIDADO 180×250mm amarelo epóxi

## O que replicar em outros projetos híbridos

### Padrões a MANTER
1. **Layout A3 sempre** — híbrido tem muita coisa, A4 fica apertado
2. **Cadeia MT explícita:** REDE MT → Trafo → Medidor → Disj → DPS → QGBT → micro-gerador
3. **N ramos paralelos** — cada inversor com seu próprio disj + DPS + módulos + baterias
4. **Multimedidor MM em cada ramo** (não só no principal)
5. **Cabos REDE / CIRCUITOS EPS** identificados na saída de cada inversor
6. **ISOLADO** marcado antes das baterias
7. **CARGAS CRÍTICAS EPS** como saída lateral inferior
8. **CARGAS COMUNS** como saída lateral do QGBT (não passam pela bateria)
9. **12 notas técnicas** (7 base + 5 específicas híbrido)
10. **Placa CUIDADO amarela** dentro da entrada de energia

### Escalabilidade
- **1 inversor híbrido:** simplifica pra 1 ramo (residencial pequeno)
- **2-3 inversores:** usa o template como está
- **4-6 inversores:** compacta espaçamento vertical dos ramos
- **>6 inversores:** considera A2 ou divide em folhas múltiplas

### Casos limite
- **Sem transformador (BT):** remove trafo + linha MT, entra direto do medidor
- **Sem cargas EPS:** remove saída EPS (fica só on-grid)
- **Baterias centralizadas (não por ramo):** todas as baterias num barramento CC comum

## Dados pra template (Panificação Daiana)

```
TITULO_HEADER = "DIAGRAMA UNIFILAR SIMPLIFICADO - HÍBRIDO"
SUBTITULO = "Daiana da Silva Panificação EPP - MT - 113,4 kWp / 75 kW / 40,28 kWh"
CLIENTE_RAZAO_SOCIAL = "DAIANA DA SILVA PANIFICACAO EPP"
UC_GERADORA = "não informado"
CIDADE_UF = "Cidade/SC"
POTENCIA_KWP = "113,4"
POTENCIA_CA_KW = "75"
ARMAZENAMENTO_KWH = "40,28"
TRAFO_POTENCIA_KVA = "150" (estimado; especificar em cada caso)
DISJ_ENTRADA_A = "175A"
DISJ_MICROGERADOR_A = "125A"
DPS_CLASSE_ENTRADA = "Cl II - 40kA/275V"

RAMO1_DISJ_A = "50A"
RAMO1_INVERSOR = "WEG SIW400H T030 W10"
RAMO1_INV_W = "30.000"
RAMO1_QTD_MODULOS = "65"
RAMO1_MODULO = "RSM132-8-700-725BHDG"
RAMO1_KWP = "45,5"
RAMO1_QTD_BAT = "02"
RAMO1_BAT_MODELO = "SBW CB100 W00"
RAMO1_KWH = "20,14"

RAMO2_DISJ_A = "50A"
RAMO2_INVERSOR = "WEG SIW400H T030 W10"
RAMO2_INV_W = "30.000"
RAMO2_QTD_MODULOS = "65"
RAMO2_MODULO = "RSM132-8-700-725BHDG"
RAMO2_KWP = "45,5"
RAMO2_QTD_BAT = "01"
RAMO2_BAT_MODELO = "SBW CB100 W00"
RAMO2_KWH = "10,07"

RAMO3_DISJ_A = "30A"
RAMO3_INVERSOR = "WEG SIW400H T015 W10"
RAMO3_INV_W = "15.000"
RAMO3_QTD_MODULOS = "32"
RAMO3_MODULO = "RSM132-8-700-725BHDG"
RAMO3_KWP = "22,4"
RAMO3_QTD_BAT = "01"
RAMO3_BAT_MODELO = "SBW CB100 W00"
RAMO3_KWH = "10,07"

RESUMO_INVERSORES = "2× SIW400H T030 W10 + 1× SIW400H T015 W10"
```

## Avisos técnicos esperados (auto)

O agente deve calcular e emitir:
- ✅ "Cadeia MT correta: Trafo → Medidor → QGBT → Micro-gerador"
- ✅ "FCI por ramo dentro do limite (1,52 - 1,49)"
- ⚠️ "Cargas EPS isoladas — validar dimensionamento vs autonomia de bateria"
- ⚠️ "40,28 kWh de bateria — autonomia estimada X horas em cargas críticas Y kW"
- ✅ "Multimedidor MMW03-M22CH em cada ramo — permite controle/medição individual"
- ✅ "Disjuntor entrada 175A adequado pra corrente total inversores + cargas"
- ✅ "Setpoints ANSI (27/59/81U/81O) configurados nos inversores WEG"

## Arquivo de referência

PDF original: `~/Downloads/DIAGRAMA UNIFILAR HIBRIDO.pdf`
