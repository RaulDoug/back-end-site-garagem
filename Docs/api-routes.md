# Documentação de Rotas e Endpoints da API

Esta documentação detalha todas as rotas da API Garagem de Veículos, especificando métodos HTTP, middlewares de autenticação e contexto multi-tenant/multi-store, validações Zod e payloads alinhados ao código-fonte e à suíte de testes do Vitest.

---

## Sumário
1. [Health](#health)
2. [Empresas / Tenants (`/api/tenants`)](#empresas--tenants)
3. [Usuários (`/api/users`)](#usuários)
4. [Lojas (`/api/stores`)](#lojas)
5. [Marcas (`/api/brands`)](#marcas)
6. [Opcionais (`/api/features`)](#opcionais)
7. [Modelos (`/api/models`)](#modelos)
8. [Veículos (`/api/vehicles`)](#veículos)
9. [Rotas Planejadas (Roadmap de Segurança e Fases Futuras)](#rotas-planejadas-roadmap-de-segurança-e-fases-futuras)

---

# Health

## `GET` /health
- **Descrição:** Endpoint de verificação de disponibilidade e integridade da aplicação em tempo real.
- **Middlewares / Autenticação:** Rota pública (nenhum middleware de autenticação).

### Parâmetros & Payload
- **Path Params (`req.params`):** Nenhum.
- **Query Params (`req.query`):** Nenhum.
- **Body (`req.body`):** Nenhum.

### Respostas
- **`200 OK`**:
```json
{
  "status": "ok",
  "timestamp": "2026-11-06T15:00:00.000Z",
  "uptime": 142.35
}
```

---

# Empresas / Tenants

Gerenciamento de empresas no modelo Multi-Tenant hierárquico, permitindo onboarding transacional protegido por chave de provisionamento SaaS e manutenção cadastral da própria empresa autenticada.

---

## `POST` /api/tenants/onboard
- **Descrição:** Cria transacionalmente a empresa (`tenant`), sua loja matriz (`store`) e o primeiro usuário administrador (`admin`), retornando imediatamente o token JWT funcional.
- **Middlewares / Autenticação:** `authenticateOnboardingSecret` (valida o header `x-onboarding-secret` em tempo constante contra `ONBOARDING_SECRET`), `validate(onboardTenantRouteSchema)`.

### Parâmetros & Payload
- **Headers Obrigatórios:**
  - `x-onboarding-secret`: Chave secreta de provisionamento SaaS configurada na variável de ambiente `ONBOARDING_SECRET`.
- **Body (`req.body`):**

| Objeto | Campo | Tipo | Obrigatório | Descrição / Restrição |
| :--- | :--- | :--- | :--- | :--- |
| — | `is_multi_store` | `boolean` | Não | Padrão `false`: define se o admin inicial nasce com `store_id: null` para atuar em todas as lojas da rede ou vinculado à matriz |
| `tenant` | `corporate_name` | `string` | Sim | Razão social (2 a 255 chars) |
| `tenant` | `trade_name` | `string` | Sim | Nome fantasia (2 a 255 chars) |
| `tenant` | `cnpj` | `string` | Sim | CNPJ válido com dígitos verificadores (14 a 18 chars) |
| `tenant` | `is_active` | `boolean` | Não | Status inicial da empresa (padrão `true`) |
| `store` | `name` | `string` | Sim | Nome da filial matriz (2 a 255 chars) |
| `store` | `cnpj` | `string` | Sim | CNPJ da filial (14 dígitos numéricos após sanitização) |
| `store` | `phone` | `string` | Sim | Telefone brasileiro válido (`(XX) XXXXX-XXXX` ou dígitos) |
| `store` | `zip_code` | `string` | Sim | CEP brasileiro válido (8 dígitos após sanitização) |
| `store` | `street`, `number`, `neighborhood`, `city`, `state` | `string` | Sim | Endereço completo da matriz (`state` com 2 letras UF maiúsculas) |
| `store` | `complement` | `string` | Não | Complemento do endereço (máx. 100 chars) |
| `admin` | `name` | `string` | Sim | Nome completo do gestor master (2 a 255 chars) |
| `admin` | `email` | `string` | Sim | E-mail corporativo (normalizado para lowercase) |
| `admin` | `password` | `string` | Sim | Senha com no mínimo 8 caracteres |
| `admin` | `phone` | `string` | Sim | Telefone celular no padrão brasileiro (até 15 chars) |

### Respostas
- **`201 Created`**:
```json
{
  "tenant": {
    "id": "11111111-1111-4111-8111-111111111111",
    "corporate_name": "Alpha Veículos Ltda",
    "trade_name": "Alpha Motors",
    "cnpj": "12345678000199",
    "is_active": true,
    "created_at": "2026-11-17T12:00:00.000Z",
    "deleted_at": null
  },
  "store": {
    "id": "22222222-2222-4222-8222-222222222222",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "name": "Alpha Matriz",
    "phone": "(37) 98888-7777",
    "cnpj": "12345678000288",
    "zip_code": "35500000",
    "street": "Av. Brasil",
    "number": "1000",
    "complement": null,
    "neighborhood": "Centro",
    "city": "Divinópolis",
    "state": "MG",
    "is_active": true,
    "deleted_at": null,
    "created_at": "2026-11-17T12:00:00.000Z"
  },
  "admin": {
    "id": "33333333-3333-4333-8333-333333333333",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "store_id": "22222222-2222-4222-8222-222222222222",
    "name": "Gestor Master",
    "email": "admin@alphamotors.com",
    "phone": "(37) 99999-8888",
    "role": "ADMIN",
    "commission_rates": null,
    "is_active": true,
    "created_at": "2026-11-17T12:00:00.000Z",
    "deleted_at": null
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
- **`400 Bad Request`**: Dados inválidos via Zod (`{ "status": "fail", "errors": [...] }`).
- **`401 Unauthorized`**: `{"message": "Acesso negado. Chave de provisionamento inválida ou ausente."}`.
- **`409 Conflict`**: CNPJ da empresa (`"CNPJ da empresa já está em uso"`) ou CNPJ da loja (`"CNPJ da loja já está em uso"`) já cadastrado.

---

## `GET` /api/tenants/me
- **Descrição:** Retorna as informações cadastrais do tenant associado ao usuário autenticado (`req.user.tenantId`).
- **Middlewares / Autenticação:** `authenticateJWT`.

### Respostas
- **`200 OK`**:
```json
{
  "tenant": {
    "id": "11111111-1111-4111-8111-111111111111",
    "corporate_name": "Alpha Veículos Ltda",
    "trade_name": "Alpha Motors",
    "cnpj": "12345678000199",
    "is_active": true,
    "created_at": "2026-11-17T12:00:00.000Z",
    "deleted_at": null
  }
}
```
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`404 Not Found`**: `{"message": "Empresa não encontrada"}`.

---

## `PUT` /api/tenants/me
- **Descrição:** Atualiza os dados cadastrais da empresa do usuário logado.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(updateTenantRouteSchema)`.

### Parâmetros & Payload
- **Body (`req.body`):** `corporate_name` (opcional), `trade_name` (opcional), `cnpj` (opcional, validado).

### Respostas
- **`200 OK`**:
```json
{
  "tenant": {
    "id": "11111111-1111-4111-8111-111111111111",
    "corporate_name": "Alpha Veículos Ltda",
    "trade_name": "Alpha Motors Premium",
    "cnpj": "12345678000199",
    "is_active": true,
    "created_at": "2026-11-17T12:00:00.000Z",
    "deleted_at": null
  }
}
```
- **`400 Bad Request`**: Erro de validação Zod (`{ "status": "fail", "errors": [...] }`) ou nenhum campo enviado (`{"message": "Nenhum dado informado"}`).
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Usuário sem perfil `ADMIN`.
- **`404 Not Found`**: `{"message": "Empresa não encontrada"}`.
- **`409 Conflict`**: `{"message": "CNPJ da empresa já está em uso"}`.

---

# Usuários

Controle de autenticação, criação de credenciais e gerenciamento de perfis de acesso (`ADMIN`, `VENDEDOR`, `VISUALIZADOR`, `PUBLICO`), estritamente isolados por `tenant_id` e opcionalmente vinculados a uma filial (`store_id`).

---

## `POST` /api/users/login
- **Descrição:** Autentica o usuário validando e-mail e senha com hash bcrypt, emitindo token JWT (`HS256`, validade `1d`) com `id`, `email`, `role`, `tenantId` e `storeId`. Suporta desambiguação por `tenant_id` quando o mesmo e-mail existe em múltiplas empresas.
- **Middlewares / Autenticação:** `loginLimit` (máximo de 5 tentativas **falhas** por 15 minutos por IP; logins bem-sucedidos não consomem a cota via `skipSuccessfulRequests: true`), `validate(loginUserSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** Nenhum.
- **Query Params (`req.query`):** Nenhum.
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições & Validações |
| :--- | :--- | :--- | :--- |
| `email` | `string` | Sim | Formato de e-mail válido, normalizado para lowercase |
| `password` | `string` | Sim | Mínimo de 1 caractere |
| `tenant_id` | `string` | Não | UUID v4 da empresa (necessário caso o e-mail esteja ativo em mais de um tenant) |

- **Exemplo de Envio (extraído de `user.e2e.login.spec.ts`):**
```json
{
  "email": "paula.mendes@garagem.com",
  "password": "LoginSeguro123!"
}
```

### Respostas
- **`200 OK`**:
```json
{
  "message": "Login realizado com sucesso!",
  "userInfo": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b",
      "tenant_id": "11111111-1111-4111-8111-111111111111",
      "store_id": null,
      "name": "Paula Mendes",
      "email": "paula.mendes@garagem.com",
      "phone": "(37) 97777-6666",
      "role": "VENDEDOR",
      "commission_rates": 5.0,
      "is_active": true,
      "deleted_at": null,
      "created_at": "2026-11-06T15:00:00.000Z"
    }
  }
}
```
- **`400 Bad Request`**:
  - Erro de validação de campos via Zod (`{ "status": "fail", "errors": [...] }`).
  - E-mail ativo em múltiplas empresas sem envio de `tenant_id`: `{"message": "E-mail vinculado a múltiplas empresas. Informe o tenant_id para autenticar."}`.
- **`401 Unauthorized`**: `{"message": "Credenciais inválidas"}` (disparado se e-mail não existir, senha estiver incorreta ou a conta estiver inativa/deletada).
- **`429 Too Many Requests`**: `{"message": "Muitas tentativas de login neste IP, tente novamente após 15 minutos."}`.

---

## `POST` /api/users/register
- **Descrição:** Registra um novo usuário vinculado à empresa do administrador logado (`req.user.tenantId`), com senha criptografada e vínculo opcional a uma filial (`store_id`).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(createUserSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** Nenhum.
- **Query Params (`req.query`):** Nenhum.
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições & Validações |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Sim | Mínimo 2 e máximo 255 caracteres |
| `email` | `string` | Sim | Formato de e-mail válido (único dentro do tenant) |
| `password` | `string` | Sim | Mínimo 8 caracteres, contendo maiúscula, minúscula, número e caractere especial |
| `phone` | `string` | Sim | Regex `^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$` |
| `role` | `enum` | Não | `'ADMIN'`, `'VENDEDOR'`, `'VISUALIZADOR'`, `'PUBLICO'` (padrão no banco `'VENDEDOR'`) |
| `commission_rates` | `number` | Não | Mínimo 0 e máximo 100 (grava `null` quando omitido) |
| `store_id` | `string \| null` | Não | UUID v4 de uma filial pertencente ao mesmo `tenant_id` (ou `null` para acesso a toda a rede) |

- **Exemplo de Envio (extraído de `user.e2e.register.spec.ts`):**
```json
{
  "name": "Paula Mendes",
  "email": "paula.mendes@garagem.com",
  "password": "LoginSeguro123!",
  "phone": "(37) 97777-6666",
  "role": "VENDEDOR",
  "commission_rates": 5.0
}
```

### Respostas
- **`201 Created`**:
```json
{
  "message": "Usuário criado com sucesso!",
  "user": {
    "id": "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "store_id": null,
    "name": "Paula Mendes",
    "email": "paula.mendes@garagem.com",
    "phone": "(37) 97777-6666",
    "role": "VENDEDOR",
    "commission_rates": 5.0,
    "is_active": true,
    "deleted_at": null,
    "created_at": "2026-11-06T15:00:00.000Z"
  }
}
```
- **`400 Bad Request`**: Senha em desacordo com as regras de complexidade ou campos inválidos.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil sem autorização (não é `ADMIN`).
- **`404 Not Found`**: `{"message": "Filial informada não encontrada nesta empresa"}` (quando `store_id` não existe ou pertence a outro tenant).
- **`409 Conflict`**: `{"message": "E-mail já cadastrado"}`.

---

## `GET` /api/users
- **Descrição:** Lista usuários pertencentes ao tenant do usuário autenticado (`req.user.tenantId`), com suporte a paginação e filtros. Restrito ao perfil ADMIN.
- **Middlewares / Autenticação:** `authenticateJWT`, `validate(findUserSchema)`, `authorizeRoles('ADMIN')`, `includeDeletedValidateRole`.

### Parâmetros & Payload
- **Query Params (`req.query`):**
  - `page`: `number` opcional (mínimo 1).
  - `limit`: `number` opcional (mínimo 1).
  - `is_active`: `'true' | 'false'` opcional.
  - `include_deleted`: `'true' | 'false'` opcional (apenas `ADMIN`).
  - `store_id`: `string` UUID v4 opcional (filtra usuários vinculados a uma filial específica).
  - `created_at_gte`, `created_at_lte`: `string` data ISO `YYYY-MM-DD` opcional.
  - `name_like`: `string` opcional.
  - `email_like`: `string` opcional.
  - `role`: `enum` opcional (`'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO'`).

### Respostas
- **`200 OK`**:
```json
{
  "users": [
    {
      "id": "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b",
      "tenant_id": "11111111-1111-4111-8111-111111111111",
      "store_id": null,
      "name": "Paula Mendes",
      "email": "paula.mendes@garagem.com",
      "phone": "(37) 97777-6666",
      "role": "VENDEDOR",
      "commission_rates": 5.0,
      "is_active": true
    }
  ]
}
```
- **`401 Unauthorized`** / **`403 Forbidden`** (inclusive se não-`ADMIN` enviar `include_deleted=true`).

---

## `GET` /api/users/:id
- **Descrição:** Busca um usuário específico do mesmo tenant através de seu UUID. Restrito ao perfil ADMIN. Retorna `404` caso pertença a outro tenant.
- **Middlewares / Autenticação:** `validate(findByIdUserSchema)`, `authenticateJWT`, `authorizeRoles('ADMIN')`.

### Parâmetros & Payload
- **Path Params (`req.params`):**
  - `id`: `string` UUID v4 obrigatório.

### Respostas
- **`200 OK`**:
```json
{
  "userInfo": {
    "id": "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "store_id": null,
    "name": "Paula Mendes",
    "email": "paula.mendes@garagem.com",
    "phone": "(37) 97777-6666",
    "role": "VENDEDOR",
    "is_active": true
  }
}
```
- **`404 Not Found`**: `{"message": "Usuário inexistente."}`.

---

## `PUT` /api/users/:id
- **Descrição:** Atualiza dados de um usuário existente do mesmo tenant.
- **Middlewares / Autenticação:** `authenticateJWT`, `validate(updateUserSchema)`, `authorizeRoles('ADMIN')`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID).
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Não | Mínimo 2 e máximo 255 caracteres |
| `phone` | `string` | Não | Regex de telefone brasileiro |
| `role` | `enum` | Não | `'ADMIN'`, `'VENDEDOR'`, `'VISUALIZADOR'`, `'PUBLICO'` |
| `commission_rates` | `number` | Não | 0 a 100 |
| `store_id` | `string \| null` | Não | UUID v4 de filial do mesmo tenant (ou `null`) |

- **Exemplo de Envio (extraído de `user.e2e.update.spec.ts`):**
```json
{
  "name": "Paula Mendes Atualizada",
  "phone": "(37) 98888-2222",
  "role": "ADMIN",
  "commission_rates": 7.5
}
```

### Respostas
- **`200 OK`**:
```json
{
  "message": "Usuário atualizado com sucesso!",
  "userInfo": {
    "id": "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "store_id": null,
    "name": "Paula Mendes Atualizada",
    "email": "paula.mendes@garagem.com",
    "phone": "(37) 98888-2222",
    "role": "ADMIN",
    "commission_rates": 7.5,
    "is_active": true
  }
}
```
- **`400 Bad Request`**: Nenhum campo válido informado ou falha Zod.
- **`404 Not Found`**: Usuário ou filial (`store_id`) não encontrado no tenant.

---

## `DELETE` /api/users/:id
- **Descrição:** Realiza o soft delete do usuário dentro do mesmo tenant. Impede que o próprio usuário autenticado exclua a si mesmo.
- **Middlewares / Autenticação:** `authenticateJWT`, `validate(deleteUserSchema)`, `authorizeRoles('ADMIN')`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID).

### Respostas
- **`200 OK`**:
```json
{
  "message": "Usuário deletado com sucesso!",
  "userInfo": {
    "id": "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b",
    "name": "Paula Mendes",
    "deleted_at": "2026-11-06T15:30:00.000Z"
  }
}
```
- **`400 Bad Request`**: `{"message": "Não é possível deletar o próprio usuário."}`.
- **`404 Not Found`**: `{"message": "Usuário inexistente."}` (inclusive para usuários de outro tenant).

---

# Lojas

Gerenciamento das concessionárias e unidades físicas dentro do tenant autenticado (`req.user.tenantId`), além de consulta pública para a vitrine.

---

## `GET` /api/stores/public/:id
- **Descrição:** Consulta pública dos dados de uma loja/filial ativa para montagem da vitrine. Valida simultaneamente se **a loja** e **a empresa (`tenant`)** estão ativas e não deletadas.
- **Middlewares / Autenticação:** Rota pública (`validate(findByIdStoreSchema)`).

> [!NOTE]
> Conforme a decisão D2 de [roadmap-seguranca.md](./roadmaps/roadmap-seguranca.md) (Subfase S9.2), esta rota receberá uma allowlist restrita de campos públicos (`id`, `name` e endereço), removendo `cnpj`, `phone`, `tenant_id`, `is_active`, `deleted_at` e `created_at`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID da loja).

### Respostas
- **`200 OK`**:
```json
{
  "item": {
    "id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "name": "Concessionária Horizonte",
    "phone": "(37) 98888-7777",
    "cnpj": "12345678000199",
    "zip_code": "35500000",
    "street": "Av. Paulista",
    "number": "1000",
    "neighborhood": "Bela Vista",
    "city": "São Paulo",
    "state": "SP",
    "complement": null,
    "is_active": true,
    "deleted_at": null,
    "created_at": "2026-11-06T15:00:00.000Z"
  }
}
```
- **`400 Bad Request`**: UUID inválido.
- **`404 Not Found`**: `{"message": "Loja não encontrada"}` (loja inexistente, inativa, deletada ou vinculada a tenant inativo/deletado).

---

## `GET` /api/stores
- **Descrição:** Lista as lojas cadastradas no tenant do usuário com paginação e filtros.
- **Middlewares / Autenticação:** `authenticateJWT`, `validate(findStoreSchema)`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `includeDeletedValidateRole`.

### Parâmetros & Payload
- **Query Params (`req.query`):**
  - `page`, `limit`, `is_active`, `include_deleted` (apenas `ADMIN`), `created_at_gte`, `created_at_lte`.
  - `name_like`: `string` opcional.
  - `cnpj`: `string` com 14 dígitos (aceita formatação, sanitizado pelo Zod).
  - `city_like`: `string` opcional.
  - `state`: `string` com 1 a 2 caracteres.

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
      "tenant_id": "11111111-1111-4111-8111-111111111111",
      "name": "Concessionária Horizonte",
      "phone": "(37) 98888-7777",
      "cnpj": "12345678000199",
      "city": "São Paulo",
      "state": "SP",
      "is_active": true
    }
  ]
}
```

---

## `GET` /api/stores/:id
- **Descrição:** Retorna os detalhes de uma loja do tenant pelo UUID. Retorna `404` se a loja pertencer a outro tenant.
- **Middlewares / Autenticação:** `authenticateJWT`, `validate(findByIdStoreSchema)`, `authorizeRoles('ADMIN', 'VENDEDOR')`.

### Respostas
- **`200 OK`**:
```json
{
  "item": {
    "id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "name": "Concessionária Horizonte",
    "phone": "(37) 98888-7777",
    "cnpj": "12345678000199",
    "zip_code": "35500000",
    "street": "Av. Paulista",
    "number": "1000",
    "neighborhood": "Bela Vista",
    "city": "São Paulo",
    "state": "SP",
    "complement": null,
    "is_active": true
  }
}
```
- **`404 Not Found`**: Loja inexistente ou pertencente a outro tenant.

---

## `GET` /api/stores/cnpj/:cnpj
- **Descrição:** Busca uma loja do tenant a partir do CNPJ (higienizado para 14 dígitos). Retorna `404` se pertencer a outro tenant.
- **Middlewares / Autenticação:** `authenticateJWT`, `validate(findByCnpjStoreSchema)`, `authorizeRoles('ADMIN', 'VENDEDOR')`.

### Parâmetros & Payload
- **Path Params (`req.params`):**
  - `cnpj`: `string` (14 dígitos numéricos após sanitização).

### Respostas
- **`200 OK`**:
```json
{
  "store": {
    "id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "name": "Concessionária Horizonte",
    "cnpj": "12345678000199",
    "phone": "(37) 98888-7777"
  }
}
```
- **`404 Not Found`**: `{"message": "Loja com CNPJ <cnpj> não encontrada"}`.

---

## `POST` /api/stores
- **Descrição:** Cadastra uma nova unidade de loja vinculada ao tenant do usuário logado.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(createStoreSchema)`.

### Parâmetros & Payload
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Sim | Mínimo 2 e máximo 255 |
| `phone` | `string` | Sim | Regex de telefone brasileiro |
| `cnpj` | `string` | Sim | 14 dígitos numéricos |
| `zip_code` | `string` | Sim | 8 dígitos numéricos (CEP) |
| `street` | `string` | Sim | Mínimo 2 e máximo 255 |
| `number` | `string` | Sim | Mínimo 1 e máximo 20 |
| `neighborhood` | `string` | Sim | Mínimo 2 e máximo 100 |
| `city` | `string` | Sim | Mínimo 2 e máximo 100 |
| `state` | `string` | Sim | 2 caracteres maiúsculos (UF) |
| `complement` | `string` | Não | Máximo 100 caracteres |

- **Exemplo de Envio (extraído de `store.e2e.spec.ts`):**
```json
{
  "name": "Concessionária Horizonte",
  "phone": "(37) 98888-7777",
  "cnpj": "12345678000199",
  "zip_code": "35500000",
  "street": "Av. Paulista",
  "number": "1000",
  "neighborhood": "Bela Vista",
  "city": "São Paulo",
  "state": "SP",
  "complement": "Sala 101"
}
```

### Respostas
- **`201 Created`**:
```json
{
  "item": {
    "id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "name": "Concessionária Horizonte",
    "cnpj": "12345678000199",
    "is_active": true
  }
}
```
- **`409 Conflict`**: `{"message": "CNPJ já cadastrado"}`.

---

## `PUT` /api/stores/:id
- **Descrição:** Atualiza dados de uma loja do tenant autenticado.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(updateStoreSchema)`.

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` atualizado.
- **`404 Not Found`**: Loja inexistente ou pertencente a outro tenant.
- **`409 Conflict`**: `{"message": "CNPJ já em uso por outra loja"}`.

---

## `DELETE` /api/stores/:id
- **Descrição:** Exclusão lógica (soft delete) da loja pertencente ao tenant autenticado.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteStoreSchema)`.

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` com `deleted_at` preenchido e `is_active: false`.
- **`404 Not Found`**: Loja inexistente ou pertencente a outro tenant.
- **`409 Conflict`**:
  - `{"message": "Não é permitido excluir a própria filial vinculada ao usuário"}`: caso o usuário autenticado esteja vinculado à filial a ser excluída (`req.user.storeId === id`).
  - `{"message": "Não é possível excluir loja com usuários ou veículos ativos vinculados"}`: caso existam registros ativos em `users` ou `vehicles` associados a esta filial no tenant.

---

# Marcas

Catálogo híbrido de marcas e fabricantes de veículos: combina registros globais do sistema (`tenant_id: null`) e registros customizados da empresa (`tenant_id = req.user.tenantId`).

---

## `GET` /api/brands
- **Descrição:** Lista as marcas globais e as marcas customizadas do tenant do usuário.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findBrandSchema)`, `includeDeletedValidateRole`.

### Parâmetros & Payload
- **Query Params (`req.query`):** `page`, `limit`, `is_active`, `include_deleted` (apenas `ADMIN`), `created_at_gte`, `created_at_lte`, `name`, `name_like`.

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "tenant_id": null,
      "name": "Toyota",
      "is_active": true
    }
  ]
}
```

---

## `GET` /api/brands/:id
- **Descrição:** Detalhes de uma marca global ou do próprio tenant pelo UUID. Retorna `404` para marca exclusiva de outro tenant.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findByIdBrandSchema)`.

---

## `POST` /api/brands
- **Descrição:** Cadastra uma nova marca vinculada ao `tenant_id` do usuário autenticado.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(createBrandSchema)`.

### Parâmetros & Payload
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Sim | Mínimo 2 e máximo 255 caracteres |

- **Exemplo de Envio (extraído de `brand.e2e.spec.ts`):**
```json
{
  "name": "Toyota"
}
```

### Respostas
- **`201 Created`**:
```json
{
  "item": {
    "id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "name": "Toyota",
    "is_active": true
  }
}
```
- **`409 Conflict`**: `{"message": "Marca já cadastrada"}` (se já existir globalmente ou no mesmo tenant).

---

## `PUT` /api/brands/:id
- **Descrição:** Atualiza o nome de uma marca exclusiva do tenant. Marcas globais (`tenant_id: null`) são protegidas contra edição.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(updateBrandSchema)`.

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` atualizado.
- **`403 Forbidden`**: `{"message": "Não é permitido alterar ou excluir uma marca global do sistema"}`.
- **`404 Not Found`**: Marca não encontrada ou pertencente a outro tenant.
- **`409 Conflict`**: `{"message": "Nome de marca já cadastrado"}`.

---

## `DELETE` /api/brands/:id
- **Descrição:** Exclusão lógica (soft delete) de marca exclusiva do tenant. Marcas globais não podem ser excluídas.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteBrandSchema)`.

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` com `deleted_at` preenchido e `is_active: false`.
- **`403 Forbidden`**: `{"message": "Não é permitido alterar ou excluir uma marca global do sistema"}` (ou perfil sem role `ADMIN`).
- **`404 Not Found`**: Marca não encontrada ou pertencente a outro tenant.

---

# Opcionais

Catálogo híbrido de itens opcionais e equipamentos dos veículos (`tenant_id: null` para globais + `tenant_id` da empresa para customizados).

---

## `GET` /api/features
- **Descrição:** Lista opcionais globais e opcionais customizados do tenant autenticado.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findFeatureSchema)`.

### Parâmetros & Payload
- **Query Params (`req.query`):** `page`, `limit`, `name`, `name_like`.

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "f5e18231-1552-4467-93be-ef9ce79868f0",
      "tenant_id": null,
      "name": "Teto Solar Panorâmico"
    }
  ]
}
```

---

## `GET` /api/features/:id
- **Descrição:** Detalhes de um opcional global ou do tenant pelo UUID. Retorna `404` para opcional exclusivo de outro tenant.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findByIdFeatureSchema)`.

---

## `POST` /api/features
- **Descrição:** Cadastra um novo item opcional vinculado ao `tenant_id` do usuário autenticado.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(createFeatureSchema)`.

### Parâmetros & Payload
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Sim | Mínimo 2 e máximo 255 caracteres |

- **Exemplo de Envio (extraído de `feature.e2e.spec.ts`):**
```json
{
  "name": "Teto Solar Panorâmico"
}
```

### Respostas
- **`201 Created`**: Retorna `{"item": { "id": "...", "tenant_id": "...", "name": "Teto Solar Panorâmico" }}`.
- **`409 Conflict`**: `{"message": "Opcional já cadastrado"}`.

---

## `PUT` /api/features/:id
- **Descrição:** Atualiza o nome de um opcional exclusivo do tenant. Opcionais globais são protegidos.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(updateFeatureSchema)`.

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` atualizado.
- **`403 Forbidden`**: `{"message": "Não é permitido alterar ou excluir um opcional global do sistema"}`.
- **`404 Not Found`**: Opcional não encontrado ou pertencente a outro tenant.
- **`409 Conflict`**: `{"message": "Nome de opcional já cadastrado"}`.

---

## `DELETE` /api/features/:id
- **Descrição:** Exclusão física (hard delete) de um opcional exclusivo do tenant. Opcionais globais retornam `403` e opcionais vinculados a veículos retornam `409` devido à restrição de chave estrangeira (`ON DELETE RESTRICT`).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteFeatureSchema)`.

### Respostas
- **`200 OK`**: Retorna `{"item": { "id": "...", "tenant_id": "...", "name": "..." }}`.
- **`403 Forbidden`**: `{"message": "Não é permitido alterar ou excluir um opcional global do sistema"}` (ou perfil sem role `ADMIN`).
- **`404 Not Found`**: Opcional não encontrado ou pertencente a outro tenant.
- **`409 Conflict`**: `{"message": "Operação não permitida: registro vinculado a outros dados."}` (quando em uso em `vehicle_features`).

---

# Modelos

Catálogo de modelos associados às marcas visíveis pelo tenant, estritamente isolado por `tenant_id`.

---

## `GET` /api/models
- **Descrição:** Lista modelos do tenant autenticado com filtros por marca, status e texto.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findModelSchema)`, `includeDeletedValidateRole`.

### Parâmetros & Payload
- **Query Params (`req.query`):** `page`, `limit`, `is_active`, `include_deleted` (apenas `ADMIN`), `created_at_gte`, `created_at_lte`, `brand_id`, `name`, `name_like`.

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "c4a7e912-6b94-4d6b-9c2f-0f6a2b8e3a1d",
      "tenant_id": "11111111-1111-4111-8111-111111111111",
      "brand_id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Corolla XEi",
      "is_active": true
    }
  ]
}
```

