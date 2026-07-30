# DIAGNÓSTICO — app.spinsolar antes do Módulo Serviços

**Fase 0 do pacote de implementação do Módulo Serviços.**
Auditoria read-only. Nenhum arquivo, migration ou dependência foi alterado.
Data: 2026-07-28.

---

## 1. STACK

| Item | Valor |
|---|---|
| Framework | **Next.js 14.2.18** (App Router) + React 18.3.1 |
| Bundler | Padrão do Next (Webpack). Sem config custom além de `images.remotePatterns` e header `noindex` (`next.config.js`) |
| TypeScript | **5.6.3**, `strict: true`, path alias `@/*`, `moduleResolution: bundler` |
| Tailwind | **3.4.15** com paleta custom em `tailwind.config.js` (`noite`, `sol`, `weg.azul`, `verde`, `coral`). Fonte `Inter`. Sem plugins |
| Gráficos | **Nenhuma lib.** SVG inline manual (`components/GraficoImpactoHibrido.tsx`) |
| Forms / validação | **Nenhuma lib.** `useState<FormData>` + `useTransition` chamando Server Action que valida no server e retorna `{ erro }` \| `{ sucesso }`. Formatters manuais em `lib/formatters.ts`. Zero `react-hook-form`, `zod`, `formik` no fonte |
| Supabase | `@supabase/ssr ^0.5.2` + `@supabase/supabase-js ^2.45.4`. Três clients em `lib/supabase/`: `client.ts` (browser), `server.ts` (server + cookies), `admin.ts`. Middleware refresca cookies. **Sem react-query/SWR** — todo fetch é server-side em Server Component (`export const dynamic = 'force-dynamic'`); mutations por Server Actions |
| Outras deps | `@anthropic-ai/sdk` (Bianca/Davi), Leaflet + Google Maps loader (telhado no mapa), Turf.js (área/centróide), jsPDF + html2canvas + html-to-image (proposta PDF), pdf-parse, xlsx |

---

## 2. BANCO

**Última migration:** `056_favicon_papel_timbrado.sql` (numeradas 001–056, faltando o número 003 — nunca existiu).

**Tabelas por domínio** (todas em `public.`):

| Domínio | Tabelas |
|---|---|
| Auth / core | `profiles`, `representantes`, `audit_log`, `logs_auditoria`, `configuracoes_empresa` |
| Catálogo WEG | `produtos`, `precos_produtos`, `estoque`, `cidades_isopleta`, `planilha_weg_versoes`, `weg_imports`, `catalogo_uploads_historico` |
| Precificação | `parametros_precificacao`, `parametros_precificacao_log`, `parametros_precificacao_servicos`, `faixas_precificacao_servicos`, `parametros_proposta` |
| Comercial / CRM | `clientes`, `leads`, `interacoes_cliente`, `metas`, `comissoes` |
| Técnico / Projeto | `projetos`, `projetos_telhado_secoes`, `projetos_anexos`, `projeto_itens`, `projeto_status_historico`, `projetos_diagramas`, `projeto_hibrido_analise`, `projeto_hibrido_dimensionamento` |
| Homologação | `homologacoes`, `homologacao_etapas` |
| Agenda / IA | `agenda_eventos`, `agenda_tarefas`, `agenda_historico`, `bianca_conversas`, `bianca_comunicacoes`, `bianca_gatilhos`, `bianca_eventos_disparados`, `davi_conversas`, `cotacoes_mercado`, `solicitacoes_cotacao` |
| Financeiro | `categorias_financeiras`, `contas_receber`, `contas_pagar`, `movimentos_caixa` |
| Operações / compras | `fornecedores`, `pedidos_compra`, `pedido_compra_itens`, `equipes_instalacao`, `equipe_membros`, `instalacoes` |
| Fiscal | `notas_fiscais`, `contratos`, `documentos_projeto` |
| Pós-venda / execução | `ordens_servico`, `garantias`, `execucoes_servicos`, `execucoes_status_historico` |

### Pessoas — não unificada

