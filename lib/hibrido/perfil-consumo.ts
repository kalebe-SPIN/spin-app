/**
 * Gerador de curvas típicas de consumo, geração solar e comportamento
 * do sistema híbrido para visualização no wizard e na proposta.
 *
 * Curvas horárias (24 pontos) e diárias (30 pontos) baseadas em
 * perfis brasileiros: residencial, comercial e industrial.
 *
 * Todas as unidades em kW (potência instantânea) ou kWh (energia diária).
 */

export type PerfilCliente = 'residencial' | 'comercial' | 'industrial'

/**
 * Curva típica de 24 horas de consumo NORMALIZADA (soma = 1).
 * Multiplicar pelo consumo diário total (kWh) pra obter kW hora a hora.
 */
export function curvaConsumoDiaria24h(perfil: PerfilCliente): number[] {
  // Cada elemento representa 1 hora do dia (0-23)
  // Baseado em perfis típicos de carga (ONS/CELESC)
  const perfis: Record<PerfilCliente, number[]> = {
    // Residencial: baixo dia, picos manhã (7h) e noite (18-21h)
    residencial: [
      0.015, 0.012, 0.010, 0.010, 0.012, 0.020, // 0-5h madrugada
      0.045, 0.070, 0.055, 0.035, 0.030, 0.035, // 6-11h manhã
      0.045, 0.040, 0.035, 0.035, 0.040, 0.055, // 12-17h tarde
      0.085, 0.090, 0.075, 0.055, 0.035, 0.020, // 18-23h noite (PICO)
    ],
    // Comercial: forte 8h-18h, quase zero fora do horário
    comercial: [
      0.010, 0.008, 0.008, 0.008, 0.010, 0.012, // madrugada
      0.020, 0.045, 0.075, 0.080, 0.080, 0.075, // 6-11h abertura + operação
      0.070, 0.075, 0.080, 0.080, 0.075, 0.055, // 12-17h operação
      0.030, 0.020, 0.015, 0.012, 0.010, 0.008, // fechamento
    ],
    // Industrial: constante 24h, leve queda madrugada
    industrial: [
      0.030, 0.028, 0.028, 0.028, 0.030, 0.035, // madrugada
      0.045, 0.055, 0.060, 0.060, 0.060, 0.055, // manhã
      0.050, 0.055, 0.060, 0.060, 0.055, 0.045, // tarde
      0.040, 0.038, 0.035, 0.035, 0.032, 0.032, // noite
    ],
  }
  return perfis[perfil]
}

/**
 * Curva de geração solar típica NORMALIZADA (soma = 1).
 * Parábola centrada em 12h. Multiplicar por geração diária total (kWh).
 * Modelagem: nasce ~6h, pico 12h, morre ~18h.
 */
export function curvaGeracaoSolar24h(latitudeAprox: number = -27.24): number[] {
  const curva: number[] = new Array(24).fill(0)
  const inicio = 6
  const fim = 18
  const meio = 12
  const largura = fim - inicio
  let soma = 0
  for (let h = inicio; h <= fim; h++) {
    // Curva senoidal (aprox. parábola de geração)
    const t = (h - inicio) / largura // 0..1
    const valor = Math.sin(t * Math.PI) // 0..1..0
    curva[h] = valor
    soma += valor
  }
  // Normaliza
  return curva.map((v) => v / soma)
}

/**
 * Simula o comportamento do sistema híbrido hora a hora.
 * Retorna 24 pontos com: consumo, geração, consumoDaRede, injecao, descargaBateria.
 */
export type PontoHoraSistema = {
  hora: number
  consumoKw: number
  geracaoKw: number
  consumoDaRedeKw: number   // o que ainda vem da rede após solar + bateria
  injecaoRedeKw: number      // excedente solar injetado
  descargaBateriaKw: number  // energia saindo da bateria (peak shaving/backup)
  cargaBateriaKw: number     // energia entrando na bateria
  socBateriaPerc: number     // % de carga da bateria (0-100)
}

