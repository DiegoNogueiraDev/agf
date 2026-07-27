---
name: graph-refactor
description: Tech debt management and refactoring audit using SQALE method, complexity analysis, dead code detection, and KISS/YAGNI/DRY enforcement
triggers:
  - graph-refactor
version: 2.0.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-refactor

Tech debt management and refactoring audit using SQALE method, complexity analysis, dead code detection, and KISS/YAGNI/DRY enforcement. Identifies code that is too complex, duplicated, unused, or over-engineered, and produces a prioritized refactoring plan tracked in the execution graph.

## When to Use

- During LISTENING phase — track tech debt for future sprints
- Before major features — reduce complexity to make new code easier to add
- When code quality score drops below B — systematic cleanup needed
- At sprint boundaries — allocate 15-20% of capacity for tech debt reduction

## Mandatory Flow

```
complexity scan → dead code detection → duplication analysis → KISS/YAGNI audit → tech debt scoring → refactoring order → test verification → report → write_memory
```

## Workflow

### Step 1: Complexity Scan

Measure cyclomatic complexity per function. Use `agf code def|refs|impact` for symbol-level analysis, and
`agf lint-files` for the 800-line ceiling. Dead capability is debt too: `agf wire-dormant` lists
exported-but-unreachable code and `agf wire-check` fails when it grows.

| Complexity | Level    | Action               |
| ---------- | -------- | -------------------- |
| 1-5        | Simple   | No action            |
| 6-10       | Moderate | Monitor              |
| 11-20      | Warning  | Schedule refactor    |
| >20        | Critical | Refactor immediately |

Also flag: nesting >3 levels, functions >50 lines, parameters >5, files >500 lines.

### Step 2: Dead Code Detection

- Unused exports, unreachable code, commented-out blocks (>3 lines), unused imports, unused variables.
- Broken Window: dead code signals "nobody cares" — remove or board up with dated TODO.

```bash
npx eslint src/ --rule '{"no-unused-vars":"error","no-unreachable":"error"}'
```

### Step 3: Duplication Analysis

Detect blocks >10 lines appearing in multiple files. Target: <3% duplication.
DRY violation types: inadvertent (stored twice), impatient (copy-paste), interdeveloper (same utility twice).

### Step 4: KISS/YAGNI Audit

Flag: single-impl interfaces, abstract classes with one subclass, unused config flags, functions with zero callers, speculative code paths.
Ask: "Does this complexity serve a _current_ requirement?" If not → remove.

### Step 5: Tech Debt Scoring (SQALE)

**Full formula:**

```
debt_ratio = Σ remediation_time / (LOC × 30min)
```

| Grade | Debt Ratio | Meaning                             |
| ----- | ---------- | ----------------------------------- |
| A     | <5%        | Healthy                             |
| B     | 6-10%      | Manageable — address in next sprint |
| C     | 11-20%     | Concerning — allocate 20% capacity  |
| D     | 21-50%     | High — dedicated cleanup sprint     |
| E     | >50%       | Critical — new features blocked     |

Debt categories:

| Category     | Difficulty | Examples                                               |
| ------------ | ---------- | ------------------------------------------------------ |
| Architecture | Hard       | Circular deps, layer violations, module boundaries     |
| Design       | Medium     | Missing interfaces, tight coupling, wrong abstractions |
| Code         | Easy       | Long functions, magic numbers, naming, duplication     |

Hotspot analysis (files with high churn AND high debt = top priority):

```bash
git log --format=format: --name-only --since="90 days" -- src/ | sort | uniq -c | sort -rn | head -20
```

### Step 6: Refactoring Order

Never refactor randomly. Apply this sequence — it matches both Feathers' legacy code loop and Fowler's four refactoring types.

**Feathers' Legacy Code Loop** (`[[feathers-legacy-code]]`):

1. Find a seam (Object Seam preferred — where behavior depends on which object receives the call)
2. Break the dependency at the seam's enabling point
3. Get code into a test harness (Characterization Tests document what code _actually does_)
4. Then refactor with confidence

**Fowler's Four Refactoring Types** (`[[fowler-refactoring]]` ch02), in priority order:

1. **Preparatory** — before a feature: "Make the change easy, then make the easy change" (Kent Beck)
2. **Comprehension** — while reading: rename to record understanding, small cleanups
3. **Litter-pickup** — campsite rule: leave it slightly better than you found it
4. **Planned** — scheduled session for M/L items only; rare, short, tracked as tasks

### Step 7: Two Hats Rule

