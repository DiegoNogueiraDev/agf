---
name: graph-refactor
description: Tech debt management and refactoring audit — SQALE method, complexity analysis, dead code detection, KISS/YAGNI/DRY enforcement. Produces a prioritized refactoring plan tracked in the graph.
triggers:
  - graph-refactor
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-refactor

Tech debt + refactoring audit — SQALE, complexity, dead code, KISS/YAGNI/DRY. Identifies over-complex, duplicated, unused, or over-engineered code and produces a prioritized plan tracked in the graph. Drive via the `agf` CLI — zero MCP.

## When to Use

- During LISTENING — track tech debt for future sprints
- Before major features — cut complexity first
- When quality score drops below B — systematic cleanup
- At sprint boundaries — allocate 15–20% capacity to debt

## Mandatory Flow

```
complexity scan → dead code → duplication → KISS/YAGNI → SQALE scoring → refactoring plan → test verification → report → agf memory write
```

## Workflow

### Step 1: Complexity Scan

Use `agf code search <symbol>` / `agf code index` for symbol-level analysis to enumerate functions and methods.

| Complexity | Level    | Action            |
| ---------- | -------- | ----------------- |
| 1–5        | Simple   | none              |
| 6–10       | Moderate | monitor           |
| 11–20      | Warning  | schedule refactor |
| >20        | Critical | refactor now      |

Also flag: nesting >3 levels · functions >50 lines (Extract Method) · >5 params (Parameter Object) · files >500 lines (Split Module).

### Step 2: Dead Code Detection

Unused exports, unreachable code (after `return`/`throw`/`break`/`continue`), commented-out blocks (>3 lines), unused imports, unused variables.

Use `agf insights` for stale references and orphaned symbols. Automated:

```bash
npx eslint src/ --rule '{"no-unused-vars":"error","no-unreachable":"error"}'
```

### Step 3: Duplication Analysis

Blocks >10 lines repeated across files; same-behavior functions under different names; utility patterns to extract into `src/core/utils/`; repeated validation logic to shared Zod schemas; similar store queries to abstract.

Hotspots here: store init across test files, error handling across tools, overlapping Zod schemas.

### Step 4: KISS/YAGNI Audit

Flag over-engineering: single-impl interfaces, premature generalization, unused config/flags, exported functions with zero import sites, speculative code behind always-on/off flags, functions with >10 optional fields. For each: "Does this serve a current requirement?" If not, flag.

### Step 5: SQALE Scoring

```
Technical Debt Ratio = remediation_cost / development_cost
```

| Category     | Difficulty | Examples                                               |
| ------------ | ---------- | ------------------------------------------------------ |
| Architecture | Hard       | module boundaries, circular deps, layer violations     |
| Design       | Medium     | missing interfaces, tight coupling, wrong abstractions |
| Code         | Easy       | long functions, magic numbers, naming, duplication     |

Prioritize by impact × change frequency (hotspots):

```bash
git log --format=format: --name-only --since="90 days" -- src/ | sort | uniq -c | sort -rn | head -20
```

High churn + high debt = top priority.

### Step 6: Refactoring Plan

| Pattern             | Refactoring                    | Effort |
| ------------------- | ------------------------------ | ------ |
| Long function       | Extract Method                 | XS–S   |
| Deep nesting        | Guard Clauses / Early Return   | XS     |
| Duplicate code      | Extract Shared Utility         | S–M    |
| Large class/file    | Split Module                   | M      |
| Complex conditional | Replace with Polymorphism      | M–L    |
| God object          | Decompose into focused modules | L      |
| Tight coupling      | Introduce Interface / DI       | M–L    |

Create graph nodes for significant refactors (M+):

```bash
agf node add --type task --title "<refactor>" --ac "<criteria>"
```

Then tag via `agf node update`. Include in description: what, why, effort, affected files.

### Step 7: Test Verification

Verify candidates have tests; if not, add tests BEFORE refactoring. Confirm green baseline:

```bash
npm test
```

Per candidate: has tests + good coverage = safe · has tests + shallow = add edge cases first · no tests = write tests first (blocked).

### Step 8: Report

**Grades:** A (90–100) debt <5% · B (75–89) 5–10% · C (60–74) 10–20% · D (45–59) 20–35% · F (<45) >35%.

Save: `agf memory write "tech-debt-audit-<date>" --content <report>`

## Output Format

```
Phase: TECH DEBT AUDIT
Complexity: <N> >10 (<N> critical >20), avg <N>
Dead Code: <N> unused exports, <N> unreachable, <N> commented
Duplication: <N>%, <N> patterns
KISS/YAGNI: <N> over-engineered
SQALE Debt Ratio: <N>% (arch <N>h, design <N>h, code <N>h)
Top 5 Candidates:
  1. [<effort>] <description> — <file>
  ...
Test Safety: <N>/<M> have tests
Grade: <A-F> (<N>/100)
Graph Nodes: <N> tech-debt tasks
Saved: "tech-debt-audit-<date>"
```

## Anti-Patterns

- Don't refactor without tests — add tests first
- Don't refactor during bug fixes — separate commits
- Don't chase 100% — diminishing returns after 80%
- Don't refactor stable, rarely-changed code — prioritize high-churn hotspots
- Don't ignore hotspots — they deserve clean code most
- Don't plan large refactors — break into atomic graph tasks

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
