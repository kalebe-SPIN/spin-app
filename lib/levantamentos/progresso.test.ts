// Testes (Vitest). Contagens de obrigatórios conferidas com a página de referência.
import { describe, it, expect } from "vitest";
import { calcularProgresso } from "./progresso";
import fv from "./modelos/fv.json";
import padraoNovo from "./modelos/padrao_novo.json";
import aumentoCarga from "./modelos/aumento_carga.json";
import type { ModeloChecklist } from "./types";

const casos: [string, ModeloChecklist, number][] = [
  ["fv", fv as ModeloChecklist, 31],
  ["padrao_novo", padraoNovo as ModeloChecklist, 30],
  ["aumento_carga", aumentoCarga as ModeloChecklist, 35],
];

describe("calcularProgresso", () => {
  it.each(casos)("%s tem o número certo de itens obrigatórios", (_n, modelo, total) => {
    const p = calcularProgresso(modelo, {});
    expect(p.total).toBe(total);
    expect(p.pct).toBe(0);
    expect(p.faltando).toHaveLength(total);
  });

  it("conta campos e fotos preenchidos", () => {
    const m = padraoNovo as ModeloChecklist;
    const p = calcularProgresso(m, { consultor: "Ana", cliente: "  " }, [{ tipo: "foto", slot: "poste" }]);
    expect(p.ok).toBe(2); // 'cliente' só com espaços não conta
    expect(p.faltando.some((f) => f.campo === "foto:poste")).toBe(false);
  });
});
