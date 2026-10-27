// Lista de cargas (campo "cargas", modelos v2) e números no padrão brasileiro.
import { describe, it, expect } from "vitest";
import { itensCarga, numeroBR, somaCargasW, valorExibido } from "./comum";
import type { CampoModelo } from "./types";

const campo: CampoModelo = { id: "cargas_esp", rotulo: "Cargas especiais", tipo: "cargas", obrigatorio: true };

describe("cargas especiais", () => {
  it("limpa os itens e descarta o que não serve", () => {
    const itens = itensCarga([
      { item: "Chuveiro elétrico", qtd: 2, potencia_w: 5500, equipamento_id: "chuveiro-eletrico" },
      { item: "  ", qtd: 1, potencia_w: 100 },
      { item: "Bomba do poço", qtd: 0, potencia_w: -3 },
      "texto solto",
    ]);
    expect(itens).toEqual([
      { item: "Chuveiro elétrico", qtd: 2, potencia_w: 5500, equipamento_id: "chuveiro-eletrico" },
      { item: "Bomba do poço", qtd: 1, potencia_w: null },
    ]);
    expect(somaCargasW(itens)).toBe(11000);
  });

  it("aparece no relatório em texto, com a soma em pt-BR", () => {
    const v = [
      { item: "Chuveiro elétrico", qtd: 2, potencia_w: 5500 },
      { item: "Bomba do poço", qtd: 1, potencia_w: null },
    ];
    expect(valorExibido(campo, v)).toBe(
      "2× Chuveiro elétrico (5.500 W cada); 1× Bomba do poço (potência a informar) — soma 11.000 W (11,00 kW)",
    );
    expect(valorExibido(campo, [])).toBe("");
    expect(valorExibido(campo, "texto do modelo v1")).toBe("texto do modelo v1");
  });

  it("lê número com vírgula ou ponto", () => {
    expect(numeroBR("1.234,5")).toBe(1234.5);
    expect(numeroBR("12,5")).toBe(12.5);
    expect(numeroBR("7400")).toBe(7400);
    expect(numeroBR("abc")).toBeNull();
    expect(numeroBR("")).toBeNull();
  });
});
