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

// ═══════════════════ LAYOUT INSTALAÇÃO (SVG simples) ═══════════════════
export function gerarLayoutSvg(projeto: any): { conteudo: string; mimeType: string; extensao: string } {
  const secoes = projeto.telhado_secoes || []
  const qtdPlacas = projeto.kit_selecionado?.qtd_placas || 0

  // SVG A4 paisagem
  const W = 1190, H = 842
  const partes: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`,
    `<text x="${W / 2}" y="50" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold" fill="#000">`,
    `LAYOUT DE INSTALAÇÃO — ${(projeto.cliente_razao_social || 'Cliente').substring(0, 50)}</text>`,
    `<text x="${W / 2}" y="75" text-anchor="middle" font-family="Arial" font-size="14" fill="#555">${projeto.codigo || ''} · ${qtdPlacas} módulos ${projeto.kit_selecionado?.placa_modelo || 'FV 550Wp'}</text>`,
  ]

  // Desenha cada seção do telhado
  const marginX = 100, marginY = 130
  const areaW = W - marginX * 2
  const areaH = H - marginY - 150

  if (secoes.length === 0) {
    partes.push(
      `<rect x="${marginX}" y="${marginY}" width="${areaW}" height="${areaH}" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="10 5"/>`,
      `<text x="${W / 2}" y="${marginY + areaH / 2}" text-anchor="middle" font-family="Arial" font-size="18" fill="#888">Sem informação de telhado</text>`,
    )
  } else {
    // Divide horizontal por seção
    const larguraSecao = areaW / secoes.length
    secoes.forEach((s: any, i: number) => {
      const x = marginX + i * larguraSecao + 10
      const w = larguraSecao - 20
      const numPlacas = s.qtd_placas || Math.floor(qtdPlacas / secoes.length)
      partes.push(
        `<rect x="${x}" y="${marginY}" width="${w}" height="${areaH}" fill="#E8F4FD" stroke="#000" stroke-width="2"/>`,
        `<text x="${x + w / 2}" y="${marginY + 25}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#000">Seção ${i + 1}</text>`,
        `<text x="${x + w / 2}" y="${marginY + 45}" text-anchor="middle" font-family="Arial" font-size="11" fill="#333">${s.tipo_cobertura || 'cobertura'} · ${s.area_m2 || '—'}m²</text>`,
        `<text x="${x + w / 2}" y="${marginY + 62}" text-anchor="middle" font-family="Arial" font-size="11" fill="#333">Orient. ${s.orientacao || '—'} · Incl. ${s.inclinacao_graus || '—'}°</text>`,
      )
      // Desenha placas como grid dentro da seção
      const cols = Math.min(8, Math.ceil(Math.sqrt(numPlacas)))
      const rows = Math.ceil(numPlacas / cols)
      const gridStartY = marginY + 90
      const gridH = areaH - 120
      const placaW = (w - 20) / cols
      const placaH = Math.min(30, (gridH - 20) / rows)
      for (let p = 0; p < numPlacas; p++) {
        const col = p % cols
        const row = Math.floor(p / cols)
        const px = x + 10 + col * placaW
        const py = gridStartY + row * (placaH + 2)
        partes.push(
          `<rect x="${px}" y="${py}" width="${placaW - 4}" height="${placaH}" fill="#1e40af" stroke="#000" stroke-width="0.5"/>`,
        )
      }
      partes.push(
        `<text x="${x + w / 2}" y="${marginY + areaH - 15}" text-anchor="middle" font-family="Arial" font-size="12" fill="#000">${numPlacas} placas</text>`,
      )
    })
  }

  // Legenda
  partes.push(
    `<g transform="translate(${marginX}, ${H - 100})">`,
    `<rect x="0" y="0" width="20" height="15" fill="#1e40af" stroke="#000"/>`,
    `<text x="30" y="12" font-family="Arial" font-size="12" fill="#000">Módulo FV ${projeto.kit_selecionado?.placa_modelo || 'WEG 550Wp'}</text>`,
    `<text x="0" y="35" font-family="Arial" font-size="10" fill="#555">Gerado automaticamente em ${new Date().toLocaleDateString('pt-BR')} — Spin Solar</text>`,
    `</g>`,
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
