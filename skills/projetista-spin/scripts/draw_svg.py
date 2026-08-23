# -*- coding: utf-8 -*-
"""
draw_svg.py — Biblioteca de desenho técnico (SVG) para a skill projetista-spin.

Uso típico:
    from draw_svg import SVG, PALETTE
    d = SVG(1580, 1120)
    d.rect(16, 16, d.W-32, d.H-32, sw=1.8)          # moldura
    d.medidor(210, 225); d.text(240, 220, "MEDIDOR BIDIRECIONAL", 9.5, w="bold")
    d.disj(210, 310); d.inversor(150, 470, 120, 96)
    d.save("saida.svg")

Depois: cairosvg.svg2pdf(url="saida.svg", write_to="saida.pdf")

IMPORTANTE: nunca passe '<' cru em text(); use '&lt;'.
"""
import math

PALETTE = dict(
    INK="#111827", BLUE="#1a4f8b", GREY="#6b7280", RED="#b91c1c",
    GRN="#0f766e", ORN="#b45309", YEL="#f4d000", TEAL="#0e7490",
    # cores de fase CELESC
    FASE_R="#111827", FASE_S="#7a7a7a", FASE_T="#c0392b", NEUTRO="#2980b9", PE="#1e8449",
)
INK = PALETTE["INK"]; BLUE = PALETTE["BLUE"]; GREY = PALETTE["GREY"]