**Never mix refactoring with behavior change.** (`[[fowler-refactoring]]` ch02 — Fowler's core discipline)

- Refactoring hat: change code structure, no new capabilities, tests stay green at every small step
- Feature hat: extend behavior, add new tests, leave structure alone
- Rule: wear one hat at a time; commit structural work before switching hats
- Signal: if you catch yourself writing a new test for new behavior _while_ restructuring → stop, commit, switch hats

Practical enforcement:

- Refactoring commits: `refactor: extract pricing logic into PriceCalculator`
- Feature commits: `feat: add volume discount tier`
- Mixed commits = violation — split them

### Step 8: Seam Model (for Untested Code)

When a refactoring target has no tests, use Feathers' Seam Model to break dependencies before refactoring. (`[[feathers-legacy-code]]` ch04)

**Three seam types, in preference order:**

| Seam Type              | How It Works                                             | Enabling Point                                         | Use When                                 |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| **Object Seam**        | Method call behavior depends on which object receives it | Object creation site (constructor, factory, parameter) | Always prefer this first                 |
| **Link Seam**          | Entire class/library resolved at link time               | Build configuration                                    | Pervasive dependency spanning many files |
| **Preprocessing Seam** | C/C++ macro replaces text before compile                 | `#define` / `#ifdef`                                   | Last resort; invisible to code readers   |

**Object Seam workflow:**

1. Identify the call you want to fake
2. Make it receivable on a parameter (Parameterize Constructor or Parameterize Method)
3. Pass a fake through the parameter in tests
4. Write Characterization Tests against the real behavior
5. Now refactor safely

### Step 9: Refactoring Catalog

Per finding, select the specific Fowler move:

| Pattern             | Refactoring                                | Effort |
| ------------------- | ------------------------------------------ | ------ |
| Long function       | Extract Function                           | XS-S   |
| Deep nesting        | Guard Clauses / Early Return               | XS     |
| Duplicate code      | Extract Shared Utility                     | S-M    |
| Large class/file    | Extract Class, Split Module                | M      |
| Complex conditional | Replace Conditional with Polymorphism      | M-L    |
| God object          | Decompose into focused modules             | L      |
| Tight coupling      | Introduce Interface / Dependency Injection | M-L    |
| Feature Envy        | Move Function to where the data lives      | S      |
| Repeated Switches   | Replace Conditional with Polymorphism      | M      |
| Data Clumps         | Extract Class, Introduce Parameter Object  | S      |

Create graph nodes for M/L refactorings:

```
agf node add --title "DEBT: <what> em <file>" --type task --tags "tech-debt,<category>" --ac "<observable outcome>"
```

### Step 10: Test Verification

Before ANY refactoring move:

- Tests green? If not, fix tests first — do not refactor into a broken baseline
- No tests? Write Characterization Tests first (Feathers' algorithm: assert dummy value → let failure reveal actual output → pin that as expected)
- Shallow tests? Add edge cases covering paths the change will touch
- Run: `npm test` — must be green before first structural change

Safety protocol (Fowler):

1. Run tests — green
2. Make one named refactoring move
3. Run tests — green
4. Commit with refactoring name in message
5. Repeat

### Step 11: Debt Report

**Scoring:**

- **A (90-100):** Low complexity, no dead code, minimal duplication, debt ratio <5%
- **B (75-89):** Some moderate complexity, minor duplication, debt ratio 5-10%
- **C (60-74):** Several complex functions, noticeable duplication, debt ratio 10-20%
- **D (45-59):** High complexity, significant dead code, debt ratio 20-50%
- **F (< 45):** Critical tech debt, pervasive duplication, debt ratio >50%

Save findings:

```
agf memory write tech-debt-audit-<date> --content "<report>"
```

## Anti-Patterns

- Do NOT refactor without tests — write Characterization Tests first, then refactor
- Do NOT refactor during bug fixes or feature work — Two Hats: separate commits, separate concerns
- Do NOT mix behavior change with structural change in the same commit
- Do NOT chase 100% — diminishing returns after 80%; focus on high-churn hotspots
- Do NOT refactor code that works and rarely changes — hotspots first
- Do NOT plan large refactors as one task — break into atomic steps tracked in the graph
- Do NOT skip the Seam Model for untested code — breaking dependencies safely requires a seam

## Cross-References

- `[[fowler-refactoring]]` — Two Hats (ch02), smell catalog (ch03), refactoring mechanics (ch06-ch12), Preparatory Refactoring, Self-Testing Code prerequisite
- `[[feathers-legacy-code]]` — Seam Model (ch04), Characterization Tests (ch13), Sprout/Wrap (ch06), Legacy Code Change Algorithm

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
