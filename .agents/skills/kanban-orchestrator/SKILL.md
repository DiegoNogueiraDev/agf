---
name: kanban-orchestrator
description: Kanban board orchestration with WIP limits, auto-suggestions, bottleneck detection, and flow metrics. Deterministic-first approach inspired by Anthropic Agent Teams but 100% local-first.
triggers:
  - kanban-orchestrator
  - kanban
version: 1.0.0
author: Diego Nogueira
date: 2026-04-10
---

# kanban-orchestrator

Transform the mcp-graph execution graph into a visual Kanban board with intelligent orchestration. Deterministic-first: all decisions are made via graph traversal, no LLM calls needed.

## When to Use

- Visualizing project progress as a Kanban board
- Managing WIP (Work In Progress) limits
- Identifying bottlenecks and blocked tasks
- Getting smart suggestions for next actions
- Tracking flow metrics (throughput, cycle time, lead time)
- During any lifecycle phase (cross-cutting skill)

## CLI Usage — zero MCP

### View the Kanban Board

```bash
agf kanban                           # status columns, WIP, flow metrics
agf kanban --swimlane epic           # group the lanes
agf kanban --swimlane sprint
agf kanban --sprint <id>             # narrow the board to one sprint's cards
```

### Move a Card

A move is a status transition, and `status_flow` validates it — an illegal move is refused, not logged:

```bash
agf kanban validate-move <id> <status>   # dry-run: unresolved deps, WIP overflow (advisory)
agf node status <id> in_progress         # then commit the move
agf done <id>                            # done goes through the DoD gate, never a raw status write
```

### Get Suggestions

```bash
agf kanban --suggestions --select data.suggestions   # auto-promote, unblock, WIP/bottleneck, next task
```

### Read the Flow

The board shows state; `agf insights` explains it:

```bash
agf insights wip           # WIP count and alert
agf insights bottlenecks   # where the queue accumulates (TOC: fix the bottleneck first)
agf insights flow          # flow_on vs flow_off verdict
agf insights summary       # cycle time, lead time, throughput
```

## Dashboard

The **Kanban** tab in the dashboard provides:

- 5 status columns: Backlog, Ready, In Progress, Blocked, Done
- Drag-and-drop cards between columns
- WIP limit indicators (red when exceeded)
- Swimlane grouping by Epic or Sprint
- Suggestions sidebar with auto-apply
- Flow metrics bar (throughput, cycle time, blocked %)

## Methodology

### WIP Limits (Little's Law)

- Default: In Progress = 3, Ready = 10
- `cycle_time = WIP / throughput` — lower WIP = faster delivery
- Visual warning when limits are exceeded

### Pull System

- Use `next` tool or Kanban suggestions to pull the next task
- Never push tasks to In Progress without finishing current work

### Bottleneck-First (Theory of Constraints)

- If Blocked column is growing, stop adding new work
- Focus on resolving blockers before starting new tasks
- Automated detection when blocked > 30% of total tasks

### Suggestion Types

| Action             | Trigger                             | Priority   |
| ------------------ | ----------------------------------- | ---------- |
| `unblock`          | Blocked task with all deps resolved | 1 (urgent) |
| `wip_violation`    | Column exceeds WIP limit            | 1 (urgent) |
| `bottleneck_alert` | >30% tasks blocked                  | 1 (urgent) |
| `promote_ready`    | Backlog task with all deps done     | 2 (normal) |
| `start_next`       | Recommended next task               | 3 (low)    |

### Flow Metrics

- **Throughput**: Total done tasks
- **Avg Cycle Time**: Average hours from creation to completion
- **Avg Lead Time**: Average hours from first status change to done
- **Blocked %**: Percentage of tasks currently blocked
- **WIP Violations**: Count of columns exceeding limits

## Integration with Other Skills

- **graph-implement**: Use `kanban(action: "board")` before `start_task` to see the big picture
- **graph-validate**: Check Kanban metrics after validation phase
- **graph-review**: Export Kanban state for review handoff
- **graph-plan**: Use swimlane view by sprint during planning

## Comparison with Anthropic Agent Teams

| Aspect               | Anthropic             | mcp-graph Kanban           |
| -------------------- | --------------------- | -------------------------- |
| Orchestration        | LLM-heavy (expensive) | Deterministic-first (free) |
| Persistence          | Context window        | SQLite graph (permanent)   |
| Visualization        | None native           | Dashboard + ASCII          |
| WIP control          | None                  | Built-in limits + alerts   |
| Bottleneck detection | Manual                | Automatic                  |

## Codex Notes

- In Codex Plan Mode, use this skill for planning only and do not mutate files.
- During implementation, follow the project `AGENTS.md` rules and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

O board é lido muito mais vezes do que é escrito, e cada leitura completa custa
o envelope inteiro. Peça só a coluna que você vai usar.

- `agf … --select data.<caminho>` — projeta o envelope antes de ele chegar ao
  contexto. Ler o board inteiro para descobrir uma contagem é o desperdício mais
  comum desta skill.
- `agf retrieve-command "<intenção>"` — recupera o comando exato a partir da
  intenção, em vez de fixar um catálogo de comandos no contexto.
- `agf exec chain "cmd1; cmd2"` — encadeia num único round-trip quando você
  precisa de várias leituras; N envelopes viram um.

Reuse antes de criar: um card que já existe não precisa ser redescrito.
