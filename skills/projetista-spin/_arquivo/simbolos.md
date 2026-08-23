# Biblioteca de Símbolos SVG — Projetista SPIN

Todos os símbolos SVG oficiais pra copiar/adaptar no diagrama. **Substituir {x}/{y}/{cx}/{cy}/{w}/{h}** pelas coordenadas reais.

## Paleta (uso em fill/stroke)

```
INK      = #111827  (traço técnico padrão)
BLUE     = #1a4f8b  (títulos, selos, inversor fill)
GREY     = #6b7280  (secundário, cotas)
SOL      = #f4d000  (placa CUIDADO amarela)
RED      = #b91c1c  (alertas)
GRN      = #0f766e  (verde OK)
INV_FILL = #eef3fa  (inversor fill)
```

## 1. MÓDULO FV (24×18 com grade + diagonal)

```svg
<g>
  <rect x="{x}" y="{y}" width="24" height="18" fill="none" stroke="#111827" stroke-width="1.2"/>
  <line x1="{x+8}" y1="{y}" x2="{x+8}" y2="{y+18}" stroke="#6b7280" stroke-width="0.5"/>
  <line x1="{x+16}" y1="{y}" x2="{x+16}" y2="{y+18}" stroke="#6b7280" stroke-width="0.5"/>
  <line x1="{x}" y1="{y+9}" x2="{x+24}" y2="{y+9}" stroke="#6b7280" stroke-width="0.5"/>
  <line x1="{x}" y1="{y+18}" x2="{x+24}" y2="{y}" stroke="#6b7280" stroke-width="0.6"/>
</g>
```

## 2. INVERSOR (retângulo w×h com diagonal, "~" e "=")

```svg
<g>
  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#eef3fa" stroke="#111827" stroke-width="1.3" rx="2"/>
  <line x1="{x}" y1="{y+h}" x2="{x+w}" y2="{y}" stroke="#1a4f8b" stroke-width="1"/>
  <text x="{x+w*0.28}" y="{y+h*0.42}" font-family="Helvetica" font-size="14" font-weight="bold" text-anchor="middle" fill="#111827">~</text>
  <text x="{x+w*0.72}" y="{y+h*0.75}" font-family="Helvetica" font-size="13" font-weight="bold" text-anchor="middle" fill="#111827">=</text>
</g>
```

## 3. MEDIDOR BIDIRECIONAL (36×26 com "kWh" + setas)

```svg
<g>
  <rect x="{cx-18}" y="{cy-13}" width="36" height="26" fill="none" stroke="#111827" stroke-width="1.3" rx="2"/>
  <line x1="{cx-10}" y1="{cy-5}" x2="{cx+10}" y2="{cy-5}" stroke="#111827" stroke-width="1"/>
  <path d="M {cx-10} {cy-5} l 3 -2 M {cx-10} {cy-5} l 3 2 M {cx+10} {cy-5} l -3 -2 M {cx+10} {cy-5} l -3 2" fill="none" stroke="#111827" stroke-width="0.9"/>
  <text x="{cx}" y="{cy+7}" font-family="Helvetica" font-size="10" font-weight="bold" text-anchor="middle" fill="#111827">kWh</text>
</g>
```

## 4. DISJUNTOR 3P (chave + curva térmica)

```svg
<g>
  <line x1="{cx}" y1="{cy-12}" x2="{cx}" y2="{cy-5}" stroke="#111827" stroke-width="1.3"/>
  <circle cx="{cx}" cy="{cy-5}" r="1.8" fill="#111827"/>
  <line x1="{cx}" y1="{cy-5}" x2="{cx+11}" y2="{cy+6}" stroke="#111827" stroke-width="1.3"/>
  <path d="M {cx+8} {cy-3} q 5 3 2 8" fill="none" stroke="#111827" stroke-width="1"/>
  <circle cx="{cx}" cy="{cy+12}" r="1.8" fill="#111827"/>
  <text x="{cx-8}" y="{cy+2}" font-family="Helvetica" font-size="7.5" text-anchor="end" fill="#6b7280">3P</text>
</g>
```

## 5. DPS (retângulo 22×24 com diagonal → aterramento)