---

## `GET` /api/models/:id
- **Descrição:** Retorna os dados de um modelo do tenant pelo UUID. Retorna `404` se pertencer a outro tenant.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findByIdModelSchema)`.

---

## `POST` /api/models
- **Descrição:** Cadastra um modelo vinculado a uma marca global ou do mesmo tenant.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(createModelSchema)`.

### Parâmetros & Payload
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições |
| :--- | :--- | :--- | :--- |
| `brand_id` | `string` | Sim | UUID v4 válido de marca global ou do tenant |
| `name` | `string` | Sim | Mínimo 2 e máximo 255 caracteres |

- **Exemplo de Envio (extraído de `model.e2e.spec.ts`):**
```json
{
  "brand_id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "name": "Corolla XEi"
}
```

### Respostas
- **`201 Created`**:
```json
{
  "item": {
    "id": "c4a7e912-6b94-4d6b-9c2f-0f6a2b8e3a1d",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "brand_id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "name": "Corolla XEi",
    "is_active": true
  }
}
```
- **`404 Not Found`**: `{"message": "Marca informada não encontrada"}`.
- **`409 Conflict`**: `{"message": "Modelo já cadastrado para esta marca"}`.

---

## `PUT` /api/models/:id
- **Descrição:** Atualiza dados de um modelo do tenant (exige ao menos um campo). Valida nova marca no catálogo visível do tenant e unicidade de nome.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(updateModelSchema)`.

---

## `DELETE` /api/models/:id
- **Descrição:** Exclusão lógica (soft delete) do modelo do tenant.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteModelSchema)`.

