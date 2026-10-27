// Cálculo de progresso e pendências de um levantamento — função pura,
// usada no formulário (barra de progresso) e antes de gravar `progresso`.
import type { ModeloChecklist, Respostas, ArquivoLevantamento, Pendencia, CampoModelo } from "./types";

export interface Progresso {
  total: number;
  ok: number;
  pct: number;              // 0..100
  faltando: Pendencia[];    // itens obrigatórios ainda vazios (origem 'app')
}

export function preenchido(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/** Campo com `mostrar_se` só aparece (e só conta) quando a condição bate. */
export function campoVisivel(c: Pick<CampoModelo, "mostrar_se">, respostas: Respostas): boolean {
  return !c.mostrar_se || respostas[c.mostrar_se.campo] === c.mostrar_se.igual;
}

/** Preenchido de acordo com o tipo (medição coletiva = pelo menos 2 unidades). */
export function campoPreenchido(c: Pick<CampoModelo, "tipo">, v: unknown): boolean {
  if (c.tipo === "coletiva") {
    const u = v && typeof v === "object" && !Array.isArray(v) ? (v as { unidades?: unknown }).unidades : null;
    return Array.isArray(u) && u.length >= 2;
  }
  return preenchido(v);
}

export function calcularProgresso(
  modelo: ModeloChecklist,
  respostas: Respostas,
  arquivos: Pick<ArquivoLevantamento, "tipo" | "slot">[] = [],
): Progresso {
  let total = 0;
  let ok = 0;
  const faltando: Pendencia[] = [];
  for (const secao of modelo.secoes) {
    for (const c of secao.campos) {
      if (!c.obrigatorio || !campoVisivel(c, respostas)) continue;
      total++;
      if (campoPreenchido(c, respostas[c.id])) ok++;
      else faltando.push({ campo: c.id, mensagem: c.rotulo, origem: "app" });
    }
  }
  const slots = new Set(
    arquivos.filter((a) => a.tipo === "foto" || a.tipo === "documento").map((a) => a.slot),
  );
  for (const f of modelo.fotos) {
    if (!f.obrigatorio) continue;
    total++;
    if (slots.has(f.id)) ok++;
    else faltando.push({ campo: `foto:${f.id}`, mensagem: `Foto: ${f.titulo}`, origem: "app" });
  }
  return { total, ok, pct: total ? Math.round((100 * ok) / total) : 0, faltando };
}
