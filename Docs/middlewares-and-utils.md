# Documentação: Middlewares e Utilitários

Esta documentação cobre os componentes transversais da aplicação Express/TypeScript: interceptors de requisição, autenticação, controle de permissões (RBAC), middleware global de erros, injeções de tipos no `Express.Request` e o catálogo de funções utilitárias puras.

---

## 1. Middlewares Express

### `errorHandler`
- **Arquivo:** `src/middlewares/error.middleware.ts`
- **Tipo:** Error Handler Global `(err: Error, req: Request, res: Response, next: NextFunction)`.
- **Entradas Analisadas:** Objeto `error` propagado pela cadeia de middlewares ou disparado diretamente nos controllers e services.
- **Injeção no `Express.Request`:** Nenhuma injeção.
- **Tratamento de Erros e Interrupções:**
  - **`AppError` (e subclasses `NotFoundError`, `BadRequestError`):** Extrai dinamicamente `error.statusCode` e responde com o payload:
    ```json
    {
      "message": "Mensagem descritiva do erro"
    }
    ```
  - **`MulterError`:** Erros de upload que escaparem dos wrappers de Multer respondem com status `400 Bad Request` e `{ "message": error.message }`.
  - **`ZodError`:** Disparado se uma exceção de validação escapar sem interceptor local. Responde com status `400 Bad Request` com `{ "message": error.message }`.
  - **Erros Nativos do PostgreSQL (pgCode):**
    - **`23505` (Unique Violation):** Responde com status `409 Conflict`:
      ```json
      {
        "message": "Registro duplicado ou já existente."
      }
      ```
    - **`23503` (Foreign Key Violation):** Responde com status `409 Conflict`:
      ```json
      {
        "message": "Operação não permitida: registro vinculado a outros dados."
      }
      ```
  - **Erro Desconhecido / Não Tratado (`Error` genérico):** Registra o erro no console e responde com status `500 Internal Server Error`:
    ```json
    {
      "message": "Erro interno do servidor"
    }
    ```
  - **Evolução Planejada (`roadmap-seguranca.md` S4.7 / S6.5):** Tratamento de `MissingTenantContextError` (`500` sem detalhes), código Postgres `42501` (`403` `'Operação não permitida.'`) e logs JSON estruturados sem PII via `logError`.

---

### `validate`
- **Arquivo:** `src/middlewares/validate.middleware.ts`
- **Tipo:** Interceptor de Requisição (Factory / Currying) que recebe um schema Zod: `(schema: ZodType) => (req: Request, res: Response, next: NextFunction)`.
- **Entradas Analisadas:** Valida simultaneamente `req.body`, `req.query` e `req.params` contra o schema informado via `schema.parse()`.
- **Injeção no `Express.Request`:**
  Redefine as propriedades de requisição utilizando `Object.defineProperty` com os dados sanitizados, transformados e validados pelo Zod:
  - `req.body`: Sobrescrito com `parsed.body` (configurável, gravável, enumerável).
  - `req.query`: Sobrescrito com `parsed.query`.
  - `req.params`: Sobrescrito com `parsed.params`.
- **Tratamento de Erros e Interrupções:**
  - **Falha de Validação (`ZodError`):** Interrompe imediatamente a requisição sem chamar `next()`, retornando status `400 Bad Request` com lista estruturada:
    ```json
    {
      "status": "fail",
      "errors": [
        {
          "field": "body.email",
          "message": "Formato de e-mail inválido"
        }
      ]
    }
    ```
  - **Outros Erros:** Encaminha exceções inesperadas para `next(error)`.

---

