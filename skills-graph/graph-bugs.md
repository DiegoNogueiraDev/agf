---
name: graph-bugs
description: Bug discovery + structured fix — LSP, patterns, hotspots → reproduce, 5-Whys, TDD, regression prevention
trigger: /graph-bugs
tools_used: [insights, check, start, done, memory, node, search]
tokens: ~800
---

<!-- shared:pipeline,dod,principles,errors -->

# graph-bugs

Automated bug discovery + structured fix. Two modes: **hunt** (find) and **fix** (correct).

## When

- **Hunt:** before VALIDATE, code review, or periodically in LISTENING
- **Fix:** reported bug, failing test, post-deploy regression
- `$graph-bugs` or "find bugs", "fix bug", "debug"

## Flow — Hunt

```
LSP diagnostics → ESLint deep → pattern detection → circular deps → regression hotspots → error catalog → triage → agf node add → agf memory write
```

## Flow — Fix

```
select bug → agf start → reproduce (RED) → 5 Whys → impact → fix (GREEN) → regression → verify AC → prevent → agf done
```

## Steps — Bug Hunt

### 1. LSP Diagnostics

`agf insights` — warnings/errors from active language servers.

### 2. ESLint Deep Scan

`npx eslint . --max-warnings 0` — categorize by rule (security, quality, convention).

### 3. Anti-Pattern Detection

Look for: non-null `!`, `any`, empty catch, magic numbers (>3 uses), `console.error` in prod, `setTimeout` without cleanup.

### 4. Circular Dependencies

`agf insights` — circular module deps.

### 5. Regression Hotspots

`agf insights` — high-churn files (30d). Correlate with closed bugs.

### 6. Error Catalog Mining

`agf search "<error pattern>"` — recurring error patterns in knowledge store.

### 7. Triage

Classify: severity (critical/high/medium/low), confidence, location. `agf node add` (type task, tag bug).

---

## Steps — Bug Fix

### 1. Select Bug

Pick from graph (status backlog, type task, tag bug).

### 2. Start Task

`agf start` — pull next, follow pipeline.

### 3. Reproduce (RED)

Write a test that reproduces the bug. Must FAIL. `npx vitest run <test-file>`.

### 4. Root Cause (5 Whys)

Ask "why" 5× from the symptom. Document root cause in node description.

### 5. Impact / Blast Radius

`agf insights` — what else breaks if touched here?

### 6. Fix (GREEN)

Minimal fix. Test passes. No extra features.

### 7. Regression Suite

`npx vitest run --changed` — module tests + bug-covering tests.

### 8. Verify AC

`agf check <id>`. No AC → `agf node update <id>` to add it.

### 9. Prevention

`agf memory write <name>` — root cause + fix pattern to prevent recurrence.

### 10. Finish Task

`agf done <id>` — DoD checks.

## Exit — Hunt

- [ ] Bugs triaged as graph nodes
- [ ] Report (severity + confidence) saved

## Exit — Fix

- [ ] RED confirms bug → GREEN confirms fix
- [ ] Root cause documented (5 Whys)
- [ ] Regression suite passes
- [ ] Prevention pattern saved via `agf memory write`
- [ ] DoD passes

Loop: fix done → `agf done <id>` → next: graph-validate.
