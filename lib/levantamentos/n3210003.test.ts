// Medição coletiva pela CELESC N-321.0003 — contas conferidas à mão com as tabelas da norma.
import { describe, it, expect } from "vitest";
import { calcularColetiva, coletivaVazia, demandaAtividadeKw, demandaPorArea, type MedicaoColetiva, type UnidadeColetiva } from "./n3210003";

const casa = (n: number, area: number, disj: number, tipo: UnidadeColetiva["tipo"] = "Residencial"): UnidadeColetiva[] =>
  Array.from({ length: n }, (_, i) => ({ identificacao: `Casa ${i + 1}`, tipo, ligacao: "Monofásica (1F+N)", disjuntor_a: disj, area_m2: area }));
const med = (p: Partial<MedicaoColetiva>): MedicaoColetiva => ({ ...coletivaVazia(), ...p });

describe("N-321.0003 — demanda provável e disjuntor geral", () => {
  it("4 casas de 80 m²: F 3,88 × Da 1,76 × 1,2 = 8,19 kVA → 50 A", () => {
    const r = calcularColetiva(med({ unidades: casa(4, 80, 40) }));
    expect(r.F).toBe(3.88);
    expect(r.Da).toBe(1.76);
    expect(r.dp_kva).toBeCloseTo(1.2 * 3.88 * 1.76, 6);
    expect(r.disjuntor_a).toBe(50);
    expect(r.por_seletividade).toBe(false);
    expect(r.avisos).toEqual([]);
  });

  it("seletividade: geral acima do maior individual (63 A → 70 A)", () => {
    const r = calcularColetiva(med({ unidades: casa(4, 80, 63) }));
    expect(r.disjuntor_tabela).toBe(50);
    expect(r.disjuntor_a).toBe(70);
    expect(r.por_seletividade).toBe(true);
    expect(r.linha?.aereo_cobre).toBe("16");
  });

  it("10 apartamentos de 65 m² + condomínio (iluminação, tomadas, motores) → 36,23 kVA → 70 A", () => {
    const r = calcularColetiva(med({
      unidades: casa(10, 65, 40),
      condominio: { iluminacao_kw: 12, tomadas_kw: 5, especiais_kw: null, motores: [{ cv: "1", fases: "Trifásico", qtd: 2 }] },
    }));
    expect(r.Da).toBe(1.57);                         // até 70 m²
    expect(r.F).toBe(9.64);
    expect(r.Di).toBeCloseTo(10.5 / 0.9, 6);         // 10 kW a 100% + 2 kW a 25%
    expect(r.Dt).toBeCloseTo(1 / 0.9, 6);            // 20% de 5 kW
    expect(r.Dm).toBe(2.28);                         // Tabela 04: 2 × 1 CV trifásico
    expect(r.dp_kva).toBeCloseTo(1.2 * (9.64 * 1.57 + 10.5 / 0.9 + 1 / 0.9 + 2.28), 6);
    expect(r.disjuntor_a).toBe(70);                  // 36 < D ≤ 45
  });

  it("condomínio só comercial: Tabelas 05, 06 e 07, sem o fator 1,2", () => {
    const r = calcularColetiva(med({
      unidades: casa(2, 0, 63, "Comercial"),
      comercial: {
        atividades: [{ atividade: "escritorios", kw: 30 }],             // 20 × 0,9 + 10 × 0,7 = 25 kW
        aquecimento: [{ descricao: "Chuveiro", qtd: 2, kw_cada: 5.5 }],  // 11 × 0,65 = 7,15 kW
        ar: [{ qtd: 12, kw_cada: 1.5 }],                                 // 18 × 0,90 = 16,2 kW
      },
    }));
    expect(r.com_k).toBe(false);
    expect(r.Ds).toBeCloseTo((25 + 7.15 + 16.2) / 0.9, 6);
    expect(r.dp_kva).toBeCloseTo(48.35 / 0.9, 6);    // 53,72 kVA
    expect(r.disjuntor_a).toBe(90);                  // 52 < D ≤ 58
  });

  it("industrial: demanda informada pelo projetista", () => {
    const r = calcularColetiva(med({
      unidades: [
        { identificacao: "Galpão 1", tipo: "Industrial", ligacao: "Trifásica (3F+N)", disjuntor_a: 80, demanda_kva: 30 },
        { identificacao: "Galpão 2", tipo: "Industrial", ligacao: "Trifásica (3F+N)", disjuntor_a: 63, demanda_kva: 25 },
      ],
    }));
    expect(r.dp_kva).toBe(55);
    expect(r.disjuntor_tabela).toBe(90);
    expect(r.disjuntor_a).toBe(90);                  // 90 > 80: seletividade ok
  });

  it("trava quando falta dado ou sai da norma", () => {
    expect(calcularColetiva(med({ unidades: casa(1, 80, 40) })).disjuntor_a).toBeNull();
    const semArea = calcularColetiva(med({ unidades: [...casa(2, 80, 40), { identificacao: "Apto 3", tipo: "Residencial", ligacao: "Monofásica (1F+N)", disjuntor_a: 40, area_m2: null }] }));
    expect(semArea.disjuntor_a).toBeNull();
    expect(semArea.avisos.join(" ")).toMatch(/área útil/);
    const motores = calcularColetiva(med({ unidades: casa(3, 80, 40), condominio: { iluminacao_kw: null, tomadas_kw: null, especiais_kw: null, motores: [{ cv: "2", fases: "Trifásico", qtd: 11 }] } }));
    expect(motores.disjuntor_a).toBeNull();
    const grande = calcularColetiva(med({ unidades: casa(2, 80, 40), condominio: { iluminacao_kw: null, tomadas_kw: null, especiais_kw: 300, motores: [] } }));
    expect(grande.dp_kva).toBeGreaterThan(300);
    expect(grande.disjuntor_a).toBeNull();
    const comSemCarga = calcularColetiva(med({ unidades: casa(2, 0, 40, "Comercial") }));
    expect(comSemCarga.disjuntor_a).toBeNull();
  });

  it("Tabela 02 e fórmula acima de 400 m²; Tabela 05 com faixas", () => {
    expect(demandaPorArea(50)).toBe(1.57);
    expect(demandaPorArea(71)).toBe(1.59);
    expect(demandaPorArea(92.4)).toBe(2.02);         // área quebrada → linha de 93 m²
    expect(demandaPorArea(400)).toBe(7.45);
    expect(demandaPorArea(500)).toBeCloseTo(0.034939 * Math.pow(500, 0.895075), 9);
    expect(demandaAtividadeKw("hospitais", 60)).toBeCloseTo(50 * 0.4 + 10 * 0.2, 9);
    expect(demandaAtividadeKw("bancos_lojas", 10)).toBeCloseTo(7.5, 9);
  });
});
