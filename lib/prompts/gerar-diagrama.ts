/**
 * Prompt embarcado combinando as regras de:
 *   - /mestre-da-eletrica (dimensionamento, auditoria, memória de cálculo)
 *   - /projetista-spin (padrão de desenho Spin + CELESC, camadas, blocos)
 *
 * Instrui o Claude a devolver JSON estruturado com SVG + memória + avisos.
 */

export function buildSystemPrompt(): string {
  return `Você é o combo /mestre-da-eletrica + /projetista-spin da Spin Solar.

Sua tarefa: receber os dados de um projeto fotovoltaico e produzir o UNIFILAR
elétrico no padrão Spin/CELESC pronto pra envio à distribuidora (homologação de GD).

## REGRAS TÉCNICAS FIXAS (padrão Spin)
1. NÃO usar quadro de proteção CC — as strings ligam DIRETO no inversor
   (SIW200/300/400 têm proteção CC embutida).
2. USAR sempre Quadro de Proteção CA (QPCA) com:
   - Disjuntor CA do sistema FV (dimensionado pra corrente do inversor)
   - DPS classe II (dispositivo de proteção contra surtos)
   - Ligação ao QGBT do cliente
3. Aterramento: hastes conforme informação do padrão (mín 1 haste 5/8" x 2,4m).
   Se SPDA presente, interligado.
4. Selo obrigatório canto inferior direito: logo Spin, razão social, CNPJ,
   nome do RT, título, registro CREA/CFT, ART (se houver), assinatura.

## SISTEMAS HÍBRIDOS (BESS) — Regras WEG
Se tipo_desenho = unifilar_hibrido, ADICIONAR ao unifilar on-grid:
1. **Multimedidor MMW03-M22CH** APÓS o medidor CELESC — obrigatório pra
   detectar queda de energia (transição on-grid → off-grid EPS)
2. **Baterias SBW** (CB050 5kWh ou CB100 10kWh) — LiFePO4 modular
   Regra crítica: TODAS baterias iguais (nunca misturar 5kWh e 10kWh)
3. **Caixa junção JBW 41DC 50A W0** quando > 1 bateria por entrada do inversor
   (max 4 baterias por JBW por entrada)
4. **EMBOX** obrigatório se paralelismo de inversores (múltiplos SIW200H ou SIW400H).
   Precisa comunicação com MMW03-M22CH pra funcionar.
5. **Saída EPS/backup**: bloco separado após o inversor híbrido, alimentando o
   Quadro de Carga Crítica (sub-quadro dedicado às cargas de backup).
   Cabo HEPR 90°C obrigatório (temperatura de curto-circuito maior que PVC).
6. **Cabos comunicação**: sempre BLINDADOS (Modbus/CAN entre inversor↔bateria↔EMBOX)
7. **Disjuntor carga crítica**: mesmo calibre do inversor (proteção redundante).
   Se paralelismo: adicionar disjuntor geral do barramento + disjuntor geral EPS

## NORMAS CELESC APLICÁVEIS
- N-321.0001 (Fornecimento de energia em BT)
- I-432.0004 (Micro/mini geração distribuída)
- E-321.0031 (Padrão de entrada)

## FORMATO DE SAÍDA — JSON ESTRITO
Responda APENAS com um bloco JSON válido, SEM texto ao redor, no formato:

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
    "auditoria_padrao": "OK ou 'UPGRADE necessário: motivo'",
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
  "avisos": [
    "Aviso 1 (ex: 'FCI acima de 130% — reavaliar')",
    "Aviso 2 se aplicável"
  ]
}
\`\`\`

## REGRAS DO SVG
- viewBox="0 0 1190 842" (A4 paisagem em pontos)
- Fundo BRANCO (#FFFFFF)
- Traços PRETOS (#000000)
- Fonte: Arial, Helvetica ou sans-serif
- Título centralizado no topo: "UNIFILAR - <razão_social_cliente>"
- Selo canto inferior direito com dados da empresa E responsável técnico
- Se logo_url fornecido: usar <image xlink:href="URL" .../> no canto superior esquerdo
- Se assinatura_url fornecido: usar <image .../> logo abaixo do nome do RT

### Estrutura do fluxo (esquerda pra direita OU cima pra baixo):
**ON-GRID:**
rede CELESC → padrão de entrada → medidor bidirecional → QGBT →
QPCA (disjuntor + DPS) → inversor(es) → módulos FV

**HÍBRIDO (adicionar):**
rede CELESC → padrão de entrada → medidor bidirecional → **MMW03-M22CH** →
QGBT → QPCA (disjuntor + DPS) → inversor(es) híbrido(s) SIW200H/SIW400H →
{**EMBOX** se paralelismo} → módulos FV
                          ↓
                    Baterias SBW via **JBW** →
                          ↓
                    Saída EPS → Quadro Carga Crítica → cargas essenciais

- Anotar em cada bloco: modelo, potência, tensão
- Anotar cabos: bitola + material (Ex: "6mm² HEPR", "16mm² PP", "4×22AWG blindado")
- Símbolos padrão: círculo = medidor, retângulo = quadro/inversor, losango = bateria

## MEMÓRIA DE CÁLCULO
- Fator de carregamento (FCI) = Pcc/Pca × 100% (aceitável 100-130%)
- Disjuntor CA = Icc do inversor × 1,25 (arredondar pra amperagem comercial: 16,20,25,32,40,50,63,80,100,125)
- Bitola CA: dimensionar por queda de tensão máx 2% + capacidade de corrente
- Auditoria do padrão: comparar amperagem do padrão atual vs corrente calculada.
  Se padrão < corrente → sinalizar upgrade
- Para BESS: preencher memoria_calculo.bess com dados reais do dimensionamento

Comece agora — leia os dados do projeto e responda APENAS com o JSON.`
}