**Não existe tabela `pessoas` unificada.** Três entidades separadas:
- `clientes` — com discriminador `tipo IN ('pf', 'pj')`; FK `proprietario_id → profiles`
- `leads` — tabela separada com FK opcional `cliente_id`
- `fornecedores` — independente, só CNPJ

`profiles` é extensão de `auth.users` (Kalebe, consultores, instaladores). Ver `019_erp_fundacao.sql:17–59` e `188–202`.

### Sistema instalado / projeto / obra — CRÍTICO

**Três tabelas cobrem parcialmente o conceito, mas NENHUMA representa o ativo físico persistente:**

1. **`projetos`** (`005_projetos.sql` + evoluções em 021, 022, 024, 025):
   - É **workflow de proposta/venda**, não o ativo
   - Campos: `codigo` (`SPIN-2026-0001`), `cliente_id`, `titular_cliente_id`, `endereco_instalacao jsonb`, `uc_geradora`, `ucs_beneficiarias text[]`, `tipo_projeto`, `status projeto_status ENUM`, `analise_fatura jsonb`, `kit_selecionado jsonb`, `orcamento_final jsonb`, `qtd_placas_estimada int`, `data_instalacao_prevista date`
   - **NÃO tem** `qtd_modulos` final (só `estimada`) nem `data_conexao` (só `data_instalacao_prevista`)

2. **`instalacoes`** (`019_erp_fundacao.sql:254–273`):
   - Agendamento de instalação: `projeto_id`, `data_agendada`, `equipe_id`, `status`, `fotos_before/after`, `concluida_em`
   - Sem `qtd_modulos` nem `data_conexao`

3. **`execucoes_servicos`** (`053_execucoes_servicos.sql`):
   - Pipeline de execução de qualquer item da proposta (FV, limpeza, manutenção, retirada)
   - FK pra `projetos` + opcional `projeto_itens`, com `tipo_servico`, `status` de 9 estados (incluindo `pos_venda`), materiais/checklist/fotos JSONB

**⚠️ Não existe `telhados` como ativo físico persistente.** Só `projetos_telhado_secoes` (mig 041/055), que é anexo do projeto pra dimensionamento — tem `coordenadas_geo jsonb` e `azimute_graus`, mas é vinculado ao projeto (workflow), não é o ativo em si.

### Orçamento / proposta

Não há tabela dedicada. Vive dentro de:
- `projetos.orcamento_final jsonb` — snapshot congelado do resultado final
- `projetos.url_pdf_proposta` (mig 013)
- `projetos.valor_total_proposta` (mig 025)
- `projeto_itens` (mig 025) — linhas por tipo (`fv_ongrid`, `srv_limpeza`, etc), com `dados jsonb` guardando `{ entradas, resultado_calculado, valor_final_com_ajuste }`

---

## 3. CALCULADORA ATUAL — a pergunta mais importante

### Onde vive

**Motor por serviço em `lib/precificacao/`** — cada arquivo é puramente funcional `(entradas, params) => resultado`:

| Arquivo | Função | Consumo |
|---|---|---|
| `lib/precificacao/calcular.ts` | `calcularProposta()` — proposta FV consolidada (kit WEG + lista CA + margem/comissão/impostos) | `app/projetos/[id]/orcamento/page.tsx:126` |
| `lib/precificacao/servico-limpeza.ts:63` | `calcularLimpeza()` | `components/ServicoLimpezaForm.tsx:49` (`useMemo`) |
| `lib/precificacao/servico-instalacao-placas.ts:110` | `calcularInstalacaoPlacas()` | `components/ServicoInstalacaoForm.tsx` |
| `lib/precificacao/servico-retirada-recolocacao.ts` | `calcularRetiradaRecolocacao()` | `components/ServicoRetiradaForm.tsx` |
| `lib/precificacao/servico-revisao.ts` | `calcularRevisao()` | `components/ServicoRevisaoForm.tsx` |
| `lib/precificacao/faixas.ts:24` | `encontrarFaixa()` — pura lookup | Todos os motores |

### Modelo: faixas ou valor único?

**Híbrido, sem preço marginal.** Dois níveis convivem:

