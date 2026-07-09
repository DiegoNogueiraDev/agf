---
name: harness-engineering
description: Evaluate project harnessability — composite agent-readiness across type coverage, test coverage, architecture fitness, and docs coverage. Run during VALIDATE and REVIEW.
triggers:
  - harness-engineering
  - harnessability
  - harness:scan
version: 1.0.0
author: Diego Nogueira
date: 2026-04-12
phases:
  - VALIDATE
  - REVIEW
---

# harness-engineering

Evaluates **harnessability** — a composite 4-dimension metric for how ready the codebase is to be operated by an AI coding agent. Based on "Harness Engineering for Coding Agent Users" (Böckeler, Thoughtworks 2026). Drive via the `agf` CLI — zero MCP.

Full guide: [docs/guides/HARNESS-ENGINEERING.md](../docs/guides/HARNESS-ENGINEERING.md)

## When to Use

- VALIDATE — before marking a sprint/epic done, confirm agent-readiness didn't regress
- REVIEW — include the score in the blast-radius report
- New modules — verify type coverage + docs
- After large refactors — fitness functions catch dependency-direction violations
- Periodic health check — track trend across releases

## Score Dimensions

| Dimension            | Weight | Description                                                              |
| -------------------- | ------ | ------------------------------------------------------------------------ |
| Type coverage        | 30%    | % public functions/classes with explicit TS types                        |
| Test coverage        | 30%    | Structural module→test file match (proximity, not % lines)               |
| Architecture fitness | 20%    | 3 rules: dependency direction, no circular deps, barrel export integrity |
| Docs coverage        | 20%    | % public symbols with JSDoc + README/guides present                      |

**Formula:** `score = types×0.30 + tests×0.30 + fitness×0.20 + docs×0.20`

## Grade Scale

| Grade | Score | Recommendation                                        |
| ----- | ----- | ----------------------------------------------------- |
| A     | ≥85   | Agent-ready. Maintain.                                |
| B     | ≥70   | Mostly ready. Review lowest dimension (usually docs). |
| C     | ≥55   | Usable but agent friction. Fix weakest dimension.     |
| D     | <55   | Urgent refactor before reliable agent operation.      |

## How to Use

### 1. Scan

```bash
agf harness        # or: npm run harness:scan
```

Output: grade + score + per-dimension breakdown + issues. Use `agf harness --violations` to list violations.

### 2. Interpret

**Type coverage <70%:** add return types to public functions; annotate exported interfaces; `tsc --noEmit` passes.

**Test coverage <70%:** create `src/tests/<module>.test.ts` for uncovered modules (even stubs count — metric is file proximity); TDD (Red→Green→Refactor).

**Architecture fitness <100%:** `core/` must not import `cli/`/`mcp/`/`api/`/`web/`; `index.ts` barrels re-export all siblings; break circular deps via interface abstraction.

**Docs coverage <70%:** JSDoc on exported symbols; module `README.md`; user docs in `docs/guides/`.

### 3. Act

```
A → no action; log in sprint review
B → open issue for lowest dimension; fix next sprint
C → block ship until ≥1 dimension improves
D → escalate; refactor before new features
```

### 4. VALIDATE Gate

During `agf gate` (validate readiness), check the score: ≥70 (B) passes the harness gate; <70 flags a risk before REVIEW.

## Anti-Patterns

- Don't ship a D-grade — agent operations will be unreliable
- Don't fake test files — structural scan checks real test proximity
- Don't skip fitness functions — dependency violations compound
- Don't treat type coverage as optional — strict mode + explicit types are the foundation of agent observability

## Loop Link

VALIDATE/REVIEW gate. Pass (≥B) → proceed to next phase. After tasks, `agf savings` / `agf metrics --economy-report` → `agf learning` → calibrate next turn.

## Related

- Full guide: `docs/guides/HARNESS-ENGINEERING.md`
- Scan runner: `scripts/harness-scan-run.js`
- Implementation: `src/core/harness/`
- npm script: `harness:scan`

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
