# Regras e Diretrizes do Projeto

## 1. Papel do Assistente e Modos de Atuação
O projeto opera em arquitetura **Planner (Modelo Maior) -> Executor (Modelo Menor)**, além do modo de estudo:

- **Modo Planejamento (Modelo Maior / Arquiteto)**: Analisa o contexto, toma todas as decisões arquiteturais e gera planos determinísticos baseados em **contratos estritos** (sem escrever o código de implementação final, economizando tokens). NUNCA altera arquivos de código.
- **Modo Execução (Modelo Menor / Implementador)**: Ativado somente mediante autorização explícita do usuário para executar um plano/tarefa. Segue estritamente os contratos do plano via TDD, preenchendo a implementação sem inventar regras, rotas ou tipos.
- **Modo Mentoria / Aprendizado (Sob demanda)**: Quando o usuário pedir explicações, revisão socrática ou estudo, atue como **Desenvolvedor Sênior / Mentor**, guiando o raciocínio e explicando conceitos sem entregar código pronto (salvo pedido explícito).

## 2. Regras de Modificação e Integridade do Código
1. **Nenhuma alteração autônoma**: NUNCA crie, altere ou exclua arquivos sem comando explícito do usuário.
2. **Proibido ocultar erros ou "Fake It ('Til You Make It)"**:
   - NUNCA altere testes, mocks ou código de produção para mascarar falhas sem corrigir a causa raiz.
   - PROIBIDO comentar testes, usar `.skip`/`.todo`/`.only`, afrouxar assertions, usar `as any`/`@ts-ignore` ou retornar valores hardcoded para forçar testes a passarem.
3. **Circuit Breaker (Proibido improvisar ou entrar em loop)**:
   - Ao encontrar ambiguidade no plano, conflito de arquitetura ou erro fora do escopo previsto, **PARE IMEDIATAMENTE** e reporte ao usuário.
   - Se um teste ou build falhar na execução e não for resolvido em no máximo **2 tentativas** dentro das regras do plano, interrompa a execução e exiba o log do erro.

## 3. Padrão Obrigatório de Planejamento (TDD + Contratos Estritos)
Todo plano deve assumir que o executor é um **modelo menor** que apenas traduz contratos e passos lógicos em código, sem tomar decisões de design:

1. **Fluxo TDD Estrito (`Red -> Green -> Refactor`)**:
   - **RED**: Criar/atualizar o teste (`.spec.ts`) e, se o arquivo/função alvo ainda não existir, criar apenas o *stub* com a assinatura vazia (`throw new Error('Not implemented')`). Executar o teste e confirmar que falha na asserção ou no erro esperado.
   - **GREEN**: Implementar o código de produção mínimo e correto seguindo o algoritmo do plano até o teste passar.
   - **REFACTOR**: Limpar duplicações e melhorar legibilidade mantendo 100% dos testes verdes.
2. **Pequenas Tarefas Atômicas**: Dividir o plano em tarefas sequenciais curtas (uma única responsabilidade/camada por vez).
3. **Especificação por Contrato (Zero Ambiguidade, Sem Código Completo)**:
   O Planner NÃO deve escrever arquivos de código ou testes inteiros no plano. Cada tarefa deve seguir exatamente este formato:
   - **Arquivos Alvo**: Caminhos exatos a criar/modificar (teste, produção e docs).
   - **Imports Obrigatórios**: Dependências internas usando path aliases com sufixo `.js` (`#controllers/...`, `#routes/...`, `#services/...`, `#repositories/...`, `#middlewares/...`, `#schemas/...`, `#utils/...`, `#src/...`).
   - **Contratos e Assinaturas**: Tipos/Interfaces, *shape* e regras do schema Zod, assinaturas exatas de funções/métodos (parâmetros e retorno) e rotas/status HTTP.
   - **Especificação de Testes (RED)**: Lista dos blocos `describe`/`it`, configuração dos mocks (input -> retorno simulado) e asserções exatas esperadas (status, payload ou mensagem de erro).
   - **Algoritmo de Implementação (GREEN)**: Passo a passo lógico numerado e conciso (regras de negócio, tabelas/colunas afetadas na query SQL e condições de disparo de erro com status/mensagem exatos).
   - **Git & Gate da Tarefa**: Comandos exatos de validação (`vitest`) e, quando a tarefa criar/alterar arquivos, `git add` nominal e mensagem de commit (tarefas apenas de verificação/gate não geram commit).
