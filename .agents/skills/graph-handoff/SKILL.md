---
name: graph-handoff
description: Execute the HANDOFF phase of the lifecycle via the `agf` CLI — PR creation, memory capture, knowledge export, doc completeness validation
triggers:
  - graph-handoff
version: 2.0.0
author: Diego Nogueira
date: 2026-04-04
toolchain:
  - agf memory write
  - agf snapshot create
  - agf export
  - agf gate
  - agf phase
---

# graph-handoff

HANDOFF phase via the `agf` CLI (ZERO MCP). Creates PRs, captures decisions as memories, exports knowledge, finalizes docs for delivery.

## When to Use

- After REVIEW approves the changes
- Creating a PR for the sprint's work
- Capturing decisions/knowledge for future cycles
- `agf phase` reports `HANDOFF`

## Mandatory Flow

```
agf memory write → agf snapshot create → agf export → [create PR] → agf gate handoff → agf phase DEPLOY
```

## Workflow

### Step 1: Capture Decisions

```bash
agf memory write <name>
```

Record architectural choices, error patterns, perf insights, integration learnings (land under `workflow-graph/memories/`).

### Step 2: Snapshot

```bash
agf snapshot create
```

### Step 3: Export Deliverables

```bash
agf export
agf export --format mermaid
```

Summary + visual overview for the PR description.

### Step 4: Share Knowledge

`agf export` also produces a cross-project knowledge package (memory + docs, quality-filtered, deduped by hash — safe to re-run).

### Step 5: Prepare Commit

```bash
git status
git diff --staged
git log --oneline -5
```

Commit following project conventions.

### Step 6: Create PR (if requested)

```bash
gh pr create --title "<title>" --body "<body>"
```

Body: summary (from export), tasks done (node IDs/titles), test results, breaking changes, mermaid graph.

### Step 7-8: Validate Gate

```bash
agf gate handoff
```

Criteria: all sprint tasks done, snapshot created, knowledge exported, memories captured, PR created (if applicable), docs updated (CLAUDE.md/ADRs/API docs).

### Step 9: Transition

```bash
agf phase DEPLOY
```

Follow the `nextAction` from `agf phase`.

## Output Format

```
Phase: HANDOFF → DEPLOY
PR: #N (url)  Snapshot: created
Memories: N captured  Knowledge: M docs exported
Gate: handoff_ready N/100
Status: Ready for DEPLOY
```

> Loop link → DEPLOY (graph-deploy): `agf gate deploy` (harness ≥ 70).

## Anti-Patterns

- Don't skip `agf memory write` — lost decisions are rediscovered expensively
- Don't skip snapshots — they're the audit trail
- No PR without test results in the body
- Update CLAUDE.md with new conventions
- Don't ignore `nextAction` from `agf phase`
- Don't skip the knowledge export — it enables cross-project learning

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
