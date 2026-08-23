# Motor de desenho — API

Duas bibliotecas espelhadas: `draw_svg.py` (gera o SVG, que vira PDF) e `draw_dxf.py` (gera o
DXF editável no AutoCAD, em camadas). Use as **mesmas coordenadas** nas duas — o DXF só inverte
o eixo Y internamente.

## Instalação (uma vez)

```bash
pip install ezdxf cairosvg matplotlib --break-system-packages
```

## Fluxo completo (exemplo mínimo)

```python
import sys; sys.path.insert(0, "scripts")
from draw_svg import SVG, BLUE
from draw_dxf import DXF
import cairosvg

# 1) SVG
d = SVG(1580, 1120)
d.rect(16, 16, d.W-32, d.H-32, sw=1.8)                 # moldura
d.text(40, 44, "DIAGRAMA UNIFILAR - EXEMPLO", 16, BLUE, "bold")
d.medidor(210, 225); d.text(240, 220, "MEDIDOR BIDIRECIONAL", 9.5, w="bold")
d.disj(210, 310); d.dps(210, 342)                      # disjuntor + DPS (Quadro de Proteção CA)
d.inversor(150, 470, 120, 96)
d.ground(60, 336)
d.save("out.svg")

# 2) PDF
cairosvg.svg2pdf(url="out.svg", write_to="out.pdf")

# 3) DXF (mesmas coordenadas) + validação
q = DXF(1580, 1120)
q.rect(16, 16, q.W-32, q.H-32, "MOLDURA")
q.tx(40, 44, "DIAGRAMA UNIFILAR - EXEMPLO", 16, "TEXTO")
q.medidor(210, 225); q.disj(210, 310); q.dps(210, 342)
q.inversor(150, 470, 120, 96); q.gnd(60, 336)
q.save("out.dxf")
print("DXF entidades:", DXF.validate("out.dxf", png="out_check.png"))
```

## Regras de ouro

1. **Renderize e confira** o SVG em PNG antes de exportar (sobreposições, rótulos fora da margem).
   `cairosvg.svg2png(url="out.svg", write_to="prev.png", scale=1.2)` e inspecione.
2. **Nunca** deixe `<` cru dentro de `text()` — use `&lt;` (senão o XML quebra).
3. **Sempre** entregue **PDF + DXF + SVG** com `present_files`.
4. Aplique as **regras fixas da SPIN** (`../references/regras-spin.md`): sem quadro de proteção
   CC; Quadro de Proteção CA com disjuntor do sistema FV + DPS ligado ao QGBT.
5. Coluna direita (x ≥ ~1095) para legenda/notas/placa/carimbo; diagrama à esquerda.

## Principais métodos

`SVG`: `line, rect, circle, text, mtext, dot, path, arrow, hdim, vdim, ground, disj, medidor,
dps, inversor, modulo, bateria, ansi, gerador, save`.

`DXF`: `ln, rect, cir, tx, gnd, disj, medidor, dps, inversor, modulo, ansi, save, validate`.
