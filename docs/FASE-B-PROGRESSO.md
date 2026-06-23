# FASE B — Workflow Proposta On-Grid + Híbrido BESS

> Documento de progresso da FASE B. Atualizado em 2026-06-21.

## 🎯 Visão geral

Construir o fluxo completo de proposta solar pro consultor de campo Spin Solar:

```
[Cliente envia faturas]
    ↓
/analista-de-faturas        ← B.1 ✅ PRONTA
    ↓
[Consultor visita o local + preenche form]
    ↓
/mestre-da-eletrica         ← B.2 ✅ PRONTA (modo workflow proposta)
    ↓
/orcamentista-on-grid       ← B.3 ⏳ próxima
    ↓
[PDF da proposta]           ← B.5 ⏳ migrar do menu-spin
```

## 📊 Status das skills/etapas

### ✅ B.1 — Skill `/analista-de-faturas` — PRONTA

**Local:** `~/.claude/skills/analista-de-faturas/`

**O que faz:** lê fatura CELESC (PDF/texto), extrai TUDO em JSON estruturado.

**Cobre:**
- Grupo B (B1 residencial, B3 comercial/industrial)
- Grupo A (A4 convencional, horosazonal verde, horosazonal azul)
- Com ou sem geração própria
- Com ou sem unidades beneficiárias
- Multas (ultrapassagem demanda, reativo excedente)
- ICMS (alíquota padrão, isenção, diferimento)
- Histórico 12 meses (consumo, demanda, reativo, geração)
- Análise de expansão (cliente com solar existente)
- Itens faturados granulares (cada linha cobrada)

**Testado em 3 casos reais:**
- BERKE (B3 trifásico comercial) — ~1.949 kWh/mês
- VISTACOR (A4 horosazonal verde sem geração) — ~11.200 kWh/mês FP, 130 kW demanda
- IMG BRASIL (A4 horosazonal verde COM geração + beneficiárias) — ~42.000 kWh/mês FP, 451 kW demanda, gerando 7.000 kWh/mês

**Referências:**
- `celesc-grupos-tarifarios.md`
- `codigos-itens-fatura.md`
- `icms-isencoes-celesc.md`
- `geracao-distribuida-expansao.md`
- `exemplos-faturas.md`

### ✅ B.2 — Skill `/mestre-da-eletrica` (workflow proposta) — PRONTA

**Local:** `~/.claude/skills/mestre-da-eletrica/`

**O que faz:** recebe output do analista + form do consultor + produz projeto técnico completo.

**Cobre:**
- Dimensionamento CC (kWp, modelo placa WEG, arranjo strings, MPPT)
- Dimensionamento CA (modelo inversor WEG SIW, oversize, tensão)
- Validação compatibilidade strings × inversor
- Auditoria de conformidade (padrão CELESC, QGBT, aterramento, SPDA, queda tensão, homologação)
- Lista de materiais CA COMPLETA (estrutura, cabos, conectores, string box, proteções, etc)
- Mão de obra estimada
- BESS quando híbrido (capacidade, potência, topologia)
- Complementares (banco capacitivo, smart meter)
- Geração estimada (kWh/mês médio/inverno/verão)
- Viabilidade técnica

**Coexiste com:** `anthropic-skills:mestre-da-eletrica` (que é professor técnico geral conversacional). A nova é workflow operacional.

**Referências:**
- `form-projeto-campo.md` — 17 campos do formulário de visita técnica
- `dimensionamento-solar-sc.md` — irradiação SC, oversize WEG, cálculos

**Pendente criar:** `auditoria-conformidade.md`, `lista-materiais-ca.md`, `bess-dimensionamento.md`, `inversores-weg-catalogo.md`, `placas-weg-catalogo.md`

### ✅ B.0 — Schema do banco — MODELADO (falta dados)

**Local:** `spin-app/supabase/migrations/002_catalogo_weg.sql`

**4 tabelas + 1 view:**
- `produtos` (catálogo, com `specs` JSONB flexível por categoria)
- `precos_produtos` (histórico)
- `estoque`
- `v_produtos_ativos` (view atalho)

**Categorias suportadas:** placa, inversor, bateria, estrutura, cabo_cc, cabo_ca, conector, string_box, disjuntor, dps, eletroduto, aterramento, quadro, smart_meter, monitoramento, mao_de_obra, projeto_engenharia, frete, identificacao.

**Falta:** Kalebe enviar planilha WEG pra carregar dados.

### ⏳ B.3 — Skill `/orcamentista-on-grid` — PENDENTE

**Vai precisar:** B.0 carregado com dados WEG + B.2 output.

### ⏳ B.4 — Form Projeto no portal — PENDENTE

Tela no `app.spinsolar.com.br` que o consultor preenche em campo.

### ⏳ B.5 — Migrar gerador PDF — PENDENTE

Pegar o gerador 6 páginas A4 do menu-spin e adaptar pro portal.

## 🚦 Próximas tarefas

1. **Receber planilha WEG do Kalebe** → carregar no Supabase
2. **B.3: Skill /orcamentista-on-grid** → consulta produtos + aplica margem + monta cotação
3. **B.4: Form de projeto no portal** → tela em Next.js que o consultor abre no celular
4. **B.5: Migrar gerador PDF** → reutilizar lógica html2canvas + jsPDF do menu-spin

## 📅 Como retomar

Próxima sessão:

```
"Vamos seguir FASE B" → eu releio este doc + verifico tasks + pego de onde paramos.
```

Tasks atuais:
- #37 [in_progress] B.0 — Importar planilha WEG
- #38 [completed] B.1 — Skill analista-de-faturas
- #39 [completed] B.2 — Skill mestre-da-eletrica
- #40 [pending] B.3 — Skill orcamentista-on-grid
- #41 [pending] B.4 — Form Projeto
- #42 [pending] B.5 — Migrar gerador PDF