---

# Veículos

Módulo central do sistema: vitrine pública (isolada por `resolvePublicTenantContext`), comparador e backoffice administrativo com isolamento por empresa (`tenant_id`) e restrição por filial (`store_id`).

---

## `GET` /api/vehicles
- **Descrição:** Catálogo da Vitrine Pública (UC01). Retorna veículos com status `ATIVO` ou `RESERVADO` e higienização de segurança LGPD (oculta placa completa, custos de compra, comissões e dados do proprietário).
- **Middlewares / Autenticação:** `resolvePublicTenantContext`, `validate(findVehicleSchema)`.
  - **Resolução Estrita de Contexto Público (`resolvePublicTenantContext`):**
    - Aceita `x-tenant-id` / `x-store-id` (Headers) ou `tenant_id` / `store_id` (Query Params), com precedência **Header > Query**.
    - **Não** lê `req.user` (JWT) e **não** possui tenant padrão de fallback.
    - Nenhum identificador enviado -> `400 Bad Request` (`"Contexto da empresa ou loja é obrigatório (informe x-tenant-id, x-store-id, tenant_id ou store_id)"`).
    - Identificador malformado -> `400 Bad Request` (`"Identificador de empresa ou loja inválido"`).
    - Loja inexistente, inativa, deletada, pertencente a outra empresa ou vinculada a tenant inativo -> `404 Not Found` (`"Loja não encontrada"`) para evitar enumeração entre empresas.
    - Empresa informada diretamente inexistente, inativa ou deletada -> `404 Not Found` (`"Empresa não encontrada"`).

