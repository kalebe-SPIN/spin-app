# Roadmap do Portal Interno — Spin Solar

> **Visão original do Kalebe (junho/2026):** transformar o `app.spinsolar.com.br` numa plataforma completa de operação comercial pros vendedores/representantes Spin.

---

## 🎯 As 12 ferramentas planejadas

1. **CRM** — gestão de leads e pipeline
2. **Gerador de proposta PDF** — personalizado com dados do cliente
3. **Gerador de contrato** — templates por categoria
4. **Gerador de procuração** — com assinatura digital (CELESC, financiamento)
5. **Painel de resultados** — vendas, comissões, histórico
6. **Chat com cliente em tempo real**
7. **Repositório de criativos** — campanhas com a marca Spin
8. **Agente Oráculo (IA)** — conhecimento técnico WEG + operação Spin
9. **Comparador de concorrência** — produtos e propostas
10. **Perfil profissional do consultor** — foto, bio, regiões atendidas
11. **Atribuição automática de lead** — consultor mais próximo
12. **Email corporativo** `@spinsolar.com.br` por consultor

---

## 🗺️ Roadmap em 5 fases

Ordem decidida: **A → B → C → D → E** (cada fase entrega valor independente).

### 🌱 FASE A — Fundação operacional (~4-6 semanas)

*Você já tem login funcionando. Agora dá ferramentas básicas pro vendedor atuar.*

- Sprint 1.x: Seção "Nosso time" no `menu.spinsolar.com.br` + atribuição por proximidade
- Perfil completo do consultor (foto profissional, bio, especialidade, regiões)
- Email corporativo `@spinsolar.com.br` (Zoho Mail free até 5 usuários, ou Google Workspace R$ 26/mês/usuário)
- Painel admin pra CRUD básico (catálogo + usuários)

**Pré-requisitos:**
- Lista dos 2-5 representantes (nome, telefone, cidades atendidas)
- Fotos profissionais de cada um (sugestão: contratar fotógrafo, R$ 200-500/foto)

---

### 💼 FASE B — Fechamento de venda (~4-6 semanas)

*Permite vendedor sair com a venda fechada, papelada pronta, assinada digitalmente.*

- **Gerador de proposta PDF** (migrar do menu-spin público pro portal interno)
- **Gerador de contrato** (templates por categoria de kit/cliente)
- **Gerador de procuração** (pra homologação CELESC e financiamento bancário)
- **Assinatura digital** integrada:
  - Zapsign: R$ 49/mês ilimitado (recomendado)
  - Clicksign: R$ 79/mês

---

### 📊 FASE C — CRM + Painel de resultados (~6-8 semanas)

*O coração comercial. Lead entra → é trackeado → vira venda → gera comissão.*

- **CRM completo** customizado no Supabase
  - Pipeline de vendas (status, follow-ups, notas)
  - Decisão tomada: NÃO usar HubSpot/Pipefy (construir próprio porque custa R$ 0, integra nativamente, e dados ficam **nossos**)
- **Painel de resultados** (dashboards)
  - Vendas do mês
  - Comissões a pagar / pagas
  - Histórico de fechamentos
- **Integração WhatsApp Business API** pra rastrear conversas com leads

---

### 🤖 FASE D — Oráculo IA + Comparador concorrência (~4-6 semanas)

*Diferencial competitivo enorme. Multiplica conhecimento técnico em todo o time.*

- **Agente Oráculo** com IA (Claude API)
  - RAG sobre: datasheets WEG (já consolidados), catálogo Spin, FAQs comuns, política comercial, regras CELESC
  - Vendedor pergunta: *"Cliente em Itajaí com fatura R$ 850, telhado fibrocimento, quer financiar 60 meses, qual o melhor kit?"* → Oráculo responde
  - Decisão tomada (v1): SEM histórico de leads ainda (escopo: técnico WEG + operação Spin)
  - Custo estimado: ~R$ 100-300/mês conforme uso
