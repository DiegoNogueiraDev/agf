---
name: graph-listening
description: LISTENING phase — DORA retrospective, CFD, knowledge gaps, cross-project learning, next cycle
trigger: /graph-listening
tools_used: [agf forecast, agf insights, agf metrics, agf node add, agf memory write, agf phase]
tokens: ~550
---

<!-- shared:phases,gates,principles,errors -->

# graph-listening

Data-driven retrospective, gap analysis, feedback collection, next-cycle seeding — all via `agf`.

## When

- After DEPLOY (release live)
- Collect feedback on shipped features
- Sprint retrospective
- `_lifecycle.phase === LISTENING`

## Flow

```
agf forecast → agf insights → agf metrics → [feedback] → agf node add → agf memory write → agf phase
```

## Steps

### 1. DORA Retrospective

`agf forecast` — sprint vs prior baseline; trends (better/worse/flat).

### 2. Cumulative Flow Diagram

`agf insights` — WIP accumulation, bottlenecks (where tasks pile up).

### 3. Knowledge Gap Analysis

`agf insights` — RAG categories under-represented; areas needing more data for future context.

### 4. Sprint Metrics

`agf metrics` — throughput, cycle time, lead time, flow efficiency. Target: flow efficiency > 40%.

### 5. Collect Feedback

New nodes: bugs → `agf node add --type task`, feature requests → `agf node add --type epic`, tech debt → `agf node add --type task`.

### 6. Cross-Project Learning

`agf insights` — import patterns, estimates, errors from similar projects.

### 7. Backlog Health

`agf insights` — stale tasks (>30d), oversized without subtasks, blocked without action.

### 8. Next Cycle Seed

`agf memory write <name>` — save insights for next ANALYZE. `agf phase` — restart lifecycle.

## Exit

- [ ] DORA retrospective documented (`agf memory write`)
- [ ] CFD analyzed — bottlenecks identified
- [ ] Feedback collected as nodes (bugs, features, debt)
- [ ] `agf phase` — next cycle ready

Loop: cycle seeded → next: graph-analyze.

## Economy

Token economy is part of the loop: run `agf savings` / `agf metrics --economy-report` after each task, then feed savings → `agf learning` to calibrate the next turn (spiral, not circle).
