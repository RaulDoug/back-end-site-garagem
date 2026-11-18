# Arquitetura do Ecossistema: Backend Global, ADM SaaS e Vitrine Whitelabel

> **Objetivo**: Documentar a arquitetura do ecossistema Multi-Tenant e Multi-Store, o estado atual validado no backend, as decisões arquiteturais consolidadas após o code review da Fase 5 e a visão alvo de defesa em profundidade definida em [roadmap-seguranca.md](./roadmaps/roadmap-seguranca.md).

---

## 1. Visão Geral dos 3 Pilares

```mermaid
flowchart TD
    subgraph Frontends["Camada de Apresentação (Frontends)"]
        ADM["Painel ADM Único (SaaS)\nLogin JWT (Admin da Loja / Vendedor / Visualizador)"]
        Ops["Provisionamento SaaS (Operador)\nHeader x-onboarding-secret"]
        VitrineA["Vitrine Cliente A (Template + Pacote NPM)\nEnvia x-tenant-id / x-store-id"]
        VitrineB["Vitrine Cliente B (Template + Pacote NPM)\nEnvia x-tenant-id / x-store-id"]
    end

    subgraph Backend["Backend Global (API Node.js / Express 5)"]
        AuthMW["authenticateJWT\n(Contexto Privado via Token HS256)"]
        OnboardMW["authenticateOnboardingSecret\n(Provisionamento Protegido)"]
        TenantMW["resolvePublicTenantContext\n(Contexto Público via Header > Query)"]
        Services["Services & Repositories\n(Isolamento por tenant_id e store_id)"]
    end

    subgraph Database["Banco de Dados Único (PostgreSQL)"]
        HybridTables["Catálogo Híbrido\n(brands, features: global + por tenant)"]
        TenantTables["Dados Isolados por Empresa e Filial\n(tenants, stores, users, models, vehicles, photos, metrics)"]
    end

    ADM -->|Bearer Token| AuthMW
    Ops -->|x-onboarding-secret| OnboardMW
    VitrineA -->|x-tenant-id / x-store-id| TenantMW
    VitrineB -->|x-tenant-id / x-store-id| TenantMW
    AuthMW --> Services
    OnboardMW --> Services
    TenantMW --> Services
    Services --> HybridTables & TenantTables
```

### Pilar 1: Backend Global Multi-Tenant
- **Conceito**: Uma única instância da API e um único banco de dados PostgreSQL (*Shared Database, Shared Schema*).
- **Isolamento**: Tabelas operacionais possuem `tenant_id` (empresa) e, quando aplicável, `store_id` (filial/loja), reforçadas por chaves estrangeiras compostas `(tenant_id, store_id) REFERENCES stores(tenant_id, id)` no `schema.sql`.
- **Vantagem**: Zero duplicação de código de regra de negócio; manutenção e deploy centralizados.

### Pilar 2: Frontend ADM Único (SaaS)
- **Conceito**: Uma única aplicação web administrativa (`React + Vite` SPA) usada por todas as empresas clientes, hospedada no **Cloudflare Pages**.
- **Funcionamento**: O usuário autentica com e-mail e senha (com suporte a `tenant_id` opcional para desambiguação caso o mesmo e-mail exista em mais de uma empresa). O backend emite JWT `HS256` (`1d`) contendo `id`, `email`, `role`, `tenantId` e `storeId`.

### Pilar 3: Frontend de Vitrine por Cliente (Template Repository + Pacote NPM Privado)
- **Conceito**: Cada garagem cliente possui seu próprio projeto frontend em **Next.js (SSR)** (gerado a partir de um *Template Repository* no GitHub) hospedado no **Cloudflare Workers** (`@opennextjs/cloudflare`), garantindo domínio próprio, SEO no Google e preview de cards com foto/preço no WhatsApp (*OpenGraph*).
- **Pacote NPM Privado (`@garagem/sdk` via GitHub Packages)**: Dividido em **2 camadas** para atender diferentes perfis de clientes:
  1. **Camada Headless (`/api`, `/hooks`, `/types`)**: Cliente HTTP configurado para injetar `x-tenant-id` / `x-store-id`, tipagens geradas do OpenAPI (`Docs/openapi.yaml`), schemas Zod e hooks React Query (`useVehicles`, `useVehicleDetails`, `usePublicStore`). Usada sozinha quando o cliente contrata um **layout 100% personalizado do zero**.
  2. **Camada de Componentes Base (`/ui`)**: Componentes visuais prontos (`<VehicleCard />`, `<VehicleFilters />`, `<PhotoGallery />`) estilizados via variáveis CSS (`--color-primary`, `--radius`, etc.). Usada no `vitrine-template` para **clientes de menor custo**, exigindo apenas configurar cores, fontes e logo.

