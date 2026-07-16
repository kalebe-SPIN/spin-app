/**
 * Lista CA ADICIONAL para sistemas híbridos com BESS.
 *
 * Complementa a Lista CA on-grid com materiais específicos do híbrido:
 *   • Cabos comunicação BLINDADOS entre inversor ↔ bateria ↔ EMBOX ↔ MMW03
 *   • Cabo HEPR 90°C (dobrado) pra saída EPS/backup — HEPR suporta temperaturas
 *     de curto-circuito mais altas, exigência técnica pro modo off-grid
 *   • Cabo de força CC pra baterias (calibre por corrente)
 *   • Terminais tubulares pras conexões CC
 *   • Disjuntor extra pra carga crítica (igual ao do inversor)
 *   • Se paralelismo: disjuntor geral do barramento + disjuntor saída EPS
 *   • Chave seccionadora DC pra manutenção segura
 *   • Barramento cobre para paralelismo de baterias
 *
 * Regras Spin (Kalebe):
 *   • Nunca compartilhar cabos comunicação com força (blindagem obrigatória)
 *   • HEPR sempre em EPS (temperatura de trabalho maior)
 *   • Disjuntor da carga crítica = mesmo calibre do inversor (proteção redundante)
 *   • Paralelismo exige barramento + 2 disjuntores extras (geral + EPS)
 */

import type { ItemKit } from '@/lib/kit-auto/montar-kit'
import type { SaidaDimensionamentoHibrido } from './dimensionamento'

// ═══════════════════ HELPERS DE CALIBRAÇÃO ═══════════════════

/**
 * Escolhe secção do cabo CC bateria→inversor pela corrente máxima.
 * SBW CB050 (5kWh): ~50A nominal, pico 100A → 16mm² por bateria
 * SBW CB100 (10kWh): ~100A nominal, pico 200A → 25mm² por bateria
 *
 * Fator de agrupamento: 4 baterias por entrada JBW → cabo do barramento
 * ao inversor precisa dimensionar pra soma das correntes = 4× nominal.
 */
function calibreCaboBateriaMm2(capacidadeBateriaKwh: number, qtdPorEntrada: number): number {
  const correnteNominal = capacidadeBateriaKwh === 10 ? 100 : 50
  const correnteBarramento = correnteNominal * qtdPorEntrada
  if (correnteBarramento <= 100) return 16
  if (correnteBarramento <= 150) return 25
  if (correnteBarramento <= 250) return 50
  return 70
}

/**
 * Disjuntor CA equivalente pro inversor híbrido (baseado na potência+fase).
 * Padrão WEG SIW: corrente nominal I = P / (V × cos φ)
 * cos φ ≈ 1 no inversor / V mono=220 / V tri=380
 */
function disjuntorInversorA(potenciaKw: number, fase: 'monofasico' | 'trifasico'): number {
  const tensao = fase === 'trifasico' ? 380 : 220
  const correnteA = (potenciaKw * 1000) / tensao
  // Fator segurança 1.25 (NBR 5410)
  const nominal = correnteA * 1.25
  // Arredonda pra próximo valor comercial (16, 20, 25, 32, 40, 50, 63, 80, 100, 125)
  const valores = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160]
  return valores.find((v) => v >= nominal) || 160
}

/**
 * Gera a lista de itens CA adicionais pro sistema híbrido.
 * Retorna itens no mesmo formato do ItemKit — encaixa direto na Lista CA existente.
 */
