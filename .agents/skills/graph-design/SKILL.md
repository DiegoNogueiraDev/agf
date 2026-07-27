---
name: graph-design
description: Execute the DESIGN phase of the lifecycle via the `agf` CLI — ADRs, architecture decisions, contract coverage, Code Intelligence impact analysis
triggers:
  - graph-design
version: 2.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-design

DESIGN phase via the `agf` CLI (zero MCP). Defines architecture, creates ADRs, validates contract coverage before planning.

## When to Use

- After ANALYZE (PRD imported, requirements defined)
- Making architectural decisions
- Documenting technical choices (ADRs)
- `agf phase` reports `DESIGN`

## Mandatory Flow

```
agf context <id> → agf node add (decision) → agf edge add → agf insights → agf gate design → agf phase plan
```

## Workflow

### Step 1: Load Context

```bash
agf context <epic or requirement id>
agf search "<architecture keywords>"
```

Review requirements/constraints/risks from ANALYZE.

### Step 2: Impact Analysis (existing codebases)

```bash
agf insights
agf code impact <file>
```

Understand what design decisions will affect.

### Step 3: Create ADR Decision Nodes

```bash
agf node add --type decision
```

Description format:

```markdown
## Status: Accepted

## Context: [why needed]

## Decision: [what + how]

## Consequences: [trade-offs, follow-up, risks accepted]
```

Common: tech stack, storage, API design, comms patterns, error handling, testing, deploy model.

### Step 4: Link Decisions

```bash
agf edge add <from> <to> --type <rel>
```

Types: `decision→requirement`, `decision→epic`, `decision→risk`, `decision→decision`.

### Step 5: Interface Design

Define contracts as constraint nodes:

```bash
agf node add --type constraint
```

### Step 6: Save Decisions

```bash
agf memory write <name>
```

### Step 7-8: Validate ADRs + Contract Coverage

```bash
agf insights
```

Verify ADR completeness/quality and interface coverage across components.

### Step 9: Design Gate

```bash
agf gate design
```

Criteria: key decisions as ADR nodes, decisions linked to requirements, no orphan requirements, interface contracts defined. On failure, add missing ADRs/edges.

### Step 10: Transition

```bash
agf phase plan
```

Follow the CLI next-action hint.

## Output Format

```
Phase: DESIGN → PLAN
ADRs: N decisions  Contracts: M constraints
Impact: K modules analyzed  Coverage: J/T requirements addressed
Gate: design_ready N/100
Status: Ready for PLAN
```

> Loop link → PLAN (graph-plan): `agf decompose` to break epics into atomic tasks.

## Anti-Patterns

- No implementation tasks in DESIGN — that's PLAN
- No code — design is decisions/docs only
- Don't skip ADRs — undocumented decisions cause inconsistency
- Don't over-design — focus on MVP-affecting decisions
- Don't ignore the CLI next-action hint
- Use `agf node add` for nodes; run impact analysis on existing codebases

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
