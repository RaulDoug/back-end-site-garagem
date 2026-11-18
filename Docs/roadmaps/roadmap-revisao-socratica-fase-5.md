# Roadmap de Revisão Manual & Socrática — Fase 5 (Multi-Tenant & Multi-Store)

> **Como usar este guia com a skill `socratic-code-review`**:
> 1. Escolha **1 bloco (ou 1 arquivo) por sessão** para evitar sobrecarga.
> 2. Envie o arquivo para revisão pedindo uma **revisão socrática** (sem spoilers).
> 3. Use os pontos de **"Foco de Atenção"** abaixo como guia para conferir se você realmente domina o *Mental Debugging* (Camada 3) e os *Edge Cases* (Camada 4) antes de marcar `[x]`.

---

## Critério de Recorte (O que entrou e o que ficou fora)

- **Incluídos (`[NOVO]` e `[MODIFICAÇÃO ALTA]`)**: arquivos que criam fluxos inéditos, alteram queries SQL, modificam regras de autorização/isolamento ou protegem contra vazamento *Cross-Tenant* / *Cross-Store*.
- **Excluídos (essência mantida)**: controllers que apenas repassam `req.user!.tenantId` (`brand`, `feature`, `model`, `store`, `vehicle-media`), `app.ts`, `express.d.ts`, `role.middleware.ts`, `create-admin.ts` e ajustes pontuais sem nova regra complexa.

---

## Bloco 1 — Alicerce: Banco, Autenticação, Contexto Público e Base SQL

*Objetivo: Garantir que você domina como a requisição é identificada (`tenantId` e `storeId`) e como o repositório base impede vazamentos antes mesmo da camada de serviço.*

- [x] **`[MODIFICAÇÃO ALTA]`** [schema.sql](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/schema.sql)
  - **Escopo**: Tabela `tenants`, colunas `tenant_id` / `store_id`, `UNIQUE (tenant_id, id)` em `stores` com FKs compostas `(tenant_id, store_id)`, índices únicos parciais (`WHERE deleted_at IS NULL`), `is_active`/`deleted_at` em `features`, trigger `update_date_trigger` e `CHECK` de final de placa em `vehicles`.
  - **Foco no Mental Debugging**: Simule o cadastro do mesmo e-mail em dois tenants distintos, o vínculo de um `store_id` de outra empresa em `vehicles`/`users` (bloqueado pela FK composta) e a exclusão lógica em `features`.

- [x] **`[NOVO]`** [tenant.middleware.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/middlewares/tenant.middleware.ts)
  - **Escopo**: Middleware `resolvePublicTenantContext` para rotas públicas da vitrine (precedência `header > query` via `pickIdentifier`, resolução de `tenant_id` a partir de `store_id`, validação de `store` e `tenant` ativos/não deletados e unificação de erro `404` anti-enumeração).
  - **Foco no Mental Debugging**: Teste mentalmente 3 entradas: visitante enviando `header` + `query` conflitantes; visitante enviando `store_id` ativa de um `tenant` inativo/deletado; visitante enviando `tenant_id` + `store_id` de empresas diferentes (por que retorna `"Loja não encontrada"` em vez de revelar o conflito?).

- [x] **`[MODIFICAÇÃO ALTA]`** [auth.middleware.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/middlewares/auth.middleware.ts) + [jwt.util.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/utils/jwt.util.ts) + [app.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/app.ts) + [server.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/server.ts)
  - **Escopo (Pós-Correção TDD)**:
    - `jwt.util.ts`: `InvalidTokenError`, `getSecretKey()` validada no boot (`server.ts`), assinatura/verificação fixa em `HS256` (`expiresIn: '1d'`) e validação em runtime com `tokenPayloadSchema` (`id`, `tenantId` e `storeId` como UUIDs válidos).
    - `auth.middleware.ts`: Extração robusta via regex `/^Bearer\s+(\S+)$/i`, factory `createAuthMiddleware(userRepo)` consultando `findAuthUserById`, separação estrita `401` (`InvalidTokenError` / `JsonWebTokenError`) vs `500` (`next(error)`), `loginLimit` com `skipSuccessfulRequests: true` (`TRUST_PROXY_HOPS` em `app.ts`) e `authenticateOnboardingSecret` com `crypto.timingSafeEqual`.
  - **Foco no Mental Debugging & Edge Case**:
    1. Trace o que acontece quando `JWT_SECRET` ou `ONBOARDING_SECRET` está ausente no `.env` vs. quando o cliente envia um token com `id: "nao-uuid"` ou header `x-onboarding-secret` de tamanho diferente (por que checar `byteLength` antes de `timingSafeEqual`?).
    2. O que acontece se um token JWT válido tiver `storeId: null`, mas no banco o usuário estiver vinculado a uma filial que acabou de ser desativada?