```svg
<g>
  <line x1="{eixo}" y1="{y}" x2="{bx}" y2="{y}" stroke="#111827" stroke-width="1.3"/>
  <rect x="{bx-11}" y="{y-12}" width="22" height="24" fill="none" stroke="#111827" stroke-width="1.3"/>
  <line x1="{bx-11}" y1="{y+12}" x2="{bx+11}" y2="{y-12}" stroke="#111827" stroke-width="1.2"/>
  <line x1="{bx}" y1="{y+12}" x2="{bx}" y2="{y+18}" stroke="#111827" stroke-width="1.3"/>
</g>
```
(Continua com aterramento logo abaixo)

## 6. ATERRAMENTO (3 traços decrescentes)

```svg
<g>
  <line x1="{x}" y1="{y}" x2="{x}" y2="{y+8}" stroke="#111827" stroke-width="1.3"/>
  <line x1="{x-8}" y1="{y+8}" x2="{x+8}" y2="{y+8}" stroke="#111827" stroke-width="1.6"/>
  <line x1="{x-5}" y1="{y+11}" x2="{x+5}" y2="{y+11}" stroke="#111827" stroke-width="1.6"/>
  <line x1="{x-2.5}" y1="{y+14}" x2="{x+2.5}" y2="{y+14}" stroke="#111827" stroke-width="1.6"/>
</g>
```

## 7. GERADOR G (círculo com "G")

```svg
<g>
  <circle cx="{cx}" cy="{cy}" r="16" fill="none" stroke="#111827" stroke-width="1.3"/>
  <text x="{cx}" y="{cy+5}" font-family="Helvetica" font-size="12" font-weight="bold" text-anchor="middle" fill="#111827">G</text>
</g>
```

## 8. ANSI (círculo com código de proteção)

Códigos ANSI úteis pra micro/mini GD:
- **27** — Subtensão (ajuste 0,80 p.u., ≤ 0,2s)
- **59** — Sobretensão (1,10 p.u., ≤ 0,2s)
- **81U** — Subfrequência (59,5 Hz)
- **81O** — Sobrefrequência (60,5 Hz)
- **25** — Sincronismo (10°/10%/0,3Hz)
- **78** — Anti-ilhamento (≤ 0,2s)
- **67** — Sobrecorrente direcional (Grupo A)
- **32** — Potência direcional (Grupo A)
- **50/51** — Sobrecorrente inst./temporizada (Grupo A)

```svg
<g>
  <circle cx="{cx}" cy="{cy}" r="10" fill="none" stroke="#111827" stroke-width="1.3"/>
  <text x="{cx}" y="{cy+3}" font-family="Helvetica" font-size="7" font-weight="bold" text-anchor="middle" fill="#111827">{codigo}</text>
</g>
```

## 9. BATERIA BESS (4 barras alternadas + label BAT)

```svg
<g>
  <line x1="{x}" y1="{y-10}" x2="{x}" y2="{y+10}" stroke="#111827" stroke-width="1.8"/>
  <line x1="{x+7}" y1="{y-5}" x2="{x+7}" y2="{y+5}" stroke="#111827" stroke-width="1.3"/>
  <line x1="{x+14}" y1="{y-10}" x2="{x+14}" y2="{y+10}" stroke="#111827" stroke-width="1.8"/>
  <line x1="{x+21}" y1="{y-5}" x2="{x+21}" y2="{y+5}" stroke="#111827" stroke-width="1.3"/>
  <text x="{x+10}" y="{y+20}" font-family="Helvetica" font-size="7.5" font-weight="bold" text-anchor="middle" fill="#111827">BAT</text>
</g>
```

## 10. CHAVE FUSÍVEL (Grupo A — MT)

```svg
<g>
  <line x1="{cx}" y1="{cy-15}" x2="{cx}" y2="{cy-8}" stroke="#111827" stroke-width="1.3"/>
  <rect x="{cx-4}" y="{cy-8}" width="8" height="16" fill="none" stroke="#111827" stroke-width="1.3"/>
  <line x1="{cx-3}" y1="{cy-6}" x2="{cx+3}" y2="{cy+6}" stroke="#111827" stroke-width="1"/>
  <line x1="{cx}" y1="{cy+8}" x2="{cx}" y2="{cy+15}" stroke="#111827" stroke-width="1.3"/>
</g>
```