class SVG:
    def __init__(self, W=1580, H=1120):
        self.W, self.H = W, H
        self.s = []
        # marcadores de seta reutilizáveis
        self.add('<defs>'
                 '<marker id="ar" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">'
                 '<path d="M0,0 L6,3 L0,6 Z" fill="#111827"/></marker></defs>')

    # ---- infra ----
    def add(self, x): self.s.append(x)

    def line(self, x1, y1, x2, y2, w=1.5, c=INK, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{c}" stroke-width="{w}"{d}/>')

    def rect(self, x, y, w, h, fill="none", stroke=INK, sw=1.5, rx=0, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}" rx="{rx}"{d}/>')

    def circle(self, cx, cy, r, fill="none", stroke=INK, sw=1.5):
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="{sw}"/>')

    def text(self, x, y, t, size=11, c=INK, w="normal", a="start"):
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="Helvetica, Arial, sans-serif" '
                 f'font-size="{size}" fill="{c}" font-weight="{w}" text-anchor="{a}">{t}</text>')

    def mtext(self, x, y, lines, size=9, c=INK, w="normal", a="start", lh=None):
        lh = lh or size + 2.5
        for i, l in enumerate(lines):
            self.text(x, y + i * lh, l, size, c, w, a)

    def dot(self, x, y, r=3): self.circle(x, y, r, fill=INK)

    def path(self, d, stroke=INK, w=1.2, fill="none"):
        self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{w}"/>')

    def arrow(self, x1, y1, x2, y2, c=INK, w=1.5):
        self.add(f'<path d="M {x1} {y1} L {x2} {y2}" stroke="{c}" stroke-width="{w}" '
                 f'marker-end="url(#ar)"/>')

    # ---- cotas ----
    def _tick(self, x, y, ang=45, r=5):
        dx = r * math.cos(math.radians(ang)); dy = r * math.sin(math.radians(ang))
        self.line(x - dx, y - dy, x + dx, y + dy, 1.3, GREY)

    def hdim(self, x1, x2, y, t):
        self.line(x1, y, x2, y, 1.1, GREY); self._tick(x1, y); self._tick(x2, y)
        self.text((x1 + x2) / 2, y - 4, t, 9, GREY, a="middle")

    def vdim(self, x, y1, y2, t):
        self.line(x, y1, x, y2, 1.1, GREY); self._tick(x, y1); self._tick(x, y2)
        self.add(f'<text x="{x-4:.1f}" y="{(y1+y2)/2:.1f}" font-family="Helvetica" '
                 f'font-size="9" fill="{GREY}" text-anchor="middle" '
                 f'transform="rotate(-90 {x-4:.1f} {(y1+y2)/2:.1f})">{t}</text>')

    # ---- símbolos elétricos ----
    def ground(self, x, y, c=INK):
        self.line(x, y, x, y + 10, 1.5, c); self.line(x - 10, y + 10, x + 10, y + 10, 2, c)
        self.line(x - 6, y + 14, x + 6, y + 14, 2, c); self.line(x - 3, y + 18, x + 3, y + 18, 2, c)

    def disj(self, x, y, tri=True):
        """Disjuntor termomagnético (vertical) centrado em (x,y)."""
        self.line(x, y - 15, x, y - 6); self.dot(x, y - 6, 2.2); self.line(x, y - 6, x + 13, y + 7)
        self.path(f"M {x+9:.1f} {y-4:.1f} q 6 4 2 10", INK, 1.2)
        self.dot(x, y + 14, 2.2); self.line(x, y + 14, x, y + 15)
        if tri: self.text(x - 9, y + 2, "3P", 7.5, GREY, a="end")

    def medidor(self, x, y):
        self.rect(x - 22, y - 16, 44, 32, rx=3); self.line(x - 12, y - 7, x + 12, y - 7, 1.1)
        self.path(f"M {x-12} {y-7} l 4 -3 M {x-12} {y-7} l 4 3 "
                  f"M {x+12} {y-7} l -4 -3 M {x+12} {y-7} l -4 3", INK, 1)
        self.text(x, y + 9, "kWh", 10, INK, "bold", "middle")

    def dps(self, x, y, side=-1, ramal=64):
        """DPS derivando do eixo (x,y) para o terra, do lado 'side' (-1 esq)."""
        bx = x + side * ramal
        self.line(x, y, bx, y); self.rect(bx - 13, y - 15, 26, 30)
        self.line(bx - 13, y + 15, bx + 13, y - 15, 1.4)
        self.line(bx, y + 15, bx, y + 22); self.ground(bx, y + 22)
        return bx

    def inversor(self, x, y, w, h):
        self.rect(x, y, w, h, rx=3, fill="#eef3fa"); self.line(x, y + h, x + w, y, 1.2, BLUE)
        self.text(x + w * 0.28, y + h * 0.42, "~", 17, INK, "bold", "middle")
        self.text(x + w * 0.72, y + h * 0.75, "=", 16, INK, "bold", "middle")

    def modulo(self, x, y, w=30, h=22):
        self.rect(x, y, w, h)
        for gx in (w / 3, 2 * w / 3): self.line(x + gx, y, x + gx, y + h, 0.6, GREY)
        self.line(x, y + h / 2, x + w, y + h / 2, 0.6, GREY); self.line(x, y + h, x + w, y, 0.7, GREY)

    def bateria(self, x, y):
        for i, dx in enumerate((0, 9, 18, 27)):
            hh = 13 if i % 2 == 0 else 7
            self.line(x + dx, y - hh, x + dx, y + hh, 2 if i % 2 == 0 else 1.4)
        self.text(x + 13, y + 24, "BAT", 8.5, INK, "bold", "middle")

    def ansi(self, x, y, t):
        self.circle(x, y, 13); self.text(x, y + 3.5, t, 8.5, INK, "bold", "middle")

    def gerador(self, x, y, r=20):
        self.circle(x, y, r); self.text(x, y + r * 0.28, "G", int(r * 0.75), INK, "bold", "middle")

    # ---- saída ----
    def render(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.W}" height="{self.H}" '
                f'viewBox="0 0 {self.W} {self.H}"><rect width="{self.W}" height="{self.H}" '
                f'fill="white"/>' + "\n".join(self.s) + "</svg>")

    def save(self, path):
        with open(path, "w") as f:
            f.write(self.render())
        return path


if __name__ == "__main__":
    # exemplo mínimo
    d = SVG(700, 400)
    d.rect(16, 16, d.W - 32, d.H - 32, sw=1.6)
    d.text(40, 44, "EXEMPLO projetista-spin", 16, BLUE, "bold")
    d.medidor(120, 150); d.text(150, 148, "MEDIDOR", 10, w="bold")
    d.disj(120, 230); d.dps(120, 230)
    d.inversor(300, 200, 110, 80); d.ground(120, 300)
    d.save("exemplo.svg")
    print("gerado exemplo.svg")
