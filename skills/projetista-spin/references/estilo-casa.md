# Padrão Gráfico da Casa — Projetista SPIN

Estilo visual oficial dos diagramas Spin/CELESC. Aplicar em **todos** os desenhos.

## Formato

### A4 paisagem (padrão)
- **viewBox:** `0 0 1190 842`
- **Tamanho papel:** 297×210 mm @ 96dpi
- **Uso:** unifilar residencial/comercial simples, padrão de entrada BT

### A3 paisagem (opcional pra sistemas grandes)
- **viewBox:** `0 0 1580 1120`
- **Tamanho papel:** 420×297 mm @ 96dpi
- **Uso:** híbrido complexo, Grupo A industrial, usinas

## Layout de áreas

### A4 (1190×842)

```
┌─────────────────────────────────────────────────────────────┐
│ MOLDURA externa (12,12 → 1178,830) stroke 1.5px             │
│ ┌───────────────────────────────┬─────────────────────────┐│
│ │                               │                          ││
│ │   ÁREA DIAGRAMA               │   COLUNA DIREITA         ││
│ │   (12..820, altura 808)       │   (828..1178, 350px)     ││
│ │                               │                          ││
│ │   • Título (topo)             │   • LEGENDA (20-250)     ││
│ │   • Rede → Padrão → Medidor   │   • NOTAS (258-470)      ││
│ │   • QGBT → QPCA → Inversor    │   • PLACA CUIDADO        ││
│ │   • Módulos FV                │     (482-570)            ││
│ │                               │   • CARIMBO SPIN         ││
│ │   Blocos laterais:            │     (582-830)            ││
│ │   • Aterramento               │                          ││
│ │   • Memória de cálculo        │                          ││
│ │   • Normas aplicáveis         │                          ││
│ │                               │                          ││
│ └───────────────────────────────┴─────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
    Separador vertical: line x1=824 y1=12 x2=824 y2=830
```

## Paleta oficial (exata)

| Uso | Nome | Hex |
|-----|------|-----|
| Traço técnico | INK | `#111827` |
| Títulos/selos/inversor | BLUE | `#1a4f8b` |
| Secundário/cotas | GREY | `#6b7280` |
| Placa CUIDADO | SOL | `#f4d000` |
| Alertas/negativo | RED | `#b91c1c` |
| Verde OK | GRN | `#0f766e` |
| Inversor fill | INV_FILL | `#eef3fa` |
| Teal (logo) | TEAL | `#0e7490` |
| Amarelo (logo) | YEL | `#f4d000` |
| Verde (logo) | GRN_LOGO | `#0f766e` |

## Tipografia

- **Fonte:** `Helvetica, Arial, sans-serif` (universalmente disponível — safe pra CELESC)
- **Título grande** (topo diagrama): 13px, bold, BLUE, text-anchor middle
- **Subtítulo:** 8.5px, GREY, text-anchor middle
- **Blocos rotulados:** 9-10px, bold, INK
- **Labels de componentes:** 8px, INK
- **Cotas de cabo:** 9pt, GREY (bitola + distância)
- **Notas técnicas:** 7pt, INK, spacing vertical 18px
- **Legenda:** 8pt, INK
- **Placa CUIDADO — "CUIDADO":** 17pt, bold
- **Placa CUIDADO — subtexto:** 9pt, bold
- **Carimbo campos label:** 6.5pt uppercase, GREY
- **Carimbo campos valor:** 8pt bold, INK

## Traços (stroke-width)

- **Moldura externa:** 1.8 px
- **Blocos principais:** 1.5 px
- **Sinais elétricos:** 1.2 px
- **Símbolos secundários (dentro):** 1 px
- **Cotas:** 0.8-1.1 px
- **Cabos tracejados:** 0.8 px + dasharray "5,3"

## LEGENDA (topo coluna direita)

```
rect x=828 y=20 width=350 height=230 stroke #111827 stroke-width 1
text x=1003 y=38 (título "LEGENDA") font 11pt bold BLUE text-anchor middle
line x1=828 y1=45 x2=1178 y2=45 stroke #111827 stroke-width 0.6
```

**Depois:** 6-8 linhas com célula do símbolo (~30×24) + rótulo à direita.

**Símbolos obrigatórios pra unifilar on-grid:**
1. Módulo fotovoltaico
2. Inversor de corrente
3. Medidor bidirecional (CELESC)
4. Disjuntor termomagnético
5. DPS
6. Gerador fotovoltaico (G)
7. Aterramento / neutro / PE

**Se híbrido, ADICIONAR:**
8. Bateria (BESS)
9. Multimedidor MMW03 (opcional)

**NUNCA incluir:** string box, quadro de proteção CC (regra fixa).

## NOTAS TÉCNICAS (meio da coluna direita)

```
rect x=828 y=258 width=350 height=212 stroke #111827 stroke-width 1
text x=840 y=275 ("NOTAS TÉCNICAS") font 10pt bold BLUE
line x1=828 y1=282 x2=1178 y2=282 stroke #111827 stroke-width 0.6
```

**Lista padrão 1-8:**

