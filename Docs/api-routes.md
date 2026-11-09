# Documentação de Rotas e Endpoints da API

Esta documentação detalha todas as rotas da API Garagem de Veículos, especificando métodos HTTP, middlewares de autenticação, validações Zod e payloads reais extraídos da suíte de testes E2E do Vitest.

---

## Sumário
1. [Health](#health)
2. [Usuários (`/api/users`)](#usuários)
3. [Lojas (`/api/stores`)](#lojas)
4. [Marcas (`/api/brands`)](#marcas)
5. [Opcionais (`/api/features`)](#opcionais)
6. [Modelos (`/api/models`)](#modelos)
7. [Veículos (`/api/vehicles`)](#veículos)

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

# Usuários

Controle de autenticação, criação de credenciais e gerenciamento de perfis de acesso (`ADMIN`, `VENDEDOR`, `VISUALIZADOR`, `PUBLICO`).

---

## `POST` /api/users/login
- **Descrição:** Autentica o usuário validando e-mail e senha com hash bcrypt, gerando o token JWT para os endpoints protegidos.
- **Middlewares / Autenticação:** `loginLimit` (máximo de 5 requisições por 15 minutos por IP).

### Parâmetros & Payload
- **Path Params (`req.params`):** Nenhum.
- **Query Params (`req.query`):** Nenhum.
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições & Validações |
| :--- | :--- | :--- | :--- |
| `email` | `string` | Sim | Formato de e-mail válido, normalizado para lowercase |
| `password` | `string` | Sim | Mínimo de 1 caractere |

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
      "name": "Paula Mendes",
      "email": "paula.mendes@garagem.com",
      "phone": "(37) 97777-6666",
      "role": "VENDEDOR",
      "commission_rates": 5.0,
      "is_active": true
    }
  }
}
```
- **`400 Bad Request`**: Validação de campos via Zod.
- **`401 Unauthorized`**: `{"message": "Credenciais inválidas"}` (disparado se e-mail não existir, senha estiver incorreta ou a conta estiver inativa `is_active: false`).
- **`429 Too Many Requests`**: `{"message": "Muitas tentativas de login neste IP, tente novamente após 15 minutos."}`.

---

## `POST` /api/users/register
- **Descrição:** Registra um novo usuário no sistema com senha criptografada.
- **Middlewares / Autenticação:** `authenticateJWT`, `registerLimit` (máx 5 cadastros/hora), `authorizeRoles('ADMIN')`, `validate(createUserSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** Nenhum.
- **Query Params (`req.query`):** Nenhum.
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições & Validações |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Sim | Mínimo 2 e máximo 255 caracteres |
| `email` | `string` | Sim | Formato de e-mail válido |
| `password` | `string` | Sim | Mínimo 8 caracteres, contendo maiúscula, minúscula, número e caractere especial |
| `phone` | `string` | Sim | Regex `^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$` |
| `role` | `enum` | Não | `'ADMIN'`, `'VENDEDOR'`, `'VISUALIZADOR'`, `'PUBLICO'` (padrão `'VENDEDOR'`) |
| `commission_rates` | `number` | Não | Mínimo 0 e máximo 100 (opcional, grava `null` quando omitido) |

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
    "name": "Paula Mendes",
    "email": "paula.mendes@garagem.com",
    "phone": "(37) 97777-6666",
    "role": "VENDEDOR",
    "commission_rates": 5.0,
    "is_active": true
  }
}
```
- **`400 Bad Request`**: Senha em desacordo com as regras de complexidade ou campos inválidos.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil sem autorização (não é ADMIN).
- **`409 Conflict`**: `{"message": "E-mail já cadastrado"}`.

---

## `GET` /api/users
- **Descrição:** Lista usuários cadastrados com suporte a paginação e filtros.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `includeDeletedValidateRole`, `validate(findUserSchema)`.

### Parâmetros & Payload
- **Query Params (`req.query`):**
  - `page`: `number` opcional (mínimo 1).
  - `limit`: `number` opcional (mínimo 1).
  - `is_active`: `'true' | 'false'` opcional.
  - `include_deleted`: `'true' | 'false'` opcional (apenas `ADMIN`).
  - `name_like`: `string` opcional.
  - `email_like`: `string` opcional.
  - `role`: `enum` opcional.

### Respostas
- **`200 OK`**:
```json
{
  "users": [
    {
      "id": "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b",
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

---

## `GET` /api/users/:id
- **Descrição:** Busca um usuário específico através de seu UUID.
- **Middlewares / Autenticação:** `validate(findByIdUserSchema)`, `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`.

### Parâmetros & Payload
- **Path Params (`req.params`):**
  - `id`: `string` UUID v4 obrigatório.

### Respostas
- **`200 OK`**:
```json
{
  "userInfo": {
    "id": "4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b",
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
- **Descrição:** Atualiza dados de um usuário existente.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(updateUserSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID).
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Não | Mínimo 2 caracteres |
| `phone` | `string` | Não | Regex de telefone brasileiro |
| `role` | `enum` | Não | `'ADMIN'`, `'VENDEDOR'`, `'VISUALIZADOR'`, `'PUBLICO'` |
| `commission_rates` | `number` | Não | 0 a 100 |

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
    "name": "Paula Mendes Atualizada",
    "email": "paula.mendes@garagem.com",
    "phone": "(37) 98888-2222",
    "role": "ADMIN",
    "commission_rates": 7.5,
    "is_active": true
  }
}
```

---

## `DELETE` /api/users/:id
- **Descrição:** Realiza o soft delete do usuário. Impede que o próprio usuário autenticado exclua a si mesmo.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteUserSchema)`.

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

---

# Lojas

Gerenciamento das concessionárias e unidades físicas.

---

## `GET` /api/stores
- **Descrição:** Lista as lojas cadastradas com paginação e filtros.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `includeDeletedValidateRole`, `validate(findStoreSchema)`.

### Parâmetros & Payload
- **Query Params (`req.query`):**
  - `page`, `limit`, `is_active`, `include_deleted` (Base find).
  - `name_like`: `string` opcional.
  - `cnpj`: `string` com 14 dígitos.
  - `city_like`: `string` opcional.
  - `state`: `string` com 2 dígitos (UF).

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
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
- **Descrição:** Retorna os detalhes de uma loja pelo UUID.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findByIdStoreSchema)`.

### Respostas
- **`200 OK`**:
```json
{
  "item": {
    "id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
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

---

## `GET` /api/stores/cnpj/:cnpj
- **Descrição:** Busca uma loja a partir do CNPJ (higienizado para 14 dígitos).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findByCnpjStoreSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):**
  - `cnpj`: `string` (14 dígitos).

### Respostas
- **`200 OK`**:
```json
{
  "store": {
    "id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
    "name": "Concessionária Horizonte",
    "cnpj": "12345678000199",
    "phone": "(37) 98888-7777"
  }
}
```

---

## `POST` /api/stores
- **Descrição:** Cadastra uma nova unidade de loja.
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
    "name": "Concessionária Horizonte",
    "cnpj": "12345678000199",
    "is_active": true
  }
}
```
- **`409 Conflict`**: `{"message": "CNPJ já cadastrado"}`.

---

## `PUT` /api/stores/:id
- **Descrição:** Atualiza dados de uma loja existente.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(updateStoreSchema)`.

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` atualizado.
- **`409 Conflict`**: `{"message": "CNPJ já em uso por outra loja"}`.

---

## `DELETE` /api/stores/:id
- **Descrição:** Exclusão lógica (soft delete) da loja.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteStoreSchema)`.

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` com `deleted_at` preenchido.

---

# Marcas

Catálogo de marcas e fabricantes de veículos.

---

## `GET` /api/brands
- **Descrição:** Lista as marcas cadastradas.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `includeDeletedValidateRole`, `validate(findBrandSchema)`.

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Toyota",
      "is_active": true
    }
  ]
}
```

---

## `GET` /api/brands/:id
- **Descrição:** Detalhes de uma marca pelo UUID.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findByIdBrandSchema)`.

---

## `POST` /api/brands
- **Descrição:** Cadastra uma nova marca de veículo.
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
    "name": "Toyota",
    "is_active": true
  }
}
```

---

## `PUT` /api/brands/:id
- **Descrição:** Atualiza o nome da marca.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(updateBrandSchema)`.

