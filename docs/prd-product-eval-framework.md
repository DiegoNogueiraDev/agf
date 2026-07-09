# PRD: Product-Relevant Evaluation Framework

## 5W2H

| W/H          | Resposta                                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**     | Sistema de avaliação que mede a capacidade do agente em operar o próprio produto (agent-graph-flow), não apenas escrever funções JS isoladas                                                                                  |
| **Why**      | Benchmark atual (30+ modelos, T0-T5) testa "consegue escrever isEven()?" — problema genérico que qualquer LLM resolve. Precisamos saber se o agente consegue usar ferramentas MCP do grafo, orquestrar pipelines e seguir TDD |
| **Who**      | Desenvolvedores que usam agent-graph-flow como agente SWE autônomo                                                                                                                                                            |
| **When**     | Agora — benchmark atual tem 1 dado de full-suite (20% resolve) e conclusões estatisticamente insignificantes (n=5, sem repeats)                                                                                               |
| **Where**    | Evals rodam via CLI `agf eval`, reportam no grafo e no CI                                                                                                                                                                     |
| **How**      | Cenários que testam graph CRUD, analyze modes, delivery pipeline, TDD cycle, guardian. Fix oracles existentes. Conectar ao golden dataset                                                                                     |
| **How Much** | 3 sprints (~3 semanas), ~12 tasks atômicas                                                                                                                                                                                    |

## JTBD (Jobs To Be Done)

1. **"Quando tenho um novo modelo de LLM, quero saber se ele consegue operar meu agente SWE de verdade, não só escrever funções isoladas"**
2. **"Quando mudo o system prompt ou workflow, quero detectar regressão nas capacidades core do produto"**
3. **"Quando escolho um modelo default, quero basear a decisão em dados estatisticamente significativos"**
4. **"Quando implemento uma feature nova, quero que o eval cubra ela automaticamente"**
5. **"Quando o autopilot marca done mas testes falham, quero detectar esse falso-positivo"**

## MoSCoW

### Must Have (MVP)

- M1: Cenário eval de graph CRUD (add_node + edge + analyze)
- M2: Cenário eval de delivery pipeline (import PRD → decompose → implement)
- M3: Fix oracle bugs (T3 arg order, T5 result.ok, T3 orphan file)
- M4: Repetir benchmark top-3 com cenários reais (n≥3 runs)

### Should Have

- S1: Cenário de TDD cycle compliance (agente deve escrever teste antes do código)
- S2: Conectar scenario runner ao golden dataset (eval_golden / eval_run)
- S3: CI integration (`npm run eval` no pipeline)
- S4: Relatório comparativo com confidence intervals

### Could Have

- C1: Cenário de guardian/security (tool call review, policy enforcement)
- C2: Cenário de multi-agent parallelism (delegate, WIP gate)
- C3: Dashboard HTML de resultados históricos
- C4: Medição de token efficiency por cenário

### Won't Have (agora)

- W1: Eval de TUI Ink (requer CDP browser)
- W2: Eval de LSP/code intelligence
- W3: Eval de MCP server externo

## INVEST Acceptance Criteria

| AC                                     | INVEST Score | Critério                                                                          |
| -------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| AC1: Graph CRUD scenario exists        | 85           | Cenário testa add_node + edge + analyze + update_status — 4 operações mensuráveis |
| AC2: Delivery pipeline scenario exists | 82           | Cenário testa import PRD → decompose → implement → done — pipeline completo       |
| AC3: Oracle bugs fixed                 | 90           | T3 arg order corrigido, T5 result.ok adicionado, T3 orphan file removido          |
| AC4: Top-3 re-benchmarked              | 75           | 3 modelos × 2 cenários reais × 3 repeats cada = 18 runs, com CI reportado         |
| AC5: TDD compliance scenario           | 80           | Agente deve criar teste .test.ts antes de implementar; oracle verifica ordem      |
| AC6: Golden dataset connected          | 70           | Scenario runner persiste resultados em eval_run; RAG pode consultar histórico     |

## Gherkin Scenarios

```gherkin
Feature: Graph CRUD Eval
  Scenario: Agent creates and reads graph nodes
    Given a clean workspace with agent-graph-flow
    When the agent runs "add_node type:task title:teste"
    And the agent runs "analyze mode:progress"
    Then the graph should contain a node titled "teste"
    And the analyze output should include the new node

Feature: Delivery Pipeline Eval
  Scenario: Agent executes full delivery pipeline
    Given a clean workspace
    When the agent receives a PRD for "create a task list"
    Then the agent should import the PRD
    And decompose into at least 2 subtasks
    And implement at least 1 subtask with TDD
    And mark the task as done

Feature: TDD Compliance
  Scenario: Agent writes test before implementation
    Given an acceptance criterion
    When the agent starts implementation
    Then the first file created must be a .test.ts file
    And the test must fail before implementation exists
```

## Risks

| Risco                                               | Probabilidade | Impacto | Mitigação                                          |
| --------------------------------------------------- | ------------- | ------- | -------------------------------------------------- |
| Cenários muito complexos para qualquer LLM resolver | Alta          | Médio   | Começar com M1-M2 (simples), depois evolui         |
| Oracle tests flaky (tempo, ordem de execução)       | Média         | Alto    | Usar seed determinístico, isolamento por test file |
| Manutenção de cenários não escala                   | Média         | Médio   | Template para novos cenários, CI gate              |
| Autopilot false-positive distorce resultados        | Alta          | Alto    | Debug do autopilot antes de benchmark sério        |

## Constraints

- Cenários devem rodar em ≤5 min cada (via OpenRouter)
- Seeds devem ser auto-contidos (sem depender de estado externo)
- Oracle tests usam `node --test` (padrão do projeto)
- Workspaces efêmeros (in-memory SQLite + temp dir)
- Versão Node ≥ 20 (match projeto)
- XP Size: cada task ≤ 2h (atômica)

## Definition of Ready Checklist

- [x] ≥1 epic definido
- [x] ≥1 acceptance criteria node
- [x] Sem orphans (requirements linkados)
- [x] Sem cycles de dependência
- [x] ≥1 constraint node
- [x] ≥1 risk node
- [x] PRD quality score ≥ 60
