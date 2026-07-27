# Regras Fixas da SPIN Solar (nunca-negociáveis)

Estas regras têm **prioridade sobre qualquer padrão genérico de mercado**. Todo diagrama gerado deve respeitá-las sem exceção.

## 1. NUNCA usar Quadro de Proteção CC (string box)

- **Regra:** as strings CC ligam DIRETO nas entradas MPPT do inversor
- **Motivo:** os inversores WEG (SIW200H, SIW300H, SIW400H) e demais linhas atuais têm proteção CC INTERNA (fusíveis, DPS CC, seccionamento)
- **No desenho:**
  - Linha CC sai do gerador FV (módulos) → sobe DIRETO pras entradas MPPT
  - Rotule o trecho como `"CC direto ao inversor (sem quadro de proteção CC)"`
- **Legenda:** NÃO inclua o símbolo "string box" ou "proteção CC"
- **Se pedido de revisão vier com string box:** REMOVA sem perguntar
- **Confirmado por Kalebe 2026-07-28:** "nos nossos projetos nunca usaremos stringbox CC"
- **Implicação em multifilar CC:** ao gerar prancha multifilar CC (ex: Zero Grid), representar strings indo DIRETAMENTE aos bornes MPPT do inversor. NÃO desenhar caixa intermediária de fusíveis+seccionador+DPS CC. Projetos de terceiros (Engetelks, Growatt reference designs) mostram stringbox — ignorar esse padrão.

## 2. SEMPRE usar Quadro de Proteção CA (QPCA)

- **Regra:** todo sistema FV tem QPCA visível como caixa tracejada rotulada
- **Componentes obrigatórios dentro do QPCA:**
  - Disjuntor CA do sistema FV (dimensionado pela corrente CA do inversor × 1.25)
  - DPS Classe II (ou I se local exposto a raios)
- **Posição:** entre o QGBT do cliente e o inversor
- **Cadeia CA obrigatória:**
  ```
  REDE CELESC → PONTO DE CONEXÃO → MEDIDOR bidirecional → QGBT
  → QPCA (disjuntor + DPS) → INVERSOR → CC direto → GERADOR FV
  ```

## 3. Aterramento

- **Mínimo:** 1 haste cobreada 5/8" × 2,4m
- **Sistemas > 20 placas:** 3+ hastes interligadas
- **SPDA presente:** aterramento FV interligado ao SPDA
- **Símbolo:** 3 traços decrescentes (padrão elétrico universal)
- **Norma:** E-321.0031 (CELESC) e NBR 5410

## 4. Cores de fase (padrão CELESC)

| Fase | Cor | Hex |
|------|-----|-----|
| R (fase 1) | Preto | #111827 |
| S (fase 2) | Branco/Cinza | #7a7a7a |
| T (fase 3) | Vermelho | #c0392b |
| Neutro | Azul claro | #2980b9 |
| PE (terra) | Verde | #1e8449 |

**Nota:** condutores usar EPR/HEPR/XLPE classe 2 de encordoamento.

## 5. Identidade visual (selo)

- **Logo Spin** obrigatório no canto inferior direito
- **Estrutura do carimbo:**
  - TÍTULO (ex: "DIAGRAMA UNIFILAR DE LIGAÇÃO DE MICROGERAÇÃO")
  - PROJETO (código + cliente)
  - PROPRIETÁRIO / UC
  - ENDEREÇO DA OBRA
  - RESP. TÉCNICO / Registro / ART
  - DATA + TAMANHO (A3/A4) + REVISÃO + FOLHA
  - POTÊNCIA (kWp)
- **Empresa:** razão social + CNPJ + endereço + contato

### 5.1 Responsável Técnico — SEMPRE Kalebe Grün

- **Nome:** Kalebe Grün
- **Título:** Eletrotécnico
- **Registro:** 94312176000
- **ART:** varia por projeto (único campo dinâmico do RT)
- **Confirmado por Kalebe em 2026-07-28:** "o responsável técnico será sempre o Kalebe Grun"
- **Implicação:** os templates devem ter RT como default fixo. NÃO parametrizar RT como variável obrigatória — usar como constante embutida. Se o payload de entrada não trouxer RT, preenche automaticamente com esses dados.

### 5.2 Procuração CELESC (feature futura)

- Cliente PJ ou PF outorga poderes a **DOIS procuradores conjuntamente**:
  1. **Spin Solar Energias Renováveis Ltda** (CNPJ 22.279.642/0001-04)
  2. **Kalebe Grün** (pessoa física)
- Escopo: representar cliente perante CELESC pra tramitar homologação de GD
- **Modelo pendente:** Kalebe vai enviar procuração modelo — quando chegar, criar template `procuracao-celesc.svg` na skill

## 6. Formato de entrega

**SEMPRE** entregar em 3 formatos:
- **SVG** — código-fonte editável
- **PDF** — pra envio à CELESC (renderizado do SVG)
- **DXF** — pra abertura no AutoCAD (organizado em camadas: REDE, PROTECAO, INVERSOR, CC, MODULO, ANSI, ATERRA, TEXTO, COTAS, MOLDURA, LEGENDA)

## 7. Diretrizes de qualidade

- **Escape XML:** nunca deixar `<` cru dentro de texto — usar `&lt;`
- **Namespaces SVG:** sempre `xmlns="http://www.w3.org/2000/svg"` no root; adicionar `xmlns:xlink="http://www.w3.org/1999/xlink"` se usar `<image xlink:href>`
- **Fontes:** Helvetica, Arial, sans-serif (universalmente disponíveis)
- **Traços:** 1.5 px blocos, 1.2 px sinais, 1.1 px cotas, 1.8 px moldura
- **Sem sobreposições:** validar antes de entregar
- **Sem cotas fora da margem:** verificar limites

## 8. O que NÃO pode aparecer

- ❌ Quadro de Proteção CC / string box
- ❌ Símbolos de fabricantes concorrentes (Fronius, Growatt, etc — mesmo que o cliente tenha)
- ❌ Cores fora da paleta oficial
- ❌ Fonte diferente de Helvetica/Arial
- ❌ Texto sem escape XML
- ❌ Placas em outros idiomas
- ❌ Datas específicas na copy (só a data de emissão do documento)

## 9. Se dados faltarem

**NÃO invente.** Retorne erro claro:
```json
{
  "erro": "Dados incompletos: falta análise da fatura (Passo 2) e telhado (Passo 3). Preencha antes de gerar."
}
```

## 10. Consulta obrigatória de normas

Antes de gerar, mentalmente confirme:
- N-321.0001 (BT) ou N-321.0002 (MT)?
- I-432.0004 (GD) versão vigente
- NBR IEC 62116 (inversor certificado)
- E-321.0031 (DPS + aterramento)
- NR-10 (seccionamento visível)

Ver `references/normas-celesc.md` pra detalhes.