---

## `DELETE` /api/brands/:id
- **Descrição:** Exclusão lógica da marca.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteBrandSchema)`.

---

# Opcionais

Itens opcionais e equipamentos dos veículos (ex: Ar Condicionado, Teto Solar, Central Multimídia).

---

## `GET` /api/features
- **Descrição:** Lista opcionais cadastrados.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findFeatureSchema)`.

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "f5e18231-1552-4467-93be-ef9ce79868f0",
      "name": "Teto Solar Panorâmico",
      "is_active": true
    }
  ]
}
```

---

## `GET` /api/features/:id
- **Descrição:** Detalhes de um opcional pelo UUID.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findByIdFeatureSchema)`.

---

## `POST` /api/features
- **Descrição:** Cadastra um novo item opcional.
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
- **`201 Created`**: Retorna `{"item": { "id": "...", "name": "Teto Solar Panorâmico", "is_active": true }}`.

---

## `PUT` /api/features/:id
- **Descrição:** Atualiza o nome do item opcional.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(updateFeatureSchema)`.

---

## `DELETE` /api/features/:id
- **Descrição:** Exclusão lógica do opcional.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteFeatureSchema)`.

---

# Modelos

Catálogo de modelos associados às marcas cadastradas.

---

## `GET` /api/models
- **Descrição:** Lista modelos de veículos com filtros por marca e texto.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `includeDeletedValidateRole`, `validate(findModelSchema)`.

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "c4a7e912-6b94-4d6b-9c2f-0f6a2b8e3a1d",
      "brand_id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Corolla XEi",
      "is_active": true
    }
  ]
}
```

---

## `GET` /api/models/:id
- **Descrição:** Retorna os dados do modelo pelo UUID.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(findByIdModelSchema)`.

