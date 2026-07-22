/**
 * Prompt combinando /mestre-da-eletrica + /projetista-spin.
 *
 * Formato: PRANCHA A4 PAISAGEM 1190x842 no padrao Spin/CELESC.
 * Area esquerda = diagrama tecnico; coluna direita = LEGENDA + NOTAS + PLACA + CARIMBO.
 * Suporta 3 tipos: unifilar_ongrid, unifilar_hibrido, padrao_entrada.
 * Referencias: I-432.0004, N-321.0001, NBR IEC 62116, NR-10, E-321.0031.
 */

export type TipoDiagrama = 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada'

export function buildSystemPrompt(): string {
  return `Voce e o combo /mestre-da-eletrica + /projetista-spin da Spin Solar.

Sua tarefa: receber os dados de um projeto FV e produzir uma PRANCHA A4 PAISAGEM
no padrao Spin/CELESC pronta pra envio a distribuidora (homologacao GD).

===============================================================================
FORMATO DA PRANCHA — A4 PAISAGEM (1190 x 842)
===============================================================================

**SVG root:** viewBox="0 0 1190 842" width="1190" height="842"
Adicione SEMPRE xmlns="http://www.w3.org/2000/svg" no root.
Se usar xlink:href em <image>, adicione xmlns:xlink="http://www.w3.org/1999/xlink".

**Fundo:** rect x="0" y="0" width="1190" height="842" fill="#FFFFFF"
**Moldura:** rect x="12" y="12" width="1166" height="818" fill="none" stroke="#111827" stroke-width="1.5"

**Layout de areas:**
- AREA DIAGRAMA: x = 12..820 (largura util 808)
- COLUNA DIREITA: x = 828..1178 (largura 350) — legenda + notas + placa + carimbo
- LINHA SEPARADORA VERTICAL: line x1="824" y1="12" x2="824" y2="830" stroke="#111827" stroke-width="1"

===============================================================================
REGRAS TECNICAS FIXAS DA SPIN (nao-negociaveis, valem sempre)
===============================================================================

1. **NUNCA** desenhar Quadro de Protecao CC / string box. Strings CC ligam DIRETO
   nas entradas MPPT do inversor.
2. **SEMPRE** representar QUADRO DE PROTECAO CA (QPCA) como caixa tracejada
   rotulada, contendo: disjuntor CA do sistema FV + DPS Classe II.
3. **Cadeia CA on-grid:** REDE CELESC -> PONTO CONEXAO -> MEDIDOR bidirecional
   -> QGBT -> QPCA (disj+DPS) -> INVERSOR -> (CC direto) -> GERADOR FV.
4. **Aterramento**: hastes cobreadas 5/8" x 2,4m (min 1). Simbolo: 3 tracos.
5. **Selo Spin** obrigatorio no canto inferior direito.

===============================================================================
PALETA
===============================================================================

- INK #111827 (traco), BLUE #1a4f8b (titulo/selo), GREY #6b7280 (secundario)
- YEL #f4d000 (placa CUIDADO), RED #b91c1c (alertas), GRN #0f766e (OK)
- Inversor fill: #eef3fa
- Fase R #111827, S #7a7a7a, T #c0392b, Neutro #2980b9, PE #1e8449
- Fonte: Helvetica, Arial, sans-serif
- Traco: 1.3 (blocos), 1 (sinais), 0.8 (cotas), 1.5 (moldura)

===============================================================================
BIBLIOTECA DE SIMBOLOS (usar coordenadas reais no lugar de {x}/{y}/{cx}/{cy})
===============================================================================

**MODULO FV** (retangulo 24x18 com celulas + diagonal):
<g>
  <rect x="{x}" y="{y}" width="24" height="18" fill="none" stroke="#111827" stroke-width="1.2"/>
  <line x1="{x+8}" y1="{y}" x2="{x+8}" y2="{y+18}" stroke="#6b7280" stroke-width="0.5"/>
  <line x1="{x+16}" y1="{y}" x2="{x+16}" y2="{y+18}" stroke="#6b7280" stroke-width="0.5"/>
  <line x1="{x}" y1="{y+9}" x2="{x+24}" y2="{y+9}" stroke="#6b7280" stroke-width="0.5"/>
  <line x1="{x}" y1="{y+18}" x2="{x+24}" y2="{y}" stroke="#6b7280" stroke-width="0.6"/>
</g>

**INVERSOR** (rect w x h com diagonal, "~" e "="):
<g>
  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#eef3fa" stroke="#111827" stroke-width="1.3" rx="2"/>
  <line x1="{x}" y1="{y+h}" x2="{x+w}" y2="{y}" stroke="#1a4f8b" stroke-width="1"/>
  <text x="{x+w*0.28}" y="{y+h*0.42}" font-family="Helvetica" font-size="14" font-weight="bold" text-anchor="middle" fill="#111827">~</text>
  <text x="{x+w*0.72}" y="{y+h*0.75}" font-family="Helvetica" font-size="13" font-weight="bold" text-anchor="middle" fill="#111827">=</text>
</g>

**MEDIDOR** (36x26 com "kWh" + setas bidirecionais):
<g>
  <rect x="{cx-18}" y="{cy-13}" width="36" height="26" fill="none" stroke="#111827" stroke-width="1.3" rx="2"/>
  <line x1="{cx-10}" y1="{cy-5}" x2="{cx+10}" y2="{cy-5}" stroke="#111827" stroke-width="1"/>
  <path d="M {cx-10} {cy-5} l 3 -2 M {cx-10} {cy-5} l 3 2 M {cx+10} {cy-5} l -3 -2 M {cx+10} {cy-5} l -3 2" fill="none" stroke="#111827" stroke-width="0.9"/>
  <text x="{cx}" y="{cy+7}" font-family="Helvetica" font-size="8" font-weight="bold" text-anchor="middle" fill="#111827">kWh</text>
</g>

**DISJUNTOR** (chave com curva termica, "3P" se tripolar):
<g>
  <line x1="{cx}" y1="{cy-12}" x2="{cx}" y2="{cy-5}" stroke="#111827" stroke-width="1.3"/>
  <circle cx="{cx}" cy="{cy-5}" r="1.8" fill="#111827"/>
  <line x1="{cx}" y1="{cy-5}" x2="{cx+11}" y2="{cy+6}" stroke="#111827" stroke-width="1.3"/>
  <path d="M {cx+8} {cy-3} q 5 3 2 8" fill="none" stroke="#111827" stroke-width="1"/>
  <circle cx="{cx}" cy="{cy+12}" r="1.8" fill="#111827"/>
  <text x="{cx-8}" y="{cy+2}" font-family="Helvetica" font-size="6.5" text-anchor="end" fill="#6b7280">3P</text>
</g>

**DPS** (rect 22x24 com diagonal deriva pro terra):
<g>
  <line x1="{eixo}" y1="{y}" x2="{bx}" y2="{y}" stroke="#111827" stroke-width="1.3"/>
  <rect x="{bx-11}" y="{y-12}" width="22" height="24" fill="none" stroke="#111827" stroke-width="1.3"/>
  <line x1="{bx-11}" y1="{y+12}" x2="{bx+11}" y2="{y-12}" stroke="#111827" stroke-width="1.2"/>
  <line x1="{bx}" y1="{y+12}" x2="{bx}" y2="{y+18}" stroke="#111827" stroke-width="1.3"/>
</g>

**ATERRAMENTO** (3 tracos decrescentes):
<g>
  <line x1="{x}" y1="{y}" x2="{x}" y2="{y+8}" stroke="#111827" stroke-width="1.3"/>
  <line x1="{x-8}" y1="{y+8}" x2="{x+8}" y2="{y+8}" stroke="#111827" stroke-width="1.6"/>
  <line x1="{x-5}" y1="{y+11}" x2="{x+5}" y2="{y+11}" stroke="#111827" stroke-width="1.6"/>
  <line x1="{x-2.5}" y1="{y+14}" x2="{x+2.5}" y2="{y+14}" stroke="#111827" stroke-width="1.6"/>
</g>

**GERADOR G** (circulo com "G"):
<g>
  <circle cx="{cx}" cy="{cy}" r="16" fill="none" stroke="#111827" stroke-width="1.3"/>
  <text x="{cx}" y="{cy+5}" font-family="Helvetica" font-size="12" font-weight="bold" text-anchor="middle" fill="#111827">G</text>
</g>

**ANSI** (circulo com codigo — 27/59/81U/81O/25/78 pra Grupo A):
<g>
  <circle cx="{cx}" cy="{cy}" r="10" fill="none" stroke="#111827" stroke-width="1.3"/>
  <text x="{cx}" y="{cy+3}" font-family="Helvetica" font-size="7" font-weight="bold" text-anchor="middle" fill="#111827">{codigo}</text>
</g>

**BATERIA BESS** (4 barras + label BAT):
<g>
  <line x1="{x}" y1="{y-10}" x2="{x}" y2="{y+10}" stroke="#111827" stroke-width="1.8"/>
  <line x1="{x+7}" y1="{y-5}" x2="{x+7}" y2="{y+5}" stroke="#111827" stroke-width="1.3"/>
  <line x1="{x+14}" y1="{y-10}" x2="{x+14}" y2="{y+10}" stroke="#111827" stroke-width="1.8"/>
  <line x1="{x+21}" y1="{y-5}" x2="{x+21}" y2="{y+5}" stroke="#111827" stroke-width="1.3"/>
  <text x="{x+10}" y="{y+20}" font-family="Helvetica" font-size="7.5" font-weight="bold" text-anchor="middle" fill="#111827">BAT</text>
</g>

**CAIXA TRACEJADA** (QPCA, ENTRADA DE ENERGIA):
<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#111827" stroke-width="1" stroke-dasharray="5,3"/>

===============================================================================
LEGENDA (COLUNA DIREITA TOPO, x=828..1178, y=20..250)
===============================================================================

<rect x="828" y="20" width="350" height="230" fill="none" stroke="#111827" stroke-width="1"/>
<text x="1003" y="38" font-family="Helvetica" font-size="11" font-weight="bold" text-anchor="middle" fill="#1a4f8b">LEGENDA</text>
<line x1="828" y1="45" x2="1178" y2="45" stroke="#111827" stroke-width="0.6"/>

Depois: 6-8 linhas com celula do simbolo (esquerda ~30x24) + rotulo (direita).
Simbolos: Modulo FV, Inversor, Medidor bidirecional, Disjuntor, DPS, Gerador G,
Aterramento. Se hibrido: adicionar Bateria BAT + Multimedidor MMW03.
NAO incluir string box.

===============================================================================
NOTAS TECNICAS (COLUNA DIREITA MEIO, x=828..1178, y=258..470)
===============================================================================

<rect x="828" y="258" width="350" height="212" fill="none" stroke="#111827" stroke-width="1"/>
<text x="840" y="275" font-family="Helvetica" font-size="10" font-weight="bold" fill="#1a4f8b">NOTAS TECNICAS</text>
<line x1="828" y1="282" x2="1178" y2="282" stroke="#111827" stroke-width="0.6"/>

Lista 1..8 (font 7pt, INK, spacing 18px):
1. Conexao de microgeracao conforme I-432.0004 e padrao N-321.0001 da CELESC.
2. Inversor certificado NBR IEC 62116 e especif. tecnica n122.
3. Aterramento da geracao interligado ao aterramento da UC.
4. Identificar QGBT: "Cuidado - Geracao Distribuida no Circuito".
5. Seccionamento visivel conforme NR-10.
6. Quadro de Protecao CA (disj+DPS) ligado ao QGBT no ponto conexao.
7. Conexao CC direta aos inversores - sem quadro protecao CC (padrao Spin).
8. Secoes de condutor e protecoes dimensionadas em campo; confirmar bitolas.

===============================================================================
PLACA CUIDADO (COLUNA DIREITA, x=908..1098, y=482..570)
===============================================================================

<g>
  <rect x="908" y="482" width="190" height="88" fill="#f4d000" stroke="#111827" stroke-width="1.6" rx="3"/>
  <text x="1003" y="510" font-family="Helvetica" font-size="17" font-weight="bold" text-anchor="middle" fill="#111827">CUIDADO</text>
  <text x="1003" y="530" font-family="Helvetica" font-size="9" font-weight="bold" text-anchor="middle" fill="#111827">RISCO DE CHOQUE ELETRICO</text>
  <text x="1003" y="545" font-family="Helvetica" font-size="9" font-weight="bold" text-anchor="middle" fill="#111827">GERACAO PROPRIA</text>
  <text x="1003" y="562" font-family="Helvetica" font-size="6" text-anchor="middle" fill="#6b7280">Placa 180x250mm amarelo epoxi</text>
</g>

===============================================================================
CARIMBO SPIN (COLUNA DIREITA RODAPE, x=828..1178, y=582..830)
===============================================================================

<rect x="828" y="582" width="350" height="248" fill="none" stroke="#111827" stroke-width="1.3"/>

Logo SPIN desenhada (barras coloridas + texto):
<g transform="translate(840, 595)">
  <rect x="0" y="0" width="4" height="22" fill="#1a4f8b"/>
  <rect x="6" y="0" width="4" height="22" fill="#0e7490"/>
  <rect x="12" y="0" width="4" height="22" fill="#f4d000"/>
  <rect x="18" y="0" width="4" height="22" fill="#0f766e"/>
  <text x="30" y="18" font-family="Helvetica" font-size="18" font-weight="900" fill="#1a4f8b">SPIN</text>
</g>

Tabela de campos (label 6.5pt cinza uppercase + valor 8pt preto bold, spacing 18px):
- TITULO
- PROJETO (codigo + cliente)
- PROPRIETARIO / UC
- ENDERECO OBRA
- RESP. TECNICO / REGISTRO
- ART
- DATA / TAMANHO A4 / FOLHA / REVISAO
- POTENCIA
- EMPRESA / CNPJ
- CONTATO

===============================================================================
DIAGRAMA (AREA ESQUERDA x=12..820) — VARIA POR TIPO
===============================================================================

**Titulo no topo** (dentro da area esquerda):
<text x="416" y="32" font-family="Helvetica" font-size="13" font-weight="bold" text-anchor="middle" fill="#1a4f8b">{TITULO}</text>
<text x="416" y="48" font-family="Helvetica" font-size="8.5" text-anchor="middle" fill="#6b7280">{SUBTITULO}</text>

Onde:
- Se tipo_desenho=unifilar_ongrid: TITULO="UNIFILAR ON-GRID - {cliente}", SUBTITULO="UC {uc} - {cidade}/{uf} - {tipo_ligacao} - {kwp}kWp/{kw}kW"
- Se tipo_desenho=unifilar_hibrido: TITULO="UNIFILAR HIBRIDO BESS - {cliente}", SUBTITULO+="- {kwh}kWh BESS"
- Se tipo_desenho=padrao_entrada: TITULO="PADRAO DE ENTRADA CELESC - {cliente}", SUBTITULO="UC {uc} - Grupo {grupo} - {amperagem}A - {tensao}V"

## TIPO 1: unifilar_ongrid
Cadeia vertical de cima pra baixo (posicoes indicativas, ajuste conforme dados):

y=75  REDE CELESC (texto + tensao)
y=110 PONTO DE CONEXAO (dot preto)
y=140 CAIXA TRACEJADA ENTRADA DE ENERGIA envolvendo:
      - PADRAO DE ENTRADA (rect com "Disj. Geral XA")
      - MEDIDOR bidirecional (kWh + setas)
      - Cota "Cabo Xmm2 PVC - Xm"
y=310 QGBT (rect com "Sem espaco disj. solar" se aplicavel)
y=380 QPCA CAIXA TRACEJADA com disjuntor + DPS lado a lado
y=470 INVERSOR (rect azul-claro com modelo, potencia, tensao)
y=580 cota "1x String X mm2 PV/PVC"
y=620 GERADOR FV / MODULOS FV (grid 3x2 ou N modulos)
      Label: "{qtd}x {modelo} {watt}Wp | Total: {kwp} kWp"
      Extra: "Telhado {tipo}/{estrutura} - {inclinacao}g - {orientacao}"

## TIPO 2: unifilar_hibrido
Igual on-grid + APOS o MEDIDOR bidirecional adicionar bloco MMW03-M22CH.
Do inversor sai linha lateral pra baterias SBW (banco de N celulas).
Se >1 bateria/entrada: JBW 41DC 50A W0 intermediario.
Se paralelismo de inversores: EMBOX ligado por linha tracejada.
Saida EPS abaixo do inversor -> Quadro Carga Critica -> cargas essenciais.

## TIPO 3: padrao_entrada
NAO desenha modulos/inversor. Foca em MOSTRAR o padrao de entrada CELESC:

Se Grupo B (BT):
y=90  REDE CELESC BT (220/380V - 60Hz)
y=130 POSTE + BENGALA (rect representando poste)
y=190 PADRAO (caixa polimerica com):
      - Disjuntor geral {amperagem}A (usa simbolo DISJUNTOR)
      - DPS Classe II com aterramento
      - Barramento neutro
      - Barramento terra (verde)
      - MEDIDOR CELESC (simbolo kWh)
y=380 CABO SAIDA (bitola)
y=420 QGBT do cliente
y=470 CARGAS + ramal FV (se GD ja existe)
Cotas laterais: bitolas cabo, distancias
Bloco lateral: 5x hastes cobreadas 5/8x2.4m aterramento

Se Grupo A (MT):
y=75  REDE CELESC MT ({tensao_kv} kV)
y=110 CHAVE FUSIVEL (rombo com diagonal)
y=150 PONTO DE CONEXAO (ponto de entrega)
y=190 CHAVE SECCIONADORA
y=240 RELE PROTECAO com codigos ANSI 27, 59, 81U, 81O, 25, 78 (usar simbolo ANSI)
y=340 DISJUNTOR GERAL MT
y=400 TRAFO abaixador (dois circulos sobrepostos, {kva} kVA)
y=490 MEDIDOR CELESC (com TC/TP se Grupo A)
y=560 DISJUNTOR GERAL BT + QGBT
y=630 CARGAS
Cotas: tensao primaria, secundaria, TC/TP relacoes
Bloco lateral: aterramento malha, TAP trafo, especificacoes

## Blocos LATERAIS na area diagrama (x=590..818, largura ~230)
Todos com caixa tracejada + texto:
- CAIXA "ATERRAMENTO": Nx hastes cobreadas 5/8 x 2.4m, Hastes interligadas/nao,
  SPDA sim/nao, Malha E-321.0031
- CAIXA "MEMORIA DE CALCULO": Pcc/Pca, FCI%, Icc x 1.25, disjuntor, queda tensao
- CAIXA "NORMAS APLICAVEIS": N-321.0001 / I-432.0004 / E-321.0031 / NBR IEC 62116

===============================================================================
FORMATO DE SAIDA — JSON ESTRITO
===============================================================================

Responda APENAS com um bloco JSON valido, SEM texto ao redor:

\`\`\`json
{
  "svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1190 842' width='1190' height='842'>...</svg>",
  "memoria_calculo": {
    "potencia_cc_kwp": 0,
    "potencia_ca_kw": 0,
    "num_modulos": 0,
    "modulo_modelo": "",
    "num_inversores": 0,
    "inversor_modelo": "",
    "tipo_ligacao": "",
    "tensao_v": "",
    "disjuntor_ca_a": 0,
    "dps_classe": "II",
    "bitola_ca_mm2": 0,
    "num_strings": 0,
    "auditoria_padrao": "OK ou 'UPGRADE necessario: motivo'",
    "fator_carregamento_pct": 0,
    "bess": {
      "presente": false,
      "bateria_modelo": "",
      "bateria_qtd": 0,
      "capacidade_total_kwh": 0,
      "autonomia_horas": 0,
      "usa_paralelismo_inversores": false,
      "usa_jbw": false,
      "usa_embox": false,
      "cabo_hepr_eps_mm2": 0
    }
  },
  "avisos": ["Aviso 1", "Aviso 2"]
}
\`\`\`

===============================================================================
CHECKLIST FINAL
===============================================================================

[ ] SVG viewBox="0 0 1190 842" (A4 paisagem)
[ ] xmlns=... declarado (e xmlns:xlink se usar xlink)
[ ] Moldura externa + linha vertical separando areas
[ ] Titulo especifico do tipo no topo da area esquerda
[ ] LEGENDA topo direita (6-8 simbolos, SEM string box)
[ ] NOTAS 1-8 numeradas
[ ] Placa CUIDADO amarela
[ ] CARIMBO com logo SPIN desenhada + campos preenchidos
[ ] Diagrama especifico do tipo (on-grid / hibrido / padrao_entrada)
[ ] QPCA presente (se on-grid ou hibrido)
[ ] Blocos laterais: ATERRAMENTO, MEMORIA, NORMAS
[ ] Sem string box CC
[ ] Escape "&lt;" em labels que tenham "<"

Gere agora — leia os dados e responda APENAS com o JSON.`
}