### Parâmetros & Payload
- **Headers Suportados:**
  - `x-tenant-id`: UUID da empresa dona da vitrine.
  - `x-store-id`: UUID da filial específica para filtragem.
- **Query Params (`req.query`):**
  - `tenant_id`: UUID da empresa (ignorado se `x-tenant-id` estiver no header).
  - `store_id`: UUID da filial (ignorado se `x-store-id` estiver no header).
  - `page`: `number` (padrão: 1).
  - `limit`: `number` restrito a `12`, `24`, `36` ou `48` (padrão: 12).
  - `category`: `'HATCH'`, `'SEDÃ'`, `'SUV'`, `'PICAPE'`, `'CUPE'`, `'CONVERSIVEL'`, `'PERUA'`, `'MINIVAN/VAN'`, `'ESPORTIVO'`.
  - `brand_id`: UUID da marca.
  - `model_id`: UUID do modelo.
  - `fuel_type`: `'GASOLINA'`, `'ALCOOL'`, `'DIESEL'`, `'FLEX'`, `'ELETRICO'`, `'HIBRIDO'`.
  - `transmission`: `'AUTOMATICO'`, `'MANUAL'`, `'AUTOMATIZADO'`.
  - `min_price`, `max_price`: `number >= 0`.
  - `min_year`, `max_year`: `integer >= 1900`.
  - `max_mileage`: `integer >= 0`.
  - `plate_last_digit`: `integer` entre 0 e 9.
  - `feature_ids`: Lista de UUIDs separados por vírgula.
  - `search`: Texto livre buscado no título (`v.title ILIKE`).

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
      "tenant_id": "11111111-1111-4111-8111-111111111111",
      "store_id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
      "title": "Toyota Corolla XEi 2.0 Flex Automático",
      "description": "Veículo de único dono, revisões em dia.",
      "sale_price": 110000,
      "manufacture_year": 2022,
      "model_year": 2023,
      "mileage": 25000,
      "transmission": "AUTOMATICO",
      "color": "Branco",
      "category": "SEDÃ",
      "fuel_type": "FLEX",
      "plate_last_digit": 3,
      "brand_id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "brand_name": "Toyota",
      "model_name": "Corolla XEi",
      "cover_photo_url": "/uploads/vehicles/thumbs/uuid.webp"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 12
}
```
- **`400 Bad Request`** / **`404 Not Found`** (conforme resolução de contexto acima).

---

## `GET` /api/vehicles/compare
- **Descrição:** Comparador Público de Veículos (UC02). Permite comparar as especificações de 2 a 3 veículos distintos dentro do mesmo contexto de tenant/loja.
- **Middlewares / Autenticação:** `resolvePublicTenantContext`, `validate(compareVehiclesSchema)`.

### Parâmetros & Payload
- **Headers / Query de Contexto:** `x-tenant-id` / `x-store-id` / `tenant_id` / `store_id` (mesmas regras de `GET /api/vehicles`).
- **Query Params (`req.query`):**
  - `ids`: `string` contendo no mínimo 2 e no máximo 3 UUIDs distintos separados por vírgula.

- **Exemplo de Consulta:**
`/api/vehicles/compare?tenant_id=11111111-1111-4111-8111-111111111111&ids=e3b0c442-98fc-1c14-9afb-4c8996fb9242,f4a1c223-11bb-4e22-83b6-7bdf7d37a718`

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
      "title": "Toyota Corolla XEi",
      "sale_price": 110000,
      "category": "SEDÃ",
      "transmission": "AUTOMATICO",
      "brand": { "id": "...", "name": "Toyota" },
      "model": { "id": "...", "name": "Corolla XEi" },
      "features": [{ "id": "...", "name": "Teto Solar" }],
      "photos": []
    }
  ]
}
```
- **`400 Bad Request`**: Menos de 2 ou mais de 3 IDs informados, IDs duplicados, formato de UUID inválido ou contexto ausente/inválido.
- **`404 Not Found`**: Empresa ou loja do contexto inexistente/inativa.

