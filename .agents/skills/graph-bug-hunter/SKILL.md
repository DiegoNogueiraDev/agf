---
name: graph-bug-hunter
description: Automated bug discovery through static analysis, LSP diagnostics, pattern detection, regression hotspot analysis, and error catalog mining
triggers:
  - graph-bug-hunter
version: 1.1.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-bug-hunter

Automated bug discovery through static analysis, LSP diagnostics, pattern detection, regression hotspot analysis, and error catalog mining. Proactively finds bugs before they reach production.

## When to Use

- Before VALIDATE phase — catch bugs early before formal validation
- During code review — systematic bug detection across the codebase
- Proactively during LISTENING phase — periodic health checks
- When quality metrics decline — investigate root causes of quality degradation

## Mandatory Flow

```
LSP diagnostics → ESLint deep scan → pattern detection → dependency issues → regression hotspots → error history → bug triage → false-positive filter → report → agf node add → agf memory write
```

> A finding that never becomes a node does not exist. Every Tier A/B bug is filed with
> `agf node add --type bug` **before** anyone proposes a fix — that is what makes the hunt
> auditable and what lets `agf risk triage` and `agf gaps` see it later.

## LSP Diagnostic Priority

Not all diagnostics are equal. Process in this order — stop acting on lower tiers until higher tiers are clear (from `[[effective-debugging]]` item 1: prioritize before diving):

| Tier | Level           | Action                               |
| ---- | --------------- | ------------------------------------ |
| 1    | **error**       | Block — fix before anything else     |
| 2    | **warning**     | Schedule — fix in current sprint     |
| 3    | **hint / info** | Track — batch with Low severity bugs |

Files with ≥3 errors are **high-attention targets**. Files with ≥5 warnings but 0 errors are **smell targets**.

Run: `npx tsc --noEmit` to get the full compiler list. For symbol-level analysis use `agf code` —
`agf code def <symbol>`, `agf code refs <symbol>`, `agf code impact <file> [symbol]` (blast radius),
`agf code affected <file>` (which tests already cover it).

## High-Signal Pattern Catalog

Eight patterns that convert to real bugs at high frequency (from `[[effective-debugging]]` and `[[pragmatic-programmer]]`). Run each grep; matches go straight to triage:

```bash
# 1. Non-null assertion (runtime crash waiting to happen)
grep -rn '!\.' src/ --include='*.ts' --include='*.tsx'

# 2. Empty catch (swallowed errors — silent failures)
grep -rn 'catch\s*{[[:space:]]*}' src/

# 3. any type escape hatch (type safety hole)
grep -rn ': any' src/ --include='*.ts'

# 4. Floating promise (unhandled async failure)
grep -rn 'async.*=>' src/ | grep -v 'await\|return'

# 5. TODO/FIXME/HACK (acknowledged technical debt)
grep -rn 'TODO\|FIXME\|HACK' src/

# 6. Synchronous I/O in async context (blocking event loop)
grep -rn 'readFileSync\|writeFileSync\|execSync' src/

# 7. console.log in production paths (data leak / noise)
grep -rn 'console\.log' src/ --include='*.ts' --include='*.tsx'

# 8. Magic numbers (undocumented domain knowledge)
grep -rn '[^a-zA-Z_][0-9]\{3,\}[^0-9]' src/ --include='*.ts'
```

## Hotspot Risk Score

Bugs cluster in high-churn, high-complexity, low-coverage files (from `[[effective-debugging]]` item 8: amplify failure signals). Score every file:

```
Risk = Change Frequency × Complexity × (1 − Coverage)
```

- **Change Frequency**: commits touching the file in the last 30 days  
  `git log --since="30 days" --format="" --name-only | sort | uniq -c | sort -rn`
- **Complexity**: LSP diagnostic count as a proxy (or cyclomatic if available)
- **Coverage**: fraction from the last test run (0–1)

Files changed >5 times + Coverage < 0.5 = **immediate hotspot**. Cross-reference with test coverage — hotspots without tests are the most likely source of future bugs.

## Error History Mining

Recurring bugs leave commit-message traces (from `[[effective-debugging]]` item 26: use git history):

```bash
# Find files most frequently associated with bug-fix commits
git log --oneline --since="90 days" | grep -iE 'fix:|bug:|error:|crash:|revert' | \
  awk '{print $1}' | xargs -I{} git diff-tree --no-commit-id -r --name-only {} | \
  sort | uniq -c | sort -rn | head -20
```