---

## 1.1. Organização dos 3 Repositórios e Fluxo de Desenvolvimento

Como o GitHub exige um repositório exclusivo para a função *Template Repository*, o ecossistema é dividido em **3 repositórios** para permitir desenvolvimento rápido sem precisar publicar versões no NPM a cada alteração:

| Repositório | Tecnologia | Papel no Ecossistema |
| :--- | :--- | :--- |
| **1. `back-end-site-garagem`** | Node.js, Express 5, PostgreSQL, R2 | API Global Multi-Tenant e fonte da verdade do contrato OpenAPI (`Docs/openapi.yaml` / `/api-docs.json`). |
| **2. `site-garagem-web` (Monorepo Core)** | `pnpm workspaces` | Contém **`apps/admin`** (React + Vite), **`packages/garagem-sdk`** (Pacote NPM privado) e **`apps/vitrine-dev`** (Next.js ligado localmente ao SDK via `workspace:*` para desenvolvimento em tempo real). |
| **3. `vitrine-template` (Template Repo)** | Next.js (App Router / SSR) | Repositório limpo marcado como *Template* no GitHub que consome `@garagem/sdk` publicado no **GitHub Packages**. A cada novo cliente, clica-se em *"Use this template"* para gerar o repositório dedicado da loja. |

### Configuração do Workspace Local Unificado (`Ecossistema-Garagem`)

Para que o desenvolvedor e os agentes de IA tenham visibilidade simultânea dos 3 repositórios, acesso em tempo real à documentação e controle de Git isolado por projeto:

1. **Estrutura da Pasta-Mãe (Sem `.git` na raiz)**:
   ```text
   Ecossistema-Garagem/                <-- Pasta-mãe do ecossistema (NUNCA rodar git init aqui)
   ├── .agents/AGENTS.md               <-- Regras globais de IA compartilhadas para todo o workspace
   ├── ecossistema.code-workspace      <-- Arquivo de Multi-Root Workspace do VS Code / Antigravity
   ├── Docs/                           <-- Junction (atalho em tempo real) para back-end-site-garagem/Docs
   ├── back-end-site-garagem/          <-- Repo 1 (.git independente -> origin do Backend)
   ├── site-garagem-web/               <-- Repo 2 (.git independente -> origin do Monorepo Front/SDK)
   └── vitrine-template/               <-- Repo 3 (.git independente -> origin do Template Next.js)
   ```
2. **Criação do Atalho em Tempo Real (`Junction` no Windows)**:
   - Executar no PowerShell dentro da pasta `Ecossistema-Garagem` (não exige permissão de Administrador):
     ```powershell
     cmd /c mklink /J Docs back-end-site-garagem\Docs
     ```
   - Qualquer alteração nos arquivos dentro de `back-end-site-garagem/Docs` reflete instantaneamente em `Ecossistema-Garagem/Docs`, pois apontam para o mesmo endereço físico no disco, e o Git continua rastreando esses arquivos exclusivamente dentro do repositório `back-end-site-garagem`.
3. **Arquivo `ecossistema.code-workspace` (Carregamento Imediato dos 3 Gits no Editor)**:
   - Ao abrir apenas uma pasta sem `.git`, o VS Code/Antigravity só carrega o Git de uma subpasta após abrir um arquivo dela. Criando o arquivo `ecossistema.code-workspace` na raiz e abrindo o projeto por ele (`File -> Open Workspace from File...`), o editor carrega os **3 repositórios Git imediatamente** no painel *Source Control* e no rodapé:
     ```json
     {
       "folders": [
         { "name": "00 - Raiz & Docs", "path": "." },
         { "name": "01 - Backend API", "path": "back-end-site-garagem" },
         { "name": "02 - Monorepo Web (Admin + SDK)", "path": "site-garagem-web" },
         { "name": "03 - Vitrine Template", "path": "vitrine-template" }
       ]
     }
     ```