1. **Motor detalhado (unitário-composto)** — soma componentes: mão-de-obra × qtd × fatores (telhado/pavimento/programação) + km + diárias + insumos + materiais. Ver `servico-limpeza.ts:74–126`.

2. **Faixas** (`faixas_precificacao_servicos`, mig 051/052) — **valor fixo por faixa** (não é marginal, não é R$/unidade dentro da faixa). Servem como:
   - (a) referência mostrada no form
   - (b) "usar valor da faixa" que joga um `ajuste` em cima do subtotal calculado
     `usarValorFaixa = () => setAjuste(faixaAtual.valor - resultado.subtotal)` — `ServicoLimpezaForm.tsx:56–57, 205–213`

**Não é marginal em nenhum lugar.** Exceção parcial: `tabela_instalacao_rs_placa` (mig 004:220) tem faixas com `rs_por_placa`, mas ainda aplica UMA taxa única pra toda a quantidade (`instalacao = numeroPlacas * rsPorPlaca`, `calcular.ts:120`).

### Snapshot ou recálculo?

**Ambos, mas o snapshot é solto (sem FK).**

- **Recálculo:** `orcamento/page.tsx` busca `parametros_precificacao WHERE ativo=true AND vigente_ate IS NULL` e chama `calcularProposta` a cada load
- **Snapshot:** quando o consultor salva, grava o resultado inteiro em JSONB:
  - `projetos.orcamento_final` (FV) — ver `app/projetos/[id]/orcamento/actions.ts:19`
  - `projeto_itens.dados = { entradas, resultado_calculado, valor_final_com_ajuste }` (serviços) — ver `app/projetos/[id]/servico-limpeza/actions.ts:29–33`

### Versionamento

- **Parâmetros têm SCD Type 2**: `parametros_precificacao.vigente_de / vigente_ate` (mig 004), log em `parametros_precificacao_log`, RPC `editar_parametro_precificacao` que fecha vigência antiga + insere nova ✅
- **MAS orçamento/serviço não guarda `versao_tabela_id`** — grep por `versao_tabela|versao_parametros|snapshot_parametros|param_versao_id` = **0 hits**
- Rastreabilidade depende só do JSON congelado dentro de `orcamento_final` / `projeto_itens.dados`, sem FK pra qual linha da tabela originou

### Arquivos-chave (migrations)
- `004_painel_precificacao.sql` — parâmetros FV vigentes + log + RPC + view `v_parametros_vigentes`
- `047_precificacao_servicos.sql` — `parametros_precificacao_servicos` (JSONB por chave de serviço, singleton)
- `049_precificacao_instalacao_placas.sql`, `050_precificacao_limpeza_revisao.sql` — seeds
- `051_faixas_servicos.sql` — `faixas_precificacao_servicos` (`chave_servico`, `unidade`, `faixa_min`, `faixa_max`, `valor`)
- `052_faixas_todos_servicos.sql` — expande unidades (`hora, m2, m_linear, km, amperes, diagnostico`)

---

## 4. AUTENTICAÇÃO E PAPÉIS

### Papéis (`001_initial_schema.sql:8`)

Enum `user_role`: `admin | representante | instalador | colaborador`.

**⚠️ Não existe `vendedor` / `consultor_servicos` explícito.** Provavelmente `representante` é o mais próximo, mas o vocabulário do módulo Serviços fala em "vendedor" — vai precisar decisão de nomenclatura ou role novo.

### Onde o papel é armazenado

- Tabela `public.profiles` (FK 1:1 pra `auth.users`)
- Coluna `role user_role NOT NULL DEFAULT 'colaborador'`
- **Não há claim JWT** — o role vive só em `profiles`
- Toda checagem passa pela função `public.is_admin()` (`001:97`), `SECURITY DEFINER STABLE`, que faz `SELECT role FROM profiles WHERE id = auth.uid()`
- **Não achei função equivalente** `is_representante()` / `is_instalador()`

### RLS — exemplos representativos

