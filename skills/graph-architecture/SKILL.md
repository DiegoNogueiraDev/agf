---
name: graph-architecture
description: Architecture governance — C4 Model, ADR lifecycle, fitness functions, layer-boundary enforcement, drift detection via the `agf` CLI
triggers:
  - graph-architecture
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-architecture

Architecture governance: C4 (Context/Container/Component/Code), ADR lifecycle, fitness functions, layer-boundary enforcement, drift detection. Keeps documented architecture aligned with the codebase. Drive via the `agf` CLI (zero MCP).

## When to Use

- DESIGN phase for new features
- Quarterly architecture reviews
- Coupling degradation / before major refactors
- Onboarding to understand structure

## Mandatory Flow

```
C4 context → container → component → ADR inventory → fitness functions → layer boundaries → drift → report → agf memory write
```

## Workflow

### Step 1: C4 Context

Map external boundaries: users (devs, AI agents), external systems (GitHub, SQLite), the system itself. Generate mermaid via `agf export --format mermaid`. Document who uses it, external deps, data in/out.

### Step 2: C4 Container

Map internal containers (CLI, TUI, Store, Knowledge Store, Code Intelligence). Per container: technology, responsibility, protocol. Verify they match `src/` (`cli/`, `tui/`, `core/store/`, `core/code/`).

### Step 3: C4 Component

Per container, map components: `parser/`, `importer/`, `planner/`, `context/`, `rag/`, `search/`, `insights/`. Verify boundaries (`core/` never imports `cli/`). Use `agf code impact <file>` for real dependency analysis.

### Step 4: ADR Inventory & Lifecycle

```bash
agf adr list
agf query --type decision
```

Verify each ADR has Status (Proposed/Accepted/Deprecated/Superseded), Context, Decision, Consequences. Flag stale ADRs.

### Step 5: Fitness Functions

| Function               | Tool                     | Checks                               |
| ---------------------- | ------------------------ | ------------------------------------ |
| No circular deps       | `agf gaps`               | acyclic dependency graph             |
| Layer isolation        | grep imports             | `core/` doesn't import `cli/`/`tui/` |
| Coupling               | `agf code impact <file>` | coupling within thresholds           |
| Interface completeness | `agf gaps`               | public contracts fully typed         |

Score each pass/fail.

### Step 6: Layer Boundary Enforcement

Dependency direction: `schemas/` ← `core/` ← `cli/`/`tui/`. Grep for cross-boundary imports in the wrong direction. Flag core importing cli, schemas importing core, cli holding business logic. Cross-ref CLAUDE.md.

### Step 7: Drift Detection

Compare codebase with documented architecture (C4, ADRs). Detect new modules absent from diagrams, deprecated-but-used modules, shifted responsibilities, undocumented external deps. Use `agf insights` for staleness signals.

### Step 8: Report

Score per dimension (C4 completeness, ADR quality, fitness, layer compliance, drift). Regenerate C4 mermaid. List debt.

```bash
agf memory write architecture-review-<date>
```

## Output Format

```
Phase: ARCHITECTURE GOVERNANCE
C4: Context (N actors/systems), Container (N), Component (N)
ADRs: N total (N accepted, N deprecated, N stale); quality N/100
Fitness: N/N passed  Layer violations: N  Drift: N  Debt: N
Health: A-F
Saved: "Architecture Review — <date>"
```

> Loop link → PLAN (graph-plan): `agf decompose` once design is stable.

## Anti-Patterns

- Document architecture continuously — it drifts
- Don't skip C4 Context — it defines boundaries
- No ADR without Consequences — trade-offs matter
- Don't ignore layer violations — they compound
- Don't skip fitness functions — they catch drift early
- Review ADRs quarterly; document what exists, not what you wish existed

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
