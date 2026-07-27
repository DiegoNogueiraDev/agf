/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Registers .claude/rules/tests.md as an AtomicFile so that `mcp-graph init`
 * and `mcp-graph update` propagate the three-tier test execution model to
 * every project using mcp-graph.
 *
 * Call registerTestsRules(projectDir) inside runInit(dir) before runAtomicWrites().
 */

import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { registerAtomicFile } from '../atomic-files/registry.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'tests-rules/tests-rules-atomic.ts' })

const TESTS_RULES_CONTENT = `## Gates de Teste Hierárquicos

Rodar a suite completa por task gera 25+ min de espera por épico (5 tasks × 5 min).
O modelo hierárquico distribui o custo proporcionalmente ao risco:

| Gate | Comando | Trigger | Runtime |
|------|---------|---------|---------|
| **Task** | \`npm run test:blast\` | \`finish_task\` (cada task) | <60s |
| **Épico** | \`npm run test:node\` | \`epicPromotion.readyToPromote: true\` | ~3 min |
| **PR** | \`npm test\` | Antes de \`git push\` / criar PR | varia |

**Tiers de desenvolvimento:**

| Tier | Comando | Quando usar | Runtime |
|------|---------|-------------|---------|
| 0 — Arquivo | \`npx vitest run src/tests/<file>.test.ts\` | Durante RED/GREEN TDD | <2s |
| 0 — Smoke | \`npm run test:smoke\` | Sanity check rápido (opcional) | <30s |
| 1 — Blast | \`npm run test:blast\` | Gate finish_task | <60s |
| 2 — Node | \`npm run test:node\` | Gate épico | ~3 min |
| 3 — Full | \`npm test\` | Gate pré-PR | varia |

**Regras invioláveis:**
- Blast obrigatório no gate \`finish_task\` — nunca pular.
- Node obrigatório quando \`finish_task\` retornar \`epicPromotion.readyToPromote: true\`.
- Full obrigatório pré-PR — uma vez por branch, antes de push.
- Smoke é opcional e complementar — nunca suficiente como único gate.

### Como \`test:blast\` funciona

\`vitest run --changed HEAD --project=node\` usa o **graph de módulos do Vite** para encontrar
todos os testes transitivamente afetados pelos arquivos não-comitados. Uma mudança em
\`gateway.ts\` encontra \`llm-failover-gateway.test.ts\` automaticamente, mesmo sem
importação direta.

## Scripts para package.json

Adicione se ainda não estiverem presentes:

\`\`\`json
"test:blast":      "vitest run --changed HEAD --project=node",
"test:blast:full": "vitest run --changed HEAD",
"test:node":       "vitest run --project=node",
"test:smoke":      "vitest run --config vitest.smoke.config.ts",
"test:clear":      "vitest --clearCache"
\`\`\`

## Smoke Suite

Crie \`src/tests/smoke/\` e adicione symlinks para os testes mais rápidos de caminho crítico:

\`\`\`bash
mkdir -p src/tests/smoke
ln -sf ../cache-key.test.ts src/tests/smoke/cache-key.test.ts
ln -sf ../next.test.ts src/tests/smoke/next.test.ts
# ... adicionar conforme os testes do projeto
\`\`\`

Critério de entrada no smoke: puro (sem I/O pesado), <5s por arquivo, cobre caminho crítico.`

/** Registers .claude/rules/tests.md in the AtomicFile markdown registry.
 *  Must be called inside runInit(projectDir) before runAtomicWrites(). */
export function registerTestsRules(projectDir: string): void {
  mkdirSync(join(projectDir, '.claude', 'rules'), { recursive: true })
  try {
    registerAtomicFile({
      fileId: 'tests-rules',
      path: join(projectDir, '.claude', 'rules', 'tests.md'),
      format: 'markdown',
      managedContent: TESTS_RULES_CONTENT,
    })
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== 'duplicate_file_id') throw err
  }
}