| Tabela | Policy | Efeito |
|---|---|---|
| `projetos` (005:147) | `USING (consultor_id = auth.uid())` + `admin_all` | Consultor só vê os próprios |
| `contas_receber` / `contas_pagar` / `movimentos_caixa` (019:448) | Só `USING (public.is_admin())` | **Não-admin não vê nada** ✅ (Restrição 11.2 já respeitada em tabelas críticas) |
| `leads` / `clientes` (019:429–433) | `dono` via `proprietario_id = auth.uid()` + `admin_all` | Consultor vê os próprios |
| `execucoes_servicos` (053:76) | `execucoes_read_all USING (auth.uid() IS NOT NULL)` | ⚠️ **Qualquer logado lê tudo**. Update só se `responsavel_tecnico OR criada_por` |

---

## 5. VERTICAIS ATUAIS

### Como estão separados

**Não há tabelas distintas por vertical.** Tudo cabe em `projetos + projeto_itens` (mig 025–028, 046).

O enum `tipo_item_projeto` tem **20 valores**:
- `fv_ongrid`, `fv_hibrido`, `fv_zero_grid`, `fv_offgrid` (fotovoltaico)
- `bess` (baterias)
- `ve_recarga` (carregador veicular)
- 8 tipos `srv_*` (limpeza, manutenção, retirada+recolocação, instalação de placas, revisão, laudo, etc)
- 3 tipos de construção
- 2 tipos de aluguel
- `outros`

Mapeados em `lib/tipos-projeto.ts` com fluxos por passo. Proposta tem `modo_proposta = 'simples' | 'combinada'`.

### Pipeline CRM

**Dois pipelines paralelos (potencial conflito):**

- **Comercial (principal):** enum `projeto_status` (mig 005 + 022) com **19 valores agrupados em 6 fases** (`projeto → negocio → venda → execucao → pos_venda → perdido`), definidas em `lib/projeto-pipeline.ts`. UI em `app/crm/pipeline/page.tsx`. Histórico em `projeto_status_historico`.
- **Legado/paralelo:** `public.leads.status` (mig 019:48) com `novo | qualificando | proposta | negociacao | ganho | perdido`.

### Execuções / OS

**⚠️ 3 tabelas parcialmente sobrepostas:**

1. **`execucoes_servicos`** (mig 053, novo) — 9 status: `aguardando_pre_requisitos → agendando → agendado → preparando_material → em_execucao → concluido → entregue → pos_venda | cancelado`. FK pra `projetos` e `projeto_itens`, checklist/fotos/aceite. Histórico em `execucoes_status_historico`. UI em `app/execucoes/`.
2. **`instalacoes`** (mig 019:254) — mais simples, só agendamento
3. **`ordens_servico`** (mig 019:344) — legado

Recomendação de consolidação vai pra "DECISÕES QUE PRECISO DO DONO".

---

## 6. PADRÕES DE CÓDIGO

### Estrutura de pastas
```
app/
  crm/           erp/           financeiro/     operacoes/
  pos-venda/     execucoes/     projetos/       homologacoes/
  agenda/        admin/         api/            (etc)
components/
  (arquivos soltos + subpastas: stats/, proposta/blocos/)
  ui/            ← EXISTE MAS ESTÁ VAZIO (sem design system centralizado)
lib/
  precificacao/  proposta/      hibrido/        diagrama/
  homologacao/   bianca/        davi/           supabase/
  execucoes.ts, projeto-pipeline.ts, tipos-projeto.ts, formatters.ts
supabase/
  migrations/    (001–056, kebab_case)
```

**Não existe `hooks/` global.**

### Convenção de nomes
- Componentes: **PascalCase** (`ClienteForm.tsx`, `HomologacaoPipeline.tsx`, `StatsCRM.tsx`)
- Libs, actions e rotas: **kebab-case/snake_case** (`projeto-pipeline.ts`, `servico-limpeza.ts`, `pos-venda/`)
- Migrations SQL: `NNN_descricao_snake_case.sql`