---

## `GET` /api/vehicles/admin
- **Descrição:** Listagem administrativa de veículos para o Backoffice (UC06). Isolada pelo `tenantId` do token JWT; se o usuário for restrito a uma filial (`req.user.storeId !== null`), o filtro é forçado para a sua própria filial (ignorando `query.store_id`).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR', 'VISUALIZADOR')`, `validate(findVehicleSchema)`, `includeDeletedValidateRole`.

### Parâmetros & Payload
- **Query Params (`req.query`):** Mesmos filtros de `GET /api/vehicles` (exceto `tenant_id`, pois vem exclusivamente do JWT), além de `status` e `include_deleted` (`ADMIN`).

### Respostas
- **`200 OK`**: Catálogo completo (`{ items, total, page, limit }`) incluindo campos gerenciais para `ADMIN`/`VENDEDOR` e sanitizado para `VISUALIZADOR`.

---

## `GET` /api/vehicles/admin/:id
- **Descrição:** Detalhe administrativo completo do veículo. Retorna `404` se o veículo não existir, pertencer a outro tenant ou pertencer a outra filial quando o usuário estiver vinculado a uma `store_id`.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR', 'VISUALIZADOR')`, `validate(findByIdVehicleSchema)`.

---

## `GET` /api/vehicles/:id
- **Descrição:** Detalhe público do veículo para o consumidor dentro do contexto de tenant/loja resolvido. Implementa proteção anti-fraude na métrica de visualizações (`total_views`), contabilizando em memória (`viewTracker.trackView`) 1 visualização por par `IP + User-Agent` a cada 30 minutos com persistência assíncrona em lote a cada 60 segundos.
- **Middlewares / Autenticação:** `resolvePublicTenantContext`, `validate(findByIdVehicleSchema)`.

