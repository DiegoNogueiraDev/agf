---
name: kanban-orchestrator
description: Kanban board orchestration with WIP limits, auto-suggestions, bottleneck detection, and flow metrics. Deterministic-first, 100% local. Cross-cutting skill, any lifecycle phase.
triggers:
  - kanban-orchestrator
  - kanban
version: 1.0.0
author: Diego Nogueira
date: 2026-04-10
---

# kanban-orchestrator

Turn the execution graph into a Kanban board with deterministic orchestration — all decisions via graph traversal, no LLM calls. Drive via the `agf` CLI — zero MCP.

## When to Use

- Visualizing progress as a Kanban board
- Managing WIP limits
- Identifying bottlenecks and blocked tasks
- Smart next-action suggestions
- Flow metrics (throughput, cycle time, lead time)
- Any lifecycle phase (cross-cutting)

## CLI Usage

### View the Board

```bash
agf kanban
agf kanban --swimlane          # group by epic/sprint
```

### Move a Card (status transition)

```bash
agf node status <id> ready
agf node status <id> in_progress
agf node status <id> done
```

### Suggestions / Next Action

```bash
agf next        # pull next unblocked task (WIP=1)
agf insights    # bottlenecks, WIP, aging
```

## Methodology

### WIP Limits (Little's Law)

- `cycle_time = WIP / throughput` — lower WIP = faster delivery
- Project default WIP=1; `agf insights wip` warns on violation

### Pull System

- Use `agf next` (or board suggestions) to pull the next task
- Never push to in_progress without finishing current work

### Bottleneck-First (TOC)

- If Blocked grows, stop adding work; resolve blockers first
- Auto-detected when blocked >30% of total (`agf insights bottlenecks`)

### Suggestion Types

| Action           | Trigger                         | Priority   |
| ---------------- | ------------------------------- | ---------- |
| unblock          | blocked task, all deps resolved | 1 (urgent) |
| wip_violation    | column exceeds WIP limit        | 1 (urgent) |
| bottleneck_alert | >30% blocked                    | 1 (urgent) |
| promote_ready    | backlog task, all deps done     | 2 (normal) |
| start_next       | recommended next task           | 3 (low)    |

### Flow Metrics (`agf insights` / `agf kanban`)

- Throughput — total done
- Avg Cycle Time — creation → completion
- Avg Lead Time — first status change → done
- Blocked % — currently blocked
- WIP Violations — columns over limit

## Integration with Other Skills

- **graph-implement** — `agf kanban` before `agf start` for the big picture
- **graph-validate** — check `agf kanban` metrics after validation
- **graph-review** — `agf export` board state for handoff
- **graph-plan** — `agf kanban --swimlane` (by sprint) during planning

## Why Deterministic-First

| Aspect               | LLM-heavy      | agf Kanban                     |
| -------------------- | -------------- | ------------------------------ |
| Orchestration        | expensive      | deterministic (free)           |
| Persistence          | context window | SQLite graph (permanent)       |
| Visualization        | none native    | `agf kanban` ASCII / dashboard |
| WIP control          | none           | built-in limits + alerts       |
| Bottleneck detection | manual         | automatic                      |

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