---

## `POST` /api/models
- **Descrição:** Cadastra um modelo vinculado a uma marca existente.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(createModelSchema)`.

### Parâmetros & Payload
- **Body (`req.body`):**

| Campo | Tipo Zod | Obrigatório | Restrições |
| :--- | :--- | :--- | :--- |
| `brand_id` | `string` | Sim | UUID v4 válido |
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
    "brand_id": "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "name": "Corolla XEi",
    "is_active": true
  }
}
```

---

## `PUT` /api/models/:id
- **Descrição:** Atualiza dados de um modelo (exige ao menos um campo).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(updateModelSchema)`.

---

## `DELETE` /api/models/:id
- **Descrição:** Exclusão lógica do modelo.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteModelSchema)`.

---

# Veículos

Módulo central do sistema: vitrine pública, comparador e backoffice administrativo para gestão de estoque.

---

## `GET` /api/vehicles
- **Descrição:** Catálogo da Vitrine Pública (UC01). Retorna veículos ativos com higienização de segurança (oculta placa completa, custos de compra e dados do proprietário).
- **Middlewares / Autenticação:** Rota pública, `validate(findVehicleSchema)`.

### Parâmetros & Payload
- **Query Params (`req.query`):**
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
  - `search`: Texto livre buscado no título e descrição.

### Respostas
- **`200 OK`**:
```json
{
  "items": [
    {
      "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
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
      "brand_name": "Toyota",
      "model_name": "Corolla XEi",
      "store_name": "Concessionária Horizonte"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 12
}
```

---

## `GET` /api/vehicles/compare
- **Descrição:** Comparador Público de Veículos (UC02). Permite comparar as especificações de 2 a 3 veículos lado a lado.
- **Middlewares / Autenticação:** Rota pública, `validate(compareVehiclesSchema)`.

### Parâmetros & Payload
- **Query Params (`req.query`):**
  - `ids`: `string` contendo no mínimo 2 e no máximo 3 UUIDs separados por vírgula.

- **Exemplo de Consulta:**
`/api/vehicles/compare?ids=e3b0c442-98fc-1c14-9afb-4c8996fb9242,f4a1c223-11bb-4e22-83b6-7bdf7d37a718`

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
      "transmission": "AUTOMATICO"
    },
    {
      "id": "f4a1c223-11bb-4e22-83b6-7bdf7d37a718",
      "title": "Honda Civic Touring",
      "sale_price": 125000,
      "category": "SEDÃ",
      "transmission": "AUTOMATICO"
    }
  ]
}
```
- **`400 Bad Request`**: Menos de 2 ou mais de 3 IDs informados, ou formato de UUID inválido.

---

## `GET` /api/vehicles/admin
- **Descrição:** Listagem administrativa de veículos para o Backoffice (UC06).
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR', 'VISUALIZADOR')`, `validate(findVehicleSchema)`, `includeDeletedValidateRole`.

### Respostas
- **`200 OK`**: Catálogo completo incluindo campos gerenciais de acordo com a Role do usuário.

---

## `GET` /api/vehicles/admin/:id
- **Descrição:** Detalhe administrativo completo do veículo.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR', 'VISUALIZADOR')`, `validate(findByIdVehicleSchema)`.

---

