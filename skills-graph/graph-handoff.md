---
name: graph-handoff
description: HANDOFF phase — PR, memory capture, snapshots, export, doc completeness
trigger: /graph-handoff
tools_used: [agf memory write, agf snapshot create, agf export, agf gate handoff, agf check]
tokens: ~550
---

<!-- shared:phases,gates,principles,errors -->

# graph-handoff

Capture decisions, snapshot, export knowledge, create PR + docs — all via `agf`.

## When

- After REVIEW (code approved)
- Create PR for the sprint
- Capture knowledge for next cycles
- `_lifecycle.phase === HANDOFF`

## Flow

```
agf memory write → agf snapshot create → agf export → [create PR] → agf gate handoff → agf phase
```

## Steps

### 1. Capture Decisions

`agf memory write <name>` — architectural decisions, discovered patterns, errors + solutions.

### 2. Create Snapshot

`agf snapshot create` — current graph state (nodes, edges, status). Saved to `workflow-graph/memories/`.

### 3. Export Knowledge & Graph

`agf export` — RAG knowledge for cross-project sharing + mermaid/CSV views of final sprint state.

### 4. Create PR

Sprint commits → git push → open PR. Include sprint summary, completed tasks, metrics.

### 5. Documentation Audit

`agf gate handoff` — CLAUDE.md/AGENTS.md updated, README fresh, JSDoc coverage; doc completeness ok, snapshot + memories saved.

## Exit

- [ ] Memories saved via `agf memory write` (≥1 per relevant decision)
- [ ] Snapshot in `workflow-graph/memories/`
- [ ] PR created with sprint summary
- [ ] `agf gate handoff` → `agf phase`

Loop: gate pass → next: graph-deploy.

## Economy

Token economy is part of the loop: run `agf savings` / `agf metrics --economy-report` after each task, then feed savings → `agf learning` to calibrate the next turn (spiral, not circle).
