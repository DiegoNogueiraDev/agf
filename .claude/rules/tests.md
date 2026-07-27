<!-- MCP-GRAPH:MANAGED-START:tests-rules -->

## Gates de Teste Hierárquicos

Rodar a suite completa por task gera 25+ min de espera por épico (5 tasks × 5 min).
O modelo hierárquico distribui o custo proporcionalmente ao risco:

| Gate      | Comando              | Trigger                                  | Runtime |
| --------- | -------------------- | ---------------------------------------- | ------- |
| **Task**  | `npm run test:blast` | `agf done <id>` (cada task)              | <60s    |
| **Épico** | `npm run test:node`  | `agf done <id>` com epic promotion ready | ~3 min  |
| **PR**    | `npm test`           | Antes de `git push` / criar PR           | varia   |

**Tiers de desenvolvimento:**

| Tier        | Comando                                   | Quando usar                    | Runtime |
| ----------- | ----------------------------------------- | ------------------------------ | ------- |
| 0 — Arquivo | `npx vitest run src/tests/<file>.test.ts` | Durante RED/GREEN TDD          | <2s     |
| 0 — Smoke   | `npm run test:smoke`                      | Sanity check rápido (opcional) | <30s    |
| 1 — Blast   | `npm run test:blast`                      | Gate finish_task               | <60s    |
| 2 — Node    | `npm run test:node`                       | Gate épico                     | ~3 min  |
| 3 — Full    | `npm test`                                | Gate pré-PR                    | varia   |

**Regras invioláveis:**

- Blast obrigatório no gate `agf done <id>` — nunca pular.
- Node obrigatório quando `agf done <id>` passar com epic promotion ready.
- Full obrigatório pré-PR — uma vez por branch, antes de push.
- Smoke é opcional e complementar — nunca suficiente como único gate.

### Como `test:blast` funciona

`vitest run --changed HEAD --project=node` usa o **graph de módulos do Vite** para encontrar
todos os testes transitivamente afetados pelos arquivos não-comitados. Uma mudança em
`gateway.ts` encontra `llm-failover-gateway.test.ts` automaticamente, mesmo sem
importação direta.

## Scripts para package.json

Adicione se ainda não estiverem presentes:

```json
"test:blast":      "vitest run --changed HEAD --project=node",
"test:blast:full": "vitest run --changed HEAD",
"test:node":       "vitest run --project=node",
"test:smoke":      "vitest run --config vitest.smoke.config.ts",
"test:clear":      "vitest --clearCache"
```

## Smoke Suite

Crie `src/tests/smoke/` e adicione symlinks para os testes mais rápidos de caminho crítico:

```bash
mkdir -p src/tests/smoke
ln -sf ../cache-key.test.ts src/tests/smoke/cache-key.test.ts
ln -sf ../next.test.ts src/tests/smoke/next.test.ts
# ... adicionar conforme os testes do projeto
```

Critério de entrada no smoke: puro (sem I/O pesado), <5s por arquivo, cobre caminho crítico.

## Economy Gate (cost regression)

```bash
npm run economy:gate
# → agf eval --suite economy --gate
# Fails with exit 1 when cost_regression > 10% vs baseline.
```

**Quando rodar:** antes de merge de PRs que tocam providers, tier-router, economy levers,
ou eval scenarios. Não é gate por task — é gate pré-PR opcional mas recomendado para o
3° pilar (token-custo).

**Setup da suíte:** coloque cenários em `evals/suite/economy/<cenário>/scenario.json`.
Para criar o baseline: `agf eval --suite economy` (sem `--gate`) na primeira execução.

<!-- MCP-GRAPH:MANAGED-END:tests-rules -->