4. **Operação do Git Isolada por Repositório (Terminal e Agente de IA)**:
   - **Proibido** inicializar Git (`git init`) na pasta-mãe `Ecossistema-Garagem`.
   - Para executar comandos Git a partir da raiz do workspace sem trocar de diretório a todo momento, utiliza-se a flag `-C <pasta-do-repo>` (ou `cd <pasta-do-repo>`):
     ```powershell
     git -C back-end-site-garagem status --short
     git -C back-end-site-garagem checkout -b security/hardening
     git -C site-garagem-web status --short
     git -C vitrine-template status --short
     ```
5. **Regras do Agente (`AGENTS.md`) Compartilhadas no Workspace**:
   - **Regras Gerais (`Ecossistema-Garagem/.agents/AGENTS.md`)**: Contêm o fluxo Planner -> Executor, TDD estrito, regras de Git (`git -C <repo>`, proibição de `git add .`), comunicação TDAH e arquitetura dos 3 repositórios.
   - **Regras Específicas por Repositório (`<repo>/.agents/AGENTS.md`)**: Cada repositório pode manter um arquivo curto apenas com suas particularidades técnicas (ex.: path aliases `#services/*` no Backend vs. convenções React/Next.js no Frontend), ou referenciar a regra geral via `@[Regras Globais](../../.agents/AGENTS.md)`.

---

## 1.2. Infraestrutura de Cloud e Homologação (`dev` vs `prod`)

| Camada | Serviço Escolhido | Estratégia de Ambientes (`dev` e `prod`) |
| :--- | :--- | :--- |
| **Banco de Dados** | **Neon (PostgreSQL Serverless)** | 1 projeto com *Database Branching* nativo: branch `dev` (homologação) e branch `main` (produção), rodando com roles de menor privilégio (`garagem_app` / `garagem_system`) e RLS ativo. |
| **Storage de Mídias** | **Cloudflare R2 (S3-Compatible)** | Buckets segregados por ambiente e visibilidade: `R2_PUBLIC_BUCKET` para fotos `.webp` (`thumbs`/`full`) e `R2_PRIVATE_BUCKET` para laudos `.pdf` servidos via Presigned URL (`<= 300s`). Zero custo de *egress*. |
| **Backend (API)** | **Northflank** *(ou Koyeb)* | Deploy contínuo a partir da branch `dev` (homologação) e `main` (produção). Northflank (*Developer Sandbox*) priorizado em homologação por manter o container ativo 24/7 sem *cold start*. |
| **Front Admin** | **Cloudflare Pages** | Build estático (`React + Vite`) com preview automático por branch (`dev` e `main`). |
| **Front Vitrines** | **Cloudflare Workers (OpenNext)** | Deploy SSR (`Next.js` via `@opennextjs/cloudflare`) por cliente, com variáveis `NEXT_PUBLIC_TENANT_ID` e `NEXT_PUBLIC_STORE_ID` e domínio customizado. |

---

## 1.3. Compartilhamento de Contratos (Backend -> Frontends e Agentes de IA)

Para garantir sincronia total de entradas (requests) e saídas (responses) entre o repositório do Backend e o Monorepo Frontend:

1. **Fonte Única de Verdade (`Docs/openapi.yaml` / `/api-docs.json`)**: Todo endpoint implementado no backend é obrigatoriamente documentado no `Docs/openapi.yaml` (regra da Seção 4 do `.agents/AGENTS.md`).
2. **Geração Automática de Tipos no SDK (`openapi-typescript` / `orval`)**: No pacote `packages/garagem-sdk`, um script (`pnpm generate:api`) lê o `Docs/openapi.yaml` (ou a rota `/api-docs.json` da API local/`dev`) e gera automaticamente todas as interfaces TypeScript de Request, Query Params e Response.
3. **Contexto para Agentes de IA no Frontend**: Os arquivos `Docs/openapi.yaml`, `Docs/api-routes.md` e `Docs/arquitetura-ecossistema.md` fornecem 100% do contrato necessário (rotas, headers `x-tenant-id`/`x-store-id`, códigos de erro `400`/`401`/`403`/`404`/`409` e regras de negócio `RN001`–`RN011`) sem que o frontend precise importar código interno do backend.

---

## 2. O que Já Está Implementado e Validado no Backend

