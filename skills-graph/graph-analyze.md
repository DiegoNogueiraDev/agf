---
name: graph-analyze
description: ANALYZE phase — PRD, requirements, Definition of Ready (7 checks), import into graph
trigger: /graph-analyze
tools_used: [import-prd, node, edge, gate, insights]
tokens: ~500
---

<!-- shared:phases,gates,dor,principles,errors -->

# graph-analyze

Lifecycle entry. Create PRD, define requirements, import into the exec graph via `agf`.

## When

- New project/feature — no graph nodes yet
- PRD exists, needs import
- `_lifecycle.phase === ANALYZE`
- After `$graph-prd` produced PRD.md

## Flow

```
agf insights → agf import-prd | agf node add → agf edge add → agf gate analyze → agf phase
```

## Steps

### 1. Bootstrap Knowledge (optional)

`agf insights` — learn prior-project patterns (errors, estimates, ADRs) + show current gaps.

### 2. Understand Scope

Collect: problem, target users, core features (MVP), NFRs, known constraints.

### 3. Import or Create PRD

- **Import:** `agf import-prd <file>` — parses .md/.txt/.pdf/.html → nodes + edges
- **From scratch:** `agf node add --type epic` per epic → `agf node add --type requirement` → `agf edge add <from> <to> --type relates_to`

### 4. Constraints

`agf node add --type constraint` — tech, budget, deadline, compliance.

### 5. Risks

`agf node add --type risk` — probability + impact + mitigation.

### 6. Validate Quality

`agf gate analyze` — PRD score ≥ 60.

### 7. Definition of Ready Gate

`agf gate analyze` — 7 checks. Fail → fix + re-run. Pass → DESIGN.

## Exit

- [ ] ≥1 epic or requirement in graph
- [ ] `agf gate analyze` all 7 checks pass
- [ ] `agf phase` run (advances to DESIGN)

Loop: gate pass → next: graph-design.

## Economy

Token economy is part of the loop: run `agf savings` / `agf metrics --economy-report` after each task, then feed savings → `agf learning` to calibrate the next turn (spiral, not circle).
