/**
 * Geradores de arquivos automáticos pras etapas de homologação.
 * Rodam server-side, sem IA (exceto diagrama unifilar).
 *
 * Cada função recebe o projeto e retorna { conteudo, mimeType, extensao }.
 * O arquivo é salvo no bucket homologacao-arquivos e a URL vai pra url_arquivo_pdf da etapa.
 */

// ═══════════════════ MEMORIAL DESCRITIVO (Markdown) ═══════════════════
export function gerarMemorialDescritivo(projeto: any): { conteudo: string; mimeType: string; extensao: string } {
  const cliente = projeto.cliente_razao_social || 'Cliente'
  const cnpj = projeto.cliente_cpf_cnpj || 'não informado'
  const endereco = projeto.cliente_endereco?.logradouro || projeto.cliente_endereco || 'não informado'
  const cidade = typeof projeto.cliente_endereco === 'object'
    ? `${projeto.cliente_endereco?.cidade || '—'}/${projeto.cliente_endereco?.uf || 'SC'}`
    : 'Tijucas/SC'
  const uc = projeto.uc_geradora || projeto.uc_beneficiaria || '—'
  const kit = projeto.kit_selecionado || {}
  const analise = projeto.analise_fatura || {}
  const telhado = projeto.telhado_secoes?.[0] || {}
  const padrao = projeto.padrao_entrada || {}

  const potenciaCC = kit.potencia_cc_kwp || kit.potencia_kwp || '—'
  const potenciaCA = kit.potencia_ca_kw || '—'
  const numModulos = kit.qtd_placas || '—'
  const moduloModelo = kit.placa_modelo || 'WEG Monocristalino 550Wp'
  const inversorModelo = kit.inversor_modelo || '—'
  const numInversores = kit.qtd_inversores || 1
  const tipoLigacao = padrao.tipo_ligacao || 'monofásico'

  const consumoMedio = analise.consumo_medio_kwh || analise.consumo_kwh || '—'
  const tarifa = analise.tarifa_kwh || '—'

  const md = `# MEMORIAL DESCRITIVO
## Sistema Fotovoltaico Conectado à Rede (On-Grid)

---

## 1. IDENTIFICAÇÃO DO CLIENTE
- **Razão social / Nome:** ${cliente}
- **CPF/CNPJ:** ${cnpj}
- **Endereço da instalação:** ${endereco}
- **Cidade:** ${cidade}
- **Unidade Consumidora (UC):** ${uc}

## 2. IDENTIFICAÇÃO DA EMPRESA RESPONSÁVEL
- **Razão social:** Spin Solar
- **CNPJ:** [preencher]
- **Endereço:** Tijucas/SC
- **Responsável Técnico:** [preencher — nome, CREA/CFT, ART]

## 3. DESCRIÇÃO DO SISTEMA
Trata-se de um sistema fotovoltaico ${projeto.tipo_projeto === 'hibrido_bess' ? 'HÍBRIDO com armazenamento (BESS)' : 'ON-GRID (conectado à rede)'} da concessionária CELESC.

### 3.1. Potências
- **Potência CC total (módulos):** ${potenciaCC} kWp
- **Potência CA total (inversor):** ${potenciaCA} kW
- **Fator de carregamento (FCI):** ${potenciaCC !== '—' && potenciaCA !== '—' ? ((Number(potenciaCC) / Number(potenciaCA)) * 100).toFixed(1) + '%' : '—'}

### 3.2. Geração de Energia
Módulos fotovoltaicos:
- Modelo: ${moduloModelo}
- Quantidade: ${numModulos} unidades
- Potência unitária: 550 Wp

### 3.3. Inversor(es)
- Modelo: ${inversorModelo}
- Quantidade: ${numInversores}
- Tipo de ligação: ${tipoLigacao}

### 3.4. Consumo Atual do Cliente
- Consumo médio mensal: ${consumoMedio} kWh/mês
- Tarifa atual: R$ ${tarifa}/kWh

## 4. INSTALAÇÃO
### 4.1. Localização dos Módulos
Instalação em cobertura ${telhado.tipo_cobertura || 'de fibrocimento'}, área aproximada de ${telhado.area_m2 || '—'} m², orientação ${telhado.orientacao || '—'}, inclinação ${telhado.inclinacao_graus || '—'}°.

### 4.2. Padrão de Entrada
Padrão de entrada existente: ${padrao.amperagem_a || '—'}A ${tipoLigacao}. ${padrao.upgrade_necessario ? '**UPGRADE NECESSÁRIO** — atualizar padrão conforme normas CELESC.' : 'Padrão compatível com a nova potência.'}

### 4.3. Ponto de Conexão
Conexão à rede será feita no Quadro Geral (QGBT) do cliente através de disjuntor e DPS classe II, conforme norma técnica CELESC N-321.0001.

## 5. NORMAS TÉCNICAS APLICÁVEIS
- NBR 5410 — Instalações elétricas de baixa tensão
- NBR 16149 — Sistemas fotovoltaicos conectados à rede
- N-321.0001 — Fornecimento de energia em BT (CELESC)
- I-432.0004 — Micro e mini geração distribuída (CELESC)
- E-321.0031 — Padrão de entrada (CELESC)
- REN 482/2012 e REN 687/2015 — ANEEL Geração Distribuída

## 6. DOCUMENTOS ANEXOS
1. Diagrama Unifilar
2. Layout de Instalação
3. Lista de materiais do Kit Fotovoltaico
4. Lista CA (materiais complementares)
5. ART do responsável técnico
6. Cópia do RG e CPF do titular
7. Cópia da última fatura CELESC

---

_Este memorial foi gerado automaticamente pelo Portal Spin Solar em ${new Date().toLocaleDateString('pt-BR')}._
_Projeto: ${projeto.codigo} — ${cliente}_
`

  return { conteudo: md, mimeType: 'text/markdown', extensao: 'md' }
}