- [ ] **`[MODIFICAÇÃO ALTA]`** [query.util.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/utils/query.util.ts)
  - **Escopo**: `buildUpdateQuery` com filtro por `tenant_id` no `WHERE` e bloqueio de mutação nas colunas `id`, `tenant_id` e `created_at`.
  - **Foco no Mental Debugging**: Rastreie os índices dos placeholders `$1, $2, $3...` quando `data` contém `tenant_id` malicioso e `options.tenantId` está ativo.

- [ ] **`[MODIFICAÇÃO ALTA]`** [base.repository.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/repositories/base.repository.ts) + [base.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/base.service.ts)
  - **Escopo**: Repasse opcional de `tenantId` em `find`, `findById`, `update` e `delete`, condicionado a `this.columns.includes('tenant_id')`.
  - **Foco no Trade-off**: Por que `find` injeta `tenant_id` no array de filtros em `BaseService` enquanto `findById`/`update`/`delete` verificam `this.columns.includes('tenant_id')`? O que acontece se uma subclasse esquecer de declarar `columns`?

---

## Bloco 2 — Novo Módulo `tenants` e Fluxo de Onboarding Transacional

*Objetivo: Validar o fluxo completo de criação atômica de uma nova empresa no SaaS (Empresa + Matriz + Admin).*

- [ ] **`[NOVO]`** [tenant.schema.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/schemas/tenant.schema.ts)
  - **Escopo**: Validadores de dígitos verificadores (`validateCNPJ`, `validateCPF`) e composição de `onboardTenantSchema`.
  - **Foco no Edge Case**: Observe o `storeInputSchema` com `z.union` — por que ele aceita formatos diferentes e quais campos são obrigatórios no onboarding?

- [ ] **`[NOVO]`** [tenant.repository.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/repositories/tenant.repository.ts)
  - **Escopo**: `findByCNPJ` (normalizando pontuação via `regexp_replace`) e `onboardTenant` usando `pool.connect()` + transação manual (`BEGIN` / `COMMIT` / `ROLLBACK`).
  - **Foco no Mental Debugging**: Simule uma falha na query do `admin` (terceiro `INSERT`); o que acontece com a conexão no `finally` e com os registros anteriores?

- [ ] **`[NOVO]`** [tenant.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/tenant.service.ts)
  - **Escopo**: Validação prévia de conflito de CNPJ da empresa e da loja (`409`), geração de hash, emissão de token inicial e atualização segura do próprio tenant.
  - **Foco no Edge Case**: Por que checar `findByCNPJ` antes da transação se o banco já tem índice único? O que acontece em caso de condição de corrida (*race condition*)?

- [ ] **`[NOVO]`** [tenant.routes.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/routes/tenant.routes.ts) + **`[NOVO]`** [tenant.controller.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/controllers/tenant.controller.ts)
  - **Escopo**: Rota `/onboard` protegida para provisionamento exclusivo do dono do SaaS (`registerLimit` + `authenticateOnboardingSecret` via header `x-onboarding-secret`) e rota `/me` (autenticada, `PUT` restrito a `ADMIN`) usando `validate(...)` e propagação assíncrona do Express 5.

---

## Bloco 3 — Lojas (`stores`) e Usuários / Login (`users`)

*Objetivo: Entender a separação entre unicidade global vs. por empresa, validação dupla na vitrine pública de lojas e como o login lida com e-mails repetidos em tenants diferentes.*

- [ ] **`[MODIFICAÇÃO ALTA]`** [store.repository.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/repositories/store.repository.ts) + [store.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/store.service.ts) + [store.routes.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/routes/store.routes.ts)
  - **Escopo**: `findByIdAndTenant`, rota pública `GET /public/:id` (`findPublicById`) validando loja **e** `tenant` ativos/não deletados via `TenantRepository`, e isolamento Cross-Tenant em `findByCNPJ` sem quebrar a checagem global de duplicidade no `create`/`update`.
  - **Foco no Trade-off & Edge Case**: Compare `storeRepository.findByCNPJ` (global) vs. `storeService.findByCNPJ(cnpj, tenantId)` (escopado), e trace o que ocorre em `findPublicById` quando a loja está ativa mas o `tenant` foi desativado ou sofreu *soft delete*.

