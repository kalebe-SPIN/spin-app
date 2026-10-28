import { describe, expect, it } from 'vitest'
import { avisosUsina, normalizarDadosUsina, resumoPlacas, somaInversoresKw, type EquipamentoUsina } from './usina'

const eq = (tipo: EquipamentoUsina['tipo'], modelo: string, qtd: number, potencia: number | null): EquipamentoUsina =>
  ({ tipo, modelo, qtd, potencia, numeros_serie: null })

describe('quantidade de placas da usina', () => {
  it('cadastro certo (SPIN-2026-0045): 16 × 630 Wp = 10,08 kWp, 1 × 7,5 kW — sem aviso', () => {
    const equipamentos = [eq('placa', 'HMB132T12R', 16, 630), eq('inversor', 'SOFAR 7.5KTLM-G3', 1, 7.5)]
    expect(resumoPlacas(equipamentos)).toEqual({ qtd: 16, wp: 630, kwp: 10.08 })
    expect(somaInversoresKw(equipamentos)).toBe(7.5)
    expect(avisosUsina({ potencia_cc_kwp: 10.08, potencia_ca_kw: 7.5, equipamentos })).toEqual([])
  })

  it('potência digitada na quantidade (SPIN-2026-0151): 560 placas em 7,28 kWp avisa', () => {
    const avisos = avisosUsina({ potencia_cc_kwp: 7.28, potencia_ca_kw: null, equipamentos: [eq('placa', 'RS81-M HC 560', 560, null)] })
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('560 placas não fecham com 7,28 kWp')
  })

  it('quantidade × Wp diferente da potência CC avisa; inversores × CA também', () => {
    const equipamentos = [eq('placa', 'X', 560, 560), eq('inversor', 'Y', 5, 5)]
    const avisos = avisosUsina({ potencia_cc_kwp: 7.28, potencia_ca_kw: 5, equipamentos })
    expect(avisos[0]).toContain('As placas somam 313,60 kWp')
    expect(avisos[1]).toContain('Os inversores somam 25,00 kW')
  })

  it('placa sem modelo fica (a quantidade importa); outro equipamento sem modelo sai', () => {
    const d = normalizarDadosUsina({ equipamentos: [eq('placa', '', 13, 560), eq('inversor', '', 1, 5)] })
    expect(d.equipamentos).toEqual([eq('placa', '', 13, 560)])
  })
})
