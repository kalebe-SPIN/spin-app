/**
 * Diária do profissional de campo (Kalebe 2026-10-05):
 *  - R$ 100 (integral) quando conclui TODOS os serviços aprovados do dia;
 *  - R$ 70 (parcial) quando algum não foi concluído.
 * Conta o dia que teve agenda aprovada. Fecha na manhã seguinte (Bianca);
 * o que não foi concluído volta pras demandas.
 */
export const DIARIA_INTEGRAL = 100
export const DIARIA_PARCIAL = 70

export function calcularDiaria(previstos: number, concluidos: number): { valor: number; tipo: 'integral' | 'parcial' } {
  return previstos > 0 && concluidos >= previstos
    ? { valor: DIARIA_INTEGRAL, tipo: 'integral' }
    : { valor: DIARIA_PARCIAL, tipo: 'parcial' }
}
