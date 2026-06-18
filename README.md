# Spin Solar — Portal Interno (`spin-app`)

Sistema interno para **representantes**, **instaladores** e **equipe Spin Solar** gerenciarem:

- 📊 OCR de fatura CELESC
- 📄 Geração de proposta PDF
- 📝 Geração de contrato
- 🛠️ Catálogo (placas, inversores, baterias, componentes) — admin only
- 👥 Vendedores com link de afiliação e tracking de leads
- ⚙️ Gestão de usuários e papéis

> ℹ️ **Cliente final NÃO tem login aqui.** Cliente acessa apenas o site público
> [menu.spinsolar.com.br](https://menu.spinsolar.com.br) com o catálogo e
> calculadora visual. Documentos formais e operações saem deste sistema interno.

---

## 🛠️ Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (design system Spin v3 — paleta noite/sol/weg)
- **Supabase** — Auth, Database (Postgres), Storage, Realtime
- **Vercel** — hospedagem (free tier cobre o uso atual)

---

## 🚀 Como rodar localmente

### Pré-requisitos

- Node.js 20+ ([baixar](https://nodejs.org/))
- Conta Supabase ([dashboard](https://supabase.com/dashboard))

### Setup

```bash
# 1. Clone (depois que o repo estiver no GitHub)
git clone https://github.com/kalebe-SPIN/spin-app.git
cd spin-app

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.local.example .env.local
# Edite .env.local e preencha com suas credenciais Supabase

# 4. Aplicar migrations no Supabase
# Abra Supabase Dashboard > SQL Editor > cole o conteúdo de:
# supabase/migrations/001_initial_schema.sql
# E execute (rode uma vez por projeto).

# 5. Rodar em dev
npm run dev
# Abre em http://localhost:3000
```

---

## 📁 Estrutura

```
spin-app/
├── app/
│   ├── layout.tsx              # Layout raiz
│   ├── page.tsx                # / → redirect pra /login
│   ├── globals.css             # Tailwind + design system
│   ├── login/page.tsx          # /login (público)
│   ├── dashboard/page.tsx      # /dashboard (protegido)
│   ├── conta/page.tsx          # /conta (protegido — perfil do usuário)
│   └── api/auth/
│       ├── callback/route.ts   # OAuth callback
│       └── signout/route.ts    # Logout
├── components/
│   ├── LoginForm.tsx           # Formulário de login (client component)
│   └── ui/                     # Componentes reutilizáveis (futuro)
├── lib/
│   └── supabase/
│       ├── client.ts           # Cliente Supabase pro BROWSER
│       └── server.ts           # Cliente Supabase pro SERVER
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # Schema inicial (profiles, representantes, audit_log)
├── middleware.ts                # Proteção de rotas + renovação de sessão
├── next.config.js
├── tailwind.config.js
├── package.json
├── tsconfig.json
└── .env.local.example          # Template das variáveis de ambiente
```

---

## 🔐 Papéis de acesso

| Papel | O que pode acessar |
|---|---|
| **admin** | Tudo: dashboard, catálogo CRUD, usuários, audit log |
| **representante** | Dashboard, OCR fatura, gerar proposta/contrato, meus leads, link afiliação |
| **instalador** | Dashboard, instalações agendadas (futuro), checklist técnico |
| **colaborador** | Dashboard, ferramentas operacionais limitadas |

Papéis são armazenados na coluna `role` da tabela `profiles`.

---

## 🛣️ Roadmap

- ✅ **Sprint 0** — Esconder OCR/PDF/contrato do menu público (DONE no repo `menu-spin`)
- 🟡 **Sprint 1** (atual) — Setup + login + dashboard básico
- ⏳ **Sprint 1.x** — Seção "Nosso time" no menu-spin puxando representantes daqui
- ⏳ **Sprint 2** — Painel admin (CRUD catálogo + preços + usuários)
- ⏳ **Sprint 3** — OCR fatura migrado pra cá (com cliente cadastrado)
- ⏳ **Sprint 4** — Gerador de proposta PDF (com dados do cliente)
- ⏳ **Sprint 5** — Gerador de contrato
- ⏳ **Sprint 6** — Link de afiliação + tracking + comissões
- ⏳ **Sprint 7** — Hardening (RLS rigorosa, backups, monitoramento)

---

## 🔗 Projetos relacionados

- **`menu-spin`** — vitrine pública em [menu.spinsolar.com.br](https://menu.spinsolar.com.br)
- **`spin-app`** (este) — sistema interno em `app.spinsolar.com.br` (em construção)

---

## 📜 Licença

Privado / proprietário. Spin Solar Energias Renováveis Ltda · CNPJ 22.279.642/0001-04
