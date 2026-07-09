---
name: graph-review
description: REVIEW phase — blast radius, API contract audit, code-aware sync, mermaid
trigger: /graph-review
tools_used: [insights, export, check, metrics, gate]
tokens: ~600
---

<!-- shared:phases,gates,principles,errors,harness -->

# graph-review

Code review with real blast radius + API governance. Detects stale refs, validates contracts.

## When

- After VALIDATE (all tests pass)
- Review code before PR
- `_lifecycle.phase === REVIEW`

## Flow

```
agf insights → agf export → agf metrics → agf gate review → agf phase
```

## Steps

### 1. Blast Radius

`agf insights` — affected files, callers/callees, breaking-change risk. > 20 files → recommend PR split.

### 2. Code-Aware Sync

`agf insights` — stale sourceRefs (file moved/deleted), missing testFiles, nodes without source_file.

### 3. API Contract Audit

Endpoint inventory (paths + methods), naming (kebab-case paths, snake_case API keys), Zod contract validation, breaking-change detection (field removal, type narrowing, enum removal), versioning/deprecation tracking.

### 4. Mermaid Visualization

`agf export` — dependency graph, data flow (mermaid).

### 5. Quality Feedback

`agf export` — record quality patterns to RAG for future context.

### 6. Review Ready Gate

`agf gate review` — blast radius ok, code_sync clean, export generated.

## Exit

- [ ] Blast radius analyzed (no surprises)
- [ ] `agf insights` (code_sync) no critical stale refs
- [ ] API contracts validated (no undocumented breaking changes)
- [ ] `agf gate review` → `agf phase` (HANDOFF)

Loop: gate pass → next: graph-handoff.

## Economy

Token economy is part of the loop: run `agf savings` / `agf metrics --economy-report` after each task, then feed savings → `agf learning` to calibrate the next turn (spiral, not circle).
