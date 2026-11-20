# Documentação: Services & Repositories

Esta documentação detalha a arquitetura da camada de negócio (`services`) e de persistência relacional com SQL puro via `node-postgres` (`repositories`), mapeando parâmetros multi-tenant/multi-store, transações ACID, fluxos condicionais, exceções (`AppError`) e comportamentos validados na suíte do Vitest.

> **Evolução Planejada (`Docs/roadmaps/roadmap-seguranca.md`):** Na Subfase S4 do roadmap de segurança, as chamadas diretas a `pool.query`/`pool.connect` nos repositories serão substituídas por `db.query`/`db.transaction` (`src/config/db.ts`), mantendo todos os filtros explícitos de `tenant_id` como primeira trava de isolamento em conjunto com o RLS do PostgreSQL.

---

## Sumário
1. [Base / Camada Genérica (CRUD)](#módulo-base--infraestrutura-genérica)
2. [Empresas / Tenants (`tenants`)](#módulo-empresas--tenants-tenants)
3. [Usuários (`users`)](#módulo-usuários-users)
4. [Lojas (`stores`)](#módulo-lojas-stores)
5. [Marcas (`brands`)](#módulo-marcas-brands)
6. [Opcionais (`features`)](#módulo-opcionais-features)
7. [Modelos (`models`)](#módulo-modelos-models)
8. [Veículos (`vehicles`)](#módulo-veículos-vehicles)
9. [Mídias e Galeria (`VehicleMedia`)](#módulo-de-mídias-e-galeria-vehiclemedia)

---

# Módulo: Base / Infraestrutura Genérica

Classes genéricas parametrizadas (`T extends QueryResultRow, C = Record<string, unknown>`), fornecendo operações CRUD reutilizáveis com suporte nativo a isolamento multi-tenant (`tenantId?: string`) controlado por `options.tenantScoped` (padrão `true`; fail-closed sem depender de `columns`). Apenas tabelas raiz sem `tenant_id` (como `tenants`) declaram `tenantScoped: false`.

---

### 1. Camada de Serviço (`BaseService<T, C>`)
**Arquivo:** `src/services/base.service.ts`

#### `findById(id: string, tenantId?: string): Promise<T>`
- **Responsabilidade:** Recupera um registro pelo UUID garantindo que pertença ao `tenantId` (quando fornecido).
- **Exceções (`AppError`):** `404 Not Found` - `NotFoundError ('Registro não encontrado')` quando `result === null`.

#### `find(filters: FindData = { filters: [] }, tenantId?: string): Promise<T[]>`
- **Responsabilidade:** Cria cópia imutável dos filtros e injeta automaticamente `{ field: 'tenant_id', operator: '=', value: tenantId }` caso `tenantId` seja informado e não exista filtro prévio de `tenant_id`.

#### `create(data: C): Promise<T>`
- **Responsabilidade:** Persiste um novo registro via `repository.create(data)`. Lança `BadRequestError ('Erro ao criar registro')` se `!result`.

#### `update(id: string, data: Partial<C>, tenantId?: unknown): Promise<T>`
- **Responsabilidade:** Valida que `Object.keys(data).length > 0` (senão lança `400 BadRequestError('Nenhum dado informado')`), normaliza `tenantId` (`typeof tenantId === 'string'`) e executa `repository.update(id, data, tenantIdStr)`. Lança `NotFoundError` se `null`.

#### `delete(id: string, tenantId?: string): Promise<T>`
- **Responsabilidade:** Executa soft-delete ou hard-delete restrito ao `tenantId`. Lança `NotFoundError` se `null`.

---

### 2. Camada de Persistência (`BaseRepository<T, C>`)
**Arquivo:** `src/repositories/base.repository.ts`

- **Propriedades:** `protected columns: string[] = []` (usado apenas para projeção e documentação; não decide mais o isolamento por tenant), `options: { softDelete?: boolean; hasActiveStatus?: boolean; tenantScoped?: boolean }` (todos `true` por padrão; `tenants` é o único repositório com `tenantScoped: false`) e getter `protected get isTenantScoped(): boolean` (`options.tenantScoped !== false`). O construtor valida `tableName` via `assertValidIdentifier(tableName)` antes de configurar as opções (lança `400 BadRequestError` para identificadores inválidos).
- **`findById(id: string, tenantId?: string): Promise<T | null>`:**
  - Executa `SELECT * FROM ${this.tableName} WHERE id = $1` adicionando `AND tenant_id = $2` se `tenantId && this.isTenantScoped` e `AND deleted_at IS NULL` se `options.softDelete`.
- **`find(filters: FindData, tenantId?: string): Promise<T[]>`:**
  - Gera SQL via `buildFindQuery(this.tableName, filters, findOptions)` (repassa `{ softDelete: this.options.softDelete }` e `tenantId` quando `this.isTenantScoped && tenantId !== undefined`; suporta `=`, `>=`, `<=`, `ILIKE`, `IN`/`ANY`, `includeDeleted`, `columns`, `orderBy` e `limit`).
- **`create(data: C): Promise<T>`:**
  - Gera SQL via `buildInsertQuery(this.tableName, data)`.
- **`update(id: string, data: Partial<C>, tenantId?: string): Promise<T | null>`:**
  - Retorna `null` se `data` estiver vazio. Repassa `{ softDelete: this.options.softDelete }` e `tenantId` (se `this.isTenantScoped && tenantId !== undefined`) para `buildUpdateQuery` (que bloqueia `id`, `tenant_id` e `created_at` e filtra `AND tenant_id = $n` e `AND deleted_at IS NULL`).
- **`delete(id: string, tenantId?: string): Promise<T | null>`:**
  - Inclui `AND tenant_id = $2` quando `tenantId && this.isTenantScoped`.
  - Se `softDelete`: `UPDATE ${tableName} SET deleted_at = NOW() [, is_active = false] WHERE id = $1... AND deleted_at IS NULL RETURNING *;`.
  - Se `!softDelete`: `DELETE FROM ${tableName} WHERE id = $1... RETURNING *;`.

---

# Módulo: Empresas / Tenants (`tenants`)

Gestão da entidade raiz da arquitetura Multi-Tenant hierárquica e seu fluxo de Onboarding transacional.

---

### 1. Camada de Repositório (`TenantRepository`)
**Arquivo:** `src/repositories/tenant.repository.ts` (`softDelete: true, hasActiveStatus: true, tenantScoped: false`, `customPool: Pool = pool`)

#### `findByCNPJ(cnpj: string): Promise<Tenant | null>`
- **Operação:** `SELECT * FROM tenants WHERE (cnpj = $1 OR regexp_replace(cnpj, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')) AND deleted_at IS NULL LIMIT 1;`.

#### `onboardTenant(input: OnboardTenantDbInput): Promise<{ tenant: Tenant; store: Store; admin: Omit<User, 'password_hash'> }>`
- **Operação:** Transação ACID (`pool.connect()`, `BEGIN`, `COMMIT`, `ROLLBACK` no `catch`, `client.release()` no `finally`) criando atomicamente:
  1. Registro em `tenants` (`corporate_name`, `trade_name`, `cnpj`, `is_active`).
  2. Registro em `stores` vinculado a `tenant.id` com `is_active = true`.
  3. Registro em `users` com `tenant_id = tenant.id`, `store_id = store.id`, `role = 'ADMIN'`, `is_active = true`, retornando colunas sem `password_hash`.

---

### 2. Camada de Serviço (`TenantService`)
**Arquivo:** `src/services/tenant.service.ts`

#### `onboard(data: unknown)`
- **Fluxo:**
  1. Valida entrada com `onboardTenantSchema.parse(data)`.
  2. Verifica colisão de CNPJ do tenant (`repository.findByCNPJ`) -> `AppError('CNPJ da empresa já está em uso', 409)`.
  3. Sanitiza CNPJ da loja (`replace(/\D/g, '')`) e verifica colisão (`storeRepo.findByCNPJ`) -> `AppError('CNPJ da loja já está em uso', 409)`.
  4. Gera hash da senha com `hashPassword(validated.admin.password)`.
  5. Executa `repository.onboardTenant(...)`.
  6. Gera token JWT (`generateToken({ id: admin.id, email: admin.email, role: admin.role, tenantId: tenant.id, storeId: store.id })`).
  7. Retorna `{ tenant, store, admin, token }`.

#### `getById(tenantId: string): Promise<Tenant>`
- Busca em `repository.findById(tenantId)`. Lança `NotFoundError('Empresa não encontrada')` se não existir.

#### `update(tenantId: string, data: unknown): Promise<Tenant>`
- Valida `data` com `updateTenantSchema`, verifica existência com `getById(tenantId)`, checa colisão de CNPJ se alterado (`409` `'CNPJ da empresa já está em uso'`) e persiste via `repository.update(tenantId, validated)`.

---

# Módulo: Usuários (`users`)

Gerencia regras de credenciamento multi-tenant, vínculo opcional a filial (`store_id`), criptografia bcrypt, emissão de JWT e consulta unificada de autenticação.

---

### 1. Camada de Serviço (`UserService`)
**Arquivo:** `src/services/user.service.ts`

#### `create(data: CreateUserInput, tenantId?: string): Promise<Omit<User, 'password_hash'>>`
- **Regras de Negócio & Fluxos:**
  1. Exige `tenantId` não vazio (`AppError('Tenant não identificado', 401)`).
  2. Normaliza e-mail para lowercase e verifica duplicidade no tenant via `userRepository.findByEmail(normalizedEmail, tenantId)` (`409` `'E-mail já cadastrado'`).
  3. Se `data.store_id` for informado, valida via `storeRepo.findByIdAndTenant(data.store_id, tenantId)` (`404` `'Filial informada não encontrada nesta empresa'`).
  4. Criptografa senha com `hashPassword(password)` e cria usuário com `tenant_id: tenantId` e `store_id: data.store_id ?? null`.
  5. Remove `password_hash` do retorno.

#### `login(data: LoginUserInput): Promise<{ token: string; user: Omit<User, 'password_hash'> }>`
- **Regras de Negócio & Fluxos:**
  1. Se `tenant_id` for informado: busca usuário com `userRepository.findByEmail(email, tenant_id)`.
  2. Se `tenant_id` **não** for informado: busca candidatos ativos via `userRepository.findAllActiveByEmail(email)`. Se `candidates.length > 1`, lança `AppError('E-mail vinculado a múltiplas empresas. Informe o tenant_id para autenticar.', 400)`. Caso contrário usa `candidates[0] ?? null`.
  3. Valida existência e `user.is_active === true`; compara senha via `comparePassword`. Em falha lança `AppError('Credenciais inválidas', 401)`.
  4. Gera JWT (`HS256`, `1d`) com `{ id, email, role, tenantId: user.tenant_id ?? '', storeId: user.store_id ?? null }`.
  5. Retorna `{ token, user }` sem `password_hash`.

#### `findById(id: string, tenantId?: string): Promise<Omit<User, 'password_hash'>>`
- Consulta `userRepository.findById(id, tenantId)` (`404` `'Usuário inexistente.'`), removendo `password_hash`.

#### `find(filters: FindData = { filters: [] }, tenantId?: string): Promise<Omit<User, 'password_hash'>[]>`
- Injeta filtro `tenant_id = tenantId` quando informado e remove `password_hash` de todos os itens.

#### `update(id: string, data: UpdateUserBody, tenantId?: string): Promise<Omit<User, 'password_hash'>>`
- Valida existência no tenant (`404` `'Usuário inexistente.'`), verifica duplicidade de e-mail se alterado (`409` `'E-mail já em uso por outro usuário'`), valida `data.store_id` no tenant via `storeRepo.findByIdAndTenant` (`404` `'Filial informada não encontrada nesta empresa'`), atualiza via `userRepository.update(id, data, tenantId)` (`400` se vazio) e oculta `password_hash`.

#### `delete(id: string, tenantId?: string): Promise<Omit<User, 'password_hash'>>`
- Verifica existência no tenant (`404` `'Usuário inexistente.'`), executa soft delete no tenant e oculta `password_hash`. *(A trava contra auto-exclusão fica em `UserController.delete`).*

---

### 2. Camada de Persistência (`UserRepository`)
**Arquivo:** `src/repositories/user.repository.ts`

- **`columns`:** `['id', 'tenant_id', 'store_id', 'name', 'email', 'password_hash', 'phone', 'role', 'commission_rates', 'is_active', 'deleted_at', 'created_at']`.
- **`findByEmail(email: string, tenantId?: string): Promise<User | null>`:** Filtra por `tenant_id = $1 AND LOWER(email) = LOWER($2) AND deleted_at IS NULL` quando `tenantId` é informado (ou `ORDER BY created_at ASC LIMIT 1` global se omitido).
- **`findAllActiveByEmail(email: string): Promise<User[]>`:** Busca todas as contas ativas e não deletadas com o e-mail informado (`LOWER(email) = LOWER($1) AND deleted_at IS NULL AND is_active = true ORDER BY created_at ASC`).
- **`findAuthUserById(id: string): Promise<User | null>`:** Query unificada utilizada pelo `authenticateJWT` que executa `INNER JOIN tenants t ON t.id = u.tenant_id` e `LEFT JOIN stores s ON s.id = u.store_id AND s.tenant_id = u.tenant_id`, garantindo que usuário, empresa e filial vinculada (quando `u.store_id IS NOT NULL`) estejam simultaneamente ativos e não deletados.
- **`create(data: CreateUserData): Promise<User>`:** Insere `tenant_id`, `store_id` (`null` padrão), `role` (`COALESCE($7, 'VENDEDOR')::users_roles_types`), `commission_rates` (`$8 ?? null`).

---

# Módulo: Lojas (`stores`)

Gerenciamento das concessionárias e filiais com isolamento por `tenant_id`, checagem de unicidade global de CNPJ e consulta pública dupla (loja + empresa) para vitrine.

---

### 1. Camada de Serviço (`StoreService`)
**Arquivo:** `src/services/store.service.ts`

#### `findByCNPJ(cnpj: string, tenantId?: string): Promise<Store>`
- Sanitiza CNPJ para 14 dígitos, busca via `repository.findByCNPJ` e exige que `store !== null` e `(!tenantId || store.tenant_id === tenantId)`. Caso contrário lança `NotFoundError('Loja com CNPJ ${cnpj} não encontrada')`.

#### `create(data: unknown, tenantId?: string): Promise<Store>`
- Exige `tenantId` (`401` `'Tenant não identificado'`), valida body com `createStoreSchema.shape.body`, verifica unicidade de CNPJ (`409` `'CNPJ já cadastrado'`) e persiste com `tenant_id: tenantId`.

#### `find(filters, tenantId)` / `findById(id, tenantId)` / `delete(id, tenantId)`
- Delegam para `BaseService` escopados por `tenantId`.

#### `findPublicById(id: string): Promise<Store>`
- Busca loja via `repository.findById(id)` e valida `!store || !store.is_active || store.deleted_at != null`.
- Valida também a empresa dona via `tenantRepository.findById(store.tenant_id)` (`!tenant || !tenant.is_active || tenant.deleted_at != null`).
- Em qualquer inconsistência lança `NotFoundError('Loja não encontrada')`.

#### `update(id: string, data: unknown, tenantId?: string): Promise<Store>`
- Verifica pertencimento ao tenant (`super.findById(id, tenantId)`), checa colisão de CNPJ caso alterado (`409` `'CNPJ já em uso por outra loja'`) e executa `super.update(id, updateData, tenantId)`.

---

### 2. Camada de Persistência (`StoreRepository`)
**Arquivo:** `src/repositories/store.repository.ts`

- **`columns`:** inclui `'tenant_id'`, `'id'`, `'name'`, `'phone'`, `'zip_code'`, `'street'`, `'number'`, `'neighborhood'`, `'city'`, `'state'`, `'complement'`, `'cnpj'`, `'is_active'`, `'deleted_at'`, `'created_at'`.
- **`findByCNPJ(cnpj: string): Promise<Store | null>`:** `SELECT * FROM stores WHERE cnpj = $1 AND deleted_at IS NULL LIMIT 1;`.
- **`findByIdAndTenant(id: string, tenantId: string): Promise<Store | null>`:** `SELECT * FROM stores WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1;`.

---

# Módulo: Marcas (`brands`)

Catálogo híbrido de marcas (`tenant_id IS NULL` para globais + `tenant_id` da empresa para marcas próprias).

---

### 1. Camada de Serviço (`BrandService`)
**Arquivo:** `src/services/brand.service.ts`

- **`find(filters, tenantId)`:** Chama `repository.findForTenant(tenantId, filters)`.
- **`findById(id, tenantId)`:** Chama `repository.findByIdForTenant(id, tenantId)` (`404` `'Marca não encontrada'`).
- **`create(data, tenantId)`:** Valida com `createBrandSchema`, verifica duplicidade global ou no tenant via `findByNameForTenant` (`409` `'Marca já cadastrada'`) e cria com `tenant_id: tenantId ?? null`.
- **`update(id, data, tenantId)` / `delete(id, tenantId)`:**
  - Busca via `findByIdForTenant(id, tenantId)` (`404` se não existir ou pertencer a outro tenant).
  - Se `brand.tenant_id === null || (tenantId && brand.tenant_id !== tenantId)` lança **`AppError('Não é permitido alterar ou excluir uma marca global do sistema', 403)`**.
  - No `update`, valida duplicidade de nome caso alterado (`409` `'Nome de marca já cadastrado'`).
  - Persiste restrito ao `tenantId` (`softDelete: true, hasActiveStatus: true`).

### 2. Camada de Persistência (`BrandRepository`)
**Arquivo:** `src/repositories/brand.repository.ts`

- **`findForTenant(tenantId?, filters)`:** Filtra `deleted_at IS NULL` (salvo `includeDeleted`), `(tenant_id IS NULL OR tenant_id = $n)` (ou `tenant_id IS NULL` se sem tenant), `name` (`=`/`ILIKE`) ordenado por `name ASC`.
- **`findByIdForTenant(id, tenantId?)` / `findByNameForTenant(name, tenantId?)`:** Consideram `(tenant_id IS NULL OR tenant_id = $2) AND deleted_at IS NULL`.

---

# Módulo: Opcionais (`features`)

Catálogo híbrido de opcionais (`tenant_id IS NULL` para globais + `tenant_id` da empresa para itens customizados).

---

### 1. Camada de Serviço (`FeatureService`)
**Arquivo:** `src/services/feature.service.ts`

- **`find(filters, tenantId)`:** Chama `repository.findForTenant(tenantId, filters)`.
- **`findById(id, tenantId)`:** Chama `repository.findByIdForTenant(id, tenantId)` (`404` `'Opcional não encontrado'`).
- **`create(data, tenantId)`:** Valida `createFeatureSchema`, verifica duplicidade via `findByNameForTenant` (`409` `'Opcional já cadastrado'`) e cria com `tenant_id: tenantId ?? null`.
- **`update(id, data, tenantId)` / `delete(id, tenantId)`:**
  - Se `feature.tenant_id === null || (tenantId && feature.tenant_id !== tenantId)` lança **`AppError('Não é permitido alterar ou excluir um opcional global do sistema', 403)`**.
  - `update` verifica duplicidade de nome (`409` `'Nome de opcional já cadastrado'`).

### 2. Camada de Persistência (`FeatureRepository`)
**Arquivo:** `src/repositories/feature.repository.ts`

- **Opções atuais:** `super('features', { softDelete: false, hasActiveStatus: false })` — exclusão física (`DELETE FROM features WHERE id = $1 AND tenant_id = $2 RETURNING *`), sujeita a `ON DELETE RESTRICT` de `vehicle_features` no `schema.sql`. *(Nota: `schema.sql` já possui colunas `is_active` e `deleted_at` pendentes de alinhamento futuro no repositório).*
- **`findForTenant(tenantId?, filters)`:** Filtra `(tenant_id IS NULL OR tenant_id = $1)` e suporta filtros `name` (`=` e `ILIKE`), ordenando por `name ASC`.
- **`findByIdForTenant(id, tenantId?)` / `findByNameForTenant(name, tenantId?)` / `findByIdsForTenant(ids, tenantId?)`:** Consultas híbridas usadas tanto pelo CRUD quanto por `VehicleService` para validar lotes de `feature_ids`.

---

# Módulo: Modelos (`models`)

Modelos vinculados às marcas visíveis pelo tenant, estritamente isolados por `tenant_id`.

---

### 1. Camada de Serviço (`ModelService`)
**Arquivo:** `src/services/model.service.ts`

- Exige `tenantId` em todas as operações (`AppError('Tenant não identificado', 400)`).
- **`create(data, tenantId)` / `update(id, data, tenantId)`:**
  - Valida existência e visibilidade da marca via `brandRepository.findByIdForTenant(brand_id, tenantId)` (`404` `'Marca informada não encontrada'`).
  - Valida unicidade do nome na marca dentro do tenant via `repository.findByNameAndBrand(name, brandId, tenantId)` (`409` `'Modelo já cadastrado para esta marca'`).
- **`find`, `findById`, `delete`:** Escopados estritamente por `tenantId` (`softDelete: true, hasActiveStatus: true`).

### 2. Camada de Persistência (`ModelRepository`)
**Arquivo:** `src/repositories/model.repository.ts`

- **`findByNameAndBrand(name, brandId, tenantId)`:** Busca case-insensitive (`lower(name) = lower($3)`) ativa no tenant/marca.
- **`findByBrandId(brandId, tenantId)`:** Lista modelos ativos de uma marca no tenant ordenados por `name ASC`.

---

# Módulo: Veículos (`vehicles`)

Módulo central do sistema: controle multi-tenant (`tenantId`) e multi-store (`userStoreId` / `filterStoreId`), transações ACID com `vehicle_features`, sanitização LGPD (`RN003`) e métricas em lote (`RN007`).

---

### 1. Camada de Serviço (`VehicleService`)
**Arquivo:** `src/services/vehicle.service.ts`

- **`TenantExecutionContext`:** `{ tenantId: string; userStoreId?: string | null; filterStoreId?: string | null }`.

#### `create(data, featureIdsOverride?, ctx?)`
1. Exige `tenantId` (`400` `'Tenant não identificado'`).
2. Se `ctx?.userStoreId` estiver definido e `data.store_id !== ctx.userStoreId`, lança `AppError('Usuário só tem permissão para operar veículos da sua própria filial', 403)`.
3. Valida pertencimento da loja ao tenant (`storeRepository.findByIdAndTenant(data.store_id, tenantId)` -> `404`), do modelo ao tenant (`modelRepository.findById(data.model_id, tenantId)` -> `404`) e dos opcionais ao catálogo visível do tenant (`featureRepository.findByIdsForTenant(uniqueIds, tenantId)` -> `404`).
4. Normaliza placa (`normalizePlate`) e verifica unicidade no tenant (`repository.findByPlate(plate, tenantId)` -> `409` `'Placa já cadastrada para outro veículo ativo'`).
5. Calcula `plate_last_digit` e executa `repository.createWithFeatures(payload, featureIds)`.

#### `update(id, data, featureIdsOverride?, ctxParam?)`
1. Verifica se há dados ou `featureIds` informados (`400`).
2. Busca veículo no tenant (`repository.findById(id, tenantId)` -> `404`).
3. Bloqueia com `403` se `ctx?.userStoreId` diferir de `currentVehicle.store_id` ou tentar transferir para outro `store_id`.
4. Valida alterações de `store_id`, `model_id`, `full_license_plate` (unicidade no tenant + recálculo de `plate_last_digit`) e `feature_ids`.
5. Valida regras de negócio condicionais no estado mesclado (`PROPRIO` exige `purchase_price > 0`; `CONSIGNADO` exige `owner_name`, `owner_contact`, `owner_price > 0`, `store_commission_rate >= 0`).
6. Atualiza atomicamente via `repository.updateWithFeatures(id, cleanData, featureIds, tenantId)`.

#### `delete(id, tenantIdOrCtx?)`
- Busca veículo no tenant (`404`), verifica `userStoreId` (`403`) e executa `repository.delete(id, tenantId)`.

#### `findPublic(query, ctx)` e `findAdmin(query, role, ctx)`
- `findPublic`: força `publicOnly = true` e `include_deleted = false`, atribui `filters.tenant_id = ctx.tenantId` e sobrescreve defensivamente `filters.store_id = ctx.filterStoreId ?? undefined`. Sanitiza todos os itens com `sanitizeVehicleForRole(item, 'PUBLICO')`.
- `findAdmin`: define `publicOnly = false`, atribui `filters.tenant_id = ctx.tenantId` e força `filters.store_id = ctx.userStoreId ?? ctx.filterStoreId ?? undefined` (usuário de filial só enxerga sua filial). Sanitiza com `sanitizeVehicleForRole(item, role)`.

#### `findByIdPublic(id, ip, userAgent, ctx?)` e `findByIdAdmin(id, role, ctx)`
- `findByIdPublic`: consulta `findDetailedById(id, { publicOnly: true, tenant_id: ctx?.tenantId, store_id: ctx?.filterStoreId ?? undefined })`, registra visualização via `viewTracker.trackView(id, ip, userAgent)` (TTL 30 min em memória, flush assíncrono a cada 60s em `server.ts`), soma `viewTracker.getPendingViews(id)` ao `total_views` retornado e sanitiza para `'PUBLICO'`.
- `findByIdAdmin`: consulta `findDetailedById(id, { publicOnly: false, tenant_id: ctx.tenantId, store_id: ctx.userStoreId ?? undefined })`, soma `getPendingViews(id)` sem incrementar views e sanitiza pela `role`.

#### `comparePublic(ids, ctx?)`
- Exige 2 a 3 IDs sem duplicatas (`400`), consulta `repository.findByIds(ids, { publicOnly: true, tenant_id: ctx?.tenantId, store_id: ctx?.filterStoreId ?? undefined })` e sanitiza para `'PUBLICO'`.

#### `updateInspectionReport(id, reportUrl, ctx)`
- Valida existência no tenant (`404`) e restrição de filial (`403`), atualizando `inspection_report_url`.

---

### 2. Camada de Persistência (`VehicleRepository`)
**Arquivo:** `src/repositories/vehicle.repository.ts` (`softDelete: true, hasActiveStatus: false`)

- **`delete(id, tenantId?)`:** `UPDATE vehicles SET deleted_at = NOW(), status = 'INATIVO', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL [AND tenant_id = $2] RETURNING *;`.
- **`findByPlate(plate, tenantId?)`:** Consulta placa ativa filtrada por `tenant_id` quando fornecido.
- **`createWithFeatures(data, featureIds)`:** Transação `BEGIN ... COMMIT/ROLLBACK` inserindo em `vehicles` e `vehicle_features`.
- **`updateWithFeatures(id, data, featureIds?, tenantId?)`:** Transação atualizando `vehicles` com `{ tenantId }` no `buildUpdateQuery` e substituindo `vehicle_features` caso `featureIds !== undefined`.
- **`updateInspectionReport(id, url, tenantId?)`:** Atualiza `inspection_report_url` e `updated_at` filtrado por `id`, `deleted_at IS NULL` e `tenant_id`.
- **`findCatalog(filters)`:** Monta query paginada com `JOIN models` e `JOIN brands`, subquery de capa (`is_primary = true`), filtro `tenant_id` e `store_id`, regra Flex (`RN001`: `GASOLINA` inclui `FLEX`; `ALCOOL` inclui `FLEX`), regra pública (`RN002`: `ATIVO`/`RESERVADO`), filtro cumulativo de `feature_ids` (`GROUP BY ... HAVING COUNT(DISTINCT vf.feature_id) = $n`) e busca textual em `v.title ILIKE`.
- **`findDetailedById(id, options)` / `findByIds(ids, options)`:** Filtram por `tenant_id`, `store_id` e `publicOnly`, agregando `brand`, `model`, `features` e `photos`.
- **`incrementBatchViews(views: Map<string, number>)`:** Transação em lote chamada a cada 60s pelo `server.ts`, somando `count` em `vehicles.total_views` e fazendo upsert em `vehicle_metrics` (`ON CONFLICT (vehicle_id, recorded_date)`).
- **`incrementViewMetrics(id)`:** Incremento unitário transacional em `vehicles` e `vehicle_metrics`.

---

# Módulo de Mídias e Galeria (`VehicleMedia`)

## 1. `VehicleMediaService`
**Arquivo:** `src/services/vehicle-media.service.ts`

- **`ensureVehicleAccess(vehicleId, tenantId, userStoreId?)`:** Valida que o veículo existe no tenant (`404` `'Veículo não encontrado'`) e que pertence à filial do usuário quando `userStoreId` está definido (`403` `'Usuário só tem permissão para gerenciar mídias de veículos da sua própria filial'`).
- **`uploadPhotos(vehicleId, files, tenantId, userStoreId?)`:**
  - Valida acesso (`ensureVehicleAccess`) e presença de arquivos (`400`).
  - Processa cada arquivo temporário (`file.path`) via `processVehiclePhoto`, salva `thumbBuffer` e `fullBuffer` em `this.storage.save(...)` (WebP 80%) e insere em lote via `vehiclePhotoRepository.createMany`.
  - **Rollback compensatório:** Em erro de processamento ou banco, remove fotos já salvas do lote via `deletePhotoFiles`; no `finally`, remove sempre os arquivos temporários via `this.storage.deleteTempFile(file.path)`.
- **`reorderPhotos(vehicleId, photoIds, tenantId, userStoreId?)`:** Valida acesso e contagem total (`400` se divergir) e executa `vehiclePhotoRepository.reorder` (índice `0` vira `is_primary = true`).
- **`deletePhoto(vehicleId, photoId, tenantId, userStoreId?)`:** Valida acesso, pertencimento da foto ao veículo (`400`), remove arquivos (`deletePhotoFiles`) e registro no banco, e elege a próxima foto de menor `display_order` como capa (`setPrimary`) caso a excluída fosse principal.
- **`uploadInspectionReport(vehicleId, file, tenantId, userStoreId?)`:** Valida acesso e `file.path`, salva PDF via `this.storage.save('reports', ...)`, atualiza `inspection_report_url` no banco e só remove o PDF anterior (`deleteReportFile`) **após** sucesso do banco. Em erro, remove o novo arquivo e preserva o antigo; no `finally`, limpa o arquivo temporário.
- **`deleteInspectionReport(vehicleId, tenantId, userStoreId?)`:** Valida acesso, remove o arquivo físico (`deleteReportFile`) e define `inspection_report_url = null`.

## 2. `VehiclePhotoRepository`
**Arquivo:** `src/repositories/vehicle-photo.repository.ts`

- **`createMany(vehicleId, photos)`:** Transação explícita (`BEGIN ... COMMIT/ROLLBACK`) para inserção em lote em `vehicle_photos`.
- **`findByVehicleId(vehicleId)`:** Lista fotos ordenadas por `display_order ASC, created_at ASC`.
- **`findById(id)`** e **`countByVehicleId(vehicleId)`:** Consulta foto unitária ou contagem + `MAX(display_order)`.
- **`reorder(vehicleId, photoIds)`:** Transação ACID validando que todos os IDs pertencem ao veículo e definindo `display_order = index` e `is_primary = (index === 0)` (`RN008`).
- **`delete(id)`** e **`setPrimary(vehicleId, photoId)`:** Exclusão física e redefinição transacional da foto principal.
