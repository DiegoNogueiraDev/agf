---
name: graph-plan
description: PLAN phase — decompose epics into atomic tasks, sprint planning, DORA estimation
trigger: /graph-plan
tools_used: [context, insights, node, edge, decompose, forecast]
tokens: ~550
---

<!-- shared:phases,gates,principles,errors -->

# graph-plan

Decompose epics → atomic tasks, plan sprints, prep for IMPLEMENT via `agf`.

## When

- After DESIGN (ADRs + architecture ready)
- Epic with no child tasks
- `_lifecycle.phase === PLAN`

## Flow

```
agf context <id> → agf insights → agf decompose | agf node add → agf edge add → agf forecast → agf phase
```

## Steps

### 1. Load Context

`agf context <id>` + `agf insights` (cross-project patterns, estimates).

### 2. Decompose Epics → Tasks

- **Auto:** `agf decompose` — detects large epics, generates atomic tasks (≤2h each)
- **Manual:** `agf node add --type task --parent <epicId>` with xpSize, AC

### 3. Map Dependencies

`agf edge add <from> <to> --type depends_on` — sequential tasks, technical blockers.

### 4. Plan Sprint

`agf decompose` — group by priority, enforce WIP=1, detect oversized (L/XL without subtasks).

### 5. Estimate with DORA

`agf forecast` — lead time, cycle time, throughput estimates.

### 6. Sync Docs

Update AGENTS.md, CLAUDE.md, copilot-instructions.md with the plan (manual — no CLI).

### 7. Validate

`agf insights` — coverage, dependencies, sizing (sprint health).

## Exit

- [ ] Every epic has ≥1 child task
- [ ] Tasks atomic (≤2h, size S/M)
- [ ] Dependencies mapped, no cycles
- [ ] `agf insights` (sprint health) ok → `agf phase` (IMPLEMENT)

Loop: sprint health ok → next: graph-implement.

## Economy

Token economy is part of the loop: run `agf savings` / `agf metrics --economy-report` after each task, then feed savings → `agf learning` to calibrate the next turn (spiral, not circle).