### `authenticateJWT` e `createAuthMiddleware`
- **Arquivo:** `src/middlewares/auth.middleware.ts`
- **Tipo:** Factory de Interceptor de Requisição (`createAuthMiddleware(userRepo: AuthUserFinder = userRepository)`) com export padrão `authenticateJWT = createAuthMiddleware()`. Permite injeção de dependência para testes unitários mantendo `userRepository` como padrão em produção.
- **Entradas Analisadas:** Header HTTP `Authorization` validado via regex `/^Bearer\s+(\S+)$/i` (case-insensitive para `Bearer`, tolerante a múltiplos espaços e rejeitando headers sem token ou com segmentos extras antes de invocar `validateToken`).
- **Consulta Unificada:** Executa **1 única query SQL** via `userRepo.findAuthUserById(payload.id)` (`INNER JOIN tenants t ON t.id = u.tenant_id` e `LEFT JOIN stores s ON s.id = u.store_id AND s.tenant_id = u.tenant_id`), validando simultaneamente usuário e empresa ativos (`is_active = true`) e não deletados (`deleted_at IS NULL`), além de garantir que usuários vinculados a uma filial (`u.store_id IS NOT NULL`) só autentiquem se a filial também estiver ativa e não deletada.
- **Injeção no `Express.Request`:**
  Injeta no objeto `req` a propriedade `user` tipada via extensão de módulo (`src/@types/express.d.ts`), priorizando os dados atuais do banco de dados (`user.id`, `user.email`, `user.role`, `user.tenant_id`, `user.store_id`) sobre o payload estático do token JWT para refletir alterações de perfil, permissões e filiais imediatamente:
  ```typescript
  req.user = {
    id: string;              // UUID do usuário no banco
    email: string;           // E-mail atualizado do banco
    role: string;            // ADMIN | VENDEDOR | VISUALIZADOR | PUBLICO atualizado
    tenantId: string;        // UUID da empresa vinculada (obrigatório)
    storeId: string | null;  // UUID da filial vinculada (ou null se atua na rede)
  };
  ```
- **Tratamento de Erros e Interrupções (Separação `401` vs `500`):**
  - **Header ausente, malformado ou usuário/tenant inexistente, inativo ou deletado:** Status `401 Unauthorized`:
    ```json
    {
      "message": "Acesso negado. Token não fornecido ou inválido"
    }
    ```
  - **Token adulterado, expirado, algoritmo inválido ou payload inválido (`InvalidTokenError` / `jwt.JsonWebTokenError`):** Status `401 Unauthorized`:
    ```json
    {
      "message": "Token inválido ou expirado."
    }
    ```
  - **Falhas de infraestrutura ou configuração (`JWT_SECRET` ausente, erro de rede/PostgreSQL):** Repassadas integralmente para `next(error)`, resultando em `500 Internal Server Error` no `errorHandler` (nunca mascaradas como `401`).

> [!IMPORTANT]
> **Requisito Obrigatório de Revogação de Sessão (`token_version`)**: Ao implementar a rota de troca de senha (`PATCH /api/users/change-password`) ou logout global, adicione a coluna `token_version INTEGER NOT NULL DEFAULT 1` na tabela `users` (e `tokenVersion` no `TokenPayload`), incremente `token_version` no banco ao alterar a senha e valide `user.token_version === payload.tokenVersion` dentro de `authenticateJWT` para revogar imediatamente todos os tokens emitidos antes da troca de senha.

---

### `resolvePublicTenantContext`
- **Arquivo:** `src/middlewares/tenant.middleware.ts`
- **Tipo:** Interceptor de Requisição (Resolução de Contexto Multi-Tenant exclusivamente para Vitrine Pública).
- **Entradas Analisadas (sem leitura de `req.user`):**
  1. Headers HTTP `x-tenant-id` e `x-store-id`.
  2. Query parameters `tenant_id` e `store_id`.
- **Validação no Banco de Dados:**
  - Quando `x-store-id` / `store_id` é informado, consulta a loja e verifica existência, `is_active === true`, `deleted_at == null` e correspondência com `tenant_id` (caso enviado).
  - Valida sempre a empresa resolvida (`tenant_id`), exigindo existência, `is_active === true` e `deleted_at == null`.