// ═══════════════════ LISTA DO KIT FV (CSV) ═══════════════════
export function gerarListaKitCsv(projeto: any): { conteudo: string; mimeType: string; extensao: string } {
  const kit = projeto.kit_selecionado || {}
  const linhas: string[] = ['Categoria,Item,Modelo/Codigo,Quantidade,Unidade,Observacao']

  if (kit.qtd_placas) {
    linhas.push(
      `Modulos FV,Modulo fotovoltaico,${kit.placa_modelo || 'WEG 550Wp'},${kit.qtd_placas},un,${kit.potencia_cc_kwp || '—'} kWp CC total`,
    )
  }
  if (kit.qtd_inversores) {
    linhas.push(
      `Inversor,Inversor solar,${kit.inversor_modelo || '—'},${kit.qtd_inversores},un,${kit.potencia_ca_kw || '—'} kW`,
    )
  }
  // Estrutura + fixação (padrão Spin)
  const estruturaModelo = 'Estrutura WEG telha ondulada' + (kit.estrutura_marca ? ` (${kit.estrutura_marca})` : '')
  linhas.push(`Estrutura,${estruturaModelo},—,${kit.qtd_placas || 1},kit,Kit fixacao completo`)

  // Cabos CC
  const distancia = projeto.telhado_secoes?.[0]?.distancia_qgbt_m || 30
  linhas.push(`Cabo CC,Cabo solar 6mm² Vermelho,PV1-F 1.8kV,${distancia * 2},m,String → inversor`)
  linhas.push(`Cabo CC,Cabo solar 6mm² Preto,PV1-F 1.8kV,${distancia * 2},m,String → inversor`)

  // Conectores
  linhas.push(`Conector,Conector MC4 macho/fêmea par,MC4,${(kit.qtd_placas || 1) + 2},par,Emendas + entrada inversor`)

  // Placas advertência
  linhas.push(`Sinalizacao,Placa advertencia FV grande,—,1,un,Norma CELESC`)
  linhas.push(`Sinalizacao,Placa advertencia pequena,—,1,un,Norma CELESC (se >1 relogio)`)

  return { conteudo: linhas.join('\n'), mimeType: 'text/csv', extensao: 'csv' }
}

// ═══════════════════ LISTA CA (CSV) ═══════════════════
export function gerarListaCaCsv(projeto: any): { conteudo: string; mimeType: string; extensao: string } {
  const listaOngrid = projeto.lista_ca_confirmada || []
  const listaHibrida = projeto.lista_ca_hibrida_confirmada || []
  const linhas: string[] = ['Origem,Categoria,Descricao,Codigo WEG,Quantidade,Unidade,Observacao']

  for (const item of listaOngrid) {
    linhas.push([
      'ON-GRID',
      item.categoria || '—',
      csvEsc(item.descricao || ''),
      item.codigo_weg || '—',
      item.qtd || 0,
      item.unidade || 'un',
      csvEsc(item.observacao || ''),
    ].join(','))
  }
  for (const item of listaHibrida) {
    linhas.push([
      'HIBRIDO/BESS',
      item.categoria || '—',
      csvEsc(item.descricao || ''),
      item.codigo_weg || '—',
      item.qtd || 0,
      item.unidade || 'un',
      csvEsc(item.observacao || ''),
    ].join(','))
  }

  if (linhas.length === 1) {
    linhas.push('AVISO,—,Lista CA vazia — confirme a lista em /projetos/[id]/lista-ca,—,0,—,')
  }

  return { conteudo: linhas.join('\n'), mimeType: 'text/csv', extensao: 'csv' }
}

