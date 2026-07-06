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
4. Para HÍBRIDO (BESS): incluir bateria SBW + PCS + Backup EPS + isolador DC das
   baterias + comando de black-start.
5. Selo obrigatório canto inferior direito: logo Spin, razão social, CNPJ,
   nome do RT, título, registro CREA/CFT, ART (se houver), assinatura.

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
    "fator_carregamento_pct": 0
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
- Selo canto inferior direito com dados da empresa (razão social, CNPJ, endereço)
  E responsável técnico (nome, título, CREA/registro, ART se houver)
- Se logo_url fornecido: usar <image xlink:href="URL" .../> no canto superior esquerdo
- Se assinatura_url fornecido: usar <image .../> logo abaixo do nome do RT
- Blocos: rede CELESC → padrão de entrada → medidor → QGBT → QPCA (disjuntor + DPS) → inversor(es) → módulos
- Se híbrido: adicionar bateria SBW + EPS após inversor
- Anotar em cada bloco: modelo do equipamento, potência, tensão

## MEMÓRIA DE CÁLCULO
- Fator de carregamento (FCI) = Pcc/Pca × 100% (aceitável 100-130%)
- Disjuntor CA = Icc do inversor × 1,25 (arredondar pra amperagem comercial)
- Bitola CA: dimensionar por queda de tensão máx 2% + capacidade de corrente
- Auditoria do padrão: comparar amperagem do padrão atual vs corrente calculada.
  Se padrão < corrente → sinalizar upgrade

Comece agora — leia os dados do projeto e responda APENAS com o JSON.`
}

export function buildUserPrompt(dados: {
  projeto: any
  configEmpresa: any
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido'
}): string {
  const { projeto, configEmpresa, tipoDesenho } = dados

  return `## DADOS DO PROJETO A DESENHAR

**Tipo de desenho:** ${tipoDesenho === 'unifilar_hibrido' ? 'Unifilar HÍBRIDO com BESS' : 'Unifilar ON-GRID puro'}

### Cliente
- Razão social: ${projeto.cliente_razao_social}
- CPF/CNPJ: ${projeto.cliente_cpf_cnpj || 'não informado'}
- Cidade: ${projeto.cliente_endereco?.cidade || 'não informado'}/${projeto.cliente_endereco?.uf || 'SC'}
- UC geradora: ${projeto.uc_geradora}

### Análise da fatura (Passo 2)
${JSON.stringify(projeto.analise_fatura, null, 2)}

### Telhado (Passo 3)
${JSON.stringify(projeto.telhado_secoes, null, 2)}

### Padrão de entrada (Passo 4)
${JSON.stringify(projeto.padrao_entrada, null, 2)}

### Kit selecionado
${JSON.stringify(projeto.kit_selecionado, null, 2)}

### Configuração da empresa (pra estampar no selo)
- Razão social: ${configEmpresa.razao_social}
- CNPJ: ${configEmpresa.cnpj || ''}
- Endereço: ${configEmpresa.endereco || ''}
- Telefone: ${configEmpresa.telefone || ''}
- Email: ${configEmpresa.email || ''}
- Site: ${configEmpresa.site || ''}
- Logo URL: ${configEmpresa.logo_url || ''}

### Responsável Técnico (pra estampar no selo)
- Nome: ${configEmpresa.rt_nome}
- Título: ${configEmpresa.rt_titulo || 'Eletrotécnico'}
- Registro: ${configEmpresa.rt_crea}
- ART: ${configEmpresa.rt_art_padrao || 'a definir'}
- Assinatura URL: ${configEmpresa.rt_assinatura_url || ''}

Gere agora o JSON com o SVG do unifilar + memória de cálculo + avisos.`
}