### Design system
**Não existe.** Sem shadcn/ui, sem Radix. Padrão visual reforçado em `<PortalHeader>` e `<ModuloHub>`. Componentes usam classes Tailwind com tokens da paleta custom (`bg-noite`, `text-sol`, `border-coral/30`, `bg-white/5`). Estilo: fundo dark, cards `rounded-xl border border-white/10 bg-white/5`, tipografia Inter com `tracking-tightish`.

### Server Actions
- Um arquivo `actions.ts` por rota (29 arquivos)
- Sempre com `'use server'` no topo
- `createClient()` server + `auth.getUser()` como primeira validação
- `revalidatePath()` no final
- **Sem camada de service/repository** entre action e Supabase — queries inline

### Convenção de erro
- **Retorno estruturado** `{ erro: string }` \| `{ sucesso: true }` das actions (187 ocorrências em 29 arquivos)
- Consumidor mostra em UI com bloco `bg-coral/10 border border-coral/30`
- **Sem biblioteca de toast** (nem sonner, nem react-hot-toast)
- `app/error.tsx` como fallback de rota
- `components/ErrorBoundaryClient.tsx` como boundary genérico

---

## IMPACTO NO MÓDULO SERVIÇOS — 4 decisões irreversíveis (seção 11.4)

### Decisão 1 — Telhado como entidade (não campo do cliente)
**Status: ❌ NÃO ATENDIDO. Precisa CRIAR entidade nova.**

- `projetos` é workflow comercial, não ativo físico (status enum de 19 valores relacionados a fase de venda/execução, não a ciclo de vida do ativo)
- Um mesmo telhado pode originar múltiplos `projetos` ao longo do tempo (novo orçamento vira novo projeto)
- Faltam campos do ativo: `qtd_modulos` final, `data_conexao`, `inclinacao_graus`, `altura_metros`, `tem_ponto_agua`, `nivel_sujidade`, `distancia_km`, `ultima_limpeza`, `score`
- `projetos_telhado_secoes` é anexo do projeto pra dimensionamento (coordenadas + azimute) — não é o ativo em si

**Ver "Decisão A" abaixo em DECISÕES QUE TOMEI.**

### Decisão 2 — Carimbo de origem gravado no insert, imutável
**Status: 🟡 PARCIAL. Precisa refatorar + criar triggers.**

- `leads.origem` (mig 019) existe como enum, mas:
  - Sem trigger de imutabilidade (UPDATE por não-admin não é bloqueado)
  - Sem trigger de dedup (não força `base` quando CPF/CNPJ/coordenada já existe)
  - Sem trigger de resfriamento (não força `campanha` quando há inbound nos últimos 90d)
- Precisa implementar as **4 regras de trigger da seção 6.a-d do PROMPT ÚNICO** em `telhados` (e também retroativamente em `leads`, se optar por unificar)

### Decisão 3 — Versão da tabela de preço em cada transação
**Status: 🟡 PARCIAL/INSUFICIENTE. Precisa refatoração.**

- **✅ Sim:** `parametros_precificacao` tem SCD Type 2 (`vigente_de` / `vigente_ate`) + `parametros_precificacao_log` + RPC transacional. Cultura de versionamento existe.
- **❌ Falta:** **nenhuma tabela transacional guarda `versao_tabela_id`**. Só congela snapshot em JSONB (`orcamento_final`, `projeto_itens.dados`) — soft, sem FK
- Refatoração necessária: adicionar `versao_tabela_id uuid NOT NULL` em (novas) tabelas `oportunidades`, `contratos`, `ordens_servico_servicos`, gravada no INSERT, nunca UPDATE
- Como o motor de preço atual não é marginal, a criação do `fn_preco_base_marginal` (fase 3) vai casar bem com a introdução de `versao_tabela_id`

### Decisão 4 — Log de alteração desde o dia um
**Status: ✅ ATENDIDO EM CULTURA, precisa consolidar em função genérica.**

Já existem: `parametros_precificacao_log`, `projeto_status_historico`, `execucoes_status_historico`, `agenda_historico`, `audit_log`, `logs_auditoria`. Cultura de log está estabelecida.

