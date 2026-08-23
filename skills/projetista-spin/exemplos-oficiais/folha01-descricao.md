# Exemplo oficial calibrado — Folha 01 (Diagrama Unifilar)

**Projeto real:** LDM Comércio de Mercadoria · 38,5 kWp · TRIFÁSICO 380/220V ·
Tijucas/SC · 14/08/2026 · Kalebe Grün RT · Integrador SPIN Solar.

Este é o padrão gráfico "Projeto Ideal" validado pelo Kalebe. **Toda folha 01
que você gerar deve seguir esta especificação à risca** — só o conteúdo
técnico (potência, modelo, endereço, cliente) muda.

---

## FORMATO E MOLDURA

- **Página:** A4 paisagem — viewBox="0 0 1190 842", width="1190", height="842"
- **Moldura externa:** retângulo com dupla linha preta a 20px da borda
- **Fundo:** branco puro (#FFFFFF)
- **Fonte principal:** sans-serif (Bahnschrift/Barlow/Arial fallback)
- **Cores permitidas:** preto (#000000) e branco. Vermelho (#E30613) **APENAS**
  na placa de advertência CUIDADO.

## ZONAS DA PÁGINA (grid conceitual)

Divida a página horizontalmente:

- **ZONA A (x=40 até x=650, largura ~610px):** DIAGRAMA UNIFILAR propriamente dito
- **ZONA B (x=670 até x=1000, largura ~330px):** LEGENDA + PLACA + PADRÃO REPRESENTATIVO
- **ZONA C (x=1010 até x=1170, largura ~160px):** notas técnicas (encima) e carimbo (embaixo)

Ajuste o limite conforme necessário — o objetivo é as 3 zonas não se sobreporem.

## ZONA A — DIAGRAMA UNIFILAR (esquerda)

Fluxo TOPO → BASE:

1. **REDE DE BAIXA TENSÃO** (título negrito, y=40)
   - Linha horizontal representando a rede
   - Texto acima da linha: "Ponto de entrega"
   - Texto abaixo da linha: "Ramal de ligação 3x10+1x10mm²"
   - Rotulagem à direita: "ACESSADA" (topo) / "ACESSANTE" (base) separadas por linha pontilhada horizontal

2. **PADRÃO DE MEDIÇÃO** (retângulo tracejado envolvendo)
   - Rótulo dentro do retângulo: "3#10(10)mm²"
   - Símbolo KWH (quadrado com letras "KWH")
   - Disjuntor tripolar (3 setinhas): "TRIPOLAR / 63A / 380/220V"
   - Linha aterramento após o disjuntor (símbolo terra)

3. **Condutor 3#10(10)+T10mm²** (rótulo à esquerda da linha vertical)

4. **QUADRO DE DISTRIBUIÇÃO** (retângulo tracejado)
   - DPS CA (símbolo com seta pra terra): "Classe II / In: 10kA / Imax: 20kA / 275Vca"
   - Disjuntor tripolar 63A
   - Saída: "Cargas" com 3 setas descendo (representando 3 fases)
   - Linha aterramento

5. **Condutor 3#16(16)+T16mm²**

6. **QUADRO DE PROTEÇÃO CA** (retângulo tracejado — este é o QPCA da SPIN)
   - DPS CA: "Classe II / In: 10kA / Imax: 20kA / 275Vca"
   - Disjuntor Tripolar 63A

7. **Condutor 3#16(16)+T16mm²** (saindo do QPCA)

8. **INVERSOR** (símbolo circular com forma de onda dentro)
   - Título "INVERSOR" em negrito acima
   - Lista de specs à DIREITA do símbolo:
     - Modelo: Weg (SIW500HST030 M3)
     - Potência: 30.000W
     - Tensão de entrada: 200V - 1000V
     - Corrente de entrada: 4MPPT'S 26A
     - Tensão de saída: 380/220V
     - Corrente de saída: 50,4A
     - Proteções: 27, 59, 81U, 81O, 25, 78 (ver nota 6)

9. **CONDUTORES CC** (rótulo à ESQUERDA do inversor)
   - Positivo 4mm²
   - Negativo 4mm²
   - Proteção 4mm²
   - "Ver nota 2"

10. **BLOCO MPPT** (abaixo do inversor)
    - 3 caixas horizontais lado a lado: MPPT 1, MPPT 2, MPPT 3
    - Cada MPPT com 2 strings (2 grupos de módulos)
    - Símbolos de módulo (triângulo apontando pra direita) representando as strings
    - Rótulo "2 Strings" em cada MPPT

11. **MÓDULOS FOTOVOLTAICOS** (título negrito à direita dos MPPTs)
    - Marca: WEG
    - Modelo: WPV 550-HMM3 - 550W
    - Tensão nominal (Vmp): 41,96V
    - Corrente (Imp): 13,11A
    - Eficiência: 21,3%

12. **DETALHAMENTO DOS MPPTs** (rodapé da ZONA A, 3 colunas)
    - Para cada MPPT (01/02/03): 2 subblocos STRING 01 / STRING 02
    - Para cada STRING: "Módulos: N unidades / Tensão (Vmp): 41,96*N=XXXV / Corrente (Imp): 13,11A / Potência total: 550Wp*N=XXXXWp"

## ZONA B — LEGENDA + PLACA + REPRESENTATIVO (meio direita)

### B1. LEGENDA (topo, tabela 2 colunas)
Cabeçalho centralizado em cinza claro: "LEGENDA"
Linhas (7):
- Símbolo disjuntor termomagnético (3 setinhas) → "Disjuntor termomagnético"
- Símbolo KWH (quadrado) → "Medidor de energia kWh"
- Símbolo DPS (seta pra terra) → "DPS CC / CA"
- Símbolo fusível (retângulo alongado) → "Fusível CC"
- Traço horizontal grosso → "Barramento"
- Símbolo transformador (2 círculos) → "Transformador / Autotransformador"
- Símbolo onda em círculo → "Inversor / Microinversor"
- Símbolo módulo (triângulo com traço) → "Módulo fotovoltaico"

### B2. DETALHE PLACA DE ADVERTÊNCIA (meio)
- Título: "DETALHE DO PLACA DE ADVERTÊNCIA"
- Retângulo 25cm × 18cm (cotas marcadas com setas nos lados)
- Fundo AMARELO (#F7EE00) com bordas pretas
- Texto vermelho (#E30613) em bloco branco central:
  - "CUIDADO" (grande)
  - "RISCO DE CHOQUE ELÉTRICO"
  - "GERAÇÃO PRÓPRIA"

### B3. PADRÃO DE ENTRADA REPRESENTATIVO (embaixo)
- Título: "PADRÃO DE ENTRADA REPRESENTATIVO"
- Desenho simplificado da caixa de medição + poste (representação estilizada)

## ZONA C — NOTAS + CARIMBO (direita inferior)

### C1. NOTAS (encima)
Título "NOTAS:" em negrito, seguido de lista numerada 1 a 6:

1. A seção transversal dos condutores foram dimensionadas em função da corrente máxima de saída e capacidade de condução de corrente, permitindo-se utilizar até uma faixa acima da descrita em cada trecho dessa planta (exceto no padrão de medição);
2. Cabos em corrente contínua, na tensão elétrica máxima de 1,8kV, isolação em XLPE e cobertura em XLPE (termofixo) com UV;
3. Cabos em corrente alternada, na tensão máxima de 1kV, isolação e cobertura em PVC;
4. Cada string será protegida individualmente, através das proteções internas do inversor — conexão CC direta ao inversor, sem quadro de proteção CC (padrão SPIN Solar);
5. Conexão de micro/minigeração conforme I-432.0004 e padrão de entrada N-321.0001 (CELESC);
6. Funções de proteção realizadas pelo inversor (I-432.0004, Tab. 2): 27 (0,8pu/0,4s), 59 (1,1pu/0,2s), 81U (57,5Hz/0,2s), 81O (62,0Hz/0,2s), 25 e 78 — anti-ilhamento ativa, NBR IEC 62116.

### C2. CARIMBO (rodapé, canto direito)

Layout em 3 linhas:

**Linha 1 (logo + assinatura RT):**
- ESQUERDA: LOGO SPIN — texto "SPIN" grande com barras/hachuras diagonais dentro da letra S; "SOLAR" pequeno à direita, símbolo ® pequeno acima
- DIREITA: "Assinatura do responsável técnico / Kalebe Grün / CPF 943.121.760-00" (2 linhas de texto)

**Linha 2 (identificação):**
- PROJETO: [Sistema fotovoltaico N kWp]
- PROPRIETÁRIO: [Nome do cliente] / CNPJ/CPF: [xxx]
- ID DO PEDIDO: [XXXX] (em box destacado, à direita)

**Linha 3 (título + endereço):**
- TÍTULO: DIAGRAMA UNIFILAR (grande, negrito)
- ENDEREÇO DA OBRA: [Rua, Nº - Cidade] / CEP: [xx.xxx-xxx]

**Linha 4 (metadados em 6 colunas):**
| PROJETISTA | DATA | REVISADO POR | REVISÃO | CONTA CONTRATO | INTEGRADOR | FOLHA |
| Kalebe Grün | 14/08/2026 | Kalebe Grün | 01 | 52406471 | SPIN Solar | 01 |

## LOGO SPIN — CONSTRUÇÃO SIMPLIFICADA (SVG inline)

Como você não tem acesso ao arquivo raster, desenhe o logo SPIN assim:

```xml
<g transform="translate({x},{y})">
  <!-- Retângulo com hachuras diagonais que forma a letra "S" estilizada -->
  <rect x="0" y="0" width="80" height="40" fill="none" stroke="#000" stroke-width="1.5"/>
  <line x1="0" y1="0" x2="80" y2="40" stroke="#000" stroke-width="1"/>
  <line x1="0" y1="10" x2="70" y2="40" stroke="#000" stroke-width="1"/>
  <line x1="10" y1="0" x2="80" y2="30" stroke="#000" stroke-width="1"/>
  <line x1="20" y1="0" x2="80" y2="20" stroke="#000" stroke-width="1"/>
  <!-- Texto SPIN à direita das hachuras -->
  <text x="90" y="30" font-family="sans-serif" font-weight="900" font-size="28">SPIN</text>
  <text x="180" y="20" font-family="sans-serif" font-size="10">®</text>
  <text x="180" y="35" font-family="sans-serif" font-size="8">SOLAR</text>
</g>
```

## O QUE **NÃO** FAZER

- ❌ NÃO desenhe quadro de proteção CC / string box (regra SPIN — sempre CC direto no inversor)
- ❌ NÃO invente cores (só preto, branco, amarelo da placa, vermelho da advertência)
- ❌ NÃO use ícones bonitinhos ou gradientes — este é um desenho técnico, não uma capa de proposta
- ❌ NÃO deixe o RT em branco — sempre "Kalebe Grün / CPF 943.121.760-00"
- ❌ NÃO use fontes decorativas — sans-serif limpa
- ❌ NÃO adicione decorações fora dos blocos definidos

## MEMÓRIA DE CÁLCULO ESPERADA

No campo `memoria_calculo` do JSON, inclua:
- `potencia_cc_kwp`: N módulos × Wp / 1000
- `potencia_ca_kw`: soma dos inversores
- `fci_pct`: (pot_cc / pot_ca) × 100
- `qtd_modulos`: total
- `qtd_strings`: total de strings (não MPPTs — strings)
- `bitola_cabo_cc_mm2`: 4 (padrão SPIN)
- `bitola_disjuntor_ca_a`: dimensionado pela corrente CA total × 1,25
- `notas_dimensionamento`: array com observações

Referência: veja `folha01-ldm-38kwp.pdf` na mesma pasta pra ver o resultado
visual final.
