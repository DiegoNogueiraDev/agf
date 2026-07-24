---
name: graph-quality-assurance
description: Code quality audit using Clean Code (Uncle Bob), SOLID principles, DRY analysis, McCabe complexity, and project convention checks
triggers:
  - graph-quality-assurance
version: 1.1.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-quality-assurance

Code quality audit using Clean Code (Uncle Bob), SOLID principles, DRY analysis, McCabe cyclomatic complexity, and project convention checks. Produces a scored report across 7 quality dimensions.

> **Scope split**: `graph-quality-assurance` focuses on human-reviewable quality — readability, naming, conventions, review checklist. `graph-quality` focuses on automated metrics — SQALE score, duplication %, complexity distribution.

## When to Use

- After IMPLEMENT phase, before REVIEW phase
- During refactoring to measure improvement
- When code quality is a concern or technical debt is accumulating
- The user says "quality audit", "code review", "check quality", or "clean code"

## Mandatory Flow

```
lint → typecheck → code smells → SOLID → DRY → complexity → conventions → report → write_memory
```

## Workflow

### Step 1: Lint Gate

Run `npm run lint`. Verify zero errors, warnings ≤ 9 threshold, no new violations.
Score: 100 baseline, -10 per error, -2 per warning over threshold.

### Step 2: Type Safety Gate

Run `npm run typecheck`. Verify zero TypeScript errors, no `@ts-ignore` without approval, no `any` in production.
Score: 100 baseline, -5 per error, -10 per `any` in production code.

### Step 3: Code Smells Detection

Analyze modified/new files for common code smells:

| Smell               | Threshold                                             | Severity |
| ------------------- | ----------------------------------------------------- | -------- |
| Long functions      | > 50 lines                                            | High     |
| Deep nesting        | > 3 levels                                            | High     |
| God classes         | > 300 lines                                           | High     |
| Feature envy        | Method uses more data from another class than its own | Medium   |
| Data clumps         | Same group of params repeated in 3+ functions         | Medium   |
| Primitive obsession | Using primitives instead of domain types              | Low      |
| Dead code           | Unused exports, unreachable branches                  | Medium   |
| Commented-out code  | Code blocks in comments                               | Low      |

Score: 100 baseline, -5 per low, -10 per medium, -15 per high smell found.

#### Smell Priority Matrix

Not all smells are equal. Prioritize by cost:

| Priority                  | Smells                                               | Action                                                        |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| **Fix immediately**       | Long functions, deep nesting, dead code, god classes | Block merge if new; fix before next sprint if existing        |
| **Fix in current sprint** | Feature envy, data clumps, commented-out code        | Address in same PR or follow-up within sprint                 |
| **Accept or defer**       | Primitive obsession, magic numbers in tests          | Track as low-priority debt; revisit during refactoring cycles |

Trigger: if a "fix immediately" smell appears in code written _this session_, it must be resolved before writing the quality report.

### Step 4: SOLID Principles Check

Evaluate modified modules against SOLID:

| Principle                     | Check                                    | How to Verify                                                     |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| **S** — Single Responsibility | One reason to change per module          | Count distinct responsibilities; flag if > 1                      |
| **O** — Open/Closed           | Extend via composition, not modification | Check for switch/if chains that grow with new types               |
| **L** — Liskov Substitution   | Subtypes substitutable for base types    | Verify interface implementations don't throw unexpected errors    |
| **I** — Interface Segregation | No fat interfaces                        | Flag interfaces with > 7 methods or unused method implementations |
| **D** — Dependency Inversion  | Depend on abstractions, not concretions  | Check for direct instantiation of dependencies vs injection       |

Score: 20 points per principle adhered to (100 max). -10 per violation found.

### Step 5: DRY Analysis

Scan modified files for identical/near-identical blocks (> 5 lines), copy-paste candidates, and string literals repeated > 3 times without constants.
Score: 100 if no duplication, -10 per duplicated block, -5 per repeated literal.

### Step 6: Complexity Gate

Count decision points (`if`, `else if`, `case`, `while`, `for`, `&&`, `||`, `catch`, `?:`) per function:

| Range | Rating    | Action                 |
| ----- | --------- | ---------------------- |
| 1-5   | Low       | No action              |
| 6-10  | Moderate  | Monitor                |
| 11-20 | High      | Flagged — simplify     |
| > 20  | Very High | Required decomposition |

