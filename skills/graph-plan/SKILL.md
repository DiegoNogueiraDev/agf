---
name: graph-plan
description: Execute the PLAN phase of the lifecycle via the `agf` CLI — smart decompose, sprint planning, DORA-based estimation, cross-project learning
triggers:
  - graph-plan
version: 2.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-plan

PLAN phase via the `agf` CLI (zero MCP). Decomposes epics into atomic tasks (auto or manual), plans sprints, maps dependencies, and estimates with DORA metrics.

## When to Use

- After DESIGN is complete (ADRs, architecture defined)
- Breaking epics into implementable tasks
- Planning sprint scope and priorities
- `agf phase` reports `PLAN`

## Mandatory Flow

```
agf context <id> → agf decompose / agf node add → agf edge add → agf forecast → agf insights → agf phase implement
```

## Workflow

### Step 1: Load Context

```bash
agf context <epic_id>
agf search "<epic title + decisions>"
```

Review ADRs, requirements, architecture from DESIGN.

### Step 2: Cross-Project Estimates (optional)

```bash
agf search "estimates patterns"
```

Use historical velocity to improve estimates.

### Step 3: Decompose Epics

**Option A — Smart Decompose (recommended):**

```bash
agf decompose <epic_id>
```

Auto-creates subtasks: 1 AC = 1 subtask, with test-type inference:

| Keywords in AC                                       | Test type   |
| ---------------------------------------------------- | ----------- |
| api, endpoint, database, persists, sync, fetch, http | integration |
| page, click, browser, redirect, ui, form, button     | e2e         |
| else                                                 | unit        |

**Option B — Manual:**

```bash
agf node add --type task
agf node add --type subtask
```

**Atomic rules (XP Anti-Vibe):** each task ≤2h · clear testable AC · XP size (XS–XL) · prefer many small over few large.

### Step 4: Map Dependencies

```bash
agf edge add <from> <to> --type <rel>
```

Edge types: `task→task`, `subtask→task`, `task→epic`, `task→decision`.

### Step 5: Plan Sprint

```bash
agf decompose
```

Assign by priority, dependencies, size, risk (tackle risky items early).

### Step 6: Sync Stack Docs

Refresh stack API docs in the knowledge base before IMPLEMENT so the executor has accurate references. Recommended.

### Step 7: DORA Metrics

```bash
agf forecast
```

Use velocity (deploy frequency, lead time) to calibrate sprint capacity.

### Step 8: Sprint Health

```bash
agf insights
```

Score the plan: balanced load, no oversized tasks, deps resolved.

### Step 9: Validate Readiness

```bash
agf gate plan
```

**Gate:** all epics decomposed · tasks have AC · deps mapped (no cycles) · sprint assignments exist · no oversized tasks (>L without subtasks).

### Step 10: Transition

```bash
agf phase implement
```

Follow the next-action hint from the `agf` CLI.

## Output Format

```
Phase: PLAN → IMPLEMENT
Tasks: N tasks, M subtasks (K via agf decompose)
Sprints: J planned
Dependencies: D edges
DORA: velocity X tasks/day, lead time P85 Yh
Gate: ready — score N/100, grade X
Status: Ready for IMPLEMENT
```

## Loop Link

PLAN → IMPLEMENT: `agf phase implement` then `agf start` ($graph-implement) pulls the first task with TDD.

## Anti-Patterns

- Don't write code during PLAN — planning only
- Don't create tasks >2h — use `agf decompose` or decompose manually
- Don't skip AC — they drive TDD in IMPLEMENT
- Don't ignore dependencies — they set execution order
- Don't plan everything at once — 1–2 sprints ahead, refine later
- Don't ignore the next-action hint
- Don't skip refreshing stack docs — prevents executor hallucination

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
