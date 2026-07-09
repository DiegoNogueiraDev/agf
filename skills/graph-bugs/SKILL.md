---
name: graph-bugs
description: Bug discovery + structured fix (5-Whys) with regression test, driven by the `agf` CLI — zero MCP
triggers:
  - graph-bugs
version: 2.0.0
author: auto-generated
date: 2026-06-16
category: IMPLEMENT
phase: IMPLEMENT
tokens: ~594
phases: [IMPLEMENT]
---

# graph-bugs

Bug discovery + structured fix (5-Whys) with regression test. Drive via the `agf` CLI — **zero MCP**. Load context with `agf context <id>` before changing anything.

## When to Use

- Incorrect behavior observed
- Before implementing a fix
- Investigating a production incident

## Mandatory Flow

```
agf node add --type bug → agf start → [TDD: red repro → green fix] → agf done <id>
```

## Steps (IMPLEMENT phase)

| Command                   | Does                                       |
| ------------------------- | ------------------------------------------ |
| `agf node add --type bug` | register bug with repro AC                 |
| `agf start`               | pull bug + context + in_progress           |
| `agf check <id>`          | validate fix (regression test green first) |
| `agf done <id>`           | finish + root-cause memory                 |

## Workflow

1. **Register** — `agf node add --type bug` (repro AC: Given-When-Then)
2. **Start** — `agf start` (pull, context, in_progress)
3. **Reproduce** — write failing test (RED)
4. **5-Whys** — drill to root cause (5 levels)
5. **Fix** — minimal correction (GREEN)
6. **Regression** — test passes, nothing else breaks (REFACTOR)
7. **Check** — `agf check <id>` (DoD + TDD adherence)
8. **Done** — `agf done <id>` (DoD + root-cause memory + next)

## Exit

- [ ] Regression test green
- [ ] Root cause documented
- [ ] Bug node done with repro AC

## Output Format

```
Phase: BUGFIX (IMPLEMENT)
Bug: #N registered and fixed
Reproduction: RED → GREEN
5-Whys: root cause identified
Regression: all tests pass
Status: fixed and documented
```

> Loop link: delegate via `agf brief <id>` → fix → `agf submit <id> --result <json>` (validate→blast→DoD→done). Spiral: `agf savings` → `agf learning` → next.

## Anti-Patterns

- No fix without a repro test first — always RED before GREEN
- Don't stop at the symptom — reach the 5th why
- Don't mark done without documenting root cause
- Don't forget the regression test

## Related Skills

- $graph-implement — `agf skill show graph-implement`

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
