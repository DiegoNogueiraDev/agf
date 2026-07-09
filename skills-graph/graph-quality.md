---
name: graph-quality
description: Code quality + refactoring audit — Clean Code, SOLID, DRY, McCabe, SQALE, dead code, KISS/YAGNI
trigger: /graph-quality
tools_used: [insights, quality, node, memory]
tokens: ~800
---

<!-- shared:principles,errors -->

# graph-quality

Code quality audit + tech-debt management. 7 Clean Code dimensions + SQALE for debt.

## When

- After IMPLEMENT, before REVIEW
- During refactoring to measure improvement
- `$graph-quality` or "quality audit", "code review", "refactor"

## Flow

```
lint → typecheck → complexity → SOLID → DRY → dead code → SQALE → plan → report → agf memory write
```

## Steps

### 1. Lint + TypeCheck Gate

`npm run lint && npx tsc --noEmit` — fail → fix first.

### 2. Complexity Scan (McCabe)

`agf quality` — cyclomatic complexity per file/function. Critical >20, High 11-20, Medium 6-10, Low ≤5.

### 3. SOLID Audit

| Principle                   | Check                                                      |
| --------------------------- | ---------------------------------------------------------- |
| **S** Single Responsibility | Classes/functions > 200 lines? Multiple reasons to change? |
| **O** Open/Closed           | New features need editing vs extending?                    |
| **L** Liskov                | Subclasses break parent contracts?                         |
| **I** Interface Segregation | Interfaces with unused methods?                            |
| **D** Dependency Inversion  | High-level depends on low-level? Use abstractions?         |

### 4. DRY Analysis

`agf quality` — duplicated blocks (>6 similar lines). Target < 3% duplication.

### 5. Dead Code Detection

Find: unimported exports, uncalled functions, unreferenced files, unreachable branches. `agf insights` for cross-refs.

### 6. SQALE Tech Debt

Debt ratio = remediation_cost / development_cost. Convert complexity + duplication to remediation hours. Prioritize hotspots (high churn, 30d).

### 7. KISS/YAGNI

Detect: over-engineering (factories for 1 impl), premature abstractions, excess config for unplanned features, generalizations without ≥2 concrete uses.

### 8. Refactoring Plan

Per item: priority, effort (XS-XL), risk. `agf node add` (type task, tag refactor).

### 9. Quality Report

Score per dimension (0-100): Lint 15%, Type Safety 15%, Complexity 15%, SOLID 15%, DRY 10%, Dead Code 10%, Conventions 10%, SQALE 10%. Grade A≥85, B≥70, C≥55, D<55.

## Exit

- [ ] Lint + typecheck pass
- [ ] Complexity hotspots identified (McCabe >10)
- [ ] Dead code mapped
- [ ] Refactoring plan as graph tasks (via `agf node add`)
- [ ] Report saved via `agf memory write`

Loop: quality clean → next: graph-review.
