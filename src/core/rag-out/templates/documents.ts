/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * The three scaffolds whose output is prose. A PRD, a lifecycle skill, and the shape of a
 * repository — all of them documents an agent writes over and over, and all of them structure it
 * should never write twice.
 *
 * The PRD skeleton is import-ready on purpose: `agf import-prd` reads `### Task:` headings and the
 * `Acceptance criteria:` block beneath them. A template that produces a document the graph cannot
 * ingest saves tokens and costs a step.
 */

/** `templates/prd_v2.md` — a PRD the graph can ingest without a human rewriting its headings. */
export const PRD_SOFTWARE = `# PRD: {{nome}}

## Contexto

{{problema}}

Escreva o problema antes da solução. Um PRD que abre com a solução esconde a alternativa que
ninguém considerou.

## Riscos

{{riscos[]}} — um por linha, cada um com o sinal que o confirmaria. Um risco sem gatilho de
verificação é uma preocupação, não um risco.

## Métricas

{{metricas[]}} — um número por linha, medido, com o valor de hoje ao lado do alvo. "Melhorar a
latência" não é métrica; "p95 de 800ms para menos de 200ms" é.

## Epic: {{nome}}

{{fases[]}} — uma seção por fase. Dentro de cada uma, tasks atômicas no formato abaixo.

### Task: <verbo no infinitivo> <objeto>

Uma frase sobre o efeito desejado, não sobre a implementação.

Acceptance criteria:
- Dado <estado inicial>, quando <ação>, então <resultado observável com número ou booleano>
- <um critério por linha; se não dá para escrever um teste a partir dele, não é critério>
`

/** `templates/skill.md` — a lifecycle skill: command-agnostic, with the why, never a command catalogue. */
export const SKILL_LIFECYCLE = `---
name: {{skillName}}
description: {{whenToUse}}
---

# {{skillName}}

## When to use

{{whenToUse}}

Say when NOT to use it as well, and name the sibling skill that covers that case. A skill that
never declines is a skill the model reaches for by default.

## Entry

\`{{entryCommand}}\`

## Phase

{{phase}}

## Flow

{{steps[]}} — one numbered step per entry. Each step says *why*, then *what*. Never hardcode a
command catalogue: commands drift, and the agent retrieves them (\`agf retrieve-command\`) or reads
\`--help\`. What belongs here is the judgement a command cannot carry.

## Never

- Mark work done without the gate that proves it.
- Recover a shape that does not fit; generating is cheaper than unpicking.

## Related

{{relatedSkills[]}} — one per line, with the situation that hands over to it.
`

/** `templates/repo-structure.md` — the file an agent reads first, and the only one it must trust. */
export const REPO_STRUCTURE = `# {{projectName}}

Stack: {{stack}}

## Commands

{{commands[]}} — one per line: the command, then what it proves. A command whose failure means
nothing is a command nobody runs.

## Layout

\`\`\`
src/
├── core/     # domain logic; imports nothing from cli/ or web/
├── cli/      # one file per command; no logic that core could hold
└── tests/    # mirrors the source tree; the filename stem matches its module
\`\`\`

The dependency arrow points inward, always. A core module that imports a command is a core module
you cannot test.

## Conventions

{{conventions[]}} — one per line, each with the reason it exists. A convention without a reason is
a convention the next person deletes, and they will be right to.

## Definition of Done

- The behaviour is proven by a test that failed before the change.
- The value is shown in the mode the consumer actually uses, not in isolation.
- Loose ends are filed, not carried.
`
