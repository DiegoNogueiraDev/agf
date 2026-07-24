---
name: graph-listening
description: LISTENING phase via the `agf` CLI — capture feedback, persist learning, seed the next cycle. Use post-deploy or for sprint retrospective.
triggers:
  - graph-listening
version: 2.0.0
author: auto-generated
date: 2026-06-16
category: LISTENING
phase: LISTENING
tokens: ~621
phases: [DEPLOY, ANALYZE]
---

# graph-listening

LISTENING phase: feedback, persisted learning, next-cycle seed. Drive everything via the `agf` CLI — zero MCP. Load context with `agf context <id>` before changing anything.

## When to Use

- Post-deploy
- Collecting signals for the next cycle
- Sprint retrospective

## Mandatory Flow

```
agf learning stats → agf insights → agf node add --type feedback → agf import-prd <new>
```

## Steps

LISTENING-phase `agf` commands:

| Command                        | What it does                            |
| ------------------------------ | --------------------------------------- |
| `agf learning stats`           | Per-agent performance + learned routing |
| `agf node add --type feedback` | Capture feedback as a traceable node    |
| `agf insights`                 | Backlog health (aging, distribution)    |
| `agf import-prd <new>`         | Open the next cycle from feedback       |

## Workflow

1. Learning Review — `agf learning stats` (per-agent perf, learned routing)
2. Backlog Health — `agf insights` (aging, distribution, health grade)
3. Capture Feedback — `agf node add --type feedback` (bugs, improvements, learnings)
4. DORA Retrospective — `agf forecast` (compare pre- vs post-deploy baseline)
5. Knowledge Cleanup — `agf search` + flag stale entries for prune
6. Seed Next Cycle — `agf import-prd <new>` (or `agf node add` for a new epic)

## Spiral Feedback

Close the loop before the next turn: `agf savings` / `agf metrics --economy-report` → `agf learning` → calibrate. This closes LISTENING and re-opens ANALYZE.

## Exit

- [ ] Post-deploy baseline saved
- [ ] Feedback captured as traceable nodes
- [ ] Next cycle seeded

## Anti-Patterns

- Don't lose feedback — always capture as traceable nodes
- Don't ignore learning metrics — they improve future routing
- Don't skip stale-knowledge cleanup — it degrades RAG quality
- Don't start a new cycle without a retrospective — learning is mandatory

## Output Format

```
Phase: LISTENING → ANALYZE (next cycle)
Feedback: N nodes captured
Learning: per-agent performance, routing insights
Backlog: health grade X, aging Y days
DORA: delta from baseline (pre vs post-deploy)
Knowledge: M stale entries flagged for prune
Next Cycle: seeded with new epic/requirement
Status: Listening complete
```

## Loop Link

LISTENING → ANALYZE: `agf import-prd <new>` then `$graph-analyze` opens the next cycle.

## Related Skills

- $graph-deploy — `agf skill show graph-deploy`
- $graph-analyze — `agf skill show graph-analyze`

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
