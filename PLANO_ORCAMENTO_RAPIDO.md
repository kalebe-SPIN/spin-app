# PLANO — Orçamento Rápido de Lead

**Objetivo:** dar ao consultor/vendedor uma ferramenta que gera um orçamento aproximado em **até 30 segundos**, a partir de UM único gatilho, pra enviar ao lead no WhatsApp e testar interesse antes de investir tempo em projeto técnico.

**Escopo:** todos os verticais (solar, BESS, VE, serviços, construção, aluguel).
**Data:** 2026-07-30 · **Alinhado com Kalebe nas 4 decisões estruturais.**

---

## 1. Modelo mental — 3 estágios

```
┌──────────────┐   converte    ┌──────────────┐   proposta   ┌──────────────┐
│  1. LEAD     │──────────────▶│  2. PROJETO  │─────────────▶│ 3. NEGÓCIO   │
│              │  demonstrou   │              │   oficial    │  (no CRM)    │
│  Orçamento   │   interesse   │  Workflow    │   gerada     │              │
│  rápido      │               │  técnico     │              │  Pipeline    │
│  30s + wpp   │               │  completo    │              │  comercial   │
└──────────────┘               └──────────────┘              └──────────────┘

 Não vira PDF                   Passa por todos            Aceite do cliente
 Só mensagem/link               os passos: fatura,         libera contrato +
 pro WhatsApp                   telhado, kit, lista        entra em execução
                                CA, homologação, PDF
```

**Cliente** = pessoa concreta.
**Lead** = pessoa antes de virar cliente formal (não tem contrato, tem interesse).
**Orçamento rápido** = estimativa comercial (não técnica) associada ao lead.
**Projeto** = workflow técnico. Só existe depois que lead engajou.
**Proposta oficial** = PDF gerado do projeto. Cliente aceita → vira negócio no CRM.

---

## 2. Schema — 1 tabela nova + 2 FKs

### 2.1 Nova tabela `orcamentos_rapidos`

```sql
CREATE TABLE public.orcamentos_rapidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  consultor_id uuid NOT NULL REFERENCES public.profiles(id),
  -- Se lead E cliente forem NULL, é um orçamento "solto" (consultor testando)

  -- Tipo de item que está sendo orçado
  tipo tipo_item_projeto NOT NULL,

  -- Modo de entrada usado (qual gatilho o consultor escolheu)
  modo_entrada text NOT NULL,
  -- Enum livre: 'fatura' | 'valor_mensal' | 'consumo_kwh' | 'qtd_placas'
  --           | 'backup_kwh' | 'modelo_carro' | 'qtd_diarias'
  --           | 'descricao_livre'

  -- Input original (o que o consultor digitou/anexou)
  entrada jsonb NOT NULL,
  -- Ex: { "consumo_kwh": 400 } · { "qtd_placas": 10 }
  --     { "descricao": "Muro de proteção 3m", "valor_estimado": 4200 }

  -- Resultado calculado (o que a calculadora gerou)
  resultado jsonb NOT NULL,
  -- Ex solar: { "kwp_estimado": 5.55, "kit_sugerido": "10× WEG 555W",
  --            "valor_estimado_cliente": 32500 }
  -- Ex limpeza: { "qtd_placas": 32, "valor_estimado_cliente": 720 }

  -- Ajuste manual sobre o valor calculado (consultor pode subir/descer 20%)
  ajuste_percentual numeric(5,2) DEFAULT 0,
  valor_final numeric(14,2) NOT NULL,

  -- Rastreabilidade + versionamento de tabela
  versao_tabela_id uuid, -- FK opcional pra tabela_precos versionada (fase 2)

  -- Ciclo de vida
  status text NOT NULL DEFAULT 'rascunho',
  -- 'rascunho' | 'enviado' | 'convertido' | 'perdido' | 'expirado'
  enviado_em timestamptz,
  canal_envio text, -- 'whatsapp' | 'email' | 'presencial'

  -- Se converteu, aponta pro projeto criado
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  convertido_em timestamptz,

  -- Snapshot da mensagem enviada
  mensagem_enviada text,

  -- Timestamps padrão
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),

  CONSTRAINT chk_owner CHECK (
    lead_id IS NOT NULL OR cliente_id IS NOT NULL OR consultor_id IS NOT NULL
  )
);

CREATE INDEX idx_orc_rapido_lead ON orcamentos_rapidos(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_orc_rapido_cliente ON orcamentos_rapidos(cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_orc_rapido_consultor ON orcamentos_rapidos(consultor_id);
CREATE INDEX idx_orc_rapido_status ON orcamentos_rapidos(status);
CREATE INDEX idx_orc_rapido_projeto ON orcamentos_rapidos(projeto_id) WHERE projeto_id IS NOT NULL;

ALTER TABLE orcamentos_rapidos ENABLE ROW LEVEL SECURITY;

-- Policies:
-- Admin vê tudo. Consultor/vendedor vê só os próprios.
CREATE POLICY orc_rapido_admin ON orcamentos_rapidos FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY orc_rapido_dono ON orcamentos_rapidos FOR ALL
  USING (consultor_id = auth.uid()) WITH CHECK (consultor_id = auth.uid());
```

