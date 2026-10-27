// Testes (Vitest). Contagens de obrigatórios conferidas com a página de referência
// (+1 em Padrão novo e Aumento de carga: "Tipo de medição", modelos v3).
import { describe, it, expect } from "vitest";
import { calcularProgresso } from "./progresso";
import fv from "./modelos/fv.json";
import padraoNovo from "./modelos/padrao_novo.json";
import aumentoCarga from "./modelos/aumento_carga.json";
import type { ModeloChecklist, Respostas } from "./types";

const casos: [string, ModeloChecklist, number][] = [
  ["fv", fv as ModeloChecklist, 31],
  ["padrao_novo", padraoNovo as ModeloChecklist, 31],
  ["aumento_carga", aumentoCarga as ModeloChecklist, 36],
];
const COLETIVA = "Coletiva (mais de um relógio no mesmo padrão)";

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

  it("relógios da medição coletiva só contam quando a medição é coletiva (2 ou mais)", () => {
    const m = padraoNovo as ModeloChecklist;
    const individual = calcularProgresso(m, { medicao: "Individual (um relógio)" });
    expect(individual.total).toBe(31);
    expect(individual.faltando.some((f) => f.campo === "coletiva")).toBe(false);

    const umRelogio = { unidades: [{ identificacao: "Casa 1" }] } as unknown as Respostas[string];
    const coletiva = calcularProgresso(m, { medicao: COLETIVA, coletiva: umRelogio });
    expect(coletiva.total).toBe(32);
    expect(coletiva.faltando.some((f) => f.campo === "coletiva")).toBe(true);

    const doisRelogios = { unidades: [{ identificacao: "Casa 1" }, { identificacao: "Casa 2" }] } as unknown as Respostas[string];
    const ok = calcularProgresso(m, { medicao: COLETIVA, coletiva: doisRelogios });
    expect(ok.faltando.some((f) => f.campo === "coletiva")).toBe(false);
  });
});