### Parâmetros & Payload
- **Headers / Query de Contexto:** `x-tenant-id` / `x-store-id` / `tenant_id` / `store_id`.
- **Path Params (`req.params`):** `id` (UUID).

### Respostas
- **`200 OK`**:
```json
{
  "item": {
    "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
    "title": "Toyota Corolla XEi 2.0 Flex Automático",
    "sale_price": 110000,
    "total_views": 15,
    "brand": { "id": "...", "name": "Toyota" },
    "model": { "id": "...", "name": "Corolla XEi" },
    "features": [{ "id": "...", "name": "Teto Solar" }],
    "photos": []
  }
}
```
- **`404 Not Found`**: `{"message": "Veículo não encontrado"}` (ou empresa/loja não encontrada no contexto).

---

## `POST` /api/vehicles
- **Descrição:** Cadastro de veículo no estoque (UC06) dentro do tenant autenticado. Valida integridade de loja, modelo e opcionais no tenant, e bloqueia com `403` caso um usuário vinculado a filial tente cadastrar em outra filial.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(createVehicleSchema)`.

### Validações Condicionais de Negócio:
1. **Veículo Próprio (`sale_type: "PROPRIO"`):**
   - `purchase_price` é **obrigatório** e deve ser maior que zero.
2. **Veículo Consignado (`sale_type: "CONSIGNADO"`):**
   - `owner_name`, `owner_contact`, `owner_price` (> 0) e `store_commission_rate` (>= 0) são **obrigatórios**.

### Parâmetros & Payload
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições & Observações |
| :--- | :--- | :--- | :--- |
| `store_id` | `string` | Sim | UUID da loja (deve pertencer ao tenant e coincidir com `req.user.storeId` se restrito) |
| `model_id` | `string` | Sim | UUID do modelo (deve pertencer ao tenant) |
| `promotion_id` | `string \| null` | Não | UUID da promoção opcional |
| `sale_type` | `enum` | Não | `'PROPRIO'` (padrão) ou `'CONSIGNADO'` |
| `title` | `string` | Sim | Mínimo 3 e máximo 255 caracteres |
| `description` | `string` | Sim | Mínimo 5 caracteres |
| `sale_price` | `number` | Sim | Valor positivo maior que zero |
| `purchase_price` | `number` | Condicional | Obrigatório se `PROPRIO` (> 0) |
| `owner_name` | `string` | Condicional | Obrigatório se `CONSIGNADO` (mínimo 2 chars) |
| `owner_contact` | `string` | Condicional | Obrigatório se `CONSIGNADO` (8 a 15 chars) |
| `owner_price` | `number` | Condicional | Obrigatório se `CONSIGNADO` (> 0) |
| `store_commission_rate` | `number` | Condicional | Obrigatório se `CONSIGNADO` (>= 0) |
| `fipe_price` | `number \| null` | Não | Valor positivo opcional |
| `min_down_payment` | `number \| null` | Não | Entrada mínima (>= 0) |
| `max_installments` | `integer \| null` | Não | Parcelas máximas (> 0) |
| `manufacture_year` | `integer` | Sim | 1900 até ano atual + 2 |
| `model_year` | `integer` | Sim | 1900 até ano atual + 2 |
| `mileage` | `integer` | Sim | Quilometragem não negativa |
| `transmission` | `enum` | Sim | `'AUTOMATICO'`, `'MANUAL'`, `'AUTOMATIZADO'` |
| `color` | `string` | Sim | Mínimo 2 e máximo 20 |
| `category` | `enum` | Sim | Categoria veicular permitida |
| `horsepower` | `integer \| null` | Não | Potência positiva opcional |
| `fuel_type` | `enum` | Sim | Combustível aceito |
| `steering` | `string` | Sim | Direção (2 a 20 chars) |
| `doors` | `integer` | Sim | 1 a 10 portas |
| `full_license_plate` | `string` | Sim | Formato Mercosul (`ABC1D23`) ou antigo (`ABC1234`) |
| `status` | `enum` | Não | `'ATIVO'`, `'RESERVADO'`, `'EM_NEGOCIACAO'`, `'VENDIDO'`, `'INATIVO'` |
| `video_url` | `string \| null` | Não | Máx. 255 chars |
| `inspection_report_url` | `string \| null` | Não | Máx. 255 chars |
| `feature_ids` | `array[uuid]` | Não | Lista de UUIDs de opcionais (globais ou do tenant) |

### Respostas
- **`201 Created`**:
```json
{
  "item": {
    "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "store_id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
    "title": "Toyota Corolla XEi 2.0 Flex Automático",
    "sale_type": "PROPRIO",
    "sale_price": 110000,
    "plate_last_digit": 3,
    "status": "ATIVO"
  }
}
```
- **`400 Bad Request`**: Dados ausentes para o tipo de venda ou falha de schema Zod.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado (ex: `VISUALIZADOR`) ou tentativa de usuário vinculado a filial operar em outra loja (`"Usuário só tem permissão para operar veículos da sua própria filial"`).
- **`404 Not Found`**: Loja, modelo ou opcional informado não encontrado no tenant.
- **`409 Conflict`**: `{"message": "Placa já cadastrada para outro veículo ativo"}`.

---

## `PUT` /api/vehicles/:id
- **Descrição:** Atualiza os dados ou opcionais de um veículo do tenant (e da filial do usuário, caso restrito).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(updateVehicleSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID).
- **Body (`req.body`):** Campos parciais de veículo (ao menos um obrigatório).

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` atualizado.
- **`400 Bad Request`**: Nenhum dado informado ou violação das regras condicionais `PROPRIO`/`CONSIGNADO`.
- **`403 Forbidden`**: Usuário vinculado a filial tentando editar ou transferir veículo de/para outra filial.
- **`404 Not Found`**: Veículo, loja, modelo ou opcional não encontrado no tenant.
- **`409 Conflict`**: `{"message": "Placa já cadastrada para outro veículo ativo"}`.

