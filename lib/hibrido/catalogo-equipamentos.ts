/**
 * Catálogo de equipamentos eletroeletrônicos com potências típicas
 * e tipo de carga (indutiva/resistiva/capacitiva).
 *
 * Usado no método "levantamento_listagem" do wizard híbrido — permite
 * ao consultor Spin selecionar item por item no site do cliente e o
 * sistema calcula potência total, composição de carga e sugere carga crítica.
 *
 * Fonte: fabricantes brasileiros + Procel + tabela WEG motores + experiência Spin.
 */

export type TipoCarga = 'indutiva' | 'resistiva' | 'capacitiva'
export type CategoriaEquipamento = 'residencial' | 'comercial' | 'industrial'

export type Equipamento = {
  id: string
  nome: string
  potenciaW: number
  tipoCarga: TipoCarga
  categoria: CategoriaEquipamento[]  // pode aparecer em mais de uma
  emoji: string
  observacao?: string  // ex: "Pico de partida 3-5× nominal"
  prioridadeBackup?: 'essencial' | 'importante' | 'opcional'  // sugestão de carga crítica
}

export const EQUIPAMENTOS: Equipamento[] = [
  // ═══════════════════ REFRIGERAÇÃO ═══════════════════
  { id: 'geladeira-250l', nome: 'Geladeira 1 porta (250L)', potenciaW: 150, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🧊', prioridadeBackup: 'essencial', observacao: 'Compressor tem pico 3× na partida' },
  { id: 'geladeira-400l', nome: 'Geladeira frost-free (400L)', potenciaW: 250, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🧊', prioridadeBackup: 'essencial' },
  { id: 'freezer-horizontal', nome: 'Freezer horizontal 300L', potenciaW: 300, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '🥶', prioridadeBackup: 'essencial' },
  { id: 'freezer-vertical', nome: 'Freezer vertical comercial', potenciaW: 450, tipoCarga: 'indutiva', categoria: ['comercial'], emoji: '🥶', prioridadeBackup: 'essencial' },
  { id: 'refrigerador-comercial', nome: 'Refrigerador comercial 4 portas', potenciaW: 750, tipoCarga: 'indutiva', categoria: ['comercial'], emoji: '🏪', prioridadeBackup: 'essencial' },
  { id: 'balcao-refrigerado', nome: 'Balcão refrigerado 2m', potenciaW: 500, tipoCarga: 'indutiva', categoria: ['comercial'], emoji: '🍰', prioridadeBackup: 'essencial' },
  { id: 'expositor-cerveja', nome: 'Expositor de bebidas', potenciaW: 350, tipoCarga: 'indutiva', categoria: ['comercial'], emoji: '🍺', prioridadeBackup: 'importante' },

  // ═══════════════════ CLIMATIZAÇÃO ═══════════════════
  { id: 'ar-9k', nome: 'Ar condicionado split 9.000 BTU', potenciaW: 900, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '❄️', prioridadeBackup: 'importante' },
  { id: 'ar-12k', nome: 'Ar condicionado split 12.000 BTU', potenciaW: 1200, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '❄️', prioridadeBackup: 'importante' },
  { id: 'ar-18k', nome: 'Ar condicionado split 18.000 BTU', potenciaW: 1800, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '❄️', prioridadeBackup: 'importante' },
  { id: 'ar-24k', nome: 'Ar condicionado split 24.000 BTU', potenciaW: 2400, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '❄️', prioridadeBackup: 'importante' },
  { id: 'ar-30k', nome: 'Ar condicionado split 30.000 BTU', potenciaW: 3500, tipoCarga: 'indutiva', categoria: ['comercial'], emoji: '❄️', prioridadeBackup: 'importante' },
  { id: 'ar-60k', nome: 'Ar condicionado split 60.000 BTU', potenciaW: 7000, tipoCarga: 'indutiva', categoria: ['comercial', 'industrial'], emoji: '❄️', prioridadeBackup: 'importante' },
  { id: 'ar-piso-teto', nome: 'Ar condicionado piso teto', potenciaW: 5000, tipoCarga: 'indutiva', categoria: ['comercial'], emoji: '❄️', prioridadeBackup: 'importante' },
  { id: 'ventilador-teto', nome: 'Ventilador de teto', potenciaW: 100, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '🌀', prioridadeBackup: 'importante' },
  { id: 'ventilador-mesa', nome: 'Ventilador de mesa', potenciaW: 60, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🌀', prioridadeBackup: 'importante' },
  { id: 'ventilador-industrial', nome: 'Ventilador industrial 1CV', potenciaW: 750, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '🌀' },
  { id: 'exaustor', nome: 'Exaustor comercial', potenciaW: 400, tipoCarga: 'indutiva', categoria: ['comercial'], emoji: '💨' },

  // ═══════════════════ AQUECIMENTO ═══════════════════
  { id: 'chuveiro-eletrico', nome: 'Chuveiro elétrico', potenciaW: 5500, tipoCarga: 'resistiva', categoria: ['residencial'], emoji: '🚿', observacao: 'Alta carga resistiva — evitar em backup', prioridadeBackup: 'opcional' },
  { id: 'aquecedor-agua', nome: 'Aquecedor de água (boiler)', potenciaW: 3000, tipoCarga: 'resistiva', categoria: ['residencial', 'comercial'], emoji: '♨️', prioridadeBackup: 'opcional' },
  { id: 'ferro-passar', nome: 'Ferro de passar', potenciaW: 1200, tipoCarga: 'resistiva', categoria: ['residencial'], emoji: '👕', prioridadeBackup: 'opcional' },
  { id: 'aquecedor-ambiente', nome: 'Aquecedor de ambiente', potenciaW: 1500, tipoCarga: 'resistiva', categoria: ['residencial'], emoji: '🔥', prioridadeBackup: 'opcional' },
  { id: 'secador-cabelo', nome: 'Secador de cabelo', potenciaW: 1500, tipoCarga: 'resistiva', categoria: ['residencial'], emoji: '💇', prioridadeBackup: 'opcional' },

  // ═══════════════════ COZINHA ═══════════════════
  { id: 'microondas', nome: 'Microondas', potenciaW: 1200, tipoCarga: 'resistiva', categoria: ['residencial', 'comercial'], emoji: '🍽️', prioridadeBackup: 'importante' },
  { id: 'forno-eletrico', nome: 'Forno elétrico', potenciaW: 1500, tipoCarga: 'resistiva', categoria: ['residencial'], emoji: '🎂', prioridadeBackup: 'opcional' },
  { id: 'cooktop-eletrico', nome: 'Cooktop elétrico 4 bocas', potenciaW: 5000, tipoCarga: 'resistiva', categoria: ['residencial'], emoji: '🍳', prioridadeBackup: 'opcional' },
  { id: 'cafeteira', nome: 'Cafeteira elétrica', potenciaW: 800, tipoCarga: 'resistiva', categoria: ['residencial', 'comercial'], emoji: '☕' },
  { id: 'cafeteira-expresso', nome: 'Máquina de café expresso', potenciaW: 3500, tipoCarga: 'resistiva', categoria: ['comercial'], emoji: '☕' },
  { id: 'sanduicheira-comercial', nome: 'Sanduicheira comercial', potenciaW: 1500, tipoCarga: 'resistiva', categoria: ['comercial'], emoji: '🥪' },
  { id: 'chapa-quente', nome: 'Chapa quente comercial', potenciaW: 3500, tipoCarga: 'resistiva', categoria: ['comercial'], emoji: '🍔' },
  { id: 'fritadeira-5l', nome: 'Fritadeira elétrica 5L', potenciaW: 3000, tipoCarga: 'resistiva', categoria: ['comercial'], emoji: '🍟' },
  { id: 'fritadeira-15l', nome: 'Fritadeira elétrica 15L', potenciaW: 6000, tipoCarga: 'resistiva', categoria: ['comercial'], emoji: '🍟' },
  { id: 'estufa-quente', nome: 'Estufa quente para salgados', potenciaW: 2500, tipoCarga: 'resistiva', categoria: ['comercial'], emoji: '🥐' },
  { id: 'liquidificador', nome: 'Liquidificador/batedeira', potenciaW: 400, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🥤' },
  { id: 'torradeira', nome: 'Torradeira', potenciaW: 900, tipoCarga: 'resistiva', categoria: ['residencial'], emoji: '🍞' },

  // ═══════════════════ LAVANDERIA ═══════════════════
  { id: 'maquina-lavar', nome: 'Máquina de lavar roupas 8-12kg', potenciaW: 500, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🧺', prioridadeBackup: 'opcional' },
  { id: 'secadora', nome: 'Secadora de roupas', potenciaW: 2500, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🌬️', prioridadeBackup: 'opcional' },
  { id: 'lava-loucas', nome: 'Lava-louças', potenciaW: 1500, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🍽️', prioridadeBackup: 'opcional' },

  // ═══════════════════ ILUMINAÇÃO ═══════════════════
  { id: 'lampada-led-9w', nome: 'Lâmpada LED 9W (equiv. 60W)', potenciaW: 9, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '💡', prioridadeBackup: 'essencial' },
  { id: 'lampada-led-15w', nome: 'Lâmpada LED 15W (equiv. 100W)', potenciaW: 15, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '💡', prioridadeBackup: 'essencial' },
  { id: 'lampada-led-25w', nome: 'Lâmpada LED 25W', potenciaW: 25, tipoCarga: 'capacitiva', categoria: ['comercial'], emoji: '💡', prioridadeBackup: 'essencial' },
  { id: 'painel-led-40w', nome: 'Painel LED plafon 40W', potenciaW: 40, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '💡', prioridadeBackup: 'essencial' },
  { id: 'refletor-led-100w', nome: 'Refletor LED 100W', potenciaW: 100, tipoCarga: 'capacitiva', categoria: ['comercial', 'industrial'], emoji: '🔦', prioridadeBackup: 'importante' },
  { id: 'refletor-led-200w', nome: 'Refletor LED 200W (galpão)', potenciaW: 200, tipoCarga: 'capacitiva', categoria: ['industrial'], emoji: '🔦', prioridadeBackup: 'importante' },
  { id: 'reator-hqi-400w', nome: 'Lâmpada HQI 400W (galpão)', potenciaW: 400, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '💡', observacao: 'Reator indutivo — pico de partida alto' },

  // ═══════════════════ ELETRÔNICOS ═══════════════════
  { id: 'tv-43', nome: 'TV LED 43"', potenciaW: 100, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '📺', prioridadeBackup: 'importante' },
  { id: 'tv-55', nome: 'TV LED 55"', potenciaW: 150, tipoCarga: 'capacitiva', categoria: ['residencial'], emoji: '📺', prioridadeBackup: 'importante' },
  { id: 'tv-65', nome: 'TV LED 65"', potenciaW: 200, tipoCarga: 'capacitiva', categoria: ['residencial'], emoji: '📺', prioridadeBackup: 'importante' },
  { id: 'home-theater', nome: 'Home theater/soundbar', potenciaW: 300, tipoCarga: 'capacitiva', categoria: ['residencial'], emoji: '🔊', prioridadeBackup: 'opcional' },
  { id: 'computador-desktop', nome: 'Computador desktop', potenciaW: 300, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '🖥️', prioridadeBackup: 'essencial' },
  { id: 'notebook', nome: 'Notebook', potenciaW: 90, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '💻', prioridadeBackup: 'essencial' },
  { id: 'monitor-24', nome: 'Monitor LED 24"', potenciaW: 30, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '🖥️', prioridadeBackup: 'essencial' },
  { id: 'monitor-32', nome: 'Monitor LED 32"', potenciaW: 60, tipoCarga: 'capacitiva', categoria: ['comercial'], emoji: '🖥️', prioridadeBackup: 'essencial' },
  { id: 'impressora-laser', nome: 'Impressora laser', potenciaW: 500, tipoCarga: 'capacitiva', categoria: ['comercial'], emoji: '🖨️', prioridadeBackup: 'importante' },
  { id: 'roteador-wifi', nome: 'Roteador WiFi', potenciaW: 15, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '📶', prioridadeBackup: 'essencial' },
  { id: 'modem', nome: 'Modem ONT/GPON', potenciaW: 15, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '📡', prioridadeBackup: 'essencial' },
  { id: 'pos-tef', nome: 'Máquina POS/TEF', potenciaW: 30, tipoCarga: 'capacitiva', categoria: ['comercial'], emoji: '💳', prioridadeBackup: 'essencial' },
  { id: 'camera-cftv', nome: 'Câmera CFTV', potenciaW: 15, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '📹', prioridadeBackup: 'essencial' },
  { id: 'dvr-cftv', nome: 'DVR CFTV', potenciaW: 40, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '🎥', prioridadeBackup: 'essencial' },

  // ═══════════════════ BOMBAS D'ÁGUA ═══════════════════
  { id: 'bomba-residencial-0-5', nome: 'Bomba d\'água 1/2 CV (residencial)', potenciaW: 370, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '💧', prioridadeBackup: 'essencial', observacao: 'Pico de partida 5× nominal' },
  { id: 'bomba-1cv', nome: 'Bomba d\'água 1 CV', potenciaW: 750, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '💧', prioridadeBackup: 'essencial' },
  { id: 'bomba-2cv', nome: 'Bomba d\'água 2 CV', potenciaW: 1500, tipoCarga: 'indutiva', categoria: ['comercial', 'industrial'], emoji: '💧', prioridadeBackup: 'essencial' },
  { id: 'bomba-5cv', nome: 'Bomba d\'água 5 CV', potenciaW: 3700, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '💧', prioridadeBackup: 'importante' },

  // ═══════════════════ MOTORES INDUSTRIAIS ═══════════════════
  { id: 'motor-1cv', nome: 'Motor elétrico 1 CV', potenciaW: 750, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️', observacao: 'Partida direta = 5× nominal' },
  { id: 'motor-2cv', nome: 'Motor elétrico 2 CV', potenciaW: 1500, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-3cv', nome: 'Motor elétrico 3 CV', potenciaW: 2200, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-5cv', nome: 'Motor elétrico 5 CV', potenciaW: 3700, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-75cv', nome: 'Motor elétrico 7,5 CV', potenciaW: 5500, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-10cv', nome: 'Motor elétrico 10 CV', potenciaW: 7500, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-15cv', nome: 'Motor elétrico 15 CV', potenciaW: 11000, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-20cv', nome: 'Motor elétrico 20 CV', potenciaW: 15000, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-25cv', nome: 'Motor elétrico 25 CV', potenciaW: 18500, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-30cv', nome: 'Motor elétrico 30 CV', potenciaW: 22000, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },
  { id: 'motor-50cv', nome: 'Motor elétrico 50 CV', potenciaW: 37000, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '⚙️' },

  // ═══════════════════ COMPRESSORES/PRENSAS ═══════════════════
  { id: 'compressor-5hp', nome: 'Compressor de ar 5 HP', potenciaW: 3700, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '🔧' },
  { id: 'compressor-10hp', nome: 'Compressor de ar 10 HP', potenciaW: 7500, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '🔧' },
  { id: 'compressor-20hp', nome: 'Compressor de ar 20 HP', potenciaW: 15000, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '🔧' },
  { id: 'prensa-5cv', nome: 'Prensa hidráulica 5 CV', potenciaW: 3700, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '🏭' },
  { id: 'esteira-3cv', nome: 'Esteira transportadora 3 CV', potenciaW: 2200, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '📦' },
  { id: 'furadeira-industrial', nome: 'Furadeira industrial de bancada', potenciaW: 1200, tipoCarga: 'indutiva', categoria: ['industrial'], emoji: '🔩' },
  { id: 'solda-mig', nome: 'Máquina de solda MIG', potenciaW: 5000, tipoCarga: 'resistiva', categoria: ['industrial'], emoji: '🔥' },
  { id: 'solda-tig', nome: 'Máquina de solda TIG', potenciaW: 4000, tipoCarga: 'resistiva', categoria: ['industrial'], emoji: '🔥' },
  { id: 'forno-industrial', nome: 'Forno elétrico industrial', potenciaW: 15000, tipoCarga: 'resistiva', categoria: ['industrial'], emoji: '🏭' },
  { id: 'estufa-industrial', nome: 'Estufa industrial', potenciaW: 8000, tipoCarga: 'resistiva', categoria: ['industrial'], emoji: '🏭' },

  // ═══════════════════ FERRAMENTAS/OUTROS ═══════════════════
  { id: 'aspirador', nome: 'Aspirador de pó', potenciaW: 1400, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '🧹' },
  { id: 'furadeira-residencial', nome: 'Furadeira/parafusadeira', potenciaW: 700, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🔩' },
  { id: 'portao-eletronico', nome: 'Portão eletrônico', potenciaW: 200, tipoCarga: 'indutiva', categoria: ['residencial', 'comercial'], emoji: '🚪', prioridadeBackup: 'essencial' },
  { id: 'cerca-eletrica', nome: 'Cerca elétrica', potenciaW: 20, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '⚡', prioridadeBackup: 'essencial' },
  { id: 'alarme', nome: 'Central de alarme', potenciaW: 20, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '🚨', prioridadeBackup: 'essencial' },
  { id: 'nobreak-pc', nome: 'No-break 1200VA', potenciaW: 100, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '🔌' },
  { id: 'aquario', nome: 'Aquário com bomba+aquecedor', potenciaW: 200, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🐠', prioridadeBackup: 'essencial' },
  { id: 'piscina-bomba', nome: 'Bomba de piscina 1 CV', potenciaW: 750, tipoCarga: 'indutiva', categoria: ['residencial'], emoji: '🏊' },
  { id: 'carregador-ve', nome: 'Carregador veículo elétrico', potenciaW: 7400, tipoCarga: 'capacitiva', categoria: ['residencial', 'comercial'], emoji: '🚗' },
]

// ═══════════════════ HELPERS ═══════════════════

export type ItemLevantamento = {
  equipamentoId: string
  quantidade: number
  horasUsoDia?: number   // opcional — pra calcular consumo mensal
  ehCargaCritica: boolean // se está no backup
}

export type ResumoLevantamento = {
  potenciaInstaladaW: number       // soma de tudo (nunca acontece ao mesmo tempo)
  potenciaCargaCriticaW: number    // só o que está em backup
  potenciaComSimultaneidadeW: number // com fator de simultaneidade aplicado (típ. 0.6)
  consumoEstimadoMensalKwh: number  // baseado em horas de uso
  percIndutiva: number              // ponderado por potência
  percResistiva: number
  percCapacitiva: number
  itens: (ItemLevantamento & { equipamento: Equipamento; potenciaTotalW: number })[]
  totalItens: number
}

export function calcularResumoLevantamento(
  itens: ItemLevantamento[],
): ResumoLevantamento {
  const itensDetalhados = itens
    .map((i) => {
      const eq = EQUIPAMENTOS.find((e) => e.id === i.equipamentoId)
      if (!eq) return null
      return {
        ...i,
        equipamento: eq,
        potenciaTotalW: eq.potenciaW * i.quantidade,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  let potenciaInstaladaW = 0
  let potenciaCargaCriticaW = 0
  let potenciaIndutivaW = 0
  let potenciaResistivaW = 0
  let potenciaCapacitivaW = 0
  let consumoMensalWh = 0

  itensDetalhados.forEach((i) => {
    potenciaInstaladaW += i.potenciaTotalW
    if (i.ehCargaCritica) potenciaCargaCriticaW += i.potenciaTotalW

    switch (i.equipamento.tipoCarga) {
      case 'indutiva':  potenciaIndutivaW  += i.potenciaTotalW; break
      case 'resistiva': potenciaResistivaW += i.potenciaTotalW; break
      case 'capacitiva': potenciaCapacitivaW += i.potenciaTotalW; break
    }

    if (i.horasUsoDia) {
      consumoMensalWh += i.potenciaTotalW * i.horasUsoDia * 30
    }
  })

  const total = potenciaInstaladaW || 1
  const percIndutiva = (potenciaIndutivaW / total) * 100
  const percResistiva = (potenciaResistivaW / total) * 100
  const percCapacitiva = (potenciaCapacitivaW / total) * 100

  // Fator de simultaneidade típico: 0.6 (60% da carga instalada em uso simultâneo)
  const potenciaComSimultaneidadeW = potenciaInstaladaW * 0.6

  return {
    potenciaInstaladaW,
    potenciaCargaCriticaW,
    potenciaComSimultaneidadeW,
    consumoEstimadoMensalKwh: consumoMensalWh / 1000,
    percIndutiva,
    percResistiva,
    percCapacitiva,
    itens: itensDetalhados,
    totalItens: itensDetalhados.reduce((s, i) => s + i.quantidade, 0),
  }
}