1. Conexão de microgeração conforme **I-432.0004** e padrão **N-321.0001** da CELESC.
2. Inversor certificado **NBR IEC 62116** e especif. técnica nº 122.
3. Aterramento da geração interligado ao aterramento da UC.
4. Identificar QGBT: "Cuidado - Geração Distribuída no Circuito".
5. Seccionamento visível conforme **NR-10**.
6. Quadro de Proteção CA (disj+DPS) ligado ao QGBT no ponto conexão.
7. Conexão CC direta aos inversores - sem quadro proteção CC (padrão Spin).
8. Seções de condutor e proteções dimensionadas em campo; confirmar bitolas.

## PLACA CUIDADO (coluna direita, entre notas e carimbo)

- **Dimensões visuais:** 190×88 px (representa 180×250mm real)
- **Fundo:** SOL `#f4d000`
- **Borda:** INK 1.6px, rx=3
- **Texto centralizado 3 linhas:**
  - "CUIDADO" 17pt bold
  - "RISCO DE CHOQUE ELÉTRICO" 9pt bold
  - "GERAÇÃO PRÓPRIA" 9pt bold
- **Legenda pequena embaixo (fora):** "Placa 180×250mm amarelo epóxi" 6pt GREY

## CARIMBO SPIN (rodapé coluna direita)

```
rect x=828 y=582 width=350 height=248 stroke #111827 stroke-width 1.3
```

### Logo SPIN (desenhado no SVG)

```svg
<g transform="translate(840, 595)">
  <rect x="0" y="0" width="4" height="22" fill="#1a4f8b"/>
  <rect x="6" y="0" width="4" height="22" fill="#0e7490"/>
  <rect x="12" y="0" width="4" height="22" fill="#f4d000"/>
  <rect x="18" y="0" width="4" height="22" fill="#0f766e"/>
  <text x="30" y="18" font-family="Helvetica" font-size="18" font-weight="900" fill="#1a4f8b">SPIN</text>
</g>
```

### Campos (tabela, spacing 18px vertical)

| Campo | Fonte |
|-------|-------|
| TÍTULO (ex: "DIAGRAMA UNIFILAR...") | valor 9pt bold |
| PROJETO (código + cliente) | valor 8pt bold |
| PROPRIETÁRIO / UC | valor 8pt bold |
| ENDEREÇO OBRA | valor 8pt |
| RESP. TÉCNICO / REGISTRO | valor 8pt bold |
| ART | valor 8pt |
| DATA / TAMANHO A4 / FOLHA / REVISÃO | valores 7pt |
| POTÊNCIA | valor 9pt bold BLUE |
| EMPRESA / CNPJ | valor 7pt |
| CONTATO | valor 7pt |

**Labels em cinza 6.5pt uppercase, valores conforme tabela acima.**

## DIAGRAMA (área esquerda)

### Título e subtítulo (topo)

```svg
<text x="416" y="32" font-family="Helvetica" font-size="13" font-weight="bold" text-anchor="middle" fill="#1a4f8b">
  UNIFILAR - {cliente_razao_social}
</text>
<text x="416" y="48" font-family="Helvetica" font-size="8.5" text-anchor="middle" fill="#6b7280">
  UC {uc_geradora} - {cidade}/{uf} - {tipo_ligacao} - {potencia_kwp}kWp / {potencia_ca_kw}kW
</text>
```

### Cadeia vertical (top-down, posições indicativas A4)

| Y | Elemento |
|---|----------|
| 75 | REDE CELESC (label + tensão) |
| 110 | PONTO DE CONEXÃO (dot preto) |
| 140 | CAIXA TRACEJADA "ENTRADA DE ENERGIA" envolvendo: |
| | - PADRÃO DE ENTRADA (rect "Disj. Geral XA") |
| | - MEDIDOR bidirecional (kWh + setas) |
| | - Cota "Cabo Xmm² PVC - Xm" |
| 310 | QGBT (rect com aviso se aplicável) |
| 380 | QPCA (caixa tracejada com disjuntor + DPS lado a lado) |
| 470 | INVERSOR (rect azul-claro com modelo, potência, tensão) |
| 580 | Cota "1× String X mm² PV/PVC" |
| 620 | GERADOR FV / MÓDULOS FV (grid 3×2 ou N módulos) |
|     | Label: "{qtd}× {modelo} {watt}Wp \| Total: {kwp} kWp" |
|     | Extra: "Telhado {tipo}/{estrutura} - {inclinação}° - {orientação}" |

### Blocos LATERAIS (dentro da área diagrama, x=590..818)

Todos com caixa tracejada + texto:

**1. ATERRAMENTO**
- Nx hastes cobreadas 5/8" × 2,4m
- Hastes interligadas/não interligadas
- SPDA: sim/não
- Malha conforme E-321.0031

**2. MEMÓRIA DE CÁLCULO**
- Pcc = {kwp} kWp / Pca = {kw} kW
- FCI = {pct}% (OK ou ACIMA de 130 - atenção)
- Icc inversor = {Icc}A × 1,25 = {corrente}A
- Disjuntor comercial = {disjuntor}A
- Queda tensão CA ({m}m) = {pct}%

**3. NORMAS APLICÁVEIS**
- N-321.0001 / I-432.0004 / E-321.0031 / NBR IEC 62116

## Grid A/B/C/D/E/F × 1/2/3/4/5/6/7/8 (opcional, referência CAD)

- Linhas horizontais A-F: y = 0, 186, 372, 558, 744, 930
- Colunas 1-8: x = 135, 270, 405, 540, 675, 810, 945, 1080
- Letras/números pequenos (8pt GREY) nas bordas

Não é obrigatório mas dá aparência profissional CAD.
