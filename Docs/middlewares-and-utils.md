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
  - **`ZodError`:** Disparado se uma exceção de validação escapar sem interceptor local. Responde com status `400 Bad Request`:
    ```json
    {
      "message": "[{\"code\":\"...\",\"message\":\"...\"}]"
    }
    ```
  - **Erro Desconhecido / Não Tratado (`Error` genérico):** Registra o erro no console e responde com status `500 Internal Server Error`:
    ```json
    {
      "message": "Erro interno do servidor"
    }
    ```

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

### `authenticateJWT`
- **Arquivo:** `src/middlewares/auth.middleware.ts`
- **Tipo:** Interceptor de Requisição (Autenticação Bearer Token).
- **Entradas Analisadas:** Header HTTP `Authorization` (deve iniciar com o prefixo `Bearer `).
- **Injeção no `Express.Request`:**
  Injeta no objeto `req` a propriedade `user` tipada via extensão de módulo (`src/@types/express.d.ts`):
  ```typescript
  req.user = {
    id: string;    // UUID do usuário
    email: string; // E-mail cadastrado
    role: string;  // ADMIN | VENDEDOR | VISUALIZADOR | PUBLICO
  };
  ```
- **Tratamento de Erros e Interrupções:**
  - **Header ausente ou sem prefixo `Bearer `:** Status `401 Unauthorized`:
    ```json
    {
      "message": "Acesso negado. Token não fornecido ou inválido"
    }
    ```
  - **Usuário inexistente no banco, inativo (`is_active = false`) ou deletado (`deleted_at !== null`):** Status `401 Unauthorized`:
    ```json
    {
      "message": "Acesso negado. Token não fornecido ou inválido"
    }
    ```
  - **Token com assinatura inválida ou expirado:** Status `401 Unauthorized`:
    ```json
    {
      "message": "Token inválido ou expirado."
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
- **Entradas Analisadas:** Endereço IP do cliente.
- **Injeção no `Express.Request`:** Anexa headers padrão de rate-limit (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
- **Tratamento de Erros e Interrupções:**
  - Se exceder 5 requisições dentro da janela de 15 minutos por IP: Retorna status `429 Too Many Requests`:
    ```json
    {
      "message": "Muitas tentativas de login neste IP, tente novamente após 15 minutos."
    }
    ```

---

### `registerLimit`
- **Arquivo:** `src/middlewares/auth.middleware.ts`
- **Tipo:** Interceptor de Segurança / Rate Limit de Cadastros (`express-rate-limit`).
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

### `generateToken(payload: { id: string, email: string, role: string }): string`
- **Arquivo:** `src/utils/jwt.util.ts`
- **Descrição:** Gera e assina um token JWT contendo a identidade e o perfil do usuário com validade de 30 dias.
- **Assinatura & Parâmetros:**
  - `payload` (`{ id: string, email: string, role: string }`): Informações do usuário autenticado a serem gravadas no token.
- **Retorno:** `string` contendo o token no formato `Header.Payload.Signature`.
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `generateToken({ id: "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b", email: "admin@garagem.com", role: "ADMIN" })`
  - Saída: `"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjRmOGQzYzJiLTdhNjEtNGU1OS05YjBhLTJjM2Q0ZTVmNmE3YiIsImVtYWlsIjoiYWRtaW5AZ2FyYWdlbS5jb20iLCJyb2xlIjoiQURNSU4iLCJpYXQiOjE2OTk5OTk5OTksImV4cCI6MTcwMjU5MTk5OX0..."`

---

### `validateToken(token: string): string | JwtPayload`
- **Arquivo:** `src/utils/jwt.util.ts`
- **Descrição:** Valida a assinatura e expiração de um token JWT e extrai seu payload descriptografado.
- **Assinatura & Parâmetros:**
  - `token` (`string`): Token JWT extraído do header `Authorization`.
- **Retorno:** `JwtPayload` com as chaves `{ id, email, role, iat, exp }`. Dispara erro se a assinatura for adulterada ou o token estiver expirado.
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `validateToken("eyJhbGciOiJIUzI1Ni...")`
  - Saída: `{ id: "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b", email: "admin@garagem.com", role: "ADMIN" }`

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
- **Descrição:** Constrói dinamicamente uma declaração SQL `INSERT INTO` parametrizada com parâmetros posicionais `$1, $2...` e cláusula `RETURNING *`.
- **Assinatura & Parâmetros:**
  - `tableName` (`string`): Nome da tabela no PostgreSQL.
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

### `buildUpdateQuery(tableName: string, data: Record<string, unknown>, id: string): { query: string; values: unknown[] }`
- **Arquivo:** `src/utils/query.util.ts`
- **Descrição:** Constrói uma query SQL `UPDATE` parametrizada vinculando colunas e inserindo o identificador `id` no último parâmetro posicional.
- **Assinatura & Parâmetros:**
  - `tableName` (`string`): Nome da tabela no PostgreSQL.
  - `data` (`Record<string, unknown>`): Colunas a serem modificadas.
  - `id` (`string`): Identificador do registro.
- **Retorno:** `{ query: string; values: unknown[] }`.
- **Exemplo Real (Extraído dos testes do Vitest):**
  - Entrada: `buildUpdateQuery("brands", { name: "Toyota do Brasil" }, "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")`
  - Saída:
    ```javascript
    {
      query: "UPDATE brands SET name = $1 WHERE id = $2 RETURNING *;",
      values: ["Toyota do Brasil", "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"]
    }
    ```

---

### `buildFindQuery(tableName: string, filters: FindData, options?: { softDelete?: boolean }): { query: string; values: unknown[] }`
- **Arquivo:** `src/utils/query.util.ts`
- **Descrição:** Monta a query SQL `SELECT` com operadores relacionais dinâmicos (`=`, `>=`, `<=`, `ILIKE`, `ANY`), controle de `deleted_at IS NULL` e placeholders sequenciais.
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

### `sanitizeVehicleForRole<T extends Record<string, unknown>>(vehicle: T, role?: string): Record<string, unknown>`
- **Arquivo:** `src/utils/vehicle-sanitizer.util.ts`
- **Descrição:** Remove dados sensíveis ou confidenciais de veículos para conformidade com a LGPD e privacidade comercial (RN003).
- **Assinatura & Parâmetros:**
  - `vehicle` (`T`): Objeto do veículo recuperado do banco.
  - `role` (`string`, opcional): Perfil do usuário solicitante (`'ADMIN'`, `'VENDEDOR'`, `'VISUALIZADOR'`, `'PUBLICO'` ou deslogado).
- **Retorno:** Cópia higienizada do veículo.
  - Perfis `'ADMIN'` e `'VENDEDOR'`: Retorna o objeto integral (inclui preços de compra e comissões).
  - Perfis `'VISUALIZADOR'`, `'PUBLICO'` ou indefinido: Deleta as propriedades:
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

### `viewTracker.shouldIncrement(vehicleId: string, ip: string, userAgent: string): boolean`
- **Arquivo:** `src/utils/view-tracker.util.ts`
- **Descrição:** Valida em cache em memória com TTL de 30 minutos se uma visualização de veículo deve ser contabilizada, prevenindo fraudes de tráfego artificial (RN007).
- **Assinatura & Parâmetros:**
  - `vehicleId` (`string`): UUID do veículo visualizado.
  - `ip` (`string`): Endereço IP do visitante.
  - `userAgent` (`string`): Cabeçalho `User-Agent` do navegador.
- **Retorno:** `boolean`:
  - `true`: Visualização inédita dentro da janela de 30 minutos. Registra a chave no cache e permite o incremento.
  - `false`: O mesmo IP e User-Agent já visualizaram este veículo há menos de 30 minutos. Bloqueia o incremento.
- **Exemplo Real (Extraído de `vehicle.service.spec.ts`):**
  - 1ª Chamada: `viewTracker.shouldIncrement("uuid-veiculo-1", "127.0.0.1", "Mozilla/5.0")` -> `true`
  - 2ª Chamada imediata: `viewTracker.shouldIncrement("uuid-veiculo-1", "127.0.0.1", "Mozilla/5.0")` -> `false`