1. **Separação Estrita dos Middlewares de Contexto**:
   - **Fluxo Privado (`authenticateJWT` em `src/middlewares/auth.middleware.ts`)**: Extrai o token via regex `/^Bearer\s+(\S+)$/i`, valida assinatura `HS256` + schema Zod em runtime (`validateToken` em `src/utils/jwt.util.ts`) e executa 1 única query SQL (`findAuthUserById`) validando usuário, `tenant` e `store` (quando `store_id != null`) ativos e não deletados. Nunca aceita `x-tenant-id` via Header/Query.
   - **Fluxo Público (`resolvePublicTenantContext` em `src/middlewares/tenant.middleware.ts`)**: Usado nas rotas abertas da vitrine (`GET /api/vehicles`, `GET /api/vehicles/compare`, `GET /api/vehicles/:id`). Não lê `req.user` e não possui tenant padrão de fallback. Aceita `x-tenant-id`/`x-store-id` (Headers) ou `tenant_id`/`store_id` (Query) com precedência **Header > Query**, valida existência e status ativo de loja e empresa e retorna `404` unificado (`"Loja não encontrada"`) contra enumeração entre tenants.
2. **Provisionamento SaaS Protegido (`POST /api/tenants/onboard`)**:
   - Protegido por `authenticateOnboardingSecret` (`crypto.timingSafeEqual` validando `x-onboarding-secret` contra `getOnboardingSecret()` / `ONBOARDING_SECRET`, com validação *fail-fast* no boot em `src/server.ts`).
   - Cria em transação ACID (`TenantRepository.onboardTenant`) a empresa, a matriz e o primeiro usuário `ADMIN`.
3. **Catálogo Híbrido (`brands`, `features`) e Modelos por Tenant (`models`)**:
   - `brands` e `features` permitem leitura combinada `(tenant_id IS NULL OR tenant_id = :tenantId)` e criação customizada por tenant, bloqueando alteração/exclusão de itens globais com `403 Forbidden`.
   - `models` é estritamente isolado por `tenant_id`, validando que o `brand_id` pertence ao catálogo visível do tenant.
4. **Restrição Multi-Store (`store_id`) e Blindagem SQL**:
   - Usuários vinculados a uma filial (`req.user.storeId !== null`) recebem `403` ao tentar criar, editar, transferir, excluir ou gerenciar mídias de veículos de outra filial, e têm `store_id` forçado em `findAdmin` e `findByIdAdmin`.
   - `buildUpdateQuery` (`src/utils/query.util.ts`) bloqueia mutação de `id`, `tenant_id` e `created_at` e injeta `tenant_id` no `WHERE`.
   - `StoreService.findPublicById` (`GET /api/stores/public/:id`) valida que tanto a loja quanto o seu tenant estão ativos e não deletados.
5. **Sanitização LGPD e Rate Limit com Proxy Reverso**:
   - `sanitizeVehicleForRole` (`src/utils/vehicle-sanitizer.util.ts`) oculta dados confidenciais (`full_license_plate`, `purchase_price`, `owner_*`, `store_commission_rate`) para `PUBLICO` e `VISUALIZADOR`.
   - `app.set('trust proxy', ...)` lê `TRUST_PROXY_HOPS` em `src/app.ts` e `loginLimit` utiliza `skipSuccessfulRequests: true` (em ambientes sem proxy reverso na frente, configurar `TRUST_PROXY_HOPS=0` para impedir spoofing de `X-Forwarded-For`).

---

## 3. Visão Arquitetural Alvo de Segurança (Defesa em Profundidade)

Para elevar o isolamento multi-tenant do nível de aplicação para defesa em profundidade no banco, borda HTTP e storage, o plano em [roadmap-seguranca.md](./roadmaps/roadmap-seguranca.md) define:

```mermaid
flowchart TD
    subgraph Borda["Borda HTTP (S6)"]
        Helmet["helmet + CORS allowlist (HTTPS em prod)"]
        Limits["rate limit + login sem enumeração + logs sem PII"]
    end

    subgraph Contexto["Contexto Obrigatório (S2, S4)"]
        JWT["authenticateJWT"]
        Pub["resolvePublicTenantContext"]
        ALS["AsyncLocalStorage (request-context.ts)"]
    end

    subgraph DbLayer["Camada db.ts (S2)"]
        Q["db.query / db.transaction (fail-closed)"]
        SYS["db.callSystemFunction (allowlist)"]
    end

    subgraph Postgres["PostgreSQL / Neon (S1, S3, S5)"]
        APP["role garagem_app (menor privilégio)"]
        RLS["RLS em 100% das tabelas"]
        DEF["Funções SECURITY DEFINER (dono garagem_system)"]
    end

    subgraph Storage["Storage Seguro (S7 + Fase 6)"]
        R2Pub["R2 Bucket Público (thumbs / full sem EXIF)"]
        R2Priv["R2 Bucket Privado (laudos via Presigned URL <= 300s)"]
    end

    Helmet --> JWT & Pub --> ALS --> Q --> APP --> RLS
    Q --> R2Pub & R2Priv
    SYS --> DEF
```

