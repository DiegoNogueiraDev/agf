---
name: graph-analyze
description: Execute the ANALYZE phase of the lifecycle via the `agf` CLI — PRD creation, requirements, Definition of Ready (7 checks), cross-project learning
triggers:
  - graph-analyze
version: 2.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-analyze

ANALYZE phase via the `agf` CLI (zero MCP). Creates the PRD, defines requirements, imports them into the graph. Entry point of the 9-phase lifecycle.

## When to Use

- Starting a project/feature from scratch
- Defining requirements for a new epic
- Importing an existing PRD
- `agf phase` reports `ANALYZE`

## Mandatory Flow

```
[agf search] → agf import-prd <file> / agf node add → agf edge add → agf gate analyze → agf phase design
```

## Workflow

### Step 0: Bootstrap Knowledge (optional)

```bash
agf search "<errors | estimates | adrs | patterns>"
agf memory read <name>
```

### Step 1: Understand Scope

Gather: problem statement, target users, MVP features, NFRs, constraints.

### Step 2: Create or Import PRD

Import: `agf import-prd <file>`

Or write `prd.md` (vision, problem, objectives, architecture, functional + non-functional requirements, risks) then `agf import-prd prd.md`.

### Step 3: Structure Requirements as Nodes

```bash
agf node add --type requirement
agf node add --type epic
```

### Step 4: Create Edges

```bash
agf edge add <from> <to> --type <rel>
```

Types: `requirement→epic`, `epic→milestone`, `requirement→requirement`.

### Step 5: Risk & Constraint Analysis

```bash
agf node add --type risk
agf node add --type constraint
```

Link risks to the requirements/epics they affect.

### Step 6: Save Key Decisions

```bash
agf memory write <name>
```

### Step 7-8: Validate — Definition of Ready (7 checks)

```bash
agf gate analyze
```

| #   | Check                                      |
| --- | ------------------------------------------ |
| 1   | `has_requirements` — ≥1 epic/requirement   |
| 2   | `has_acceptance_criteria` — tasks/AC exist |
| 3   | `no_orphans`                               |
| 4   | `no_cycles`                                |
| 5   | `has_constraints` — ≥1                     |
| 6   | `has_risks` — ≥1                           |
| 7   | `prd_quality_score` ≥ 60                   |

On failure, fix and re-run.

### Step 9: Transition

```bash
agf phase design
```

Follow the CLI's next-action hint.

## Output Format

```
Phase: ANALYZE → DESIGN
PRD: imported (N reqs, M epics, K risks, J constraints)
Gate: prd_quality N/100; ready 7/7
Status: Ready for DESIGN
```

> Loop link → DESIGN (graph-design): `agf context <epic>` to start ADRs.

## Anti-Patterns

- No coding in ANALYZE — requirements only
- No task-level nodes yet — that's PLAN
- Don't skip risk/constraint analysis — informs DESIGN
- Don't ignore the CLI next-action hint
- Use `agf node add` to create nodes

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