- [ ] **`[MODIFICAÇÃO ALTA]`** [user.repository.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/repositories/user.repository.ts) + [user.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/user.service.ts)
  - **Escopo**: `findAuthUserById` (query única de autenticação com `INNER JOIN tenants` e `LEFT JOIN stores` validando filial ativa quando `u.store_id IS NOT NULL`), `findByEmail` vs. `findAllActiveByEmail`, desambiguação de login multi-tenant, validação de `store_id` pertencente ao `tenantId` em `create`/`update`, e escopo de leitura/deleção.
  - **Foco no Mental Debugging**: Simule `findAuthUserById` em 3 cenários (usuário global `store_id = NULL`, vendedor de filial ativa e vendedor de filial desativada/soft-deleted) e `userService.login` em 3 cenários (usuário único sem `tenant_id`; mesmo e-mail ativo em 2 empresas sem `tenant_id`; tentativa no `create` de vincular um vendedor ao `store_id` do Tenant B).

- [ ] **`[MODIFICAÇÃO ALTA]`** [user.controller.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/controllers/user.controller.ts) + [user.schema.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/schemas/user.schema.ts)
  - **Escopo**: Suporte a `store_id` (nullable/optional) no usuário, `tenant_id` opcional no login e bloqueio de auto-exclusão no controller.

---

## Bloco 4 — Catálogo Híbrido (`brands`, `features`) e Modelos (`models`)

*Objetivo: Dominar a diferença entre entidades híbridas (Global + Tenant) e entidades estritamente isoladas.*

- [ ] **`[MODIFICAÇÃO ALTA]`** [brand.repository.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/repositories/brand.repository.ts) + [brand.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/brand.service.ts)
  - **Escopo**: Consultas híbridas `(tenant_id IS NULL OR tenant_id = $n)`, tratamento de `includeDeleted`, proteção `403` impedindo que empresas editem/excluam marcas globais.
  - **Foco no Mental Debugging**: Trace o que ocorre se o Tenant A tentar atualizar a marca "Toyota" (`tenant_id = NULL`) vs. atualizar a marca "Toyota" de outro tenant (`tenant_id = Tenant B`). Qual status HTTP retorna em cada caso e por quê?

- [ ] **`[MODIFICAÇÃO ALTA]`** [feature.repository.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/repositories/feature.repository.ts) + [feature.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/feature.service.ts)
  - **Escopo**: Catálogo híbrido e método `findByIdsForTenant` para validação em lote de opcionais.
  - **Foco no Edge Case**: Como `findForTenant` monta o array `params` e os índices `$1`/`$2` quando `tenantId` é `undefined` vs. preenchido? Além disso, confronte o `schema.sql` atual (`features` agora possui `is_active`, `deleted_at` e `ON DELETE RESTRICT` em `vehicle_features`) com o comportamento atual de exclusão e listagem em `FeatureRepository`.

- [ ] **`[MODIFICAÇÃO ALTA]`** [model.repository.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/repositories/model.repository.ts) + [model.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/model.service.ts)
  - **Escopo**: Isolamento estrito de modelos por `tenant_id`, checando se a marca (`brand_id`) existe no catálogo híbrido visível pelo tenant.

---

## Bloco 5 — Núcleo de Veículos (`vehicles`) e Mídias (`vehicle-media`)

*Objetivo: Validar a camada mais complexa da aplicação — onde isolamento por Empresa (`tenantId`) e restrição por Filial (`userStoreId`) atuam juntos.*

- [ ] **`[MODIFICAÇÃO ALTA]`** [vehicle.repository.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/repositories/vehicle.repository.ts)
  - **Escopo**: `findByPlate` por tenant, `findCatalog`, `findDetailedById`, `findByIds`, `updateWithFeatures` e `updateInspectionReport` com `tenant_id` e `store_id`.
  - **Foco no Mental Debugging**: Acompanhe `paramIndex` em `findCatalog` (especialmente no filtro de `feature_ids` com `GROUP BY ... HAVING COUNT`) e na subconsulta de `cover_photo_url`.