export function simularDiaHibrido(input: {
  perfil: PerfilCliente
  consumoDiarioKwh: number         // Total consumido no dia
  geracaoDiariaKwh: number          // Total gerado pelo solar
  capacidadeBateriaKwh: number      // Total do banco de baterias
  potenciaBateriaKw?: number        // Potência instantânea do banco (limita despacho)
  potenciaInversorKw?: number       // Potência do inversor (limita tudo)
  usarPeakShaving?: boolean         // Descarrega bateria em horário de ponta
  horaInicioPonta?: number
  horaFimPonta?: number
  percDespachoMax?: number          // % max do banco usado pra despacho (peak shaving). Default 50
  percBackupReservado?: number      // % do banco RESERVADO só pra queda de energia. Default 20
  socInicialPerc?: number           // % de carga inicial (default 100 pra amostrar despacho)
  dodMaxPerc?: number               // % máx de descarga (WEG SBW = 98%)
}): PontoHoraSistema[] {
  const {
    perfil,
    consumoDiarioKwh,
    geracaoDiariaKwh,
    capacidadeBateriaKwh,
    potenciaBateriaKw = capacidadeBateriaKwh, // 1C default
    potenciaInversorKw = Infinity,
    usarPeakShaving = false,
    horaInicioPonta = 18,
    horaFimPonta = 21,
    percDespachoMax = 50,
    percBackupReservado = 20,
    socInicialPerc = 100,
    dodMaxPerc = 98,
  } = input

  const curvaConsumo = curvaConsumoDiaria24h(perfil)
  const curvaGeracao = curvaGeracaoSolar24h()

  const pontos: PontoHoraSistema[] = []
  let socKwh = (capacidadeBateriaKwh * socInicialPerc) / 100
  // Limite de despacho: usar até percDespachoMax do banco, mas nunca abaixo da reserva de backup
  const socMinReservaBackup = capacidadeBateriaKwh * (percBackupReservado / 100)
  const socMinDoD = capacidadeBateriaKwh * (1 - dodMaxPerc / 100) // ex: 98% DoD → 2% mínimo
  // Potência máxima instantânea (limitada por inversor OU banco)
  const potenciaMaxKw = Math.min(potenciaInversorKw, potenciaBateriaKw)

  for (let h = 0; h < 24; h++) {
    const consumoKw = curvaConsumo[h] * consumoDiarioKwh
    const geracaoKw = curvaGeracao[h] * geracaoDiariaKwh

    let consumoDaRedeKw = 0
    let injecaoRedeKw = 0
    let descargaBateriaKw = 0
    let cargaBateriaKw = 0

    const saldoSolar = geracaoKw - consumoKw

    if (saldoSolar > 0) {
      // Excedente solar: carrega bateria (limitado pela potência do banco), depois injeta
      const espacoBateria = capacidadeBateriaKwh - socKwh
      const cargaPossivel = Math.min(saldoSolar, espacoBateria, potenciaMaxKw)
      cargaBateriaKw = cargaPossivel
      socKwh += cargaPossivel
      injecaoRedeKw = saldoSolar - cargaPossivel
    } else {
      // Déficit solar
      const deficit = Math.abs(saldoSolar)
      const emHorarioPonta = usarPeakShaving && h >= horaInicioPonta && h < horaFimPonta
      // Reserva pra backup: só usa até (percDespachoMax) do banco em modo peak shaving
      const socLimiteDespacho = Math.max(socMinReservaBackup, socMinDoD)

      if (emHorarioPonta && socKwh > socLimiteDespacho) {
        const disponivel = socKwh - socLimiteDespacho
        const descarga = Math.min(deficit, disponivel, potenciaMaxKw)
        descargaBateriaKw = descarga
        socKwh -= descarga
        consumoDaRedeKw = deficit - descarga
      } else {
        consumoDaRedeKw = deficit
      }
    }

    const socBateriaPerc = capacidadeBateriaKwh > 0
      ? (socKwh / capacidadeBateriaKwh) * 100
      : 0

    pontos.push({
      hora: h,
      consumoKw,
      geracaoKw,
      consumoDaRedeKw,
      injecaoRedeKw,
      descargaBateriaKw,
      cargaBateriaKw,
      socBateriaPerc,
    })
  }

  return pontos
}

/**
 * Simula queda de energia começando na `horaQueda` — quanto tempo o sistema
 * aguenta atendendo a carga crítica com o SOC atual, respeitando limites de
 * potência do inversor + banco.
 */