Falta: **função genérica reutilizável** `log_alteracoes(tabela, registro_id, campo, valor_anterior, valor_novo, motivo, usuario_id, created_at)` + trigger genérico, aplicada em `origem`, `valor_final`, `desconto_percentual`, `versao_tabela_id`, `etapa`, `pipeline` (conforme fase 2.d do PROMPT).

---

## RISCOS — o que pode quebrar

1. **3 tabelas de OS sobrepostas** (`execucoes_servicos` + `instalacoes` + `ordens_servico`) — sem consolidação, o Módulo Serviços cria a 4ª e a fonte de verdade fica ainda mais confusa. **Recomendação: consolidar em `execucoes_servicos` e deprecar as outras duas ANTES de começar a fase 6.**

2. **Pipeline duplo** (`projeto_status` de 19 valores VS `leads.status` de 6 valores) — o CRM de Serviços vai ter seus **3 pipelines próprios** (base/campanha/prospeccao) com etapas específicas. Se plugar em `projeto_status` existente, quebra o funil de solar. Se criar novo, aumenta a fragmentação. Precisa decisão explícita.

3. **Role `vendedor` inexistente** — enum atual não tem. Vai precisar `ALTER TYPE user_role ADD VALUE 'vendedor_servicos'` ou reaproveitar `representante`. Como enum não é reversível trivialmente, decidir cedo.

4. **`components/ui/` vazio + sem lib de form** — todo componente novo (kanban, tabela, modal de aprovação, form multi-step de proposta) será construído artesanalmente. É consistente com o padrão do app, mas a fase 5 (calculadora reativa + gerador de proposta) vai ter volume de código considerável.

5. **RLS de `execucoes_servicos` permissiva** — qualquer autenticado lê tudo. Se Serviços plugar aqui, o vendedor de solar vê OS de Serviços (viola seção 12: "vendedor de Serviços NÃO vê pipeline de solar"). Precisa apertar antes.

6. **Faixas atuais não são marginais** — se algum consumidor externo (relatório, dashboard, export) já usa `faixas_precificacao_servicos` esperando valor fixo, a migração pra marginal quebra retrocompatibilidade. Precisa auditar consumidores antes de trocar.

7. **Migrations sequenciais numeradas** — o próximo número livre é 057. Se outro dev subir uma migration em paralelo, colide. Combinar reserva antecipada da faixa 057-070 pro Módulo Serviços.

8. **Sem lib de gráficos** — os painéis do vendedor/gestor (fase 7) vão precisar SVG artesanal ou introduzir uma dep (Recharts é o candidato natural). Decidir na fase 1.

---

## DECISÕES QUE PRECISO DO DONO

Estas não deu pra inferir do código. Preciso da tua resposta antes da fase 2.

### 1. Consolidação das 3 tabelas de OS
- **Opção A:** manter só `execucoes_servicos` (nova, mais completa) e migrar `instalacoes` + `ordens_servico` pra ela via job. O Módulo Serviços pluga direto aqui.
- **Opção B:** deixar as 3 tabelas legadas intocadas (evita risco de regressão) e o Módulo Serviços cria uma 4ª `ordens_servico_servicos` isolada.
- **Recomendação minha:** Opção A — 4 tabelas de OS é insustentável e vai gerar bug de reconciliação de fluxo financeiro.

### 2. Nome do role novo
- **Opção A:** reaproveitar `representante` (já existe no enum, cabe conceitualmente)
- **Opção B:** adicionar `vendedor_servicos` como valor novo (mais explícito, permite RLS específica)
- **Recomendação minha:** Opção B — a especificação separa vendedor de solar de vendedor de serviços em vários pontos (seção 12: "vendedor de serviços NÃO vê pipeline de solar")

### 3. Pipeline: reaproveitar `projeto_status` ou criar `oportunidade_status`?
- **Opção A:** estender enum `projeto_status` com etapas dos 3 pipelines novos (funil confuso, mistura solar+serviços)
- **Opção B:** criar tabela `oportunidades` isolada com FK pra `pipelines`/`pipeline_etapas` (como o PROMPT descreve na fase 4). `projetos` continua sendo o workflow de solar.
- **Recomendação minha:** Opção B — o PROMPT explicitamente pede tabelas separadas, e isso deixa o funil de Solar intacto.

