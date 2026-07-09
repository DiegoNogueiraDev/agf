---
name: graph-quality
description: Refactoring audit via the `agf` CLI — SOLID/DRY/McCabe + token economy. Run on code smells, accumulated debt, before closing REVIEW, or during VALIDATE gating.
triggers:
  - graph-quality
version: 2.0.0
author: auto-generated
date: 2026-06-16
category: REVIEW
phase: REVIEW
tokens: ~544
phases: [REVIEW, VALIDATE]
---

# graph-quality

Refactoring audit (SOLID/DRY/McCabe) + token economy. Drive via the `agf` CLI — zero MCP. Load context with `agf context <id>` first.

## When to Use

- Code smells or accumulated debt
- Before closing REVIEW
- During VALIDATE gating

## Mandatory Flow

```
agf harness --violations → agf quality → agf insights
```

## Steps

REVIEW-phase `agf` commands:

| Command                    | What it does                                 |
| -------------------------- | -------------------------------------------- |
| `agf quality`              | Gate 95/95 (tests + logs)                    |
| `agf harness --violations` | Violations per weak dimension                |
| `agf compress discover`    | Output-compression opportunities (token cut) |
| `agf insights`             | Complexity + duplication (McCabe, DRY)       |

## Workflow

1. Scan Violations — `agf harness --violations` (missing types, empty catches, console.log)
2. Quality Gate — `agf quality` (95/95: tests + logs over src/)
3. Complexity — `agf insights` (McCabe, duplication, naming)
4. Token Economy — `agf compress discover`
5. Address Issues — prioritize by harness-score impact
6. Re-scan — `agf harness` to confirm no regression

## Exit

- [ ] No new violations
- [ ] Weak dimensions addressed
- [ ] Quality gate 95/95 pass

## Anti-Patterns

- Don't ignore harness violations — they degrade agent readiness
- Don't refactor without tests — keep the suite green
- Don't optimize prematurely — fix dimensions <70 first

## Output Format

```
Phase: QUALITY (REVIEW parallel)
Violations: N found, M addressed
Quality Gate: 95/95 — pass/fail
Complexity: McCabe avg X, duplication Y%
Token Economy: Z opportunities
Harness: score X (no regression)
Status: Quality gate passed
```

## Loop Link

Parallel to REVIEW → HANDOFF. After tasks, `agf savings` / `agf metrics --economy-report` → `agf learning` → calibrate next turn.

## Related Skills

- $graph-review — `agf skill show graph-review`
- $graph-validate — `agf skill show graph-validate`

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
