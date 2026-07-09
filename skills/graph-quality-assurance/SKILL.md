---
name: graph-quality-assurance
description: Code quality audit — Clean Code, SOLID, DRY, McCabe complexity, and project conventions. Scored across 7 dimensions. Run after IMPLEMENT (before REVIEW), during refactoring, or on rising tech debt.
triggers:
  - graph-quality-assurance
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-quality-assurance

Code quality audit — Clean Code (Uncle Bob), SOLID, DRY, McCabe cyclomatic complexity, and project conventions. Scored report across 7 dimensions. Drive via the `agf` CLI — zero MCP.

## When to Use

- After IMPLEMENT, before REVIEW
- During refactoring, to measure improvement
- When quality is a concern or tech debt is rising
- User says "quality audit", "code review", "check quality", "clean code"

## Mandatory Flow

```
lint → typecheck → code smells → SOLID → DRY → complexity → conventions → report → agf memory write
```

## Workflow

### Step 1: Lint Gate

```bash
npm run lint
```

Zero errors; warnings within threshold (9); no new violations. Score: 100 if clean, -10/error, -2/warning over threshold.

### Step 2: Type Safety

```bash
npm run typecheck
```

Zero TS errors; no `@ts-ignore`/`@ts-expect-error` without approval; no `any` in prod. Score: 100, -5/error, -10/`any` in prod.

### Step 3: Code Smells

| Smell               | Threshold                               | Severity |
| ------------------- | --------------------------------------- | -------- |
| Long functions      | >50 lines                               | High     |
| Deep nesting        | >3 levels                               | High     |
| God classes         | >300 lines                              | High     |
| Feature envy        | uses another class's data more than own | Medium   |
| Data clumps         | same params in 3+ functions             | Medium   |
| Primitive obsession | primitives over domain types            | Low      |
| Dead code           | unused exports, unreachable             | Medium   |
| Commented-out code  | code in comments                        | Low      |

Score: 100 baseline, -5/low, -10/medium, -15/high.

### Step 4: SOLID

| Principle                 | Verify                                         |
| ------------------------- | ---------------------------------------------- |
| S — Single Responsibility | flag if >1 distinct responsibility             |
| O — Open/Closed           | flag switch/if chains that grow with new types |
| L — Liskov                | implementations don't throw unexpected errors  |
| I — Interface Segregation | flag interfaces >7 methods or unused impls     |
| D — Dependency Inversion  | injection over direct instantiation            |

Score: 20/principle (100 max), -10/violation.

### Step 5: DRY

Identical/near-identical blocks (>5 lines) across files; copy-paste extraction candidates; repeatable patterns for generics/HOFs; string literals repeated >3× without constants. Score: 100, -10/block, -5/literal.

### Step 6: Complexity (McCabe)

| Complexity | Rating    | Action            |
| ---------- | --------- | ----------------- |
| 1–5        | Low       | none              |
| 6–10       | Moderate  | monitor           |
| 11–20      | High      | flagged, simplify |
| >20        | Very High | required refactor |

Decision points: `if`, `else if`, `case`, `while`, `for`, `&&`, `||`, `catch`, `?:`. Score: 100 if all ≤10, -5/(11–20), -15/(>20).

### Step 7: Conventions (CLAUDE.md)

| Convention      | Rule                             |
| --------------- | -------------------------------- |
| File naming     | kebab-case (`graph-store.ts`)    |
| Type naming     | PascalCase (`GraphNode`)         |
| Function naming | camelCase (`findNextTask()`)     |
| Imports         | ESM with `.js`                   |
| Zod             | from `'zod/v4'`                  |
| Exports         | named only, no default           |
| Logging         | project logger, no `console.log` |
| Errors          | typed, no raw `throw "string"`   |

Score: 100 baseline, -5/violation.

### Step 8: Report

| Dimension   | Weight |
| ----------- | ------ |
| Lint        | 15%    |
| Type Safety | 15%    |
| Code Smells | 15%    |
| SOLID       | 15%    |
| DRY         | 10%    |
| Complexity  | 15%    |
| Conventions | 15%    |

**Grades:** A (85–100), B (70–84), C (55–69), D (40–54), F (<40).

Save: `agf memory write "quality-audit-<date>" --content <report>` (scores per dimension, grade, top issues, recommendations).

## Output Format

```
Phase: QUALITY ASSURANCE
Lint:        /100 (N errors, N warnings)
Type Safety: /100 (N errors, N any)
Code Smells: /100 (N high, N med, N low)
SOLID:       /100 (N violations)
DRY:         /100 (N duplications)
Complexity:  /100 (N >10, N >20)
Conventions: /100 (N violations)
Overall: /100 — Grade X
Top Issues: <top 3>
Recommendations: N items
Saved: "quality-audit-<date>"
```

## Anti-Patterns

- Don't ignore lint warnings — they compound
- Don't use `@ts-ignore` without approval — fix the type
- Don't skip typecheck — type safety is core
- Don't add `console.log` — use `src/core/utils/logger.ts`
- Don't write functions >50 lines — extract helpers
- Don't use `any` — use `unknown` + guards or generics
- Don't skip convention checks for "quick fixes"

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
