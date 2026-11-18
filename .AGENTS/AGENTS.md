# Regras Específicas — Backend API (`back-end-site-garagem`)

> **Herança Obrigatória**: Este repositório estende as @[Regras Globais do Workspace](../../.agents/AGENTS.md). Todas as diretrizes de papel do assistente (Planner -> Executor / Mentoria), integridade de código, Circuit Breaker, TDD estrito (`Red -> Green -> Refactor`), isolamento Git (`git -C back-end-site-garagem`) e comunicação focada em TDAH definidas no arquivo global aplicam-se integralmente aqui.

## 1. Especificação Técnica e Convenções do Backend (Extensão da Seção 3 Global)
Nos planos e implementações de tarefas dentro de `back-end-site-garagem`, seguir obrigatoriamente:

- **Arquivos de Teste**: Utilizar o sufixo `.spec.ts` (unitários e integração/E2E com Supertest).
- **Imports Obrigatórios (Path Aliases + ESM)**:
  - Dependências internas devem usar os *path aliases* com sufixo `.js`:
    `#controllers/...`, `#routes/...`, `#services/...`, `#repositories/...`, `#middlewares/...`, `#schemas/...`, `#utils/...`, `#src/...`.
- **Contratos e Assinaturas**:
  - Tipos/Interfaces TypeScript, *shape* e regras dos schemas **Zod**, assinaturas exatas de funções/métodos (parâmetros e retorno) e rotas Express 5 / códigos de status HTTP.
- **Especificação de Testes (RED)**:
  - Lista dos blocos `describe`/`it` (incluindo regressão para `fix/...`), configuração dos mocks (input -> retorno simulado) e asserções exatas de status HTTP, payload ou mensagem de erro.
- **Algoritmo de Implementação (GREEN)**:
  - Passo a passo lógico contendo regras de negócio, isolamento Multi-Tenant/Multi-Store (`tenant_id` / `store_id`), tabelas/colunas afetadas na query SQL e condições de disparo de erro com status e mensagem exatos.

## 2. Comandos de Gates no Backend (Extensão da Seção 3.4 Global)
*(Executados dentro de `back-end-site-garagem`)*

- **Gate RED**:
  `npx vitest run <caminho-do-arquivo.spec.ts>`
  *(Deve falhar apenas na asserção esperada ou em `Not implemented`, nunca por erro de sintaxe ou import).*
- **Gate GREEN/REFACTOR**:
  `npx vitest run <caminho-do-arquivo.spec.ts>` (com **0 falhas**) + `npx tsc --noEmit` quando houver mudança de contratos/assinaturas.
- **Gate Global (ao final do plano)**:
  `npm test -- --run && npm run lint -- --max-warnings=0 && npm run build` com **0 erros e 0 warnings** *(os testes E2E exigem o banco de teste ativo conforme `.env.test`)*.

## 3. Documentação Obrigatória da API e OpenAPI (Extensão da Seção 4 Global)
O repositório `back-end-site-garagem` é o dono físico da pasta `Docs/`. O Planner deve incluir como passo explícito no plano a atualização dos seguintes arquivos sempre que houver impacto:

- **Rotas, contratos, schemas Zod, auth/RBAC, params ou respostas HTTP**:
  - Atualizar `Docs/openapi.yaml` (consumido em `src/config/swagger.ts` e fonte de tipos para `@garagem/sdk`).
  - Atualizar `Docs/api-routes.md`.
- **Regras de negócio, services, repositories e queries**:
  - Atualizar `Docs/services-repositories.md`.
- **Middlewares, tipagens do Express e utilitários**:
  - Atualizar `Docs/middlewares-and-utils.md`.
- **Banco de dados (`schema.sql`)**:
  - Atualizar `Docs/database_schema.md`.
