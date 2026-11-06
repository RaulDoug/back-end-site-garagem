# Documentação: Services & Repositories

Esta documentação detalha a arquitetura da camada de negócio (`services`) e de persistência relacional com SQL puro via `node-postgres` (`repositories`), mapeando parâmetros, transações ACID, fluxos condicionais, exceções (`AppError`) e as asserções de teste automatizado no Vitest.

---

## Sumário
1. [Base / Camada Genérica (CRUD)](#módulo-base--infraestrutura-genérica)
2. [Usuários (`users`)](#módulo-usuários-users)
3. [Lojas (`stores`)](#módulo-lojas-stores)
4. [Marcas (`brands`)](#módulo-marcas-brands)
5. [Opcionais (`features`)](#módulo-opcionais-features)
6. [Modelos (`models`)](#módulo-modelos-models)
7. [Veículos (`vehicles`)](#módulo-veículos-vehicles)

---

# Módulo: Base / Infraestrutura Genérica

Classes abstratas/genéricas parametrizadas com Generics TypeScript (`T extends QueryResultRow, C = Record<string, unknown>`), fornecendo operações CRUD reutilizáveis.

---

### 1. Camada de Serviço (`BaseService<T, C>`)

#### `findById(id: string): Promise<T>`
- **Responsabilidade:** Recupera um registro pelo seu identificador único UUID, garantindo que o registro exista no banco.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Não | UUID identificador do registro |

- **Regras de Negócio & Fluxos:**
  1. Invoca `repository.findById(id)`.
  2. Verifica se o resultado é nulo. Caso seja, dispara exceção de não encontrado.
- **Exceções Disparadas (`AppError`):**
  - `404 Not Found` - `NotFoundError ('Registro não encontrado')`: Disparado quando `result === null`.
- **Cenários Testados (Vitest):**
  - Retorna o registro correspondente quando existente.
  - Lança `NotFoundError` quando o ID informado não existir ou estiver com soft-delete.
- **Chamadas de Persistência:** `repository.findById(id)`

#### `find(filters: FindData): Promise<T[]>`
- **Responsabilidade:** Consulta registros aplicando filtros dinâmicos de comparação, busca parcial e soft delete.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `filters` | `FindData` | Não | Objeto contendo array de `filters` (`field`, `value`, `operator`) e flag `includeDeleted` |

- **Regras de Negócio & Fluxos:**
  1. Repassa os filtros higienizados para a camada de persistência.
- **Exceções Disparadas (`AppError`):** Nenhuma direta.
- **Cenários Testados (Vitest):**
  - Retorna array vazio ou lista populada conforme filtros de igualdade e `ILIKE`.
- **Chamadas de Persistência:** `repository.find(filters)`

#### `create(data: C): Promise<T>`
- **Responsabilidade:** Persiste um novo registro no banco de dados e valida o retorno.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `data` | `C` | Não | DTO com os atributos necessários para criação |

- **Regras de Negócio & Fluxos:**
  1. Invoca `repository.create(data)`.
  2. Se a inserção não retornar registro (falha de escrita), interrompe o fluxo.
- **Exceções Disparadas (`AppError`):**
  - `400 Bad Request` - `BadRequestError ('Erro ao criar registro')`: Disparado quando `!result`.
- **Cenários Testados (Vitest):**
  - Cria e retorna a entidade completa persistida com ID gerado.
- **Chamadas de Persistência:** `repository.create(data)`

#### `update(id: string, data: Partial<C>): Promise<T>`
- **Responsabilidade:** Atualiza campos de um registro existente.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Não | UUID do registro a ser atualizado |
| `data` | `Partial<C>` | Não | Objeto contendo os campos parciais para alteração |

- **Regras de Negócio & Fluxos:**
  1. Valida se o objeto `data` contém ao menos uma chave.
  2. Executa a atualização no repositório.
  3. Lança erro caso o registro não seja localizado.
- **Exceções Disparadas (`AppError`):**
  - `400 Bad Request` - `BadRequestError ('Nenhum dado informado')`: Quando `Object.keys(data).length === 0`.
  - `404 Not Found` - `NotFoundError ('Registro não encontrado')`: Quando o retorno for `null`.
- **Cenários Testados (Vitest):**
  - Atualização com sucesso retornando entidade atualizada.
  - Bloqueio quando payload de atualização estiver vazio.
  - Lançamento de 404 quando o UUID for inexistente.
- **Chamadas de Persistência:** `repository.update(id, data)`

#### `delete(id: string): Promise<T>`
- **Responsabilidade:** Remove ou inativa logicamente um registro pelo UUID.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Não | UUID do registro |

- **Regras de Negócio & Fluxos:**
  1. Executa a deleção/inativação no repositório.
  2. Garante que o registro existia e estava ativo antes da remoção.
- **Exceções Disparadas (`AppError`):**
  - `404 Not Found` - `NotFoundError ('Registro não encontrado')`: Quando `result === null`.
- **Cenários Testados (Vitest):**
  - Retorna o registro inativado/removido.
  - Dispara 404 se o registro já estiver deletado ou inexistente.
- **Chamadas de Persistência:** `repository.delete(id)`

---

### 2. Camada de Persistência (`BaseRepository<T, C>`)

#### `findById(id: string): Promise<T | null>`
- **Operação Principal:** `SELECT`
- **Tabela(s) Afetada(s):** Tabela parametrizada (`${this.tableName}`).
- **Parâmetros SQL:**
  - `$1`: `id` (`string` UUID).
- **Comportamento da Query:**
  - Se `options.softDelete = true`: `SELECT * FROM tableName WHERE id = $1 AND deleted_at IS NULL LIMIT 1;`.
  - Se `options.softDelete = false`: `SELECT * FROM tableName WHERE id = $1 LIMIT 1;`.
- **Retorno TypeScript:** `T | null` (`result.rows[0] || null`).

#### `find(filters: FindData): Promise<T[]>`
- **Operação Principal:** `SELECT`
- **Tabela(s) Afetada(s):** `${this.tableName}`.
- **Parâmetros SQL:** Gerados dinamicamente via `buildFindQuery` (`$1, $2, ...`).
  - Suporta operadores: `=`, `>=`, `<=`, `ILIKE` (`%$value%`) e `IN` (`field = ANY($n)`).
  - Inclui cláusula `deleted_at IS NULL` automaticamente a menos que `includeDeleted = true`.
- **Comportamento da Query:** Executa query paginada ou filtrada e retorna todos os registros correspondentes.
- **Retorno TypeScript:** `T[]` (`result.rows`).

#### `create(data: C): Promise<T>`
- **Operação Principal:** `INSERT`
- **Tabela(s) Afetada(s):** `${this.tableName}`.
- **Parâmetros SQL:** Gerados dinamicamente via `buildInsertQuery`:
  - `INSERT INTO tableName (col1, col2...) VALUES ($1, $2...) RETURNING *;`.
- **Comportamento da Query:** Insere as colunas mapeadas e retorna a linha recém-criada através de `RETURNING *`.
- **Retorno TypeScript:** `T` (`result.rows[0]`).

#### `update(id: string, data: Partial<C>): Promise<T | null>`
- **Operação Principal:** `UPDATE`
- **Tabela(s) Afetada(s):** `${this.tableName}`.
- **Parâmetros SQL:** Gerados dinamicamente via `buildUpdateQuery`:
  - `UPDATE tableName SET col1 = $1, col2 = $2 WHERE id = $n RETURNING *;`.
  - `$n` é a última posição do array, recebendo o `id`.
- **Comportamento da Query:** Altera os campos informados e retorna a entidade atualizada. Retorna `null` se não houver campos no payload.
- **Retorno TypeScript:** `T | null` (`result.rows[0] || null`).

#### `delete(id: string): Promise<T | null>`
- **Operação Principal:** `UPDATE` (Soft Delete) ou `DELETE` (Hard Delete).
- **Tabela(s) Afetada(s):** `${this.tableName}`.
- **Parâmetros SQL:**
  - `$1`: `id` (`string`).
- **Comportamento da Query:**
  - Soft Delete (`options.softDelete = true`):
    `UPDATE tableName SET deleted_at = NOW() [, is_active = false] WHERE id = $1 AND deleted_at IS NULL RETURNING *;`.
  - Hard Delete (`options.softDelete = false`):
    `DELETE FROM tableName WHERE id = $1 RETURNING *;`.
- **Retorno TypeScript:** `T | null`.

---

# Módulo: Usuários (`users`)

Gerencia regras de credenciamento, criptografia de senhas (bcrypt), emissão de JWT e segurança dos dados dos operadores.

---

### 1. Camada de Serviço (`UserService`)

#### `create(data: CreateUserInput): Promise<Omit<User, 'password_hash'>>`
- **Responsabilidade:** Registra um novo usuário no banco com senha criptografada em bcrypt e normalização de e-mail.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `data.name` | `string` | Não | Nome completo do operador |
| `data.email` | `string` | Não | E-mail do operador |
| `data.password` | `string` | Não | Senha em texto puro |
| `data.phone` | `string` | Não | Telefone celular formatado |
| `data.role` | `'ADMIN' \| 'VENDEDOR' \| 'VISUALIZADOR' \| 'PUBLICO'` | Sim | Perfil de permissões |
| `data.commission_rates`| `number` | Sim | Percentual de comissão |

- **Regras de Negócio & Fluxos:**
  1. Converte o e-mail informado para lowercase: `data.email.toLowerCase()`.
  2. Consulta `userRepository.findByEmail(normalizedEmail)`. Se existir, aborta com conflito.
  3. Gera o hash seguro da senha com `hashPassword(password, 10)`.
  4. Persiste o usuário no repositório.
  5. Desestrutura e remove `password_hash` do objeto retornado.
- **Exceções Disparadas (`AppError`):**
  - `409 Conflict` - `AppError ('E-mail já cadastrado', 409)`: Quando e-mail já existe ativo.
- **Cenários Testados (Vitest):**
  - Cadastro de usuário com dados válidos e retorno correto da entidade.
  - Ocultação garantida do campo `password_hash` na resposta.
  - Lançamento de erro 409 em caso de e-mail duplicado.
  - Aplicação de hash na senha com salt de 10 rounds antes de salvar.
- **Chamadas de Persistência:**
  - `userRepository.findByEmail(normalizedEmail)`
  - `userRepository.create(payload)`

#### `login(data: LoginUserInput): Promise<{ token: string; user: Omit<User, 'password_hash'> }>`
- **Responsabilidade:** Autentica credenciais, valida a senha com o hash do banco e emite o token de sessão JWT.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `data.email` | `string` | Não | E-mail do usuário |
| `data.password` | `string` | Não | Senha informada na tentativa de login |

- **Regras de Negócio & Fluxos:**
  1. Busca o usuário por e-mail com `userRepository.findByEmail(email)`.
  2. Compara a senha informada com `user.password_hash` via `comparePassword`.
  3. Se o usuário não existir ou a senha não bater, aborta (tempo constante para mitigar timing attacks).
  4. Gera o token JWT assinado contendo `{ id, email, role }` no payload.
  5. Retorna o token e os dados públicos do usuário (sem hash).
- **Exceções Disparadas (`AppError`):**
  - `401 Unauthorized` - `AppError ('Credenciais inválidas', 401)`: Se usuário for `null` ou `isMatch === false`.
- **Cenários Testados (Vitest):**
  - Autenticação com sucesso retornando token JWT e usuário sem `password_hash`.
  - Rejeição com erro 401 para senha incorreta.
  - Rejeição com erro 401 para e-mail não existente.
- **Chamadas de Persistência:** `userRepository.findByEmail(email)`

#### `findById(id: string): Promise<Omit<User, 'password_hash'>>`
- **Responsabilidade:** Recupera os dados de um usuário pelo UUID, sem expor credenciais.
- **Regras de Negócio:** Dispara `NotFoundError` caso não exista; remove `password_hash`.
- **Exceções:** `404 Not Found` - `NotFoundError ('Usuário inexistente.')`.
- **Chamadas de Persistência:** `userRepository.findById(id)`

#### `find(filters: FindData): Promise<Omit<User, 'password_hash'>[]>`
- **Responsabilidade:** Lista usuários com paginação e filtros parciais, higienizando os hashes de senha.
- **Chamadas de Persistência:** `userRepository.find(filters)`

#### `update(id: string, data: UpdateUserBody): Promise<Omit<User, 'password_hash'>>`
- **Responsabilidade:** Atualiza informações cadastrais do operador.
- **Regras de Negócio:**
  1. Garante que o usuário existe previamente.
  2. Executa a atualização no repositório.
  3. Remove `password_hash` antes de retornar.
- **Exceções:**
  - `404 Not Found` - `NotFoundError ('Usuário inexistente.')`
  - `400 Bad Request` - `BadRequestError ('Nenhum campo informado para atualização.')`
- **Chamadas de Persistência:**
  - `userRepository.findById(id)`
  - `userRepository.update(id, data)`

#### `delete(id: string): Promise<Omit<User, 'password_hash'>>`
- **Responsabilidade:** Inativa o usuário no sistema (soft-delete).
- **Exceções:** `404 Not Found` - `NotFoundError ('Usuário inexistente.')`.
- **Chamadas de Persistência:** `userRepository.delete(id)`

---

### 2. Camada de Persistência (`UserRepository`)

#### `findByEmail(email: string): Promise<User | null>`
- **Operação Principal:** `SELECT`
- **Tabela(s) Afetada(s):** `users`.
- **Parâmetros SQL:**
  - `$1`: `email` (`string`).
- **Comportamento da Query:**
  ```sql
  SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1;
  ```
- **Retorno TypeScript:** `User | null`.

#### `create(data: CreateUserData): Promise<User>`
- **Operação Principal:** `INSERT`
- **Tabela(s) Afetada(s):** `users`.
- **Parâmetros SQL:**
  - `$1`: `data.name` (`string`)
  - `$2`: `data.email` (`string`)
  - `$3`: `data.password_hash` (`string`)
  - `$4`: `data.phone` (`string`)
  - `$5`: `data.role || null` (cast com `COALESCE($5, 'VENDEDOR')::users_roles_types`)
  - `$6`: `data.commission_rates || 0` (`number`)
- **Comportamento da Query:**
  ```sql
  INSERT INTO users (name, email, password_hash, phone, role, commission_rates)
  VALUES ($1, $2, $3, $4, COALESCE($5, 'VENDEDOR')::users_roles_types, $6)
  RETURNING *;
  ```
- **Retorno TypeScript:** `User`.

---

# Módulo: Lojas (`stores`)

Gerenciamento das concessionárias e unidades físicas, garantindo a unicidade do CNPJ ativo.

---

### 1. Camada de Serviço (`StoreService`)

#### `create(data: CreateStoreData): Promise<Store>`
- **Responsabilidade:** Cadastra uma nova loja garantindo que o CNPJ seja inédito no sistema.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `data.name` | `string` | Não | Razão social ou nome fantasia |
| `data.cnpj` | `string` | Não | CNPJ sanitizado (14 dígitos) |
| `data.phone` | `string` | Não | Telefone de contato |
| `data.zip_code`| `string` | Não | CEP de 8 dígitos |
| `data.street`, `number`, `neighborhood`, `city`, `state` | `string` | Não | Endereço completo |
| `data.complement` | `string` | Sim | Complemento do endereço |

- **Regras de Negócio & Fluxos:**
  1. Verifica se já existe loja cadastrada com o mesmo CNPJ via `repository.findByCNPJ(data.cnpj)`.
  2. Dispara erro 409 caso o CNPJ já esteja em uso por loja ativa.
  3. Delega a persistência para `super.create(data)`.
- **Exceções Disparadas (`AppError`):**
  - `409 Conflict` - `AppError ('CNPJ já cadastrado', 409)`.
- **Cenários Testados (Vitest):**
  - Sucesso ao criar loja quando CNPJ for inédito.
  - Lançamento de 409 se CNPJ já estiver cadastrado.
- **Chamadas de Persistência:**
  - `repository.findByCNPJ(data.cnpj)`
  - `repository.create(data)`

#### `findByCNPJ(cnpj: string): Promise<Store>`
- **Responsabilidade:** Busca loja pelo número de CNPJ ativo.
- **Exceções Disparadas (`AppError`):**
  - `404 Not Found` - `NotFoundError ('Loja com CNPJ ${cnpj} não encontrada')`.
- **Cenários Testados (Vitest):**
  - Retorno da loja quando CNPJ for localizado.
  - Lançamento de 404 quando CNPJ não for encontrado.
- **Chamadas de Persistência:** `repository.findByCNPJ(cnpj)`

#### `update(id: string, data: Partial<CreateStoreData>): Promise<Store>`
- **Responsabilidade:** Atualiza os dados de uma loja com validação de colisão de CNPJ.
- **Regras de Negócio & Fluxos:**
  1. Se `data.cnpj` for fornecido na atualização:
     - Consulta se o CNPJ existe em outra loja: `findByCNPJ(data.cnpj)`.
     - Se existir e o ID for diferente do ID da loja atual (`existingStore.id !== id`), aborta com erro 409.
  2. Executa a atualização via `super.update(id, data)`.
- **Exceções Disparadas (`AppError`):**
  - `409 Conflict` - `AppError ('CNPJ já em uso por outra loja', 409)`.
  - `404 Not Found` - `NotFoundError` (se o ID da loja não existir).
- **Cenários Testados (Vitest):**
  - Atualização de nome e telefone sem alterar CNPJ.
  - Atualização permitida para novo CNPJ que não está em uso.
  - Bloqueio com erro 409 se o novo CNPJ já pertencer a outra loja.
- **Chamadas de Persistência:**
  - `repository.findByCNPJ(data.cnpj)`
  - `repository.update(id, data)`

---

### 2. Camada de Persistência (`StoreRepository`)

#### `findByCNPJ(cnpj: string): Promise<Store | null>`
- **Operação Principal:** `SELECT`
- **Tabela(s) Afetada(s):** `stores`.
- **Parâmetros SQL:**
  - `$1`: `cnpj` (`string` com 14 dígitos).
- **Comportamento da Query:**
  ```sql
  SELECT * FROM stores WHERE cnpj = $1 AND deleted_at IS NULL LIMIT 1;
  ```
- **Retorno TypeScript:** `Store | null`.

---

# Módulo: Marcas (`brands`)

Gerenciamento das marcas de veículos (Toyota, Honda, Ford, etc.).

---

### 1. Camada de Serviço (`BrandService`)
Herda integralmente de `BaseService<Brand, CreateBrandData>`.

- **Métodos Expostos:** `findById`, `find`, `create`, `update`, `delete`.
- **Regras:**
  - Soft-delete padrão (`deleted_at = NOW()`, `is_active = false`).
  - Bloqueio de atualização vazia com `BadRequestError`.
  - Lançamento de `NotFoundError` caso a marca não exista.
- **Cenários Testados (Vitest):**
  - CRUD completo com mock de repositório e verificação de chamadas.

### 2. Camada de Persistência (`BrandRepository`)
- **Tabela:** `brands`.
- **Opções:** `{ softDelete: true, hasActiveStatus: true }`.
- **Herança:** Utiliza os métodos de SQL bruto dinâmico de `BaseRepository`.

---

# Módulo: Opcionais (`features`)

Gerenciamento dos acessórios veiculares (ex: Teto Solar, Bancos em Couro).

---

### 1. Camada de Serviço (`FeatureService`)
Herda de `BaseService<Feature, CreateFeatureData>`.

- **Particularidade de Negócio:** Opcionais utilizam **hard delete** no banco de dados para evitar acumular referências órfãs.
- **Cenários Testados (Vitest):**
  - Criação, listagem e remoção física de opcionais.

### 2. Camada de Persistência (`FeatureRepository`)
- **Tabela:** `features`.
- **Opções:** `{ softDelete: false, hasActiveStatus: false }`.
- **Query de Exclusão Físico-Relacional:**
  ```sql
  DELETE FROM features WHERE id = $1 RETURNING *;
  ```

---

# Módulo: Modelos (`models`)

Modelos vinculados às marcas fabricantes (Corolla -> Toyota, Civic -> Honda).

---

### 1. Camada de Serviço (`ModelService`)
Herda de `BaseService<Model, CreateModelData>`.

- **Regras de Negócio:**
  - Vínculo obrigatório com `brand_id`.
  - Soft-delete padrão.
- **Cenários Testados (Vitest):**
  - Validações de integridade e orquestração de chamadas ao repositório.

### 2. Camada de Persistência (`ModelRepository`)
- **Tabela:** `models`.
- **Opções:** `{ softDelete: true, hasActiveStatus: true }`.

---

# Módulo: Veículos (`vehicles`)

Módulo crítico do sistema: orquestração de estoque, transações ACID com tabela associativa de opcionais (`vehicle_features`), métricas anti-fraude e sanitização LGPD.

---

### 1. Camada de Serviço (`VehicleService`)

#### `create(data: CreateVehicleData & { feature_ids?: string[] }, featureIdsOverride?: string[]): Promise<Vehicle>`
- **Responsabilidade:** Cadastra um novo veículo no estoque, orquestra a associação de opcionais e calcula o dígito final da placa.
- **Parâmetros:**

| Parâmetro | Tipo | Opcional | Descrição |
| :--- | :--- | :--- | :--- |
| `data` | `CreateVehicleData` | Não | Atributos cadastrais do veículo |
| `data.feature_ids` | `string[]` | Sim | Array de UUIDs dos opcionais vinculados |
| `featureIdsOverride` | `string[]` | Sim | Sobrescrita manual da lista de opcionais |

- **Regras de Negócio & Fluxos:**
  1. Separa o array de `feature_ids` do payload de dados primários do veículo.
  2. Valida unicidade da placa: se `full_license_plate` estiver preenchida, invoca `repository.findByPlate`. Se existir veículo ativo, dispara erro 409.
  3. **RN002 / RN006: Cálculo Automático do Dígito Final da Placa**: Extrai o último caractere da placa (`Number(plate.slice(-1))`) e atribui a `plate_last_digit`.
  4. Invoca o repositório transacional `createWithFeatures(payload, featureIds)`.
- **Exceções Disparadas (`AppError`):**
  - `409 Conflict` - `AppError ('Placa já cadastrada para outro veículo ativo', 409)`.
  - `400 Bad Request` - `BadRequestError ('Erro ao cadastrar veículo')`.
- **Cenários Testados (Vitest):**
  - Criação de veículo com cálculo correto de `plate_last_digit` a partir da placa.
  - Associação transacional de múltiplos `feature_ids`.
  - Rejeição com 409 ao tentar cadastrar placa duplicada.
- **Chamadas de Persistência:**
  - `repository.findByPlate(plate)`
  - `repository.createWithFeatures(payload, featureIds)`

#### `update(id: string, data: Partial<CreateVehicleData> & { feature_ids?: string[] }, featureIdsOverride?: string[]): Promise<Vehicle>`
- **Responsabilidade:** Atualiza os dados do veículo e sincroniza a lista de opcionais.
- **Regras de Negócio & Fluxos:**
  1. Valida se há ao menos um atributo ou array de `feature_ids` informado.
  2. Se a placa for alterada, valida duplicidade garantindo que não pertença a outro veículo (`existing.id !== id`).
  3. Recalcula `plate_last_digit` caso a placa tenha sido modificada.
  4. Executa atualização atômica via `repository.updateWithFeatures`.
- **Exceções Disparadas (`AppError`):**
  - `400 Bad Request` - `BadRequestError ('Nenhum dado informado para atualização')`.
  - `409 Conflict` - `AppError ('Placa já cadastrada para outro veículo ativo', 409)`.
  - `404 Not Found` - `NotFoundError ('Veículo não encontrado')`.
- **Cenários Testados (Vitest):**
  - Recálculo de final de placa ao atualizar `full_license_plate`.
  - Substituição da lista de opcionais mantendo consistência.
- **Chamadas de Persistência:**
  - `repository.findByPlate(plate)`
  - `repository.updateWithFeatures(id, cleanData, featureIds)`

#### `findPublic(query: Record<string, unknown>): Promise<{ items: Record<string, unknown>[]; total: number; page: number; limit: number }>`
- **Responsabilidade:** Vitrine pública. Aplica sanitização de proteção de dados (LGPD) em cada item retornado.
- **Regras de Negócio & Fluxos:**
  1. Força a flag `publicOnly = true` (restringe a status ATIVO e RESERVADO).
  2. Executa busca paginada com `repository.findCatalog`.
  3. Mapeia todos os resultados através de `sanitizeVehicleForRole(item, 'PUBLICO')`, removendo custos de compra, placa integral e dados de proprietário.
- **Chamadas de Persistência:** `repository.findCatalog(filters)`

#### `findAdmin(query: Record<string, unknown>, role: string): Promise<{ ... }>`
- **Responsabilidade:** Listagem administrativa de veículos para operadores.
- **Regras de Negócio & Fluxos:**
  1. Define `publicOnly = false` para permitir visualizar todos os status (VENDIDO, INATIVO, etc.).
  2. Sanitiza os registros de acordo com a Role informada (`ADMIN` e `VENDEDOR` veem margens; `VISUALIZADOR` tem dados sensíveis ocultos).
- **Chamadas de Persistência:** `repository.findCatalog(filters)`

#### `findByIdPublic(id: string, ip: string, userAgent: string): Promise<Record<string, unknown>>`
- **Responsabilidade:** Exibe a página de detalhes para o consumidor final e computa métricas de audiência anti-fraude.
- **Regras de Negócio & Fluxos:**
  1. Busca o veículo detalhado com `findDetailedById(id, { publicOnly: true })`.
  2. Dispara 404 se não for localizado ou estiver inativo.
  3. **RN007: Métrica Anti-Fraude**: Verifica com `viewTracker.shouldIncrement(id, ip, userAgent)` se aquele IP/User-Agent já visualizou o veículo recentemente. Se liberado, dispara `incrementViewMetrics(id)`.
  4. Retorna a entidade sanitizada para o perfil público.
- **Exceções Disparadas (`AppError`):**
  - `404 Not Found` - `NotFoundError ('Veículo não encontrado')`.
- **Cenários Testados (Vitest):**
  - Incremento de visualização na primeira chamada.
  - Bloqueio de incremento em chamadas consecutivas do mesmo IP/User-Agent.
- **Chamadas de Persistência:**
  - `repository.findDetailedById(id, { publicOnly: true })`
  - `repository.incrementViewMetrics(id)`

#### `findByIdAdmin(id: string, role: string): Promise<Record<string, unknown>>`
- **Responsabilidade:** Detalhes gerenciais para o backoffice sem restrição de status público.
- **Chamadas de Persistência:** `repository.findDetailedById(id, { publicOnly: false })`

#### `comparePublic(ids: string[]): Promise<Record<string, unknown>[]>`
- **Responsabilidade:** Comparador de especificações veiculares (UC02).
- **Regras de Negócio & Fluxos:**
  1. Valida se a quantidade de veículos está entre 2 e 3 (`ids.length >= 2 && ids.length <= 3`).
  2. Busca os dados detalhados via `repository.findByIds(ids, { publicOnly: true })`.
  3. Sanitiza a saída para o público.
- **Exceções Disparadas (`AppError`):**
  - `400 Bad Request` - `BadRequestError ('O comparador exige no mínimo 2 e no máximo 3 veículos')`.
- **Chamadas de Persistência:** `repository.findByIds(ids, { publicOnly: true })`

---

### 2. Camada de Persistência (`VehicleRepository`)

#### `createWithFeatures(data: CreateVehicleData, featureIds: string[]): Promise<Vehicle>`
- **Operação Principal:** **Transação ACID Manual (`BEGIN` / `COMMIT` / `ROLLBACK`)**
- **Tabela(s) Afetada(s):** `vehicles`, `vehicle_features`.
- **Parâmetros SQL:**
  - Inserção em `vehicles`: Mapeamento dinâmico `$1..$n` via `buildInsertQuery`.
  - Inserção em `vehicle_features`: `$1 = vehicle.id`, `$2 = featureId`.
- **Comportamento da Query:**
  1. Inicia transação: `client.query('BEGIN')`.
  2. Insere o veículo e obtém a linha gerada (`RETURNING *`).
  3. Itera sobre o array `featureIds` executando:
     ```sql
     INSERT INTO vehicle_features (vehicle_id, feature_id) VALUES ($1, $2);
     ```
  4. Executa `COMMIT` e libera o cliente para o pool (`client.release()`).
  5. Em caso de erro, executa `ROLLBACK`.
- **Retorno TypeScript:** `Vehicle`.

#### `updateWithFeatures(id: string, data: Partial<CreateVehicleData>, featureIds?: string[]): Promise<Vehicle | null>`
- **Operação Principal:** **Transação ACID Manual (`BEGIN` / `COMMIT` / `ROLLBACK`)**
- **Tabela(s) Afetada(s):** `vehicles`, `vehicle_features`.
- **Parâmetros SQL:**
  - Atualização do veículo com `updated_at = NOW()`.
  - Limpeza de opcionais: `DELETE FROM vehicle_features WHERE vehicle_id = $1`.
  - Reinserção atômica de opcionais em loop.
- **Comportamento da Query:** Garante sincronização consistente entre os dados do veículo e sua lista de opcionais associados.
- **Retorno TypeScript:** `Vehicle | null`.

#### `findCatalog(filters: FindCatalogFilters): Promise<{ items: ...; total: number; page: number; limit: number }>`
- **Operação Principal:** `SELECT` com Agregações, Subqueries e Paginação.
- **Tabela(s) Afetada(s):**
  - `vehicles v`
  - `JOIN models m ON v.model_id = m.id`
  - `JOIN brands b ON m.brand_id = b.id`
  - Subquery em `vehicle_photos vp` para foto principal (`is_primary = true`).
  - Subquery em `vehicle_features vf` para filtro de múltiplos opcionais.
- **Parâmetros SQL Posicionais:** Gerados sequencialmente (`$1, $2, ...`):
  - `$n`: Status, Categoria, Marca, Modelo, Preços (`min_price`, `max_price`), Anos (`min_year`, `max_year`), etc.
  - `$n, $n+1`: Array de UUIDs e contagem exata no filtro `feature_ids`:
    ```sql
    v.id IN (
      SELECT vf.vehicle_id 
      FROM vehicle_features vf 
      WHERE vf.feature_id = ANY($1::uuid[]) 
      GROUP BY vf.vehicle_id 
      HAVING COUNT(DISTINCT vf.feature_id) = $2
    )
    ```
  - Últimos parâmetros: `LIMIT` e `OFFSET` para paginação calculada:
    `OFFSET = (page - 1) * limit`.
- **Regras SQL Especiais:**
  - **RN001 (Regra do Flex):**
    - Se `fuel_type === 'GASOLINA'`: Cláusula SQL `v.fuel_type IN ('GASOLINA', 'FLEX')`.
    - Se `fuel_type === 'ALCOOL'`: Cláusula SQL `v.fuel_type IN ('ALCOOL', 'FLEX')`.
- **Retorno TypeScript:**
  `{ items: (Vehicle & { brand_name: string; model_name: string; cover_photo_url: string | null })[]; total: number; page: number; limit: number }`.

#### `findDetailedById(id: string, options: { publicOnly?: boolean }): Promise<DetailedVehicle | null>`
- **Operação Principal:** `SELECT` com Múltiplas Consultas Relacionais.
- **Tabela(s) Afetada(s):** `vehicles`, `models`, `brands`, `vehicle_features`, `features`, `vehicle_photos`.
- **Parâmetros SQL:** `$1 = id`.
- **Comportamento da Query:**
  1. Busca o veículo com join em marca e modelo.
  2. Consulta os opcionais ordenados:
     ```sql
     SELECT f.id, f.name 
     FROM vehicle_features vf 
     JOIN features f ON vf.feature_id = f.id 
     WHERE vf.vehicle_id = $1 
     ORDER BY f.name ASC;
     ```
  3. Consulta a galeria de fotos ordenada por `display_order ASC`:
     ```sql
     SELECT id, thumb_path, full_path, display_order, is_primary 
     FROM vehicle_photos 
     WHERE vehicle_id = $1 
     ORDER BY display_order ASC;
     ```
  4. Agrega as entidades no objeto composto `DetailedVehicle`.
- **Retorno TypeScript:** `DetailedVehicle | null`.

#### `incrementViewMetrics(id: string): Promise<void>`
- **Operação Principal:** **Transação ACID com Upsert Relacional (`ON CONFLICT`)**
- **Tabela(s) Afetada(s):** `vehicles`, `vehicle_metrics`.
- **Parâmetros SQL:** `$1 = id`.
- **Comportamento da Query:**
  ```sql
  BEGIN;
  UPDATE vehicles SET total_views = total_views + 1 WHERE id = $1;

  INSERT INTO vehicle_metrics (vehicle_id, recorded_date, views_count)
  VALUES ($1, CURRENT_DATE, 1)
  ON CONFLICT (vehicle_id, recorded_date)
  DO UPDATE SET views_count = vehicle_metrics.views_count + 1;
  COMMIT;
  ```
- **Retorno TypeScript:** `Promise<void>`.

#### `findByPlate(plate: string): Promise<Vehicle | null>`
- **Operação Principal:** `SELECT`
- **Tabela(s) Afetada(s):** `vehicles`.
- **Parâmetros SQL:** `$1 = plate`.
- **Comportamento da Query:**
  ```sql
  SELECT * FROM vehicles WHERE full_license_plate = $1 AND deleted_at IS NULL LIMIT 1;
  ```
- **Retorno TypeScript:** `Vehicle | null`.

#### `delete(id: string): Promise<Vehicle | null>`
- **Operação Principal:** `UPDATE` (Soft Delete com Inativação de Status)
- **Tabela(s) Afetada(s):** `vehicles`.
- **Parâmetros SQL:** `$1 = id`.
- **Comportamento da Query:**
  ```sql
  UPDATE vehicles
  SET deleted_at = NOW(), status = 'INATIVO', updated_at = NOW()
  WHERE id = $1 AND deleted_at IS NULL
  RETURNING *;
  ```
- **Retorno TypeScript:** `Vehicle | null`.