Files appearing in ≥3 bug-fix commits in 90 days are **recurrence hotspots** — static analysis alone won't catch the next bug there; these need regression tests written against the specific failure class.

Also check if previously fixed bugs have regressed via:

```bash
agf memory search "pheromone-fix"   # trails left by past hunts: root cause + fix + gotcha
agf query --type bug --status done --limit 20 --select data.nodes
```

## False Positive Filter

Static analysis produces noise. Apply confidence tiers before triaging to avoid drowning in false alarms:

| Tier | Label        | Criteria                                                     | Action                                     |
| ---- | ------------ | ------------------------------------------------------------ | ------------------------------------------ |
| A    | **Definite** | Crash-reproducible, type error, empty catch with evidence    | File as Critical/High node                 |
| B    | **Probable** | High-signal pattern + hotspot overlap, >3 LSP errors in file | File as Medium node; confirm before fixing |
| C    | **Possible** | Pattern match only, no hotspot signal, no LSP error          | Log to report; skip node creation          |

Never create graph nodes for Tier C findings alone — they inflate the bug count without signal. Promote a Tier C to Tier B only when two independent sources (pattern + git history, or pattern + LSP warning) agree.

## Workflow

### Step 1: LSP Diagnostics Collection

Collect all errors first (Tier 1), then warnings (Tier 2). Flag files with ≥3 errors as high-attention targets.

### Step 2: ESLint Deep Scan

```bash
npx eslint src/ --max-warnings 0
```

Focus: security plugin warnings, `no-non-null-assertion`, `no-explicit-any`.

### Step 3: High-Signal Pattern Detection

Run all 8 grep commands from the catalog. Record file + line. Map each hit to a confidence tier.

### Step 4: Dependency & Import Issues

- Circular imports (A → B → A)
- Missing `.js` extensions in ESM imports
- Unused exports (dead code)

```bash
agf harness --violations --select data.violations   # architecture fitness: cycles, layer breaks
agf gaps --severity required --json                 # completeness holes the scan cannot see
```

### Step 5: Hotspot Risk Scoring

Compute Risk = Change Frequency × Complexity × (1 − Coverage) for all files. List top 10.

### Step 6: Error History Mining

Run the git log command above. Flag recurrence hotspots (≥3 bug-fix commits in 90 days).

### Step 7: Bug Triage

Classify findings by severity, filtered by confidence tier:

| Severity     | Criteria                                  | Action                   |
| ------------ | ----------------------------------------- | ------------------------ |
| **Critical** | Security vulnerability, data loss, Tier A | Fix immediately          |
| **High**     | Wrong behavior, logic errors, Tier A/B    | Fix in current sprint    |
| **Medium**   | Code smell, Tier B                        | Schedule for next sprint |
| **Low**      | Style, Tier C                             | Track and batch fix      |

Create graph nodes only for Critical and High (Tier A) and confirmed Medium (Tier B):

```bash
agf node add --title "BUG: <symptom> em <file>" --type bug --tags "<severity>" \
  --ac "<the failing behaviour, stated so a regression test can assert it>"
```

Open risk nodes that the hunt surfaced but did not confirm drain later via `agf risk triage`.

### Step 8: Bug Report

Save catalog to the knowledge store:

```bash
agf memory write bug-catalog-<date> --content "<report>"
```

## Anti-Patterns

- Do NOT ignore LSP errors — process Tier 1 before Tier 2; errors before warnings
- Do NOT create nodes for Tier C (Possible) findings — noise > signal
- Do NOT skip error history mining — recurring bugs need regression tests, not just fixes
- Do NOT skip the false-positive filter — inflated bug counts erode trust in the report
- Do NOT treat TODO/FIXME as acceptable — track them as Low-severity nodes
- Do NOT ignore regression hotspots — Risk score predicts future bugs
- Do NOT hunt bugs without running tests first — fix known failures before finding new ones

## Related Skills

- `[[effective-debugging]]` — scientific method, binary search, tool selection by problem type
- `[[pragmatic-programmer]]` — DRY principle, assertive programming, broken window theory
- `$graph-bugs` — structured fix workflow once bugs are found
- `$graph-fix-bugs` — Root Cause Analysis (5 Whys), TDD for bugs

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
