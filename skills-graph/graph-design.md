---
name: graph-design
description: DESIGN phase — C4 model, ADRs, fitness functions, layer enforcement, drift detection
trigger: /graph-design
tools_used: [node, edge, insights, gate, export, context]
tokens: ~700
---

<!-- shared:phases,gates,principles,errors,harness -->

# graph-design

Architecture + ADRs + C4. Define tech structure, validate fitness functions via `agf`.

## When

- After ANALYZE (PRD imported, requirements set)
- Architectural decisions for a new feature
- `_lifecycle.phase === DESIGN`

## Flow

```
agf context <id> → agf node add (decision) → agf edge add → agf insights → agf gate design → agf phase
```

## Steps

### 1. Load Context

`agf context <id>` — compact context + RAG for the task/epic.

### 2. C4 Model

Context (external actors + systems), Container (apps, DBs, services), Component (internal modules). `agf export` for mermaid view.

### 3. ADR Lifecycle

`agf node add --type decision` per decision. Fields: Status (Proposed/Accepted/Deprecated), Context, Decision, Consequences. `agf insights` for ADR quality scoring.

### 4. Fitness Functions

| Function               | CLI                                |
| ---------------------- | ---------------------------------- |
| No circular deps       | `agf insights`                     |
| Layer isolation        | core/ must not import mcp/ or cli/ |
| Coupling score         | `agf insights`                     |
| Interface completeness | `agf insights`                     |

### 5. Layer Boundary

Enforce `schemas/` ← `core/` ← `mcp/` ← `cli/`. Flag cross-layer imports via grep.

### 6. Drift Detection

Current code vs documented architecture. `agf insights` for staleness (code sync).

### 7. Contract Coverage

`agf insights` — endpoints, types, interfaces documented.

### 8. Design Ready Gate

`agf gate design` — ADRs created, interfaces defined, coupling + harness ≥ 55.

## Exit

- [ ] ≥1 ADR (decision node) in graph
- [ ] C4 diagrams (context + container min)
- [ ] 0 circular deps, 0 layer violations
- [ ] `agf gate design` pass → `agf phase` (PLAN)

Loop: gate pass → next: graph-plan.

## Economy

Token economy is part of the loop: run `agf savings` / `agf metrics --economy-report` after each task, then feed savings → `agf learning` to calibrate the next turn (spiral, not circle).