- [ ] **`[MODIFICAÇÃO ALTA]`** [vehicle.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/vehicle.service.ts)
  - **Escopo**: `TenantExecutionContext`, bloqueio `403` para usuário restrito à filial (`userStoreId`), validação de integridade (`store` -> `model` -> `placa` -> `features`) no `create` e `update`, e sobrescrita defensiva de `filters.store_id` em `findPublic` e `findAdmin`.
  - **Foco no Edge Case**: Por que `findPublic` faz `filters.store_id = ctx.filterStoreId ?? undefined` e `findAdmin` faz `filters.store_id = ctx.userStoreId ?? ctx.filterStoreId ?? undefined` logo após `parseQueryFilters`? O que aconteceria se `parseQueryFilters(query)` lesse `query.store_id` e `ctx.filterStoreId` fosse `null`?

- [ ] **`[MODIFICAÇÃO ALTA]`** [vehicle-media.service.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/services/vehicle-media.service.ts)
  - **Escopo**: Helper `ensureVehicleAccess` aplicado em fotos e laudos PDF antes de gravar ou apagar arquivos em disco.
  - **Foco no Edge Case**: Se o vendedor restrito à Loja A1 enviar upload de foto para um veículo da Loja A2 (mesmo tenant), os arquivos temporários do Multer no `finally` ainda são apagados corretamente?

- [ ] **`[MODIFICAÇÃO ALTA]`** [vehicle.controller.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/controllers/vehicle.controller.ts) + [vehicle.routes.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/routes/vehicle.routes.ts) + [vehicle.schema.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/schemas/vehicle.schema.ts)
  - **Escopo**: Ordem das rotas (`/compare` e `/admin` antes de `/:id`), uso exclusivo de `req.tenantContext` nas rotas públicas (`findPublic`, `findByIdPublic`, `compare`) sem fallback para `req.user` ou `req.query.store_id` cru, e inclusão de `tenant_id`/`store_id` nos schemas de query (`findVehicleSchema` e `compareVehiclesSchema`).
  - **Foco no Mental Debugging**: Siga o caminho de `GET /api/vehicles?tenant_id=...` passando por `resolvePublicTenantContext` -> `validate(findVehicleSchema)` -> `vehicleController.findPublic` -> `vehicleService.findPublic`.

---

## Bloco 6 — Auditoria de Comportamento Ponta a Ponta (Testes Novos Chave)

*Objetivo: Ler apenas os testes novos/atualizados que funcionam como especificação viva de segurança multi-tenant e proteção SQL.*

- [ ] **`[NOVO]`** [multi-tenant-isolation.e2e.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/e2e/multi-tenant/multi-tenant-isolation.e2e.spec.ts) + [tenant.e2e.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/e2e/tenants/tenant.e2e.spec.ts)
  - **Escopo**: Os 5 cenários completos de isolamento (incluindo vitrine pública retornando `404` anti-enumeração para `tenant_id` fantasma e `store_id` de outro tenant) e fluxo E2E de onboarding/gestão de tenant.
- [ ] **`[NOVO]`** [jwt.util.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/utils/jwt.util.spec.ts) & [user.middleware.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/middlewares/user/user.middleware.spec.ts)
  - **Escopo**: Testes unitários de validação runtime de UUID no payload JWT, restrição de algoritmo `HS256`, separação de erros `401` vs `500`, factory `createAuthMiddleware` e validação em tempo constante em `authenticateOnboardingSecret`.
- [ ] **`[NOVO]`** [query.util.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/utils/query.util.spec.ts) & [tenant.middleware.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/middlewares/tenant.middleware.spec.ts)
  - **Escopo**: Blindagem de atualização SQL e matriz completa do middleware público (precedência `header > query`, loja/tenant inativos ou *soft-deleted*, e unificação de mensagem `404`).
- [ ] **`[MODIFICAÇÃO ALTA]`** [store.service.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/services/store/store.service.spec.ts) + [store.e2e.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/e2e/store/store.e2e.spec.ts) + [vehicle.service.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/services/vehicle/vehicle.service.spec.ts) + [vehicle.schema.spec.ts](file:///c:/Users/User/Desktop/Projetos/back-end-site-garagem/src/tests/schemas/vehicle/vehicle.schema.spec.ts)
  - **Escopo**: Testes das novas garantias de segurança (bloqueio de loja pública quando loja ou tenant está inativo/deletado, prevenção de vazamento de `query.store_id` quando `ctx.filterStoreId` é `null`, e validação de `tenant_id`/`store_id` nos schemas).
