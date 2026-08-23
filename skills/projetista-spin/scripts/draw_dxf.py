# -*- coding: utf-8 -*-
"""
draw_dxf.py — Biblioteca de desenho técnico (DXF/AutoCAD) para a skill projetista-spin.

Espelha as coordenadas do SVG, mas com o eixo Y invertido (Y(y) = H - y), pois o DXF usa
Y para cima. Organiza o desenho em CAMADAS por tipo de elemento.

Uso típico:
    from draw_dxf import DXF
    d = DXF(1580, 1120)
    d.rect(16, 16, d.W-32, d.H-32, "MOLDURA")
    d.medidor(210, 225); d.tx(240, 220, "MEDIDOR BIDIRECIONAL", 9, "TEXTO")
    d.disj(210, 310, "PROTECAO")
    d.save("saida.dxf")
    DXF.validate("saida.dxf")           # opcional: valida + renderiza PNG de conferência

Requer: pip install ezdxf matplotlib --break-system-packages
"""
import ezdxf
from ezdxf.enums import TextEntityAlignment as TA

# camadas padrão (nome -> cor ACI)
LAYERS = {
    "REDE": 7, "MEDICAO": 7, "PROTECAO": 1, "INVERSOR": 5, "CC": 3, "MODULO": 3,
    "BATERIA": 3, "COMUNIC": 5, "EPS": 30, "ANSI": 6, "ATERRA": 3, "TEXTO": 7,
    "COTAS": 8, "MOLDURA": 5, "LEGENDA": 5, "PLACA": 1, "GABINETE": 8, "ELETRODUTO": 8,
}


class DXF:
    def __init__(self, W=1580, H=1120):
        self.W, self.H = W, H
        self.doc = ezdxf.new("R2010", setup=True)
        self.doc.header["$INSUNITS"] = 4  # milímetros
        self.msp = self.doc.modelspace()
        for n, c in LAYERS.items():
            self.doc.layers.add(n, color=c)

    def Y(self, y): return self.H - y

    def ln(self, x1, y1, x2, y2, lay="TEXTO", lt="CONTINUOUS"):
        self.msp.add_line((x1, self.Y(y1)), (x2, self.Y(y2)),
                          dxfattribs={"layer": lay, "linetype": lt})

    def rect(self, x, y, w, h, lay="TEXTO", lt="CONTINUOUS"):
        p = [(x, self.Y(y)), (x + w, self.Y(y)), (x + w, self.Y(y + h)),
             (x, self.Y(y + h)), (x, self.Y(y))]
        self.msp.add_lwpolyline(p, dxfattribs={"layer": lay, "linetype": lt})

    def cir(self, x, y, r, lay="TEXTO"):
        self.msp.add_circle((x, self.Y(y)), r, dxfattribs={"layer": lay})

    def tx(self, x, y, t, h=10, lay="TEXTO", al=TA.LEFT):
        e = self.msp.add_text(t, dxfattribs={"height": h, "layer": lay})
        e.set_placement((x, self.Y(y)), align=al)

    def gnd(self, x, y, lay="ATERRA"):
        self.ln(x, y, x, y + 10, lay); self.ln(x - 10, y + 10, x + 10, y + 10, lay)
        self.ln(x - 6, y + 14, x + 6, y + 14, lay); self.ln(x - 3, y + 18, x + 3, y + 18, lay)

    def disj(self, x, y, lay="PROTECAO"):
        self.ln(x, y - 15, x, y - 6, lay); self.ln(x, y - 6, x + 13, y + 7, lay)
        self.ln(x, y + 14, x, y + 15, lay)

    def medidor(self, x, y, lay="MEDICAO"):
        self.rect(x - 22, y - 16, 44, 32, lay); self.tx(x, y + 4, "kWh", 10, "TEXTO", TA.CENTER)

    def dps(self, x, y, side=-1, ramal=64, lay="PROTECAO"):
        bx = x + side * ramal
        self.ln(x, y, bx, y, lay); self.rect(bx - 13, y - 15, 26, 30, lay)
        self.ln(bx - 13, y + 15, bx + 13, y - 15, lay); self.gnd(bx, y + 22)
        return bx

    def inversor(self, x, y, w, h, lay="INVERSOR"):
        self.rect(x, y, w, h, lay); self.ln(x, y + h, x + w, y, lay)

    def modulo(self, x, y, w=30, h=22, lay="MODULO"):
        self.rect(x, y, w, h, lay); self.ln(x, y + h, x + w, y, lay)

    def ansi(self, x, y, t, lay="ANSI"):
        self.cir(x, y, 13, lay); self.tx(x, y + 4, t, 8, lay, TA.CENTER)

    def save(self, path):
        self.doc.saveas(path)
        return path

    @staticmethod
    def validate(path, png=None):
        """Reabre o DXF, conta entidades e (se matplotlib) renderiza um PNG de conferência."""
        d = ezdxf.readfile(path)
        n = len(list(d.modelspace()))
        if png:
            from ezdxf.addons.drawing import RenderContext, Frontend
            from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
            import matplotlib.pyplot as plt
            fig = plt.figure(figsize=(16, 11)); ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off")
            Frontend(RenderContext(d), MatplotlibBackend(ax)).draw_layout(d.modelspace())
            fig.savefig(png, dpi=80, facecolor="white")
        return n


if __name__ == "__main__":
    d = DXF(700, 400)
    d.rect(16, 16, d.W - 32, d.H - 32, "MOLDURA")
    d.tx(40, 44, "EXEMPLO projetista-spin", 16, "TEXTO")
    d.medidor(120, 150); d.disj(120, 230); d.dps(120, 230)
    d.inversor(300, 200, 110, 80); d.gnd(120, 300)
    d.save("exemplo.dxf")
    print("entidades:", DXF.validate("exemplo.dxf"))