## 11. CHAVE SECCIONADORA (Grupo A)

```svg
<g>
  <line x1="{cx}" y1="{cy-15}" x2="{cx}" y2="{cy-8}" stroke="#111827" stroke-width="1.3"/>
  <circle cx="{cx}" cy="{cy-8}" r="2" fill="#111827"/>
  <line x1="{cx}" y1="{cy-8}" x2="{cx-8}" y2="{cy+6}" stroke="#111827" stroke-width="1.5"/>
  <circle cx="{cx-8}" cy="{cy+8}" r="2" fill="#111827"/>
  <line x1="{cx-8}" y1="{cy+8}" x2="{cx}" y2="{cy+15}" stroke="#111827" stroke-width="1.3"/>
</g>
```

## 12. TRAFO (2 círculos sobrepostos + kVA)

```svg
<g>
  <circle cx="{cx-5}" cy="{cy}" r="10" fill="none" stroke="#111827" stroke-width="1.3"/>
  <circle cx="{cx+5}" cy="{cy}" r="10" fill="none" stroke="#111827" stroke-width="1.3"/>
  <text x="{cx}" y="{cy+22}" font-family="Helvetica" font-size="8" text-anchor="middle" fill="#111827">{kva} kVA</text>
  <text x="{cx}" y="{cy+32}" font-family="Helvetica" font-size="7" text-anchor="middle" fill="#6b7280">{primaria}/{secundaria}V</text>
</g>
```

## 13. TC/TP (retângulos rotulados)

```svg
<g>
  <rect x="{x}" y="{y}" width="16" height="20" fill="none" stroke="#111827" stroke-width="1.2"/>
  <text x="{x+8}" y="{y+13}" font-family="Helvetica" font-size="8" font-weight="bold" text-anchor="middle" fill="#111827">TC</text>
</g>
```

## 14. RELÉ DE PROTEÇÃO (retângulo com círculos ANSI internos)

Usado em Grupo A pra proteção da interconexão. Contém múltiplos ANSI dentro.

```svg
<g>
  <rect x="{x}" y="{y}" width="70" height="90" fill="none" stroke="#111827" stroke-width="1.3" rx="3"/>
  <text x="{x+35}" y="{y+12}" font-family="Helvetica" font-size="8" font-weight="bold" text-anchor="middle" fill="#1a4f8b">RELÉ PROTEÇÃO</text>
  <!-- ANSI 27, 59, 81U, 81O, 25, 78 dispostos em grid 2x3 -->
  <!-- copiar símbolo ANSI 6× dentro deste retângulo -->
</g>
```

## 15. CAIXA TRACEJADA (QPCA, ENTRADA DE ENERGIA, ANSI)

```svg
<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#111827" stroke-width="1" stroke-dasharray="5,3"/>
<text x="{x+8}" y="{y-4}" font-family="Helvetica" font-size="8" font-weight="bold" fill="#1a4f8b">{titulo}</text>
```

## 16. LINHAS DE SINAL

```svg
<!-- Linha simples (traço técnico) -->
<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#111827" stroke-width="1.2"/>

<!-- Linha tracejada (referencial) -->
<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#6b7280" stroke-width="0.8" stroke-dasharray="4,3"/>

<!-- Cota (com pequenos ticks nas pontas) -->
<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="#6b7280" stroke-width="1.1"/>
<text x="{(x1+x2)/2}" y="{y-4}" font-family="Helvetica" font-size="9" text-anchor="middle" fill="#6b7280">{texto}</text>
```

## 17. PONTO DE CONEXÃO (bola preta)

```svg
<circle cx="{cx}" cy="{cy}" r="3" fill="#111827"/>
```

## Regras de uso

1. **Ordem visual (top-down):** REDE → PADRÃO → MEDIDOR → QGBT → QPCA → INVERSOR → GERADOR FV
2. **Cotas em cabos:** sempre informar `Bitola mm² Isolação - Distância m` (ex: `10mm² PVC - 3m`)
3. **Rotular tudo** (nada sem label)
4. **Alinhamento vertical:** usar mesmo x pra componentes na mesma "coluna" de cadeia
5. **Espaçamento entre blocos:** mínimo 40px vertical

Ver `references/estilo-casa.md` pra layout completo (áreas, margens, tipografia).