export function buildUserPrompt(dados: {
  projeto: any
  configEmpresa: any
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido'
  hibridoDimensionamento?: any    // NOVO: dados do projeto_hibrido_dimensionamento
  hibridoAnalise?: any             // NOVO: dados do projeto_hibrido_analise
}): string {
  const { projeto, configEmpresa, tipoDesenho, hibridoDimensionamento, hibridoAnalise } = dados

  const partes = [
    `## DADOS DO PROJETO A DESENHAR`,
    ``,
    `**Tipo de desenho:** ${tipoDesenho === 'unifilar_hibrido' ? 'Unifilar HÍBRIDO com BESS' : 'Unifilar ON-GRID puro'}`,
    ``,
    `### Cliente`,
    `- Razão social: ${projeto.cliente_razao_social}`,
    `- CPF/CNPJ: ${projeto.cliente_cpf_cnpj || 'não informado'}`,
    `- Cidade: ${projeto.cliente_endereco?.cidade || 'não informado'}/${projeto.cliente_endereco?.uf || 'SC'}`,
    `- UC geradora: ${projeto.uc_geradora}`,
    ``,
    `### Análise da fatura (Passo 2)`,
    JSON.stringify(projeto.analise_fatura, null, 2),
    ``,
    `### Telhado (Passo 3)`,
    JSON.stringify(projeto.telhado_secoes, null, 2),
    ``,
    `### Padrão de entrada (Passo 4)`,
    JSON.stringify(projeto.padrao_entrada, null, 2),
    ``,
    `### Kit selecionado`,
    JSON.stringify(projeto.kit_selecionado, null, 2),
  ]

  // Contexto extra pra híbrido
  if (tipoDesenho === 'unifilar_hibrido') {
    partes.push(``, `### 🔋 DIMENSIONAMENTO HÍBRIDO (BESS) — USE ESSES DADOS EXATOS`)

    if (hibridoDimensionamento) {
      partes.push(
        `- Inversor modelo: **${hibridoDimensionamento.inversor_modelo}** (${hibridoDimensionamento.inversor_potencia_kw}kW)`,
        `- Quantidade de inversores: ${hibridoDimensionamento.inversor_qtd}`,
        `- Usa paralelismo de inversores: ${hibridoDimensionamento.usa_paralelismo ? 'SIM (adicionar EMBOX)' : 'NÃO'}`,
        `- Bateria modelo: **${hibridoDimensionamento.bateria_modelo}** (${hibridoDimensionamento.bateria_capacidade_kwh}kWh cada)`,
        `- Quantidade de baterias: ${hibridoDimensionamento.bateria_qtd}`,
        `- Capacidade total do banco: ${hibridoDimensionamento.capacidade_total_kwh} kWh`,
        `- Autonomia calculada: ${hibridoDimensionamento.autonomia_calculada_horas} horas`,
        `- Multimedidor MMW03-M22CH: ${hibridoDimensionamento.qtd_multimedidor} un (obrigatório)`,
        `- Caixas de junção JBW 41DC 50A W0: ${hibridoDimensionamento.qtd_caixa_juncao_jbw} un`,
        `- EMBOX (controlador paralelismo): ${hibridoDimensionamento.usa_controlador_paralelismo ? 'SIM' : 'NÃO'}`,
        ``,
        `⚠️ REPRESENTAR TODOS ESSES COMPONENTES NO UNIFILAR — não invente/omita nenhum.`,
      )
    } else {
      partes.push(
        `⚠️ Dimensionamento híbrido ainda não foi confirmado no wizard.`,
        `Use valores placeholder e adicione aviso: "Dimensionamento BESS pendente — confirmar no wizard híbrido"`,
      )
    }

    if (hibridoAnalise) {
      partes.push(
        ``,
        `### Análise de demanda (etapa 2 wizard)`,
        `- Demanda média: ${hibridoAnalise.demanda_media_kw ?? 'n/d'} kW`,
        `- Demanda pico: ${hibridoAnalise.demanda_pico_kw ?? 'n/d'} kW`,
        `- Carga crítica: ${hibridoAnalise.demanda_carga_critica_kw ?? 'n/d'} kW`,
        `- Autonomia desejada: ${hibridoAnalise.autonomia_desejada_horas ?? 'n/d'} h`,
        `- Usa peak shaving: ${hibridoAnalise.usar_peak_shaving ? 'SIM (Grupo A)' : 'NÃO'}`,
        `- Método de coleta: ${hibridoAnalise.metodo_demanda}`,
      )
    }
  }

  partes.push(
    ``,
    `### Configuração da empresa (pra estampar no selo)`,
    `- Razão social: ${configEmpresa.razao_social}`,
    `- CNPJ: ${configEmpresa.cnpj || ''}`,
    `- Endereço: ${configEmpresa.endereco || ''}`,
    `- Telefone: ${configEmpresa.telefone || ''}`,
    `- Email: ${configEmpresa.email || ''}`,
    `- Site: ${configEmpresa.site || ''}`,
    `- Logo URL: ${configEmpresa.logo_url || ''}`,
    ``,
    `### Responsável Técnico (pra estampar no selo)`,
    `- Nome: ${configEmpresa.rt_nome}`,
    `- Título: ${configEmpresa.rt_titulo || 'Eletrotécnico'}`,
    `- Registro: ${configEmpresa.rt_crea}`,
    `- ART: ${configEmpresa.rt_art_padrao || 'a definir'}`,
    `- Assinatura URL: ${configEmpresa.rt_assinatura_url || ''}`,
    ``,
    `Gere agora o JSON com o SVG do unifilar + memória de cálculo + avisos.`,
  )

  return partes.join('\n')
}