### 2.2 Campos novos em tabelas existentes

```sql
-- leads.status: adicionar valor 'com_orcamento_rapido' (opcional)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS orcamento_rapido_atual_id uuid
    REFERENCES public.orcamentos_rapidos(id) ON DELETE SET NULL;

-- projetos: link reverso pra saber de qual orçamento rápido nasceu
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS orcamento_rapido_origem_id uuid
    REFERENCES public.orcamentos_rapidos(id) ON DELETE SET NULL;
```

**Migration:** `058_orcamentos_rapidos.sql`

---

## 3. Arquitetura da calculadora — adaptador por vertical

Motor central genérico + 1 adaptador por vertical. Cada adaptador implementa a interface:

```typescript
// lib/orcamento-rapido/tipos.ts
export type ModoEntrada =
  | 'fatura' | 'valor_mensal' | 'consumo_kwh' | 'qtd_placas'
  | 'backup_kwh' | 'modelo_carro' | 'qtd_diarias' | 'descricao_livre'

export interface AdaptadorOrcamento<TEntrada, TResultado> {
  tipoItem: TipoItem
  modosSuportados: ModoEntrada[]
  descricaoModo(modo: ModoEntrada): string
  calcular(entrada: TEntrada, params: ParametrosOrcamento): TResultado
  formatarMensagemWhatsApp(entrada: TEntrada, resultado: TResultado, empresa: any): string
}
```

### Adaptadores previstos

| Arquivo | Vertical | Modos suportados |
|---|---|---|
| `lib/orcamento-rapido/solar.ts` | fv_ongrid, fv_hibrido, fv_zero_grid, fv_offgrid | fatura, valor_mensal, consumo_kwh, qtd_placas |
| `lib/orcamento-rapido/bess.ts` | bess | backup_kwh, valor_mensal |
| `lib/orcamento-rapido/ve.ts` | ve_recarga | modelo_carro |
| `lib/orcamento-rapido/servico-placas.ts` | srv_limpeza, srv_manutencao, srv_retirada_recolocacao, srv_instalacao_placas | qtd_placas |
| `lib/orcamento-rapido/servico-livre.ts` | srv_alvenaria, srv_serralheria, srv_carpintaria, srv_eletrica_predial, srv_laudo_tecnico, srv_analise_rede, outros | descricao_livre |
| `lib/orcamento-rapido/aluguel.ts` | aluguel_maquinas, aluguel_equipamentos | qtd_diarias |

### Parâmetros da estimativa (banco, editáveis pelo admin)

Tabela `parametros_orcamento_rapido` (uma linha, JSONB):

```json
{
  "preco_medio_kwh_celesc": 0.75,
  "fator_dimensionamento_sc": 4.0,
  "potencia_padrao_modulo_wp": 555,
  "preco_medio_kwp_instalado": 6000,
  "custo_medio_kwh_bateria": 3500,
  "kit_por_faixa_kwp": [
    { "min": 0, "max": 5, "kit": "5,55 kWp · 10 mód WEG 555W · 1 inv WEG 5K mono" },
    { "min": 5, "max": 10, "kit": "8,88 kWp · 16 mód WEG 555W · 1 inv WEG 8K mono" },
    { "min": 10, "max": 20, "kit": "13,32 kWp · 24 mód WEG 555W · 1 inv WEG 15K tri" },
    { "min": 20, "max": 999, "kit": "Sob dimensionamento — sugerir visita técnica" }
  ]
}
```