---

## `DELETE` /api/vehicles/:id
- **Descrição:** Realiza a exclusão lógica (soft delete) do veículo no estoque (`status = 'INATIVO'`, `deleted_at = NOW()`).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteVehicleSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID).

### Respostas
- **`200 OK`**:
```json
{
  "item": {
    "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
    "status": "INATIVO",
    "deleted_at": "2026-11-06T15:30:00.000Z"
  }
}
```
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Usuário sem perfil `ADMIN` ou vinculado a outra filial.
- **`404 Not Found`**: Veículo inexistente ou pertencente a outro tenant.

---

## `POST` /api/vehicles/:id/photos
- **Descrição:** Realiza upload de 1 a 15 fotos para a galeria do veículo (UC07, RN006, RN008). Salva temporariamente via Multer (`diskStorage` em `uploads/vehicles/temp`), converte em WebP (`thumb` 400x300 e `full` 1280x960) via Sharp e executa rollback compensatório em caso de falha. Se o veículo tem 0 fotos, a primeira torna-se capa principal (`is_primary: true`).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `uploadVehiclePhotos`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID do veículo).
- **Multipart Form (`multipart/form-data`):**
  - `photos`: De 1 a 15 arquivos de imagem (`image/jpeg`, `image/png`, `image/webp`), limite de 10MB por arquivo.