### 4. Base SPIN a importar
- Qual a fonte primária? Vejo `projetos` com status `instalado`/`ativo_pos_venda` já cadastrados, mas o PROMPT (fase 8) menciona planilha vinda de homologações/notas/contratos/portais de monitoramento.
- **Pergunta:** os projetos já cadastrados com `status='instalado'` ou `status='ativo_pos_venda'` devem ser promovidos a `telhados` **automaticamente** no job de fundação (fase 2)? Ou o dono prefere que a base SPIN seja SEMPRE via planilha importada pelo assistente (fase 8), começando do zero?
- **Recomendação minha:** promover automaticamente ao rodar a fase 2, e usar o importador da fase 8 apenas pra sistemas SPIN que **não** tenham `projetos` cadastrados (ex: instalações antigas anteriores ao app).

### 5. Tolerância de raio pra dedup por coordenada
- PROMPT diz "coordenada em raio de ~30 m" (regra de trigger 6.b).
- **Pergunta:** confirma 30m ou prefere ajustar (20m mais rígido, 50m mais permissivo)?
- Impacta: telhado industrial grande pode ter 2 medidores/inversores em endereços próximos e cair no dedup errado se raio for muito largo.
- **Recomendação minha:** 30m está adequado pro Brasil urbano/rural (precisão típica de GPS de smartphone é ±5-10m, e área ocupada por telhado residencial cabe em 15m de raio).

### 6. Nomenclatura do vocabulário (restrição 11.1 aplicada à UI)
- PROMPT proíbe: "expediente", "jornada", "falta", "atraso", "ponto". Manda usar "ritmo sugerido", "janelas de conversão", "meta de atividade".
- **Pergunta:** o app atual já tem algum termo em uso (ex: "carga de trabalho", "produtividade", "dashboard operacional") que devo evitar ou padronizar?
- Impacta: reuso vs criação de novos nomes em labels/menus. Detalhe pequeno mas irreversível depois que sobe.

---

## DECISÕES QUE TOMEI SOZINHO (documentadas conforme PROMPT)

### Decisão A — Criar `telhados` do zero (não promover tabela existente)

**Motivo:** o PROMPT diz "se já existe tabela de instalação/projeto com qtd de módulos e data de conexão → não crie do zero, promova". Auditei:
- `projetos` tem `qtd_placas_estimada` (não `qtd_modulos` final) e `data_instalacao_prevista` (não `data_conexao`) → **não atende o critério**
- `instalacoes` tem só agendamento → não atende
- `projetos_telhado_secoes` é anexo pra dimensionamento (seções + azimute) → não atende

**Estratégia:** criar `telhados` na fase 2 + job de migração no bootstrap que promove projetos com `status IN ('instalado', 'ativo_pos_venda')` a telhados (1-to-1 por cliente+endereço no primeiro projeto instalado), preservando histórico via FK `telhados.projeto_origem_id`.

### Decisão B — Motor de preço marginal SEPARADO, migração incremental (fases 3 e 5 continuam separadas)

**Motivo:** calculadora atual é híbrida (unitário-composto + faixas de valor fixo), não é valor único por módulo. Trocar tudo em big-bang quebra `servico-instalacao-placas`, `servico-retirada-recolocacao` e `servico-revisao` que não estão no escopo do Módulo Serviços agora.

**Estratégia:** criar `fn_preco_base_marginal` novo no banco (fase 3), específico pra limpeza/manutenção do Módulo Serviços. Motor legado (`lib/precificacao/servico-*.ts`) continua servindo os outros tipos de serviço enquanto migração incremental acontece.

Fases 3 (motor) e 5 (proposta) permanecem separadas, mas devem consumir o mesmo `fn_preco_final` do banco (não recalcular no front).

---

## Próximo passo

**PARE — aguardando validação deste diagnóstico antes de seguir pra fase 1 (PLANO.md).**

Preciso das respostas às 6 decisões pendentes (especialmente #1, #2, #3, #4) pra montar o PLANO com precisão. As demais podem ser respondidas depois.