export function gerarItensListaCaHibrida(
  dim: SaidaDimensionamentoHibrido,
  distanciaBateriaInversorM: number = 3, // padrão: baterias ao lado do inversor
): ItemKit[] {
  const itens: ItemKit[] = []
  const inv = dim.inversor
  const fase = inv.fase as 'monofasico' | 'trifasico'

  // ─── 1. CABO DE COMUNICAÇÃO BLINDADO (inversor ↔ bateria) ───
  // 4 pares 22AWG blindado — Modbus RS485 + CAN
  const metrosComunicacao = (distanciaBateriaInversorM + 2) * dim.qtdInversores * 2 // ida e volta
  itens.push({
    categoria: 'cabo_comunicacao',
    subcategoria: 'blindado_hibrido',
    descricao: 'Cabo comunicação blindado 4 pares × 22AWG (Modbus/CAN — inversor↔bateria)',
    qtd: Math.ceil(metrosComunicacao),
    unidade: 'm',
    observacao: 'Blindagem obrigatória — sem compartilhamento com cabos de força',
    automatico: true,
  })

  // ─── 2. CABO COMUNICAÇÃO MMW03 → INVERSOR ───
  itens.push({
    categoria: 'cabo_comunicacao',
    subcategoria: 'multimedidor',
    descricao: `Cabo comunicação MMW03-M22CH → inversor (par trançado blindado)`,
    qtd: 15,
    unidade: 'm',
    observacao: 'Do quadro de medição até o inversor',
    automatico: true,
  })

  // ─── 3. EMBOX (se paralelismo) — cabo Modbus/CAN entre EMBOX e cada inversor ───
  if (dim.usaControladorParalelismo) {
    itens.push({
      categoria: 'cabo_comunicacao',
      subcategoria: 'embox_paralelismo',
      descricao: `Cabo comunicação EMBOX ↔ inversores paralelismo (${dim.qtdInversores} nós)`,
      qtd: dim.qtdInversores * 3, // 3m por inversor
      unidade: 'm',
      observacao: 'CAN bus terminado nas pontas — necessário pro paralelismo funcionar',
      automatico: true,
    })
  }

  // ─── 4. CABO DE FORÇA CC (bateria → inversor) ───
  const qtdBateriasPorEntrada = Math.ceil(dim.qtdBaterias / (inv.entradas_bateria * dim.qtdInversores))
  const calibreMm2 = calibreCaboBateriaMm2(dim.bateria.capacidade_kwh, qtdBateriasPorEntrada)
  const metrosCaboCC = (distanciaBateriaInversorM + 1) * 2 * inv.entradas_bateria * dim.qtdInversores // +/- por entrada
  itens.push({
    categoria: 'cabo_cc',
    subcategoria: 'bateria_inversor',
    descricao: `Cabo flexível ${calibreMm2}mm² 1.8kV (bateria↔inversor CC) — PRETO`,
    qtd: Math.ceil(metrosCaboCC),
    unidade: 'm',
    observacao: `Corrente calculada: ${qtdBateriasPorEntrada}× ${dim.bateria.capacidade_kwh === 10 ? 100 : 50}A por entrada`,
    automatico: true,
  })
  itens.push({
    categoria: 'cabo_cc',
    subcategoria: 'bateria_inversor',
    descricao: `Cabo flexível ${calibreMm2}mm² 1.8kV (bateria↔inversor CC) — VERMELHO`,
    qtd: Math.ceil(metrosCaboCC),
    unidade: 'm',
    automatico: true,
  })

  // ─── 5. CABO HEPR 90°C PRA SAÍDA EPS (backup) ───
  // Dobrado no calibre normal — HEPR suporta temperatura maior em curto
  const disjuntorCargaCriticaA = disjuntorInversorA(inv.potencia_kw, fase)
  const calibreHeprMm2 = disjuntorCargaCriticaA <= 25 ? 6 : disjuntorCargaCriticaA <= 40 ? 10 : disjuntorCargaCriticaA <= 63 ? 16 : 25
  const metrosHepr = 20 * (fase === 'trifasico' ? 5 : 3) // 20m típico × condutores (fase+neutro+terra)
  itens.push({
    categoria: 'cabo_ca',
    subcategoria: 'hepr_eps',
    descricao: `Cabo HEPR 90°C ${calibreHeprMm2}mm² (saída EPS/backup — inversor↔quadro carga crítica)`,
    qtd: metrosHepr,
    unidade: 'm',
    observacao: 'HEPR obrigatório em EPS (temperatura de curto-circuito maior que PVC)',
    automatico: true,
  })

  // ─── 6. TERMINAIS TUBULARES PRAS CONEXÕES CC ───
  const qtdTerminaisCC = dim.qtdBaterias * 4 + dim.qtdInversores * 4 // +/− em cada ponta
  itens.push({
    categoria: 'terminal',
    subcategoria: 'tubular_cc',
    descricao: `Terminal tubular ${calibreMm2}mm² (conexões CC bateria/inversor)`,
    qtd: qtdTerminaisCC,
    unidade: 'un',
    automatico: true,
  })

  // ─── 7. CHAVE SECCIONADORA DC (manutenção segura) ───
  itens.push({
    categoria: 'protecao',
    subcategoria: 'seccionadora_cc',
    descricao: `Chave seccionadora DC ${calibreMm2 <= 25 ? 100 : 250}A 1000V (bateria)`,
    qtd: dim.qtdInversores,
    unidade: 'un',
    observacao: '1 por inversor — permite isolar CC pra manutenção',
    automatico: true,
  })

  // ─── 8. DISJUNTOR CARGA CRÍTICA (proteção redundante saída EPS) ───
  itens.push({
    categoria: 'disjuntor',
    subcategoria: 'carga_critica_eps',
    descricao: `Disjuntor ${fase === 'trifasico' ? 'tripolar' : 'monopolar'} ${disjuntorCargaCriticaA}A curva C (proteção carga crítica EPS)`,
    qtd: dim.qtdInversores,
    unidade: 'un',
    observacao: 'Igual ao disjuntor do inversor — proteção redundante pro backup',
    automatico: true,
  })

  // ─── 9. QUADRO CARGA CRÍTICA ───
  itens.push({
    categoria: 'quadro',
    subcategoria: 'carga_critica',
    descricao: 'Quadro elétrico DIN plástico 12 módulos (carga crítica separada)',
    qtd: 1,
    unidade: 'un',
    observacao: 'Sub-quadro dedicado às cargas que ficam no backup',
    automatico: true,
  })

  // ─── 10. SE PARALELISMO: barramento + disjuntores extras ───
  if (dim.usaControladorParalelismo) {
    itens.push({
      categoria: 'barramento',
      subcategoria: 'paralelismo_ca',
      descricao: `Barramento cobre CA ${disjuntorCargaCriticaA * dim.qtdInversores}A (paralelismo saída inversores)`,
      qtd: 1,
      unidade: 'un',
      observacao: 'Junção dos inversores paralelo antes do disjuntor geral',
      automatico: true,
    })
    const disjuntorGeralA = Math.ceil(disjuntorCargaCriticaA * dim.qtdInversores * 1.1 / 10) * 10
    itens.push({
      categoria: 'disjuntor',
      subcategoria: 'geral_paralelismo',
      descricao: `Disjuntor geral ${fase === 'trifasico' ? 'tripolar' : 'monopolar'} ${disjuntorGeralA}A (proteção barramento paralelismo)`,
      qtd: 1,
      unidade: 'un',
      observacao: 'Proteção geral do barramento de saída dos inversores em paralelo',
      automatico: true,
    })
    itens.push({
      categoria: 'disjuntor',
      subcategoria: 'geral_eps',
      descricao: `Disjuntor geral EPS ${fase === 'trifasico' ? 'tripolar' : 'monopolar'} ${disjuntorGeralA}A (saída backup consolidada)`,
      qtd: 1,
      unidade: 'un',
      observacao: 'Proteção do circuito consolidado de backup pós-paralelismo',
      automatico: true,
    })
  }

  // ─── 11. IDENTIFICAÇÃO + SINALIZAÇÃO ───
  itens.push({
    categoria: 'sinalizacao',
    subcategoria: 'placa_bess',
    descricao: 'Placa advertência "SISTEMA COM ARMAZENAMENTO DE ENERGIA - BESS"',
    qtd: 2,
    unidade: 'un',
    observacao: '1 no inversor + 1 no quadro medição',
    automatico: true,
  })

  return itens
}

/**
 * Resumo textual pra mostrar no wizard antes de salvar.
 */
export function resumoListaCaHibrida(itens: ItemKit[]): string {
  const total = itens.length
  const cabos = itens.filter((i) => i.categoria.startsWith('cabo')).length
  const disjuntores = itens.filter((i) => i.categoria === 'disjuntor').length
  const outros = total - cabos - disjuntores
  return `${total} itens · ${cabos} cabos · ${disjuntores} disjuntores · ${outros} outros`
}