---

## 4. UI — fluxograma

### Tela principal: `/leads/[id]/orcamento-rapido` (ou `/orcamento-rapido` se não tiver lead ainda)

**Layout mobile-first, 1 tela só:**

```
┌─────────────────────────────────────┐
│ ← Voltar   ORÇAMENTO RÁPIDO         │
├─────────────────────────────────────┤
│                                     │
│  1️⃣  QUE TIPO?                       │
│  [☀️ Solar] [🔋 BESS] [⚡ VE]        │
│  [🧹 Limpeza] [🔧 Manutenção] [🧱 …] │
│                                     │
│  2️⃣  COMO ORÇAR?                     │
│  ○ 📄 Anexar fatura                  │
│  ● 💰 Digitar valor R$/mês           │
│  ○ ⚡ Digitar consumo kWh/mês        │
│  ○ 🔢 Digitar quantidade de placas   │
│                                     │
│  3️⃣  INPUT                           │
│  R$ [_______]                        │
│                                     │
│  ═══════════════════════════════    │
│  📊 ESTIMATIVA                       │
│  ═══════════════════════════════    │
│  Sistema: 5,55 kWp                  │
│  Kit: 10 mód WEG 555W + inv 5K      │
│                                     │
│         R$ 32.500                   │
│  ±20% [− +] [restaurar]              │
│                                     │
│  [💬 Enviar pro WhatsApp]           │
│  [📋 Copiar mensagem]                │
│  [→ Converter em projeto]           │
└─────────────────────────────────────┘
```

**Comportamento:**
- Escolha do tipo (chip) → mostra os modos disponíveis pra aquele tipo
- Escolha do modo → mostra input apropriado
- Input muda → estimativa recalcula em real-time (client-side, debounced 300ms)
- Ajuste ±20% → slider ou 2 botões, atualiza valor final
- **Enviar WhatsApp:** gera mensagem pronta, abre `wa.me/{tel}?text=` (mesma abordagem que já usa em outros pontos do app)
- **Converter em projeto:** cria `projetos` com dados pré-preenchidos + redireciona

### Mensagem WhatsApp — template por vertical

Solar:
```
Oi {NOME}! Sou o {CONSULTOR} da Spin Solar 👋

Fiz uma estimativa rápida do teu sistema solar:

⚡ Sistema: 5,55 kWp
🔋 Kit: 10 painéis + 1 inversor WEG
💰 Investimento estimado: R$ 32.500

*Valor sujeito a análise técnica no local.*

Podemos avançar com uma visita? Assim eu preparo a proposta oficial completa 🙌
```

Limpeza:
```
Oi {NOME}!

Passei o valor da limpeza do teu sistema fotovoltaico:

🧹 32 placas
💰 Investimento: R$ 720

Posso agendar? Rota disponível na próxima {DIA_SEMANA}.
```

Cada vertical tem seu template — vive em `lib/orcamento-rapido/mensagens/*.ts`.

---

## 5. Prioridade de entrega

### **Fase 1 — MVP funcional (~4h)**
Cobre 80% dos casos com o mínimo de código:

1. Migration `058_orcamentos_rapidos.sql` + campo em `leads`/`projetos`
2. `lib/orcamento-rapido/solar.ts` — modos `consumo_kwh` e `qtd_placas` (sem OCR nem R$/mês por enquanto)
3. `lib/orcamento-rapido/servico-placas.ts` — modo `qtd_placas` (reaproveita motor de limpeza existente)
4. Tela `app/orcamento-rapido/page.tsx` — sem lead pré-selecionado ("orçamento solto")
5. Server Action `salvarOrcamentoRapidoAction`
6. Botão WhatsApp com template solar + limpeza
7. Botão "Converter em projeto" — cria projeto e redireciona

**Não entra na Fase 1:**
- OCR de fatura (Modo `fatura`) — usa infraestrutura existente mas precisa polir
- Modo `valor_mensal` (R$/mês → kWh)
- BESS, VE, aluguel, construção — só solar + limpeza no MVP
- Tela `/leads/[id]/orcamento-rapido` (lead pré-selecionado) — MVP usa a rota genérica
- Adaptador de conversão "lead→projeto" refinado (preenche todos os campos preenchíveis)

