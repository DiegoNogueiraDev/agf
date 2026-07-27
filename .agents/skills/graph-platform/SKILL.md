---
name: graph-platform
description: Platform audit via the `agf` CLI — Web Vitals, a11y, and harness. Run during VALIDATE when the delivery has a UI/platform surface or before a frontend deploy.
triggers:
  - graph-platform
version: 2.0.0
author: auto-generated
date: 2026-06-16
category: VALIDATE
phase: VALIDATE
tokens: ~613
phases: [VALIDATE, DEPLOY]
---

# graph-platform

Platform audit — Web Vitals, a11y, harness. Drive via the `agf` CLI — zero MCP. Load context with `agf context <id>` first.

## When to Use

- Delivery has a UI/platform surface
- During VALIDATE
- Before a frontend deploy

## Mandatory Flow

```
agf harness → agf quality → agf insights phases → agf eval --suite platform
```

## Steps

VALIDATE-phase `agf` commands:

| Command                     | What it does                            |
| --------------------------- | --------------------------------------- |
| `agf harness`               | Agent-readiness (9 dimensions, A/B/C/D) |
| `agf quality`               | Gate 95/95 (tests + logs)               |
| `agf insights phases`       | Health per lifecycle phase              |
| `agf eval --suite platform` | Platform-scenario eval                  |

## Workflow

1. Harness Scan — `agf harness` (9 dims: type coverage, test coverage, architecture fitness, docs, naming, error handling, context density, provenance, connectivity)
2. Quality Gate — `agf quality` (95/95: tests + logs over src/)
3. Phase Health — `agf insights phases`
4. Web Vitals — measure LCP, FID, CLS (if UI)
5. Accessibility — WCAG 2.2 AA, ARIA labels, keyboard nav
6. Platform Eval — `agf eval --suite platform`
7. Bundle Analysis — N+1 queries, bundle size
8. Validate — no a11y/vitals regression, harness ≥ B

## Exit

- [ ] Harness ≥ B
- [ ] No a11y/vitals regression
- [ ] Platform eval pass

## Anti-Patterns

- Don't deploy with harness < B
- Don't ignore a11y regressions — accessibility is mandatory
- Don't skip Web Vitals on UI projects — perf is a feature
- Don't neglect bundle size — it drives LCP and CLS

## Output Format

```
Phase: PLATFORM (VALIDATE parallel)
Harness: score X (grade Y, ≥B required)
Quality: 95/95 — pass/fail
Web Vitals: LCP Xms, FID Yms, CLS Z
Accessibility: WCAG 2.2 AA — pass/fail
Bundle: size X KB, N+1 queries Y
Platform Eval: N scenarios pass
Status: Platform audit passed
```

## Loop Link

Runs parallel to VALIDATE → REVIEW. After tasks, `agf savings` / `agf metrics --economy-report` → `agf learning` → calibrate next turn.

## Related Skills

- $graph-validate — `agf skill show graph-validate`
- $graph-deploy — `agf skill show graph-deploy`

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