### Respostas
- **`201 Created`**:
```json
{
  "photos": [
    {
      "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
      "vehicle_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "thumb_path": "/uploads/vehicles/thumbs/e3b0c442-98fc-1c14-9afb-4c8996fb9242.webp",
      "full_path": "/uploads/vehicles/full/e3b0c442-98fc-1c14-9afb-4c8996fb9242.webp",
      "display_order": 0,
      "is_primary": true,
      "created_at": "2026-11-09T18:00:00.000Z"
    }
  ]
}
```
- **`400 Bad Request`**: Formato não suportado, imagem corrompida, arquivo acima de 10MB ou mais de 15 fotos.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado (ex: `VISUALIZADOR`) ou usuário restrito a outra filial (`"Usuário só tem permissão para gerenciar mídias de veículos da sua própria filial"`).
- **`404 Not Found`**: Veículo não encontrado no tenant.

---

## `PATCH` /api/vehicles/:id/photos/reorder
- **Descrição:** Reordena a galeria de fotos do veículo (Drag & Drop). A foto na posição 0 torna-se automaticamente a capa (`is_primary: true`), e as demais tornam-se `is_primary: false` (RN008). Operação atômica em transação ACID.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(reorderPhotosSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID do veículo).
- **Body (`req.body`):**
```json
{
  "photo_ids": [
    "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
  ]
}
```

### Respostas
- **`200 OK`**: Retorna `{"photos": [...]}` ordenadas.
- **`400 Bad Request`**: IDs duplicados, IDs não pertencentes ao veículo ou divergência no total de fotos.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado ou usuário restrito a outra filial.
- **`404 Not Found`**: Veículo não encontrado no tenant.

---

## `DELETE` /api/vehicles/:id/photos/:photoId
- **Descrição:** Remove uma foto específica da galeria e apaga os arquivos físicos (`thumb` e `full`) do disco. Se a foto excluída era a principal (`is_primary: true`), a foto remanescente de menor `display_order` assume como nova capa.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(deletePhotoSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID do veículo), `photoId` (UUID da foto).

### Respostas
- **`200 OK`**: `{"message": "Foto excluída com sucesso"}`
- **`400 Bad Request`**: Foto informada não pertence ao veículo informado.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado ou usuário restrito a outra filial.
- **`404 Not Found`**: Veículo ou foto não encontrados.

---

## `PATCH` /api/vehicles/:id/inspection-report
- **Descrição:** Realiza upload ou substituição do laudo pericial cautelar (PDF, máx 20MB). Remove o arquivo físico anterior do disco apenas após confirmação da atualização no banco.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `uploadInspectionReport`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID do veículo).
- **Multipart Form (`multipart/form-data`):**
  - `report`: Arquivo único com MIME `application/pdf`, máx 20MB.

### Respostas
- **`200 OK`**:
```json
{
  "vehicle": {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "inspection_report_url": "/uploads/vehicles/reports/c1f542be-5a1e-450a-8bf8-d8f99e469aa7.pdf"
  },
  "inspection_report_url": "/uploads/vehicles/reports/c1f542be-5a1e-450a-8bf8-d8f99e469aa7.pdf"
}
```
- **`400 Bad Request`**: Arquivo ausente, não PDF ou superior a 20MB.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado ou usuário restrito a outra filial.
- **`404 Not Found`**: Veículo não encontrado no tenant.

---

## `DELETE` /api/vehicles/:id/inspection-report
- **Descrição:** Remove o laudo pericial (PDF) físico do disco e atualiza `inspection_report_url` para `null` no banco de dados.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID do veículo).

### Respostas
- **`200 OK`**: `{"message": "Laudo pericial excluído com sucesso"}`
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado ou usuário restrito a outra filial.
- **`404 Not Found`**: Veículo não encontrado no tenant.

---

# Rotas Planejadas (Roadmap de Segurança e Fases Futuras)

As rotas abaixo ainda **não** estão implementadas no código atual e compõem os roadmaps [roadmap-seguranca.md](./roadmaps/roadmap-seguranca.md) e [roadmap.md](./roadmaps/roadmap.md):

| Rota Planejada | Origem | Objetivo |
| :--- | :--- | :--- |
| `GET /api/vehicles/:id/inspection-report` | Segurança S6.3 / S7.4 (D1) | Servir laudo PDF com contexto público validado (`resolvePublicTenantContext`), substituindo a exposição estática de `/uploads/vehicles/reports` (e gerando Presigned URL máx. 300s com R2 na Fase 6). |
| `POST /api/vehicles/:id/anonymize` | Segurança S9.3 (`ADMIN`) | Anonimizar dados pessoais (`owner_name`, `owner_contact`, `buyer_name`, `buyer_contact` = `NULL`) retornando `204`. |
| `POST /api/users/:id/anonymize` | Segurança S9.4 (`ADMIN`) | Anonimizar colaborador (`Usuario removido`, e-mail/telefone/hash aleatório, desativação) retornando `204`. |
| `PATCH /api/users/change-password` | Fase 1.4 / Segurança Backlog | Alteração de senha com incremento de `token_version` para revogação imediata de sessões JWT. |
| `/api/banks`, `POST /api/financing/simulate` | Fase 7 | Gestão de bancos/taxas e simulador público com aviso legal (`RN011`). |
| `/api/trade-ins`, `/api/leads`, `POST /api/vehicles/:id/metrics/whatsapp` | Fase 8 | CRM de leads e trocas com consentimento LGPD (`consent_at`, `consent_version`) e tracking WhatsApp. |
| `POST /api/vehicles/:id/sell`, `GET /api/vehicles/:id/poster`, `/api/promotions`, `/api/reports/summary` | Fase 9 | Venda/comissões, cartaz PDF A4, promoções/banners e relatórios analíticos. |