### **Fase 2 — Expansão (~5h)**
1. OCR de fatura (Modo `fatura`) — reaproveita edge function `ocr-fatura` (task #52)
2. Modo `valor_mensal` (usa parâmetro `preco_medio_kwh_celesc`)
3. Adaptadores restantes: BESS, VE, aluguel, construção
4. Tela `/leads/[id]/orcamento-rapido` — pré-preenche dados do lead + histórico de orçamentos rápidos dele
5. Conversão lead→projeto refinada + promoção automática lead→cliente
6. Painel admin: parâmetros editáveis (`parametros_orcamento_rapido`)

---

## 6. Impacto no que já existe

| Elemento | Impacto |
|---|---|
| `leads` (tabela) | +1 coluna FK opcional. Zero breaking change |
| `projetos` (tabela) | +1 coluna FK opcional. Zero breaking change |
| Pipeline atual (`projeto_status`) | Nada muda — projetos convertidos entram no status inicial normal |
| Menu principal | +1 item "Orçamento rápido" (ou botão flutuante no dashboard) |
| Componente `AlternarModoButton` | Nada muda — modo vendedor_servicos também acessa |
| Rota `/servico?item=` (criada agora) | Continua funcionando — usada quando projeto já existe |
| Motor de precificação (`lib/precificacao/*`) | Reutilizado onde possível (limpeza usa o motor existente). Motores novos seguem regra dupla-visão |

---

## 7. Riscos

1. **Estimativa muito imprecisa vira reclamação** — cliente recebe "R$ 32.500" no WhatsApp, na proposta oficial vem R$ 38.000, sente-se enganado.
   **Mitigação:** mensagem SEMPRE tem "*valor sujeito a análise técnica*" em destaque + guard rail no motor pra não estimar mais que ±25% do preço real médio

2. **Consultor usa orçamento rápido em vez do fluxo completo** e cliente fecha sem passar por dimensionamento técnico.
   **Mitigação:** orçamento rápido NUNCA vira contrato/proposta oficial. Botão "Aceitar" no link não existe — só "Marcar visita/proposta oficial"

3. **Kit sugerido não existe no estoque atual** — cliente ancorou expectativa num modelo específico.
   **Mitigação:** kit sugerido é textual/genérico ("kit ~5 kWp mono padrão"), não FK direto pro `produtos`. Só na conversão pra projeto é feito o dimensionamento real

4. **Múltiplos orçamentos rápidos do mesmo lead** poluem CRM.
   **Mitigação:** listagem no perfil do lead mostra só o mais recente + histórico colapsado. Status `expirado` automático após 30 dias

5. **Ajuste manual do consultor sem log** — perigo de "descontos disfarçados".
   **Mitigação:** `ajuste_percentual` fica gravado no registro. Se ajuste > ±10%, exige justificativa (campo obrigatório)

---

## 8. Métricas de sucesso (o que medir depois)

- **Tempo médio pra criar orçamento rápido:** meta < 60s
- **Taxa de conversão orçamento rápido → projeto:** meta > 40%
- **Taxa de erro de estimativa** (valor rápido vs valor final): meta < 15% de desvio
- **Uso por consultor:** distribuição — se 1 consultor usa 90%, ferramenta virou muleta
- **Ganho de tempo:** orçamentos rápidos/mês × economia de tempo vs fluxo completo

---

## 9. Ordem prática

1. [aprovar plano] ← você agora
2. Criar migration 058 + campos em `leads`/`projetos`
3. Criar `lib/orcamento-rapido/tipos.ts` + solar + serviço-placas
4. Criar tela `app/orcamento-rapido/page.tsx` + `actions.ts` + component
5. Testar: montar 3 orçamentos de exemplo (5kWp / 15kWp / limpeza 32 placas), enviar WhatsApp, converter 1 em projeto
6. Reportar Fase 1 concluída
7. Você valida na prática → autoriza Fase 2

---

## 10. O que preciso de ti pra começar

- **Aprovação do plano** (ok, plano ruim, ajuste tal coisa)
- **1 pergunta:** os leads no `leads` atual já têm `telefone` preenchido? Se não, o WhatsApp fica sem destino no MVP. Alternativa: consultor cola o número no momento

Se aprovar, começo a Fase 1 agora.