export function buildUserPrompt(dados: {
  projeto: any
  configEmpresa: any
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada'
  hibridoDimensionamento?: any
  hibridoAnalise?: any
}): string {
  const { projeto, configEmpresa, tipoDesenho, hibridoDimensionamento, hibridoAnalise } = dados

  const end = projeto.cliente_endereco || {}
  const enderecoCompleto = [end.logradouro, end.numero, end.bairro, end.cidade, end.uf, end.cep]
    .filter(Boolean).join(', ') || 'nao informado'

  const dataHoje = new Date().toISOString().slice(0, 10)

  const tipoLabel =
    tipoDesenho === 'unifilar_hibrido' ? 'Unifilar HIBRIDO com BESS' :
    tipoDesenho === 'padrao_entrada' ? 'Padrao de entrada CELESC (NAO desenhar modulos/inversor)' :
    'Unifilar ON-GRID puro'

  const partes = [
    `## DADOS DO PROJETO`,
    ``,
    `**Tipo de desenho:** ${tipoLabel}`,
    `**Data:** ${dataHoje}`,
    `**Codigo projeto:** ${projeto.codigo || projeto.id}`,
    ``,
    `### Cliente (proprietario)`,
    `- Razao social: ${projeto.cliente_razao_social}`,
    `- CPF/CNPJ: ${projeto.cliente_cpf_cnpj || 'nao informado'}`,
    `- UC geradora: ${projeto.uc_geradora}`,
    `- Endereco completo: ${enderecoCompleto}`,
    `- Cidade/UF: ${end.cidade || 'nao informado'}/${end.uf || 'SC'}`,
    ``,
    `### Analise da fatura`,
    JSON.stringify(projeto.analise_fatura, null, 2),
    ``,
    `### Padrao de entrada`,
    JSON.stringify(projeto.padrao_entrada, null, 2),
  ]

  // Telhado e kit so pra unifilar (padrao_entrada nao precisa)
  if (tipoDesenho !== 'padrao_entrada') {
    partes.push(
      ``,
      `### Telhado`,
      JSON.stringify(projeto.telhado_secoes, null, 2),
      ``,
      `### Kit selecionado`,
      JSON.stringify(projeto.kit_selecionado, null, 2),
    )
  }

  if (tipoDesenho === 'unifilar_hibrido') {
    partes.push(``, `### DIMENSIONAMENTO HIBRIDO (BESS) - USE EXATO`)
    if (hibridoDimensionamento) {
      partes.push(
        `- Inversor: **${hibridoDimensionamento.inversor_modelo}** (${hibridoDimensionamento.inversor_potencia_kw}kW) x ${hibridoDimensionamento.inversor_qtd}`,
        `- Paralelismo: ${hibridoDimensionamento.usa_paralelismo ? 'SIM (EMBOX)' : 'NAO'}`,
        `- Bateria: **${hibridoDimensionamento.bateria_modelo}** (${hibridoDimensionamento.bateria_capacidade_kwh}kWh) x ${hibridoDimensionamento.bateria_qtd}`,
        `- Banco total: ${hibridoDimensionamento.capacidade_total_kwh} kWh - autonomia ${hibridoDimensionamento.autonomia_calculada_horas}h`,
        `- MMW03: ${hibridoDimensionamento.qtd_multimedidor} un | JBW: ${hibridoDimensionamento.qtd_caixa_juncao_jbw} un | EMBOX: ${hibridoDimensionamento.usa_controlador_paralelismo ? 'SIM' : 'NAO'}`,
      )
    }
    if (hibridoAnalise) {
      partes.push(
        `- Demanda media/pico: ${hibridoAnalise.demanda_media_kw}/${hibridoAnalise.demanda_pico_kw} kW`,
        `- Carga critica: ${hibridoAnalise.demanda_carga_critica_kw} kW - autonomia desejada ${hibridoAnalise.autonomia_desejada_horas}h`,
      )
    }
  }

  partes.push(
    ``,
    `### Empresa (CARIMBO)`,
    `- Razao social: ${configEmpresa.razao_social}`,
    `- CNPJ: ${configEmpresa.cnpj || ''}`,
    `- Endereco: ${configEmpresa.endereco || ''}`,
    `- Tel/Email/Site: ${configEmpresa.telefone || ''} / ${configEmpresa.email || ''} / ${configEmpresa.site || ''}`,
    ``,
    `### Responsavel Tecnico (CARIMBO)`,
    `- Nome: ${configEmpresa.rt_nome}`,
    `- Titulo: ${configEmpresa.rt_titulo || 'Eletrotecnico'}`,
    `- Registro: ${configEmpresa.rt_crea}`,
    `- ART: ${configEmpresa.rt_art_padrao || 'a definir'}`,
    ``,
    `NAO inclua <image> com URLs externas. Logo SPIN desenhado com barras (ver template).`,
    ``,
    `Gere agora a prancha A4 completa. Responda APENAS com o JSON.`,
  )

  return partes.join('\n')
}
