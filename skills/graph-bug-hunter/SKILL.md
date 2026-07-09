---
name: graph-bug-hunter
description: Automated bug discovery — static analysis, LSP diagnostics, anti-pattern detection, regression hotspots, error-catalog mining via the `agf` CLI
triggers:
  - graph-bug-hunter
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-bug-hunter

Proactive bug discovery: static analysis, LSP diagnostics, anti-pattern detection, regression-hotspot analysis, error-catalog mining. Finds bugs before production. Drive via the `agf` CLI (zero MCP).

## When to Use

- Pre-VALIDATE — catch bugs before formal validation
- During code review
- LISTENING phase health checks
- When quality metrics decline

## Mandatory Flow

```
LSP diagnostics → ESLint deep scan → anti-patterns → dependency issues → regression hotspots → error catalog → triage → report → agf node add → agf memory write
```

## Workflow

### Step 1: LSP Diagnostics

```bash
agf code index
npx tsc --noEmit
```

Collect errors/warnings; flag files with >3 diagnostics. Use `agf code def`/`agf code refs` for type errors, unresolved refs, signature mismatches.

### Step 2: ESLint Deep Scan

```bash
npx eslint src/ --max-warnings 0
```

Focus: security warnings, `no-non-null-assertion`, `no-explicit-any`. Categorize by severity.

### Step 3: Anti-Pattern Detection

Search source for: non-null assertions (`x!.prop`), `any`, empty catch (`catch {}`), TODO/FIXME/HACK, magic numbers, unreachable code (after `return`/`throw`), `console.log`, sync file ops in async paths (`readFileSync`).

### Step 4: Dependency & Import Issues

Check circular imports, missing `.js` ESM extensions, unused exports, tree-shaking-breaking re-exports.

```bash
agf gaps
```

(detects cycles + completeness gaps)

### Step 5: Regression Hotspot Analysis

```bash
git log --stat --since="30 days" -- src/
```

Files changed >5×/30d are hotspots. Cross-ref with `agf code affected <file>` — hotspots without tests are high-risk.

### Step 6: Error Catalog Mining

```bash
agf search "error pattern bug fix"
agf memory search "bug"
```

Compare against current code for recurring issues; check if fixed bugs regressed.

### Step 7: Triage

| Severity     | Criteria             | Action      |
| ------------ | -------------------- | ----------- |
| **Critical** | security/data-loss   | fix now     |
| **High**     | wrong behavior/logic | this sprint |
| **Medium**   | code smell           | next sprint |
| **Low**      | style                | batch       |

Create nodes for Critical + High:

```bash
agf node add --type bug --title "<desc>" --ac "<repro steps>"
```

Include repro steps + affected files in the description.

### Step 8: Report

```bash
agf memory write bug-hunt-<date>
```

## Output Format

```
Bug Hunt Report
Total: N (Critical N | High N | Medium N | Low N)
Hotspots: N (>5 changes/30d)
New bug nodes: N
Top 5 priority fixes: ...
```

> Loop link → IMPLEMENT (graph-fix-bugs): `agf brief <bug>` → fix → `agf submit <bug> --result <json>`.

## Anti-Patterns

- Don't ignore warnings — they become bugs
- LSP type errors are bugs, not suggestions
- Track TODO/FIXME as graph nodes
- Don't ignore regression hotspots
- No bug node without severity + repro steps
- Run tests first — fix known failures before finding new ones

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