- **Injeção no `Express.Request`:**
  Injeta no objeto `req` a propriedade `tenantContext` tipada:
  ```typescript
  req.tenantContext = {
    tenantId: string;        // UUID da empresa dona da vitrine
    storeId: string | null;  // UUID da filial sendo visualizada (ou null se escopo de empresa)
  };
  ```
- **Tratamento de Erros e Interrupções:**
  - **Nenhum identificador informado:** Status `400 Bad Request`:
    ```json
    {
      "message": "Contexto da empresa ou loja é obrigatório (informe x-tenant-id, x-store-id, tenant_id ou store_id)"
    }
    ```
  - **Identificador malformado (não-UUID, array duplicado ou string vazia):** Status `400 Bad Request`:
    ```json
    {
      "message": "Identificador de empresa ou loja inválido"
    }
    ```
  - **Loja inexistente, inativa, deletada, pertencente a outra empresa ou vinculada a empresa inativa:** Status `404 Not Found`:
    ```json
    {
      "message": "Loja não encontrada"
    }
    ```
  - **Empresa informada diretamente (`x-tenant-id`/`tenant_id`) inexistente, inativa ou deletada:** Status `404 Not Found`:
    ```json
    {
      "message": "Empresa não encontrada"
    }
    ```

---

### `authorizeRoles`
- **Arquivo:** `src/middlewares/role.middleware.ts`
- **Tipo:** Interceptor de Requisição (Autorização RBAC Curried): `(...allowedRoles: string[]) => (req: Request, res: Response, next: NextFunction)`.
- **Entradas Analisadas:** Propriedade `req.user` injetada previamente por `authenticateJWT`.
- **Injeção no `Express.Request`:** Nenhuma injeção.
- **Tratamento de Erros e Interrupções:**
  - **`req.user` inexistente:** Status `401 Unauthorized`:
    ```json
    {
      "message": "Usuário não autenticado."
    }
    ```
  - **`req.user.role` não permitida na lista de roles:** Status `403 Forbidden`:
    ```json
    {
      "message": "Acesso proibido. Permissão insuficiente."
    }
    ```

---

### `includeDeletedValidateRole`
- **Arquivo:** `src/middlewares/role.middleware.ts`
- **Tipo:** Interceptor de Requisição (Controle de Acesso em Nível de Parâmetro).
- **Entradas Analisadas:** `req.query.include_deleted` e `req.user.role`.
- **Injeção no `Express.Request`:** Nenhuma injeção.
- **Tratamento de Erros e Interrupções:**
  - Se `req.query.include_deleted === 'true'` e `req.user?.role !== 'ADMIN'`: Interrompe com status `403 Forbidden`:
    ```json
    {
      "message": "Acesso proibido. Permissão insuficiente para incluir registros excluídos."
    }
    ```
  - Se `include_deleted` for `'false'`, não for enviado, ou o usuário for `ADMIN`: Invoca `next()`.

---