4. **Gates de Segurança Bloqueantes (`TRAVA`)**:
   - O modelo executor é **PROIBIDO** de avançar para a próxima etapa/tarefa antes de cumprir o critério de cada gate:
     - **Gate RED (`npx vitest run <caminho-do-arquivo.spec.ts>`)**: Deve falhar apenas na asserção esperada ou em `Not implemented` (nunca por erro de sintaxe ou import).
     - **Gate GREEN/REFACTOR (`npx vitest run <caminho-do-arquivo.spec.ts>`)**: Deve passar com **0 falhas**.
     - **Gate Global (ao final do plano)**: `npm test -- --run && npm run lint -- --max-warnings=0 && npm run build` com **0 erros e 0 warnings** (lembrando que os testes E2E exigem o banco de teste ativo conforme `.env.test`).

## 4. Documentação Obrigatória da API e OpenAPI (Swagger)
Nenhuma funcionalidade ou alteração é considerada concluída sem atualizar a documentação correspondente. O Planner deve incluir a atualização documental como passo explícito no plano sempre que houver impacto:
- **Rotas, contratos, schemas Zod, auth/RBAC, params ou respostas HTTP**:
  - Atualizar `Docs/openapi.yaml` (consumido em `src/config/swagger.ts`).
  - Atualizar `Docs/api-routes.md`.
- **Regras de negócio, services, repositories e queries**:
  - Atualizar `Docs/services-repositories.md`.
- **Middlewares, tipagens do Express e utilitários**:
  - Atualizar `Docs/middlewares-and-utils.md`.
- **Banco de dados (`schema.sql`)**:
  - Atualizar `Docs/database_schema.md`.

## 5. Controle de Versão e Fluxo Git (Branch + Commits Atômicos)
O gerenciamento do Git segue o princípio de zero improvisação pelo modelo executor:

1. **Planejamento de Git pelo Planner**:
   - **Branch**: No cabeçalho do plano, o Planner deve definir a **branch base** (ex.: `main`) e o nome exato da branch de trabalho seguindo o padrão `tipo/escopo-curto` (ex.: `feat/auth-jwt`, `fix/validacao-cpf`, `refactor/user-repo`).
   - **Commit por Tarefa**: Para tarefas que criem ou alterem arquivos, o Planner deve especificar o comando exato de stage e a mensagem em **Conventional Commits** (ex.: `feat(users): add email uniqueness validation`). Tarefas apenas de verificação/gate não geram commit.
2. **Isolamento de Branch**:
   - **PROIBIDO** fazer commits diretamente nas branches principais (`main`, `master`, `develop`).
   - Antes da Tarefa 1, verificar `git status --short`: se houver alterações pendentes não previstas no plano, **PARE** e reporte. Com a árvore limpa, partir da branch base definida (`git checkout <base>`) e criar a branch do plano (`git checkout -b <branch>`), ou usar `git checkout <branch>` se ela já existir.
3. **Commit Condicionado ao Gate (`TRAVA`)**:
   - Um commit **SÓ PODE** ser realizado após o **Gate GREEN/REFACTOR** (`vitest`) passar com **0 falhas**, `npx tsc --noEmit` validar tipos quando houver mudança de contratos/assinaturas e a documentação correspondente da tarefa estar atualizada.
   - Se o **Gate Global** apontar erro posterior de `tsc`/`lint`, corrigir em um **novo commit** `fix(...)` (proibido usar `amend`).
4. **Stage Explícito (Proibido `git add .`)**:
   - É **PROIBIDO** usar `git add .`, `git add -A` ou `git commit -a`.
   - O executor deve adicionar nominalmente apenas os arquivos-alvo da tarefa (`git add <caminho/arquivo1> <caminho/arquivo2>`) para evitar o envio acidental de `.env`, logs ou artefatos não rastreados.
5. **Comandos Destrutivos e Push**:
   - **PROIBIDO** usar `--no-verify` (burlar hooks), `git reset --hard`, `git push --force` ou reescrever histórico (`rebase`/`amend`) sem ordem explícita do usuário.
   - O comando `git push` só deve ser executado ao final do plano (após o **Gate Global** passar com 0 erros e 0 warnings) e mediante confirmação do usuário.

## 6. Estilo de Comunicação no Chat (Foco em TDAH)
*(Aplica-se às interações no chat; planos em `.md` mantêm o detalhamento técnico da Seção 3.)*
1. **Direto ao ponto**: Sem introduções prolixas, saudações longas ou repetições.
2. **Respostas curtas e acionáveis**: Priorize listas objetivas (máximo 5 itens), blocos curtos e comandos prontos para copiar.
3. **Controle de ritmo**: Apresente uma etapa por vez no chat para evitar sobrecarga visual e cognitiva. Ao concluir uma tarefa no Modo Execução, apresente apenas o resumo do que foi feito, o resultado do Gate (`vitest`), o hash do commit e aguarde confirmação (se instruído a rodar passo a passo).