// ═══════════════════ LAYOUT INSTALAÇÃO (SVG A4 — planta + elevação) ═══════════════════
export function gerarLayoutSvg(projeto: any): { conteudo: string; mimeType: string; extensao: string } {
  const secoes = projeto.telhado_secoes || []
  const qtdPlacas = projeto.kit_selecionado?.qtd_placas || 0
  const moduloModelo = projeto.kit_selecionado?.placa_modelo || 'WEG 550Wp Monocristalino'
  const potCC = projeto.kit_selecionado?.potencia_cc_kwp || (qtdPlacas * 0.55).toFixed(2)
  const inversorModelo = projeto.kit_selecionado?.inversor_modelo || '—'
  const inversorQtd = projeto.kit_selecionado?.qtd_inversores || 1

  const W = 1190, H = 842  // A4 paisagem
  const partes: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`,
    // Cabeçalho
    `<text x="${W / 2}" y="35" text-anchor="middle" font-family="Arial" font-size="20" font-weight="bold" fill="#000">LAYOUT DE INSTALAÇÃO FOTOVOLTAICA</text>`,
    `<text x="${W / 2}" y="55" text-anchor="middle" font-family="Arial" font-size="13" fill="#333">${(projeto.cliente_razao_social || 'Cliente').substring(0, 60)} · ${projeto.codigo || ''}</text>`,
    `<text x="${W / 2}" y="72" text-anchor="middle" font-family="Arial" font-size="11" fill="#555">${qtdPlacas} módulos ${moduloModelo} · ${potCC} kWp CC · ${inversorQtd}× ${inversorModelo}</text>`,
    // Linhas divisórias
    `<line x1="30" y1="90" x2="${W - 30}" y2="90" stroke="#000" stroke-width="1"/>`,
    `<text x="45" y="105" font-family="Arial" font-size="11" font-weight="bold" fill="#000">A) VISTA EM PLANTA (topo)</text>`,
  ]

  // ─── VISTA EM PLANTA (metade superior) ───
  const plantaY = 115
  const plantaH = 400
  const marginX = 60
  const areaW = W - marginX * 2

  if (secoes.length === 0) {
    partes.push(
      `<rect x="${marginX}" y="${plantaY}" width="${areaW}" height="${plantaH}" fill="none" stroke="#888" stroke-width="1.5" stroke-dasharray="10 5"/>`,
      `<text x="${W / 2}" y="${plantaY + plantaH / 2}" text-anchor="middle" font-family="Arial" font-size="14" fill="#888">Sem seções de telhado cadastradas</text>`,
    )
  } else {
    const larguraSecao = areaW / secoes.length
    secoes.forEach((s: any, i: number) => {
      const x = marginX + i * larguraSecao + 8
      const w = larguraSecao - 16
      const numPlacas = s.qtd_placas || Math.floor(qtdPlacas / secoes.length)
      partes.push(
        // Contorno da seção
        `<rect x="${x}" y="${plantaY}" width="${w}" height="${plantaH}" fill="#F0F7FC" stroke="#000" stroke-width="1.5"/>`,
        // Cabeçalho da seção
        `<text x="${x + w / 2}" y="${plantaY + 22}" text-anchor="middle" font-family="Arial" font-size="13" font-weight="bold" fill="#000">Seção ${i + 1} — ${s.tipo_cobertura || 'cobertura'}</text>`,
        `<text x="${x + w / 2}" y="${plantaY + 40}" text-anchor="middle" font-family="Arial" font-size="10" fill="#333">Área: ${s.area_m2 || '—'}m² · Orient. ${s.orientacao || '—'} · Incl. ${s.inclinacao_graus || '—'}°</text>`,
      )
      // Grid de placas
      const cols = Math.min(10, Math.ceil(Math.sqrt(numPlacas * 1.6)))
      const rows = Math.ceil(numPlacas / cols)
      const gridStartY = plantaY + 60
      const gridH = plantaH - 100
      const placaW = (w - 20) / cols
      const placaH = Math.min(28, (gridH - 20) / rows)
      const gridStartX = x + 10 + ((w - 20 - cols * placaW) / 2)
      for (let p = 0; p < numPlacas; p++) {
        const col = p % cols
        const row = Math.floor(p / cols)
        const px = gridStartX + col * placaW
        const py = gridStartY + row * (placaH + 2)
        partes.push(
          `<rect x="${px}" y="${py}" width="${placaW - 2}" height="${placaH}" fill="#1e40af" stroke="#0a1a5c" stroke-width="0.5"/>`,
          // Linha central do módulo (símbolo)
          `<line x1="${px + placaW / 2 - 1}" y1="${py + 3}" x2="${px + placaW / 2 - 1}" y2="${py + placaH - 3}" stroke="#fff" stroke-width="0.5"/>`,
        )
      }
      partes.push(
        `<text x="${x + w / 2}" y="${plantaY + plantaH - 12}" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="#000">${numPlacas} módulos</text>`,
      )
    })
  }

  // ─── VISTA EM ELEVAÇÃO (metade inferior) ───
  partes.push(
    `<line x1="30" y1="${plantaY + plantaH + 20}" x2="${W - 30}" y2="${plantaY + plantaH + 20}" stroke="#000" stroke-width="1"/>`,
    `<text x="45" y="${plantaY + plantaH + 40}" font-family="Arial" font-size="11" font-weight="bold" fill="#000">B) VISTA EM ELEVAÇÃO (lateral)</text>`,
  )

  const elevY = plantaY + plantaH + 60
  const elevH = 150
  // Fundação
  partes.push(
    `<rect x="${marginX}" y="${elevY + elevH - 8}" width="${areaW}" height="8" fill="#666"/>`,
    `<text x="${marginX + areaW / 2}" y="${elevY + elevH + 20}" text-anchor="middle" font-family="Arial" font-size="9" fill="#555">Nível do solo / laje</text>`,
  )

  // Casa com telhado + módulos em elevação
  const casaX = marginX + 100
  const casaW = 400
  const casaH = 100
  const telhadoAng = 20
  const telhadoTop = elevY + elevH - 8 - casaH
  const cumeeiraY = telhadoTop - 60

  partes.push(
    // Casa (paredes)
    `<rect x="${casaX}" y="${telhadoTop}" width="${casaW}" height="${casaH}" fill="#F5EDD5" stroke="#000" stroke-width="1.5"/>`,
    // Telhado (2 águas)
    `<polygon points="${casaX - 20},${telhadoTop} ${casaX + casaW / 2},${cumeeiraY} ${casaX + casaW + 20},${telhadoTop}" fill="#A0522D" stroke="#000" stroke-width="1.5"/>`,
    // Módulos FV sobre telhado (lado esquerdo)
    `<polygon points="${casaX - 10},${telhadoTop - 4} ${casaX + casaW / 2 - 20},${cumeeiraY + 8} ${casaX + casaW / 2 - 15},${cumeeiraY + 15} ${casaX - 5},${telhadoTop + 3}" fill="#1e40af" stroke="#0a1a5c" stroke-width="1"/>`,
    // Anotação
    `<text x="${casaX - 30}" y="${telhadoTop - 20}" font-family="Arial" font-size="10" fill="#000">Módulos FV</text>`,
    `<line x1="${casaX + 40}" y1="${telhadoTop - 15}" x2="${casaX + 60}" y2="${telhadoTop + 5}" stroke="#000" stroke-width="0.5"/>`,
    // Cotas
    `<text x="${casaX + casaW / 2}" y="${cumeeiraY - 8}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">${secoes[0]?.inclinacao_graus || '20'}°</text>`,
    // Inversor lateral
    `<rect x="${casaX + casaW + 40}" y="${elevY + elevH - 55}" width="30" height="40" fill="#22c55e" stroke="#000" stroke-width="1"/>`,
    `<text x="${casaX + casaW + 55}" y="${elevY + elevH - 32}" text-anchor="middle" font-family="Arial" font-size="8" fill="#fff" font-weight="bold">INV</text>`,
    `<text x="${casaX + casaW + 55}" y="${elevY + elevH + 5}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">Inversor</text>`,
    // Cabos até QGBT
    `<line x1="${casaX + casaW + 40}" y1="${elevY + elevH - 20}" x2="${casaX + casaW + 100}" y2="${elevY + elevH - 20}" stroke="#000" stroke-width="1" stroke-dasharray="3 2"/>`,
    // QGBT
    `<rect x="${casaX + casaW + 100}" y="${elevY + elevH - 45}" width="35" height="30" fill="#eee" stroke="#000" stroke-width="1"/>`,
    `<text x="${casaX + casaW + 117}" y="${elevY + elevH - 28}" text-anchor="middle" font-family="Arial" font-size="8" fill="#000" font-weight="bold">QGBT</text>`,
  )

  // Legenda + selo
  const legendY = H - 90
  partes.push(
    `<line x1="30" y1="${legendY - 10}" x2="${W - 30}" y2="${legendY - 10}" stroke="#000" stroke-width="1"/>`,
    // Legenda
    `<g transform="translate(45, ${legendY})">`,
    `<rect x="0" y="0" width="18" height="12" fill="#1e40af" stroke="#000" stroke-width="0.5"/>`,
    `<text x="24" y="10" font-family="Arial" font-size="10" fill="#000">Módulo FV ${moduloModelo}</text>`,
    `<rect x="180" y="0" width="18" height="12" fill="#22c55e" stroke="#000" stroke-width="0.5"/>`,
    `<text x="204" y="10" font-family="Arial" font-size="10" fill="#000">Inversor ${inversorModelo}</text>`,
    `<rect x="380" y="0" width="18" height="12" fill="#eee" stroke="#000" stroke-width="0.5"/>`,
    `<text x="404" y="10" font-family="Arial" font-size="10" fill="#000">Quadro Elétrico (QGBT)</text>`,
    `</g>`,
    // Selo
    `<rect x="${W - 260}" y="${legendY - 15}" width="220" height="70" fill="none" stroke="#000" stroke-width="1"/>`,
    `<text x="${W - 250}" y="${legendY + 2}" font-family="Arial" font-size="9" font-weight="bold" fill="#000">SPIN SOLAR — Layout de Instalação</text>`,
    `<text x="${W - 250}" y="${legendY + 16}" font-family="Arial" font-size="8" fill="#333">Cliente: ${(projeto.cliente_razao_social || '').substring(0, 30)}</text>`,
    `<text x="${W - 250}" y="${legendY + 28}" font-family="Arial" font-size="8" fill="#333">Projeto: ${projeto.codigo || ''}</text>`,
    `<text x="${W - 250}" y="${legendY + 40}" font-family="Arial" font-size="8" fill="#333">UC: ${projeto.uc_geradora || '—'}</text>`,
    `<text x="${W - 250}" y="${legendY + 52}" font-family="Arial" font-size="8" fill="#555">Gerado ${new Date().toLocaleDateString('pt-BR')}</text>`,
  )

  partes.push('</svg>')
  return { conteudo: partes.join('\n'), mimeType: 'image/svg+xml', extensao: 'svg' }
}

// ═══════════════════ DIAGRAMA PADRÃO DE ENTRADA (roteador por grupo) ═══════════════════
export function gerarPadraoEntradaSvg(projeto: any, homologacao?: any): { conteudo: string; mimeType: string; extensao: string } {
  const grupo = homologacao?.padrao_novo_grupo_tarifa || projeto?.analise_fatura?.subgrupo?.[0] || 'B'
  if (grupo === 'A') return gerarPadraoEntradaGrupoA(projeto, homologacao)
  return gerarPadraoEntradaGrupoB(projeto, homologacao)
}

// ═══════════════════ GRUPO B — BAIXA TENSÃO ═══════════════════
function gerarPadraoEntradaGrupoB(projeto: any, homologacao?: any): { conteudo: string; mimeType: string; extensao: string } {
  const padrao = projeto.padrao_entrada || {}
  const cliente = projeto.cliente_razao_social || 'Cliente'
  const uc = projeto.uc_geradora || padrao.uc || '—'
  const endereco = projeto.cliente_endereco?.logradouro || '—'
  const cidade = typeof projeto.cliente_endereco === 'object'
    ? `${projeto.cliente_endereco?.cidade || '—'}/${projeto.cliente_endereco?.uf || 'SC'}`
    : 'Tijucas/SC'

  const amperagem = homologacao?.padrao_novo_amperagem || padrao.amperagem_a || padrao.amperagem_nova || 63
  const tipoLigacao = padrao.tipo_ligacao || 'monofasico'
  const numFases = tipoLigacao === 'trifasico' ? 3 : tipoLigacao === 'bifasico' ? 2 : 1
  const secaoCabo = amperagem <= 40 ? '10mm²' : amperagem <= 63 ? '16mm²' : amperagem <= 100 ? '25mm²' : '35mm²'
  const bitolaEletroduto = amperagem <= 40 ? '32mm' : amperagem <= 63 ? '40mm' : amperagem <= 100 ? '50mm' : '75mm'

  // A4 retrato
  const W = 595, H = 842
  const partes: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`,
    // Cabeçalho
    `<text x="${W / 2}" y="40" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#000">PADRÃO DE ENTRADA CELESC — GRUPO B</text>`,
    `<text x="${W / 2}" y="58" text-anchor="middle" font-family="Arial" font-size="13" fill="#333">${amperagem}A ${numFases}F · Baixa Tensão</text>`,
    `<text x="${W / 2}" y="74" text-anchor="middle" font-family="Arial" font-size="12" fill="#333">${cliente} · UC ${uc}</text>`,
    `<text x="${W / 2}" y="88" text-anchor="middle" font-family="Arial" font-size="10" fill="#555">${endereco} · ${cidade}</text>`,
    // Norma referência
    `<text x="${W / 2}" y="103" text-anchor="middle" font-family="Arial" font-size="9" fill="#888">Referência: N-321.0001 e E-321.0031 (CELESC) · NBR 5410</text>`,
  ]

  // Elementos do padrão — layout vertical simples
  const centerX = W / 2
  let y = 130

  // 1. Poste da concessionária
  partes.push(
    `<circle cx="${centerX}" cy="${y}" r="8" fill="none" stroke="#000" stroke-width="2"/>`,
    `<text x="${centerX}" y="${y + 4}" text-anchor="middle" font-family="Arial" font-size="10" fill="#000">P</text>`,
    `<text x="${centerX + 20}" y="${y + 4}" font-family="Arial" font-size="10" fill="#333">Poste CELESC (rede aérea BT)</text>`,
  )
  y += 40

  // Linha entrada aérea
  partes.push(
    `<line x1="${centerX}" y1="${y - 32}" x2="${centerX}" y2="${y}" stroke="#000" stroke-width="1.5"/>`,
    `<text x="${centerX + 5}" y="${y - 15}" font-family="Arial" font-size="9" fill="#555">Ramal aéreo · ${numFases} fases + neutro</text>`,
  )

  // 2. Caixa medidor CELESC
  const caixaW = 120, caixaH = 90
  partes.push(
    `<rect x="${centerX - caixaW / 2}" y="${y}" width="${caixaW}" height="${caixaH}" fill="none" stroke="#000" stroke-width="2"/>`,
    `<text x="${centerX}" y="${y + 20}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#000">CAIXA MEDIDOR</text>`,
    `<text x="${centerX}" y="${y + 35}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">${numFases === 3 ? 'Tipo IV' : numFases === 2 ? 'Tipo II' : 'Tipo I'}</text>`,
    `<text x="${centerX}" y="${y + 50}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">Modelo CELESC padrão</text>`,
    `<text x="${centerX}" y="${y + 65}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">1,5m acima do solo</text>`,
    `<text x="${centerX}" y="${y + 80}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">Livre acesso ao leiturista</text>`,
    // Símbolo do medidor
    `<circle cx="${centerX}" cy="${y + caixaH + 15}" r="12" fill="none" stroke="#000" stroke-width="1.5"/>`,
    `<text x="${centerX}" y="${y + caixaH + 19}" text-anchor="middle" font-family="Arial" font-size="10" fill="#000">M</text>`,
  )
  y += caixaH + 45

  // Linha até disjuntor
  partes.push(
    `<line x1="${centerX}" y1="${y}" x2="${centerX}" y2="${y + 30}" stroke="#000" stroke-width="1.5"/>`,
    `<text x="${centerX + 5}" y="${y + 20}" font-family="Arial" font-size="9" fill="#555">Cabo ${secaoCabo} PP</text>`,
  )
  y += 40

  // 3. Disjuntor geral
  const djW = 70, djH = 40
  partes.push(
    `<rect x="${centerX - djW / 2}" y="${y}" width="${djW}" height="${djH}" fill="none" stroke="#000" stroke-width="2"/>`,
    `<text x="${centerX}" y="${y + 17}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#000">DJ ${amperagem}A</text>`,
    `<text x="${centerX}" y="${y + 31}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">${numFases === 3 ? 'Tripolar' : numFases === 2 ? 'Bipolar' : 'Monopolar'} · Curva C</text>`,
    `<text x="${centerX + djW / 2 + 10}" y="${y + 25}" font-family="Arial" font-size="9" fill="#555">Disjuntor geral</text>`,
  )
  y += djH + 20

  // 4. Aterramento — desce à direita do disjuntor
  const aterX = centerX + 100
  partes.push(
    // Cabo terra
    `<line x1="${centerX}" y1="${y - 10}" x2="${aterX}" y2="${y - 10}" stroke="#0a0" stroke-width="1.5" stroke-dasharray="4 2"/>`,
    `<line x1="${aterX}" y1="${y - 10}" x2="${aterX}" y2="${y + 40}" stroke="#0a0" stroke-width="1.5"/>`,
    `<text x="${aterX + 5}" y="${y + 5}" font-family="Arial" font-size="9" fill="#0a0">Cabo terra 16mm²</text>`,
    // Símbolo aterramento
    `<line x1="${aterX - 15}" y1="${y + 40}" x2="${aterX + 15}" y2="${y + 40}" stroke="#0a0" stroke-width="2"/>`,
    `<line x1="${aterX - 10}" y1="${y + 45}" x2="${aterX + 10}" y2="${y + 45}" stroke="#0a0" stroke-width="2"/>`,
    `<line x1="${aterX - 5}" y1="${y + 50}" x2="${aterX + 5}" y2="${y + 50}" stroke="#0a0" stroke-width="2"/>`,
    `<text x="${aterX}" y="${y + 68}" text-anchor="middle" font-family="Arial" font-size="9" fill="#0a0">Haste 5/8" x 2,4m</text>`,
    `<text x="${aterX}" y="${y + 80}" text-anchor="middle" font-family="Arial" font-size="8" fill="#0a0">(mín 1 haste)</text>`,
  )

  // Linha até QGBT
  partes.push(
    `<line x1="${centerX}" y1="${y}" x2="${centerX}" y2="${y + 40}" stroke="#000" stroke-width="1.5"/>`,
  )
  y += 50

  // 5. QGBT
  const qgbtW = 150, qgbtH = 70
  partes.push(
    `<rect x="${centerX - qgbtW / 2}" y="${y}" width="${qgbtW}" height="${qgbtH}" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="6 3"/>`,
    `<text x="${centerX}" y="${y + 22}" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="#000">QGBT DO CLIENTE</text>`,
    `<text x="${centerX}" y="${y + 40}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">Quadro Geral de Baixa Tensão</text>`,
    `<text x="${centerX}" y="${y + 55}" text-anchor="middle" font-family="Arial" font-size="9" fill="#555">(instalação interna)</text>`,
  )
  y += qgbtH + 30

  // ─── LEGENDA / MEMORIAL DE DIMENSIONAMENTO ───
  const memY = y + 20
  partes.push(
    `<text x="30" y="${memY}" font-family="Arial" font-size="10" font-weight="bold" fill="#000">MEMORIAL DE DIMENSIONAMENTO</text>`,
    `<text x="30" y="${memY + 18}" font-family="Arial" font-size="9" fill="#333">• Corrente nominal: ${amperagem} A</text>`,
    `<text x="30" y="${memY + 32}" font-family="Arial" font-size="9" fill="#333">• Tipo de ligação: ${tipoLigacao} (${numFases} fase${numFases > 1 ? 's' : ''} + neutro)</text>`,
    `<text x="30" y="${memY + 46}" font-family="Arial" font-size="9" fill="#333">• Secção mínima ramal: ${secaoCabo} (cobre isolação PP 750V)</text>`,
    `<text x="30" y="${memY + 60}" font-family="Arial" font-size="9" fill="#333">• Eletroduto: PVC rígido ${bitolaEletroduto} (interno) / aço galv. ${bitolaEletroduto} (externo)</text>`,
    `<text x="30" y="${memY + 74}" font-family="Arial" font-size="9" fill="#333">• Disjuntor geral: ${amperagem}A curva C, ${numFases === 3 ? 'tripolar' : numFases === 2 ? 'bipolar' : 'monopolar'}</text>`,
    `<text x="30" y="${memY + 88}" font-family="Arial" font-size="9" fill="#333">• Aterramento: mín 1 haste cobreada 5/8" x 2,4m + cabo cobre nu 16mm²</text>`,
    `<text x="30" y="${memY + 102}" font-family="Arial" font-size="9" fill="#333">• Caixa medidor: modelo homologado CELESC, altura 1,5m do solo</text>`,
  )

  if (homologacao?.padrao_novo_observacao) {
    partes.push(
      `<text x="30" y="${memY + 130}" font-family="Arial" font-size="9" font-style="italic" fill="#555">Observação: ${homologacao.padrao_novo_observacao.substring(0, 80)}</text>`,
    )
  }

  // Selo canto inferior
  partes.push(
    `<rect x="${W - 200}" y="${H - 90}" width="180" height="70" fill="none" stroke="#000" stroke-width="1"/>`,
    `<text x="${W - 195}" y="${H - 72}" font-family="Arial" font-size="8" font-weight="bold" fill="#000">SPIN SOLAR</text>`,
    `<text x="${W - 195}" y="${H - 58}" font-family="Arial" font-size="7" fill="#333">Padrão de Entrada CELESC</text>`,
    `<text x="${W - 195}" y="${H - 46}" font-family="Arial" font-size="7" fill="#333">Cliente: ${cliente.substring(0, 25)}</text>`,
    `<text x="${W - 195}" y="${H - 34}" font-family="Arial" font-size="7" fill="#333">UC: ${uc}</text>`,
    `<text x="${W - 195}" y="${H - 22}" font-family="Arial" font-size="7" fill="#555">Gerado ${new Date().toLocaleDateString('pt-BR')}</text>`,
  )

  partes.push('</svg>')
  return { conteudo: partes.join('\n'), mimeType: 'image/svg+xml', extensao: 'svg' }
}