export function simularQuedaEnergia(input: {
  perfil: PerfilCliente
  consumoDiarioKwh: number
  cargaCriticaKw: number
  capacidadeBateriaKwh: number
  potenciaBateriaKw: number
  potenciaInversorKw: number
  socInicialPerc?: number
  dodMaxPerc?: number
  horaQueda?: number
  duracaoQuedaHoras?: number
}): {
  pontos: Array<{
    hora: number
    cargaKw: number
    potenciaEntregueKw: number
    socPerc: number
    houveDeficit: boolean
  }>
  autonomiaHoras: number
} {
  const {
    perfil,
    consumoDiarioKwh,
    cargaCriticaKw,
    capacidadeBateriaKwh,
    potenciaBateriaKw,
    potenciaInversorKw,
    socInicialPerc = 100,
    dodMaxPerc = 98,
    horaQueda = 18,
    duracaoQuedaHoras = 8,
  } = input

  const curvaConsumo = curvaConsumoDiaria24h(perfil)
  const potenciaMaxKw = Math.min(potenciaInversorKw, potenciaBateriaKw)
  const socMinKwh = capacidadeBateriaKwh * (1 - dodMaxPerc / 100)

  let socKwh = (capacidadeBateriaKwh * socInicialPerc) / 100
  let autonomiaHoras = 0
  const pontos: Array<any> = []

  for (let hOffset = 0; hOffset < duracaoQuedaHoras; hOffset++) {
    const h = (horaQueda + hOffset) % 24
    // Carga na hora = fração do perfil × consumo diário, mas SEMPRE limitada pela carga crítica
    // (backup atende só as cargas críticas selecionadas)
    const cargaPerfilKw = curvaConsumo[h] * consumoDiarioKwh
    const cargaKw = Math.min(cargaPerfilKw, cargaCriticaKw)

    // Energia disponível respeitando DoD
    const energiaDisponivel = Math.max(0, socKwh - socMinKwh)
    // Potência entregue = min(carga, potência máx, energia disponível em 1h)
    const potenciaEntregueKw = Math.min(cargaKw, potenciaMaxKw, energiaDisponivel)
    const houveDeficit = potenciaEntregueKw < cargaKw

    if (!houveDeficit) autonomiaHoras = hOffset + 1

    socKwh -= potenciaEntregueKw
    const socPerc = capacidadeBateriaKwh > 0 ? (socKwh / capacidadeBateriaKwh) * 100 : 0

    pontos.push({ hora: h, cargaKw, potenciaEntregueKw, socPerc, houveDeficit })

    if (socKwh <= socMinKwh) break
  }

  return { pontos, autonomiaHoras }
}

/**
 * Simula 30 dias — retorna consumo diário, geração diária, saldo (crédito ou débito).
 */
export type PontoDiaMes = {
  dia: number
  consumoKwh: number
  geracaoKwh: number
  saldoKwh: number // positivo = crédito, negativo = déficit
  consumoDaRedeKwh: number
  economiaKwh: number
}

export function simularMesHibrido(input: {
  perfil: PerfilCliente
  consumoMensalKwh: number
  geracaoMensalKwh: number
}): PontoDiaMes[] {
  const { consumoMensalKwh, geracaoMensalKwh } = input
  const consumoMedio = consumoMensalKwh / 30
  const geracaoMedia = geracaoMensalKwh / 30

  // Variação típica: consumo mais alto meio da semana, geração menor em dias nublados
  const variacaoConsumo = [
    // 30 dias, valores próximos a 1.0
    0.95, 1.05, 1.10, 1.00, 0.95, 0.85, 0.80, // sem 1
    1.05, 1.15, 1.10, 1.00, 0.95, 0.90, 0.85, // sem 2
    1.00, 1.10, 1.15, 1.05, 1.00, 0.90, 0.85, // sem 3
    1.05, 1.10, 1.10, 1.00, 0.95, 0.90, 0.85, // sem 4
    1.00, 1.05,
  ]
  const variacaoGeracao = [
    1.10, 1.05, 0.70, 0.60, 1.15, 1.20, 1.15, // sem 1
    1.10, 0.80, 0.50, 1.05, 1.20, 1.15, 1.10, // sem 2 (2 nublados)
    1.15, 1.20, 0.90, 0.70, 1.10, 1.20, 1.15, // sem 3
    1.05, 0.60, 1.15, 1.20, 1.15, 1.10, 1.05, // sem 4
    1.10, 1.20,
  ]

  const pontos: PontoDiaMes[] = []
  for (let d = 0; d < 30; d++) {
    const consumoKwh = consumoMedio * variacaoConsumo[d]
    const geracaoKwh = geracaoMedia * variacaoGeracao[d]
    const saldoKwh = geracaoKwh - consumoKwh
    const consumoDaRedeKwh = Math.max(0, consumoKwh - geracaoKwh)
    const economiaKwh = Math.min(consumoKwh, geracaoKwh)
    pontos.push({
      dia: d + 1,
      consumoKwh,
      geracaoKwh,
      saldoKwh,
      consumoDaRedeKwh,
      economiaKwh,
    })
  }
  return pontos
}