### `loginLimit`
- **Arquivo:** `src/middlewares/auth.middleware.ts`
- **Tipo:** Interceptor de Segurança / Proteção contra Força Bruta (`express-rate-limit`).
- **Configuração:** Limite de 5 tentativas falhas a cada 15 minutos por IP, com `skipSuccessfulRequests: true` para que logins válidos (`2xx`) não consumam a cota do IP.
- **Proxy Reverso (`TRUST_PROXY_HOPS`):** Em `src/app.ts`, `app.set('trust proxy', ...)` lê `process.env.TRUST_PROXY_HOPS` (padrão `1`), garantindo leitura correta do IP real do cliente em provedores como **Render**, **Northflank** e **Koyeb** (`1` hop direto no load balancer da PaaS, ou `2` se houver Cloudflare Proxy na frente).
- **Entradas Analisadas:** Endereço IP do cliente resolvido pelo `trust proxy`.
- **Injeção no `Express.Request`:** Anexa headers padrão de rate-limit (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
- **Tratamento de Erros e Interrupções:**
  - Se exceder 5 requisições com falha dentro da janela de 15 minutos por IP: Retorna status `429 Too Many Requests`:
    ```json
    {
      "message": "Muitas tentativas de login neste IP, tente novamente após 15 minutos."
    }
    ```

---

### `registerLimit`
- **Arquivo:** `src/middlewares/auth.middleware.ts`
- **Tipo:** Interceptor de Segurança / Rate Limit de Cadastros (`express-rate-limit`).
- **Rotas Protegidas:** Aplicado em `POST /api/tenants/onboard` (junto a `authenticateOnboardingSecret`) e nas rotas de criação de conta/usuário para contenção de força bruta.
- **Entradas Analisadas:** Endereço IP do cliente.
- **Injeção no `Express.Request`:** Headers padrão de rate-limit.
- **Tratamento de Erros e Interrupções:**
  - Se exceder 5 cadastros dentro da janela de 1 hora por IP: Retorna status `429 Too Many Requests`:
    ```json
    {
      "message": "Muitas contas criadas a partir deste IP. Tente novamente em 1 hora."
    }
    ```

---

### `authenticateOnboardingSecret`
- **Arquivo:** `src/middlewares/auth.middleware.ts`
- **Tipo:** Interceptor de Autenticação de Provisionamento SaaS (exclusivo para `POST /api/tenants/onboard`).
- **Entradas Analisadas:** Header HTTP `x-onboarding-secret` comparado em tempo constante (`crypto.timingSafeEqual`, validando igualdade de `byteLength` antes da comparação) contra `process.env.ONBOARDING_SECRET`.
- **Injeção no `Express.Request`:** Nenhuma injeção.
- **Tratamento de Erros e Interrupções:**
  - **`process.env.ONBOARDING_SECRET` ausente ou vazia:** Encaminha `Error('Variável de ambiente ONBOARDING_SECRET não configurada.')` para `next(error)` (`500 Internal Server Error`).
  - **Header `x-onboarding-secret` ausente, vazio, array ou divergente:** Interrompe com status `401 Unauthorized`:
    ```json
    {
      "message": "Acesso negado. Chave de provisionamento inválida ou ausente."
    }
    ```

---

## 2. Funções Utilitárias (Utils)

### `hashPassword(pass: string): Promise<string>`
- **Arquivo:** `src/utils/hash.util.ts`
- **Descrição:** Gera o hash criptográfico seguro de uma senha em texto puro usando bcrypt com 10 salt rounds.
- **Assinatura & Parâmetros:**
  - `pass` (`string`): Senha em texto puro a ser criptografada.
- **Retorno:** `Promise<string>` contendo o hash gerado com o prefixo do algoritmo (ex: `$2b$10$...`).
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `hashPassword("LoginSeguro123!")`
  - Saída: `"$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"`

---

### `comparePassword(purePass: string, hashPass: string): Promise<boolean>`
- **Arquivo:** `src/utils/hash.util.ts`
- **Descrição:** Compara uma senha em texto puro com um hash armazenado no banco via algoritmo de tempo constante do bcrypt.
- **Assinatura & Parâmetros:**
  - `purePass` (`string`): Senha enviada pelo usuário na tentativa de login.
  - `hashPass` (`string`): Hash previamente gerado armazenado no banco de dados.
- **Retorno:** `Promise<boolean>` indicando se as credenciais conferem (`true`) ou não (`false`).
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `comparePassword("LoginSeguro123!", "$2b$10$abcdefghijklmnopqrstuvwxyz...")`
  - Saída: `true` (ou `false` para senha incorreta).

---

### `generateToken(payload: TokenPayload): string`
- **Arquivo:** `src/utils/jwt.util.ts`
- **Descrição:** Gera e assina um token JWT contendo `id`, `email`, `role`, `tenantId` e `storeId` utilizando estritamente o algoritmo `HS256` e validade de `1d` (1 dia). Utiliza a função exportada `getSecretKey()`, que valida `process.env.JWT_SECRET` (disparando `Error` padrão se ausente ou vazia — também executada em fail-fast na subida do servidor em `src/server.ts`).
- **Assinatura & Parâmetros:**
  - `payload` (`TokenPayload`: `{ id: string, email: string, role: string, tenantId: string, storeId?: string | null }`): Informações do usuário autenticado a serem gravadas no token.
- **Retorno:** `string` contendo o token no formato `Header.Payload.Signature`.
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `generateToken({ id: "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b", email: "admin@garagem.com", role: "ADMIN", tenantId: "11111111-1111-4111-8111-111111111111", storeId: "22222222-2222-4222-8222-222222222222" })`
  - Saída: `"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`

---

### `validateToken(token: string): TokenPayload`
- **Arquivo:** `src/utils/jwt.util.ts`
- **Descrição:** Obtém o segredo via `getSecretKey()` antes do bloco de verificação JWT (preservando erros de configuração como `Error` padrão), valida a assinatura e expiração restringindo o algoritmo a `['HS256']`, e valida o payload decodificado em runtime com schema Zod (`id` e `tenantId` em formato UUID válido, `email` e `role` strings não vazias, e `storeId` em formato UUID válido quando preenchido, opcional/nulo).
- **Assinatura & Parâmetros:**
  - `token` (`string`): Token JWT extraído do header `Authorization`.
- **Retorno:** `TokenPayload` validado com `{ id, email, role, tenantId, storeId }` (normalizando `storeId` ausente para `null`). Dispara `InvalidTokenError` se assinatura, expiração, algoritmo ou campos do payload forem inválidos, e `Error` padrão se `JWT_SECRET` não estiver configurada.
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `validateToken("eyJhbGciOiJIUzI1Ni...")`
  - Saída: `{ id: "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b", email: "admin@garagem.com", role: "ADMIN", tenantId: "11111111-1111-4111-8111-111111111111", storeId: "22222222-2222-4222-8222-222222222222" }`

---

### `parseFilters(query: Record<string, unknown>): FindData`
- **Arquivo:** `src/utils/parse-filter.util.ts`
- **Descrição:** Converte parâmetros de busca de uma URL (`req.query`) em uma estrutura tipada de filtros relacionais (`filters` e `includeDeleted`).
- **Assinatura & Parâmetros:**
  - `query` (`Record<string, unknown>`): Objeto de consulta bruto da requisição.
- **Retorno:** `FindData` contendo `filters: FindParams[]` e `includeDeleted?: boolean`.
  - Mapeia sufixo `_like` -> operador `'ILIKE'`.
  - Mapeia sufixo `_gte` -> operador `'>='`.
  - Mapeia sufixo `_lte` -> operador `'<='`.
  - Mapeia valores com vírgula (ex: `"1,2,3"`) -> operador `'IN'` com array `["1", "2", "3"]`.
  - Campos sem sufixo -> operador `'='`.
  - Ignora chaves reservadas: `page`, `limit` e `include_deleted`.
- **Exemplo Real (Extraído de `parse-filter.util.spec.ts`):**
  - Entrada: `parseFilters({ name_like: "civic", role: "ADMIN", include_deleted: "true" })`
  - Saída:
    ```javascript
    {
      includeDeleted: true,
      filters: [
        { field: "name", operator: "ILIKE", value: "civic" },
        { field: "role", operator: "=", value: "ADMIN" }
      ]
    }
    ```

---

### `buildInsertQuery(tableName: string, data: Record<string, unknown>): { query: string; values: unknown[] }`
- **Arquivo:** `src/utils/query.util.ts`
- **Descrição:** Constrói dinamicamente uma declaração SQL `INSERT INTO` parametrizada com parâmetros posicionais `$1, $2...` e cláusula `RETURNING *`. Valida preventivamente o nome da tabela e todas as colunas com `assertValidIdentifier` (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) para blindagem contra SQL Injection.
- **Assinatura & Parâmetros:**
  - `tableName` (`string`): Nome da tabela no PostgreSQL (validado contra regex).
  - `data` (`Record<string, unknown>`): Chave-valor das colunas e valores a inserir.
- **Retorno:** `{ query: string; values: unknown[] }`.
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `buildInsertQuery("brands", { name: "Toyota" })`
  - Saída:
    ```javascript
    {
      query: "INSERT INTO brands (name) VALUES ($1) RETURNING *;",
      values: ["Toyota"]
    }
    ```

---

### `buildUpdateQuery(tableName: string, data: Record<string, unknown>, id: string, options?: { softDelete?: boolean; tenantId?: string }): { query: string; values: unknown[] }`
- **Arquivo:** `src/utils/query.util.ts`
- **Descrição:** Constrói uma query SQL `UPDATE` parametrizada vinculando colunas mutáveis e aplicando `id` e (quando informado) `tenant_id` no `WHERE`. Bloqueia explicitamente qualquer mutação nas colunas imutáveis (`id`, `tenant_id`, `created_at`) e ignora valores `undefined` (lançando `BadRequestError('Nenhum campo válido informado para atualização')` se nada restar). Valida identificadores com `assertValidIdentifier` e, quando `options?.softDelete !== false` (padrão), anexa `AND deleted_at IS NULL`.
- **Assinatura & Parâmetros:**
  - `tableName` (`string`): Nome da tabela no PostgreSQL.
  - `data` (`Record<string, unknown>`): Colunas a serem modificadas (campos em `IMMUTABLE_UPDATE_COLUMNS` são filtrados).
  - `id` (`string`): Identificador do registro.
  - `options` (`{ softDelete?: boolean; tenantId?: string }`, opcional): Flag de soft-delete (padrão `true`) e UUID do tenant para isolamento no `WHERE`.
- **Retorno:** `{ query: string; values: unknown[] }`.
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `buildUpdateQuery("brands", { name: "Toyota do Brasil", tenant_id: "tentativa-invasao" }, "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d", { tenantId: "11111111-1111-4111-8111-111111111111" })`
  - Saída:
    ```javascript
    {
      query: "UPDATE brands SET name = $1 WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL RETURNING *;",
      values: [
        "Toyota do Brasil",
        "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "11111111-1111-4111-8111-111111111111"
      ]
    }
    ```

---

### `buildFindQuery(tableName: string, filters: FindData, options?: { softDelete?: boolean }): { query: string; values: unknown[] }`
- **Arquivo:** `src/utils/query.util.ts`
- **Descrição:** Monta a query SQL `SELECT` com operadores relacionais dinâmicos (`=`, `>=`, `<=`, `ILIKE`, `ANY`), controle de `deleted_at IS NULL` e placeholders sequenciais. Todos os identificadores de campos são verificados com `assertValidIdentifier`.
- **Assinatura & Parâmetros:**
  - `tableName` (`string`): Nome da tabela.
  - `filters` (`FindData`): Filtros processados.
  - `options` (`{ softDelete?: boolean }`): Flag de soft-delete (padrão `true`).
- **Retorno:** `{ query: string; values: unknown[] }`.
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada:
    ```javascript
    buildFindQuery("models", {
      filters: [{ field: "name", operator: "ILIKE", value: "Corolla" }],
      includeDeleted: false
    })
    ```
  - Saída:
    ```javascript
    {
      query: "SELECT * FROM models WHERE deleted_at IS NULL AND name ILIKE $1",
      values: ["%Corolla%"]
    }
    ```

---

### `sanitizeVehicleForRole<T extends object>(vehicle: T | T[], role?: string): T | SanitizedVehicle<T> | T[] | SanitizedVehicle<T>[]`
- **Arquivo:** `src/utils/vehicle-sanitizer.util.ts`
- **Descrição:** Remove dados sensíveis ou confidenciais de um veículo ou array de veículos para conformidade com a LGPD e privacidade comercial (RN003). A verificação de role é case-insensitive (`role?.toUpperCase()`).
- **Assinatura & Parâmetros:**
  - `vehicle` (`T | T[]`): Objeto ou lista de veículos recuperados do banco.
  - `role` (`string`, opcional): Perfil do usuário solicitante (`'ADMIN'`, `'VENDEDOR'`, `'VISUALIZADOR'`, `'PUBLICO'` ou indefinido).
- **Retorno:** Cópia higienizada do veículo (ou array de veículos).
  - Perfis `'ADMIN'` e `'VENDEDOR'`: Retorna o objeto integral (inclui preços de compra e comissões).
  - Perfis `'VISUALIZADOR'`, `'PUBLICO'` ou indefinido: Remove as propriedades:
    - `full_license_plate` (preserva apenas `plate_last_digit`)
    - `purchase_price`
    - `owner_price`
    - `owner_name`
    - `owner_contact`
    - `store_commission_rate`
- **Exemplo Real (Extraído de `vehicle.service.spec.ts`):**
  - Entrada:
    ```javascript
    sanitizeVehicleForRole({
      title: "Corolla XEi",
      sale_price: 120000,
      full_license_plate: "BRA2E19",
      plate_last_digit: 9,
      purchase_price: 100000,
      owner_name: "Privado da Silva"
    }, "PUBLICO")
    ```
  - Saída:
    ```javascript
    {
      title: "Corolla XEi",
      sale_price: 120000,
      plate_last_digit: 9
    }
    ```

---

### `viewTracker` (`ViewTracker`)
- **Arquivo:** `src/utils/view-tracker.util.ts`
- **Descrição:** Controla visualizações de veículos em memória com janela anti-fraude de 30 minutos por combinação `vehicleId + IP + User-Agent` (`RN007`) e acumula incrementos pendentes (`pendingViews`) para persistência em lote a cada 60 segundos pelo job em `src/server.ts` (`vehicleRepository.incrementBatchViews`). Realiza limpeza oportunista quando o cache ultrapassa 2.000 entradas.
- **Métodos Públicos:**
  - `shouldIncrement(vehicleId: string, ip: string, userAgent: string): boolean`: Verifica se a chave expirou/inexiste no cache de 30 minutos; se sim, registra novo TTL e retorna `true`.
  - `trackView(vehicleId: string, ip: string, userAgent: string): boolean`: Chama `shouldIncrement`; se retornar `true`, soma `+1` em `pendingViews` para o `vehicleId`.
  - `getPendingViews(vehicleId: string): number`: Retorna quantas visualizações pendentes de persistência existem no buffer para o veículo (usado na leitura em `VehicleService` para exibir o total atualizado em tempo real).
  - `drainPending(): Map<string, number>`: Retorna uma cópia do mapa de visualizações pendentes e limpa `pendingViews` atomicamente para o flush no banco.
  - `clear(): void`: Limpa cache TTL e buffer pendente (utilizado em testes).

---

### `uploadVehiclePhotos` e `uploadInspectionReport` (Middlewares de Upload)
- **Arquivo:** `src/middlewares/upload.middleware.ts`
- **Descrição:**
  - Configura `multer.diskStorage` gravando os arquivos temporariamente em `TEMP_DIR` (`uploads/vehicles/temp`) com nomes gerados via `crypto.randomUUID()` + extensão original.
  - `uploadVehiclePhotos`: Intercepta requisições `multipart/form-data` no campo `photos` permitindo até 15 imagens (`image/jpeg`, `image/png`, `image/webp`) com limite de 10MB por arquivo. Converte `MulterError` (`LIMIT_FILE_SIZE`, `LIMIT_UNEXPECTED_FILE`) em `AppError(400)`.
  - `uploadInspectionReport`: Intercepta requisições `multipart/form-data` no campo `report` permitindo arquivo único PDF (`application/pdf`) de até 20MB.
- **Assinatura & Parâmetros:** Middlewares Express padronizados `(req: Request, res: Response, next: NextFunction): void`.

---

### `processVehiclePhoto`, `deletePhotoFiles` e `deleteReportFile`
- **Arquivo:** `src/utils/image-processor.util.ts`
- **Descrição:**
  - Configura `sharp.cache(false)` para evitar locks de arquivo no Windows.
  - `processVehiclePhoto(inputPath: string): Promise<{ thumbBuffer: Buffer; fullBuffer: Buffer }>`: Valida o arquivo temporário com Sharp (lançando `AppError(400, 'Formato de imagem inválido ou corrompido')` caso inválido) e gera em paralelo dois buffers em WebP (qualidade 80%): miniatura (`400x300`, `fit: 'cover'`) e alta resolução (`1280x960`, `fit: 'inside'`, `withoutEnlargement: true`). A gravação final é delegada ao `StorageProvider`.
  - `deletePhotoFiles(thumbPath: string, fullPath: string): Promise<void>` e `deleteReportFile(reportPath: string): Promise<void>`: Removem com segurança arquivos físicos usando `toSafeAbsolutePath` (prevenção de path traversal) e ignorando `ENOENT`.

---

### `StorageProvider` e `LocalStorageProvider`
- **Arquivo:** `src/utils/storage.util.ts`
- **Descrição:** Abstração de armazenamento de mídias preparando a troca transparente entre disco local e Cloudflare R2 (Fase 6).
- **Diretórios e Utilitários Exportados:**
  - `THUMBS_DIR`, `FULL_DIR`, `REPORTS_DIR`, `TEMP_DIR`: subdiretórios sob `uploads/vehicles`.
  - `ensureUploadDirs(): Promise<void>`: Cria os diretórios recursivamente de forma idempotente (chamada no boot em `src/server.ts` e no Multer).
  - `toSafeAbsolutePath(relativePath: string): string`: Resolve caminho absoluto garantindo que esteja estritamente dentro da raiz `uploads/` (bloqueia path traversal com `AppError(400)`).
  - `LocalStorageProvider`: Implementa `save(folder, filename, content)` (aceita `Buffer` ou caminho de arquivo temporário para `rename`), `delete(relativePath)` e `deleteTempFile(filePath)`.

---

## 3. Componentes Transversais Planejados (`Docs/roadmaps/roadmap-seguranca.md`)

Os módulos abaixo **ainda não existem** no código atual e serão implementados nas subfases do roadmap de segurança:

- **`src/config/request-context.ts` (S2.1):** Contexto por requisição via `AsyncLocalStorage` (`runWithTenant`, `getCurrentTenantId`).
- **`src/config/db.ts` (S2.2–S2.3):** Wrapper fail-closed do pool com `set_config('app.current_tenant_id', $1, true)` local à transação e `callSystemFunction` com allowlist.
- **`src/config/cors.ts` (S6.2):** Allowlist estrita via `CORS_ALLOWED_ORIGINS` (exigindo `https://` em produção) + `helmet` em `src/app.ts` (S6.1).
- **`src/utils/logger.util.ts` (S6.5):** Logger JSON estruturado em uma linha (`logError`) sem vazar `detail` do Postgres ou dados pessoais.
- **`src/utils/file-signature.util.ts` (S7.2):** Validação por assinatura binária (*magic bytes*) dos primeiros 12 bytes para JPEG, PNG, WebP e PDF.
- **`src/utils/storage-key.util.ts` (S7.3):** Geração padronizada de chaves por tenant (`buildStorageKey`) e `R2StorageProvider` (S7.4 / Fase 6).
- **`src/config/env.ts` & `src/config/least-privilege.ts` (S8.1–S8.3):** Validação Zod das variáveis de ambiente no boot e recusa de inicialização caso o banco conecte como usuário privilegiado ou dono das tabelas.