1. **Banco de Dados (`S1`, `S3`, `S5`)**: Usuário da app `garagem_app` sem `SUPERUSER`/`BYPASSRLS`/DDL; funções estreitas `SECURITY DEFINER` com dono `garagem_system` para pré-autenticação e views; Row Level Security habilitado em todas as tabelas via `set_config('app.current_tenant_id', $1, true)` local à transação.
2. **Arquivos & Cloudflare R2 (`S6.3`, `S7`, `Fase 6`)**: Validação por *magic bytes*, garantia de remoção de metadados EXIF/GPS, chaves prefixadas por `tenants/<tenantId>/vehicles/<vehicleId>/...`, remoção da exposição estática de laudos (`/uploads/vehicles/reports`) substituída por `GET /api/vehicles/:id/inspection-report` (Presigned URL de no máximo 300s no bucket privado `R2_PRIVATE_BUCKET`).
3. **LGPD & Boot Seguro (`S8`, `S9`)**: Validação fail-fast de `.env`, TLS obrigatório em produção, recusa de boot caso conecte com usuário privilegiado, allowlist restrita de campos em `GET /api/stores/public/:id` (Decisão D2) e rotas de anonimização (`POST /api/vehicles/:id/anonymize` e `POST /api/users/:id/anonymize`).

---

## 4. Roteiro de Execução (Backend + Homologação + Vertical Slice Frontends)

1. **Concluir Fechamento da Fase 5**: Finalizar os blocos pendentes de [roadmap-revisao-socratica-fase-5.md](./roadmaps/roadmap-revisao-socratica-fase-5.md) e alinhar `FeatureRepository` (`5.6`) com as colunas `is_active`/`deleted_at` já adicionadas ao `schema.sql`.
2. **Fase 5.5 — Executar Roadmap de Segurança (`S0–S10`)**: Implementar em TDD estrito conforme [roadmap-seguranca.md](./roadmaps/roadmap-seguranca.md) (menor privilégio `garagem_app`, `AsyncLocalStorage`, funções `SECURITY DEFINER`, RLS em 100% das tabelas, Helmet/CORS, magic bytes, chaves de storage por tenant, TLS/env e anonimização LGPD).
3. **Fase 6 — Cloudflare R2 (`+ S7.4`)**: Migrar `StorageProvider` para buckets público/privado do R2 com Presigned URLs (`<= 300s`) e remover `/uploads` estático.
4. **Fase 6.5 — Deploy de Homologação (`dev`) & Vertical Slice dos Frontends**:
   - Criar a branch `dev` e provisionar o ambiente de homologação (**Neon** branch `dev` + buckets **Cloudflare R2** + API no **Northflank**).
   - Pausar temporariamente o avanço para as Fases 7–10 do backend e construir o **Vertical Slice dos Frontends**: Monorepo `site-garagem-web` (`apps/admin` em React + Vite no Cloudflare Pages, `packages/garagem-sdk` com geração de tipos via OpenAPI e `apps/vitrine-dev`) + repositório `vitrine-template` (Next.js SSR no Cloudflare Workers), validando todo o fluxo real de cadastro e vitrine em homologação.
5. **Fases 7–9 (Retomada do Backend + Evolução dos Frontends)**: Bancos/Simulador Financeiro, CRM (Leads e Propostas de Troca com `consent_at`/`consent_version`), Venda/Comissões, Auditoria (sem gravar valores de campos pessoais), Promoções/Banners e Cartaz PDF.
6. **Fase 10 — Backoffice SaaS & Super Usuário (Operador Global)**: Identidade e autenticação isoladas dos usuários de tenant para gestão centralizada de empresas (onboarding via servidor sem expor `ONBOARDING_SECRET` no browser, suspensão/reativação, catálogo global `tenant_id IS NULL`, configurações e auditoria), preservando o RLS nas rotas de clientes.
