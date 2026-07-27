---
name: graph-review
description: Execute the REVIEW phase of the lifecycle via the `agf` CLI — blast radius insights, code-aware sync, mermaid visualization, quality feedback
triggers:
  - graph-review
version: 2.0.0
author: Diego Nogueira
date: 2026-04-04
toolchain:
  - agf insights
  - agf export
  - agf metrics
  - agf gate
  - agf phase
---

# graph-review

REVIEW phase via the `agf` CLI (zero MCP). Code review with real blast-radius analysis via `agf insights`, stale-reference detection, and quality gating before handoff.

## When to Use

- After VALIDATE confirmed all tests pass
- Reviewing changes before a PR
- Analyzing blast radius
- `agf phase` reports `REVIEW`

## Mandatory Flow

```
agf insights (impact) → agf insights (code sync) → agf export --format mermaid → agf metrics → agf gate review → agf phase HANDOFF
```

## Workflow

### Step 1: Blast Radius

```bash
agf insights
```

Real upstream/downstream dependents per modified module — replaces manual guessing.

### Step 2: Code-Aware Sync

```bash
agf insights
```

Detects stale sourceRefs (deleted/moved files), missing testFiles (done tasks without test refs), symbol drift. Fix before proceeding.

### Step 3: Visualize

```bash
agf export --format mermaid
```

Tabular: `agf export --format csv`.

### Step 4: Metrics

```bash
agf metrics
```

Review velocity, quality (AC pass rates), complexity (sizes, dependency depth).

### Step 5: Code Review

```bash
git diff main...HEAD
git log main..HEAD --oneline
```

Check: quality/readability, security (OWASP top 10), performance, error handling, test quality (not just coverage), ADR adherence from DESIGN.

### Step 6: Knowledge Quality Feedback

Inspect RAG knowledge surfaced during implementation; flag unhelpful/outdated docs for prune. Use `agf search "<q>"` to see what the store returns. Improves future RAG retrieval.

### Step 7: Gate

```bash
agf gate review
```

**Gate:** all sprint tasks validated · code review done (blast radius analyzed) · no stale refs · metrics in range. Fail → return to IMPLEMENT/VALIDATE.

### Step 8: Transition

```bash
agf phase HANDOFF
```

Follow the `nextAction` from `agf phase`.

## Output Format

```
Phase: REVIEW → HANDOFF
Blast radius: N modules affected
Code sync: M stale refs, K missing testFiles
Changes: J files, L lines
Gate: review_ready — score N/100, grade X
Status: Ready for HANDOFF
```

## Loop Link

REVIEW → HANDOFF: `agf phase HANDOFF` then `$graph-handoff`. Spiral: after tasks, `agf savings` / `agf metrics --economy-report` → `agf learning` → calibrate next turn.

## Anti-Patterns

- Don't skip `agf insights` blast radius — manual analysis misses transitive deps
- Don't ignore code-sync warnings — stale refs confuse future sprints
- Don't rubber-stamp — actually read the diffs
- Don't skip ADR compliance
- Don't ignore the `nextAction` hint
- Don't forget to flag stale RAG knowledge

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