## `GET` /api/vehicles/:id
- **Descrição:** Detalhe público do veículo para o consumidor. Implementa proteção anti-fraude na métrica de visualizações (`total_views`), registrando apenas uma visualização por IP/User-Agent dentro da janela de tempo.
- **Middlewares / Autenticação:** Rota pública, `validate(findByIdVehicleSchema)`.

### Parâmetros & Payload
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
    "features": ["Teto Solar", "Bancos em Couro"]
  }
}
```
- **`404 Not Found`**: `{"message": "Veículo não encontrado"}`.

---

## `POST` /api/vehicles
- **Descrição:** Cadastro de veículo no estoque (UC06).
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
| `store_id` | `string` | Sim | UUID da loja |
| `model_id` | `string` | Sim | UUID do modelo |
| `sale_type` | `enum` | Sim | `'PROPRIO'` (padrão) ou `'CONSIGNADO'` |
| `title` | `string` | Sim | Mínimo 3 e máximo 255 caracteres |
| `description` | `string` | Sim | Mínimo 5 caracteres |
| `sale_price` | `number` | Sim | Valor positivo maior que zero |
| `purchase_price` | `number` | Condicional | Obrigatório se `PROPRIO` |
| `owner_name` | `string` | Condicional | Obrigatório se `CONSIGNADO` (mínimo 2 chars) |
| `owner_contact` | `string` | Condicional | Obrigatório se `CONSIGNADO` (8 a 15 chars) |
| `owner_price` | `number` | Condicional | Obrigatório se `CONSIGNADO` (> 0) |
| `store_commission_rate` | `number` | Condicional | Obrigatório se `CONSIGNADO` (>= 0) |
| `manufacture_year` | `integer` | Sim | 1900 até ano atual + 2 |
| `model_year` | `integer` | Sim | 1900 até ano atual + 2 |
| `mileage` | `integer` | Sim | Quilometragem não negativa |
| `transmission` | `enum` | Sim | `'AUTOMATICO'`, `'MANUAL'`, `'AUTOMATIZADO'` |
| `color` | `string` | Sim | Mínimo 2 e máximo 20 |
| `category` | `enum` | Sim | Categoria veicular permitida |
| `fuel_type` | `enum` | Sim | Combustível aceito |
| `steering` | `string` | Sim | Direção (ex: Elétrica, Hidráulica) |
| `doors` | `integer` | Sim | 1 a 10 portas |
| `full_license_plate` | `string` | Sim | Formato Mercosul (`ABC1D23`) ou antigo (`ABC1234`) |
| `feature_ids` | `array[uuid]` | Não | Lista de identificadores dos opcionais |

- **Exemplo de Envio - Veículo Próprio (extraído de `vehicle.e2e.spec.ts`):**
```json
{
  "store_id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
  "model_id": "c4a7e912-6b94-4d6b-9c2f-0f6a2b8e3a1d",
  "sale_type": "PROPRIO",
  "title": "Toyota Corolla XEi 2.0 Flex Automático",
  "description": "Carro em excelente estado para testes E2E",
  "sale_price": 110000,
  "purchase_price": 90000,
  "manufacture_year": 2022,
  "model_year": 2023,
  "mileage": 25000,
  "transmission": "AUTOMATICO",
  "color": "Branco",
  "category": "SEDÃ",
  "fuel_type": "FLEX",
  "steering": "Elétrica",
  "doors": 4,
  "full_license_plate": "ABC1D23",
  "feature_ids": [
    "0a8ef153-bf30-4e3d-83b6-7bdf7d37a718",
    "f5e18231-1552-4467-93be-ef9ce79868f0"
  ]
}
```

- **Exemplo de Envio - Veículo Consignado:**
```json
{
  "store_id": "70a6d0b9-5095-46b5-a6a3-a7d0dbba3e5f",
  "model_id": "c4a7e912-6b94-4d6b-9c2f-0f6a2b8e3a1d",
  "sale_type": "CONSIGNADO",
  "title": "Honda Civic Touring 1.5 Turbo",
  "description": "Veículo consignado de cliente particular",
  "sale_price": 125000,
  "owner_name": "Roberto Alencar",
  "owner_contact": "(37) 98888-5555",
  "owner_price": 118000,
  "store_commission_rate": 5.0,
  "manufacture_year": 2021,
  "model_year": 2022,
  "mileage": 38000,
  "transmission": "AUTOMATICO",
  "color": "Preto",
  "category": "SEDÃ",
  "fuel_type": "GASOLINA",
  "steering": "Elétrica",
  "doors": 4,
  "full_license_plate": "XYZ9876"
}
```

### Respostas
- **`201 Created`**:
```json
{
  "item": {
    "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
    "title": "Toyota Corolla XEi 2.0 Flex Automático",
    "sale_type": "PROPRIO",
    "sale_price": 110000,
    "plate_last_digit": 3,
    "is_active": true
  }
}
```
- **`400 Bad Request`**: Dados ausentes para o tipo de venda (ex. faltou `purchase_price` em `PROPRIO` ou `owner_price` em `CONSIGNADO`).
- **`409 Conflict`**: `{"message": "Placa já cadastrada para outro veículo ativo"}`.

---

## `PUT` /api/vehicles/:id
- **Descrição:** Atualiza os dados ou opcionais de um veículo.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`, `validate(updateVehicleSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID).
- **Body (`req.body`):** Campos parciais de veículo (ao menos um obrigatório).

### Respostas
- **`200 OK`**: Retorna `{"item": { ... }}` atualizado.
- **`400 Bad Request`**:
  - Nenhum dado informado para atualização.
  - Violação de regras condicionais do tipo de venda (`purchase_price` <= 0 para `PROPRIO`; `owner_name`, `owner_contact`, `owner_price` ou `store_commission_rate` ausentes/inválidos para `CONSIGNADO`).
- **`404 Not Found`**: Veículo inexistente ou inativo.
- **`409 Conflict`**:
  - Se a placa for alterada para outra já ativa (`{"message": "Placa já cadastrada para outro veículo ativo"}`).
  - Violação de unicidade ou integridade referencial no PostgreSQL.

---

## `DELETE` /api/vehicles/:id
- **Descrição:** Realiza a exclusão lógica (soft delete) do veículo no estoque.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN')`, `validate(deleteVehicleSchema)`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID).