// ═══════════════════ GRUPO A — MÉDIA TENSÃO (subestação com TC/TP) ═══════════════════
function gerarPadraoEntradaGrupoA(projeto: any, homologacao?: any): { conteudo: string; mimeType: string; extensao: string } {
  const padrao = projeto.padrao_entrada || {}
  const cliente = projeto.cliente_razao_social || 'Cliente'
  const uc = projeto.uc_geradora || padrao.uc || '—'
  const endereco = projeto.cliente_endereco?.logradouro || '—'
  const cidade = typeof projeto.cliente_endereco === 'object'
    ? `${projeto.cliente_endereco?.cidade || '—'}/${projeto.cliente_endereco?.uf || 'SC'}`
    : 'Tijucas/SC'

  const tensaoMT = homologacao?.padrao_novo_tensao_v || 13800
  const amperagemBT = homologacao?.padrao_novo_amperagem || padrao.amperagem_a || 200
  const potenciaTrafoKVA =
    amperagemBT <= 100 ? 45 :
    amperagemBT <= 150 ? 75 :
    amperagemBT <= 250 ? 112.5 :
    amperagemBT <= 400 ? 225 : 300
  const bitolaMT = potenciaTrafoKVA <= 75 ? '10mm²' : potenciaTrafoKVA <= 150 ? '16mm²' : '25mm²'

  // A4 retrato
  const W = 595, H = 842
  const partes: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`,
    // Cabeçalho — grupo A destacado
    `<text x="${W / 2}" y="38" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#000">PADRÃO DE ENTRADA CELESC — GRUPO A</text>`,
    `<text x="${W / 2}" y="56" text-anchor="middle" font-family="Arial" font-size="13" fill="#333">${tensaoMT}V (Média Tensão) · Trafo ${potenciaTrafoKVA} kVA · BT ${amperagemBT}A</text>`,
    `<text x="${W / 2}" y="72" text-anchor="middle" font-family="Arial" font-size="12" fill="#333">${cliente} · UC ${uc}</text>`,
    `<text x="${W / 2}" y="86" text-anchor="middle" font-family="Arial" font-size="10" fill="#555">${endereco} · ${cidade}</text>`,
    `<text x="${W / 2}" y="101" text-anchor="middle" font-family="Arial" font-size="9" fill="#888">Ref: N-321.0002 (Fornecimento MT) · I-432.0004 (GD) · NBR 14039</text>`,
  ]

  const centerX = W / 2
  let y = 135

  // 1. Poste concessionária MT
  partes.push(
    `<circle cx="${centerX}" cy="${y}" r="10" fill="none" stroke="#000" stroke-width="2"/>`,
    `<text x="${centerX}" y="${y + 4}" text-anchor="middle" font-family="Arial" font-size="9" fill="#000">P</text>`,
    `<text x="${centerX + 20}" y="${y - 4}" font-family="Arial" font-size="10" fill="#333">Poste CELESC — Ramal aéreo MT</text>`,
    `<text x="${centerX + 20}" y="${y + 8}" font-family="Arial" font-size="9" fill="#555">${tensaoMT}V · 3 fases (sem neutro)</text>`,
  )
  y += 35

  // Linha vertical MT
  partes.push(
    `<line x1="${centerX}" y1="${y - 25}" x2="${centerX}" y2="${y + 25}" stroke="#000" stroke-width="2"/>`,
    `<text x="${centerX + 8}" y="${y - 5}" font-family="Arial" font-size="9" fill="#555">Cabo MT ${bitolaMT}</text>`,
  )
  y += 35

  // 2. Chave seccionadora tripolar 15kV + para-raios
  const chaveW = 100
  partes.push(
    `<rect x="${centerX - chaveW / 2}" y="${y}" width="${chaveW}" height="55" fill="none" stroke="#000" stroke-width="2"/>`,
    `<text x="${centerX}" y="${y + 18}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#000">CHAVE SECC. 15kV</text>`,
    `<text x="${centerX}" y="${y + 32}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">Tripolar + Para-raios</text>`,
    `<text x="${centerX}" y="${y + 46}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">Muflas terminais</text>`,
    // Símbolos chave e para-raios ao lado
    `<line x1="${centerX + chaveW / 2 + 8}" y1="${y + 15}" x2="${centerX + chaveW / 2 + 22}" y2="${y + 5}" stroke="#000" stroke-width="1.5"/>`,
    `<polygon points="${centerX + chaveW / 2 + 28},${y + 25} ${centerX + chaveW / 2 + 22},${y + 40} ${centerX + chaveW / 2 + 34},${y + 40}" fill="#000"/>`,
    `<line x1="${centerX + chaveW / 2 + 28}" y1="${y + 40}" x2="${centerX + chaveW / 2 + 28}" y2="${y + 50}" stroke="#000" stroke-width="1"/>`,
  )
  y += 75

  // Linha MT → cubículo
  partes.push(
    `<line x1="${centerX}" y1="${y - 20}" x2="${centerX}" y2="${y + 20}" stroke="#000" stroke-width="2"/>`,
  )
  y += 30

  // 3. Cubículo de medição (TC/TP + medidor 4 quadrantes)
  const cubW = 190, cubH = 130
  partes.push(
    `<rect x="${centerX - cubW / 2}" y="${y}" width="${cubW}" height="${cubH}" fill="none" stroke="#000" stroke-width="2"/>`,
    `<text x="${centerX}" y="${y + 20}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="bold" fill="#000">CUBÍCULO DE MEDIÇÃO MT</text>`,
    // TC
    `<rect x="${centerX - 70}" y="${y + 35}" width="45" height="30}" fill="#F5F5F5" stroke="#000" stroke-width="1"/>`,
    `<text x="${centerX - 47}" y="${y + 54}" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#000">TC</text>`,
    // TP
    `<rect x="${centerX + 25}" y="${y + 35}" width="45" height="30}" fill="#F5F5F5" stroke="#000" stroke-width="1"/>`,
    `<text x="${centerX + 48}" y="${y + 54}" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#000">TP</text>`,
    // Medidor 4Q
    `<rect x="${centerX - 40}" y="${y + 80}" width="80" height="30" fill="#F5F5F5" stroke="#000" stroke-width="1"/>`,
    `<text x="${centerX}" y="${y + 92}" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#000">MEDIDOR 4Q</text>`,
    `<text x="${centerX}" y="${y + 104}" text-anchor="middle" font-family="Arial" font-size="8" fill="#333">Bidirecional</text>`,
    // Ligações TC/TP → medidor (fios pontilhados)
    `<line x1="${centerX - 47}" y1="${y + 65}" x2="${centerX - 30}" y2="${y + 80}" stroke="#000" stroke-width="0.5" stroke-dasharray="2 2"/>`,
    `<line x1="${centerX + 48}" y1="${y + 65}" x2="${centerX + 30}" y2="${y + 80}" stroke="#000" stroke-width="0.5" stroke-dasharray="2 2"/>`,
  )
  y += cubH + 20

  // 4. Transformador de força (MT → BT)
  const trafoW = 130, trafoH = 90
  partes.push(
    `<rect x="${centerX - trafoW / 2}" y="${y}" width="${trafoW}" height="${trafoH}" fill="none" stroke="#000" stroke-width="2"/>`,
    // Símbolo trafo (dois círculos)
    `<circle cx="${centerX - 20}" cy="${y + 45}" r="18" fill="none" stroke="#000" stroke-width="1.5"/>`,
    `<circle cx="${centerX + 20}" cy="${y + 45}" r="18" fill="none" stroke="#000" stroke-width="1.5"/>`,
    // Rótulos
    `<text x="${centerX}" y="${y + 15}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#000">TRAFO ${potenciaTrafoKVA} kVA</text>`,
    `<text x="${centerX}" y="${y + 82}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">${tensaoMT}V / 220-380V</text>`,
  )

  // Aterramento lateral (malha)
  const aterX = centerX + 120
  partes.push(
    `<line x1="${centerX + trafoW / 2}" y1="${y + 45}" x2="${aterX}" y2="${y + 45}" stroke="#0a0" stroke-width="1.5" stroke-dasharray="4 2"/>`,
    `<line x1="${aterX}" y1="${y + 45}" x2="${aterX}" y2="${y + 90}" stroke="#0a0" stroke-width="1.5"/>`,
    `<line x1="${aterX - 20}" y1="${y + 90}" x2="${aterX + 20}" y2="${y + 90}" stroke="#0a0" stroke-width="2"/>`,
    `<line x1="${aterX - 14}" y1="${y + 95}" x2="${aterX + 14}" y2="${y + 95}" stroke="#0a0" stroke-width="2"/>`,
    `<line x1="${aterX - 8}" y1="${y + 100}" x2="${aterX + 8}" y2="${y + 100}" stroke="#0a0" stroke-width="2"/>`,
    `<text x="${aterX}" y="${y + 115}" text-anchor="middle" font-family="Arial" font-size="8" fill="#0a0">Malha 3×3m</text>`,
    `<text x="${aterX}" y="${y + 125}" text-anchor="middle" font-family="Arial" font-size="8" fill="#0a0">R ≤ 10Ω</text>`,
  )
  y += trafoH + 15

  // Linha BT → disjuntor
  partes.push(
    `<line x1="${centerX}" y1="${y}" x2="${centerX}" y2="${y + 25}" stroke="#000" stroke-width="2"/>`,
  )
  y += 30

  // 5. Disjuntor geral BT
  const djW = 100, djH = 45
  partes.push(
    `<rect x="${centerX - djW / 2}" y="${y}" width="${djW}" height="${djH}" fill="none" stroke="#000" stroke-width="2"/>`,
    `<text x="${centerX}" y="${y + 20}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="bold" fill="#000">DJ GERAL ${amperagemBT}A</text>`,
    `<text x="${centerX}" y="${y + 35}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">Tripolar · Curva C</text>`,
  )
  y += djH + 15

  // Linha → QGBT
  partes.push(
    `<line x1="${centerX}" y1="${y}" x2="${centerX}" y2="${y + 20}" stroke="#000" stroke-width="1.5"/>`,
  )
  y += 25

  // 6. QGBT
  const qgbtW = 150, qgbtH = 45
  partes.push(
    `<rect x="${centerX - qgbtW / 2}" y="${y}" width="${qgbtW}" height="${qgbtH}" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="6 3"/>`,
    `<text x="${centerX}" y="${y + 20}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="bold" fill="#000">QGBT DO CLIENTE</text>`,
    `<text x="${centerX}" y="${y + 35}" text-anchor="middle" font-family="Arial" font-size="9" fill="#555">Distribuição interna</text>`,
  )

  // Selo canto inferior
  partes.push(
    `<rect x="${W - 250}" y="${H - 80}" width="230" height="60" fill="none" stroke="#000" stroke-width="1"/>`,
    `<text x="${W - 245}" y="${H - 63}" font-family="Arial" font-size="8" font-weight="bold" fill="#000">SPIN SOLAR — Padrão Grupo A</text>`,
    `<text x="${W - 245}" y="${H - 50}" font-family="Arial" font-size="7" fill="#333">Cliente: ${cliente.substring(0, 30)}</text>`,
    `<text x="${W - 245}" y="${H - 40}" font-family="Arial" font-size="7" fill="#333">UC: ${uc} · ${potenciaTrafoKVA}kVA · BT ${amperagemBT}A</text>`,
    `<text x="${W - 245}" y="${H - 28}" font-family="Arial" font-size="7" fill="#555">Gerado ${new Date().toLocaleDateString('pt-BR')}</text>`,
  )

  partes.push('</svg>')
  return { conteudo: partes.join('\n'), mimeType: 'image/svg+xml', extensao: 'svg' }
}

// ═══════════════════ HELPERS ═══════════════════
function csvEsc(s: string): string {
  if (!s) return ''
  const str = String(s)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}