- **Comparador de concorrência**
  - Banco de dados de modelos da Canadian, Trina, Risen, etc.
  - Preços, prós/contras, comparativo lado a lado
  - Vendedor usa pra justificar escolha WEG vs concorrente

---

### 💬 FASE E — Chat com cliente + Repositório criativos (~3-4 semanas)

*Comunicação direta com cliente + munição pra divulgação nas redes.*

- **Chat com cliente em tempo real**
  - Supabase Realtime (alternativa open source ao Intercom, custo R$ 0)
  - Histórico de conversas associado ao lead no CRM
- **Repositório de criativos** organizado
  - Vídeos, posts, banners, templates da marca Spin
  - Categorias, tags, formatos (Story, Feed, Reels, anúncios)
  - Vendedor baixa e posta nas próprias redes sociais
  - Pode evoluir pra gerador assistido de posts personalizados

---

## ⏱️ Tempo total estimado

**~6-8 meses** de trabalho focado pra ter TUDO em produção.

**Cada fase entrega valor independente** — não precisa esperar a fase 5 pra começar a usar.

---

## 💰 Custos operacionais mensais estimados (depois de TUDO no ar)

| Item | Custo |
|---|---|
| Vercel hosting | R$ 0 (free tier suficiente) |
| Supabase | R$ 0 (free) → R$ 130/mês (Pro) quando crescer |
| Email corporativo (5 usuários) | R$ 0 (Zoho) ou R$ 130 (Google Workspace) |
| Assinatura digital (Zapsign) | R$ 49 |
| Claude API (Oráculo) | R$ 100-300 |
| WhatsApp Business API | R$ 0-200 |
| **TOTAL** | **R$ 150-700/mês** |

Bem barato pro que entrega.

---

## 🛠️ Stack técnica consolidada

- **Frontend portal:** Next.js 14 + TypeScript + Tailwind CSS
- **Backend + Auth + Storage:** Supabase
- **Realtime (chat):** Supabase Realtime
- **IA (Oráculo):** Claude API (Anthropic)
- **Assinatura digital:** Zapsign API
- **PDFs:** html2canvas + jsPDF (já tem no menu-spin)
- **Email:** Zoho Mail / Google Workspace + Resend (notificações)
- **Hospedagem:** Vercel
- **DNS:** Registro.br → cPanel HostGator
- **Versionamento:** GitHub (kalebe-SPIN/spin-app público)

---

## 📌 O que já está pronto no portal (junho/2026)

- ✅ Login email/senha funcional
- ✅ Dashboard com cards de atalho (todos "em breve")
- ✅ Página de perfil básica
- ✅ Middleware de proteção de rotas
- ✅ Schema SQL com `profiles`, `representantes`, `audit_log`
- ✅ RLS configurada com `is_admin()` function
- ✅ Repositório versionado no GitHub
- ✅ Deploy automático pelo Vercel
- ✅ Domínio `app.spinsolar.com.br` com HTTPS Let's Encrypt
- ✅ 2FA ativado na conta Vercel

---

## 🚦 Como retomar daqui

Quando voltar (próxima sessão, próxima semana, próximo mês):

1. Abre o Claude Code apontando pra `C:\Users\Usuário\Documents\GitHub\spin-app`
2. Pergunta: *"O que falta na FASE A?"* ou *"Vamos pra FASE A"*
3. Eu pego daqui — leio este ROADMAP, vejo tasks pendentes, sigo

**Tarefas no sistema:**
- #32 — FASE A: Fundação operacional
- #33 — FASE B: Fechamento de venda
- #34 — FASE C: CRM + Painel de resultados
- #35 — FASE D: Oráculo IA + Comparador concorrência
- #36 — FASE E: Chat com cliente + Repositório criativos
- #31 — Sprint 1.x (parte da FASE A)

---

*Documento atualizado em junho/2026, sessão de fechamento Sprint 1.*
*Autor da visão: Kalebe Silva. Sistematização: Claude.*