### Respostas
- **`200 OK`**:
```json
{
  "item": {
    "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
    "deleted_at": "2026-11-06T15:30:00.000Z"
  }
}
```
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Usuário não possui perfil `ADMIN` (ex: `VENDEDOR` recebe 403).
- **`404 Not Found`**: Veículo inexistente.

---

## `POST` /api/vehicles/:id/photos
- **Descrição:** Realiza upload de 1 a 15 fotos para a galeria do veículo (UC07, RN006, RN008). Redimensiona em memória e salva no disco em WebP (`thumb` 400x300 e `full` 1280x960). Se o veículo tem 0 fotos, a primeira torna-se capa principal (`is_primary: true`).
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
- **`400 Bad Request`**: Formato não suportado, arquivo acima de 10MB ou mais de 15 fotos.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado (ex: `VISUALIZADOR`).
- **`404 Not Found`**: Veículo não encontrado.

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
- **`200 OK`**:
```json
{
  "photos": [
    {
      "id": "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      "vehicle_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "thumb_path": "/uploads/vehicles/thumbs/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22.webp",
      "full_path": "/uploads/vehicles/full/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22.webp",
      "display_order": 0,
      "is_primary": true,
      "created_at": "2026-11-09T18:00:00.000Z"
    }
  ]
}
```
- **`400 Bad Request`**: IDs duplicados, IDs não pertencentes ao veículo ou divergência no total de fotos.
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado.
- **`404 Not Found`**: Veículo não encontrado.

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
- **`403 Forbidden`**: Perfil não autorizado.
- **`404 Not Found`**: Veículo ou foto não encontrados.

---

## `PATCH` /api/vehicles/:id/inspection-report
- **Descrição:** Realiza upload ou substituição do laudo pericial cautelar (PDF, máx 20MB). Remove o arquivo físico anterior do disco se existir.
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
- **`403 Forbidden`**: Perfil não autorizado.
- **`404 Not Found`**: Veículo não encontrado.

---

## `DELETE` /api/vehicles/:id/inspection-report
- **Descrição:** Remove o laudo pericial (PDF) físico do disco e atualiza `inspection_report_url` para `null` no banco de dados.
- **Middlewares / Autenticação:** `authenticateJWT`, `authorizeRoles('ADMIN', 'VENDEDOR')`.

### Parâmetros & Payload
- **Path Params (`req.params`):** `id` (UUID do veículo).

### Respostas
- **`200 OK`**: `{"message": "Laudo pericial excluído com sucesso"}`
- **`401 Unauthorized`**: Token ausente ou inválido.
- **`403 Forbidden`**: Perfil não autorizado.
- **`404 Not Found`**: Veículo não encontrado.