Score: 100 if all ≤ 10, -5 per function 11-20, -15 per function > 20.

### Step 7: Convention Compliance

**Auto-enforced (linter/formatter catches these — do not spend review time here):**

| Convention   | Rule                               |
| ------------ | ---------------------------------- |
| Formatting   | Prettier / eslint --fix            |
| Import order | ESLint import plugin               |
| File naming  | Kebab-case enforced by linter rule |

**Manual-check (human review required):**

| Convention      | Rule            | Check                                                                    |
| --------------- | --------------- | ------------------------------------------------------------------------ |
| Type naming     | PascalCase      | `GraphNode`, `NodeStatus`                                                |
| Function naming | camelCase       | `findNextTask()`, `buildTaskContext()`                                   |
| Zod imports     | From `'zod/v4'` | Never from `'zod'`                                                       |
| Exports         | Named only      | No `export default`                                                      |
| Logging         | Project logger  | No `console.log` in production code                                      |
| Errors          | Typed errors    | No raw `throw "string"` or `throw new Error("msg")` without custom class |

> **Principle (SWE@Google ch8):** Rules that can be automatically checked must be automatically checked. Human review time is too expensive to spend on formatting debates.

Score: 100 baseline, -5 per manual-check violation (auto-enforced items are not scored here — the linter gate handles them).

### Step 8: Code Review Checklist

Apply the four-pillar review before marking work complete. From [[swe-at-google]] ch9:

| Pillar            | Questions to Answer                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Correctness**   | Does the code do what it claims? Are edge cases handled? Are errors propagated, not swallowed?                             |
| **Tests**         | Do tests exist for every new behavior? Do they fail when the code is wrong? Are they testing behavior, not implementation? |
| **Design**        | Is the change self-contained? Could it be smaller? Does it introduce a layering violation?                                 |
| **Documentation** | Can a new team member understand this in 5 minutes? Are public APIs commented? Are non-obvious decisions explained inline? |

> **Readability standard (SWE@Google readability program):** Three-question test before approving:
>
> 1. Would a new team member understand what this module does without asking the author?
> 2. Would they know where to add the next piece of related logic?
> 3. Would they understand _why_ this approach was chosen over the alternatives?
>
> If any answer is "no," request clarification or restructuring — not just a comment.

### Step 9: Quality Report

Calculate overall score and grade:

| Dimension   | Weight | Score |
| ----------- | ------ | ----- |
| Lint        | 15%    | 0-100 |
| Type Safety | 15%    | 0-100 |
| Code Smells | 15%    | 0-100 |
| SOLID       | 15%    | 0-100 |
| DRY         | 10%    | 0-100 |
| Complexity  | 15%    | 0-100 |
| Conventions | 15%    | 0-100 |

**Grades:** A (85-100), B (70-84), C (55-69), D (40-54), F (< 40).

Score it with the deterministic gates before writing any prose — a grade you measured beats a grade you argued:

```bash
agf harness --violations --select data.breakdown   # 9 dims: types tests fitness docs naming errors context provenance connectivity
agf lint-files                                     # 800-line ceiling; exit 1 on violation
agf quality                                        # 95/95 gate
agf memory write quality-audit-<date> --content "<scores per dimension, overall grade, top issues>"
```

## Anti-Patterns

- Do NOT ignore lint warnings — they indicate real issues that compound over time
- Do NOT use `@ts-ignore` without explicit user approval — fix the type error instead
- Do NOT skip typecheck — type safety is a core project requirement
- Do NOT add `console.log` — use the project logger from `src/core/utils/logger.ts`
- Do NOT create functions > 50 lines without decomposing — extract helpers
- Do NOT use `any` type — use `unknown` with type guards or proper generics
- Do NOT skip convention checks for "quick fixes" — conventions prevent accumulated tech debt
- Do NOT debate formatting in review — auto-enforce it and spend human time on design and correctness

## Cross-References

- [[swe-at-google]] — ch8 (style guides as laws), ch9 (four review pillars, readability program)
- [[pragmatic-programmer]] — Broken Window Theory (ch1), DRY taxonomy (ch2), Ubiquitous Automation (ch8)
- [[fowler-refactoring]] — Smell catalog (ch3), Two Hats discipline, Design Stamina Hypothesis

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
