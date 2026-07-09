---
name: graph-fix-bugs
description: Structured bug fix via the `agf` CLI — Root Cause Analysis (5 Whys), Reproduce-Fix-Verify, TDD for bugs, regression prevention. Zero MCP
triggers:
  - graph-fix-bugs
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-fix-bugs

Disciplined bug fix: Root Cause Analysis (5 Whys), Reproduce-Fix-Verify, TDD, regression prevention. Every fix follows a process that prevents recurrence. Drive via the `agf` CLI (zero MCP).

## When to Use

- A bug is identified (graph-bug-hunter, user report, test failure)
- IMPLEMENT phase bug-fix tasks
- A regression appears after deploy/merge

## Mandatory Flow

```
select bug → agf start → reproduce (RED) → 5 Whys → impact → fix (GREEN) → regression → verify AC → prevent → agf done
```

## Workflow

### Step 1: Bug Selection

```bash
agf query --type bug
agf search "bug"
```

Select the highest-priority unresolved bug, then load + start:

```bash
agf start
```

### Step 2: Reproduce (TDD RED)

Write a test that reproduces the bug — it MUST fail. If it passes, the description is wrong or already fixed.

```bash
npx vitest run src/tests/bug-fix-<description>.test.ts
```

Confirm RED. If green, re-examine the report and update the node.

### Step 3: Root Cause Analysis (5 Whys)

Ask "Why?" 5× from symptom to root cause, e.g.:

1. Why does X fail? → Y is null
2. Why is Y null? → Z doesn't init it
3. Why? → constructor skips that branch
4. Why? → condition is inverted
5. Why? → **root cause:** copy-paste error

Document the chain in the bug node description.

### Step 4: Impact Analysis

```bash
agf code impact <affected_module>
```

Determine dependents, whether the fix breaks callers, and other call sites with the same bug pattern.

### Step 5: Fix (TDD GREEN)

Minimal fix to make the failing test pass. Don't refactor, don't add features, don't touch unrelated code.

```bash
npx vitest run src/tests/bug-fix-<description>.test.ts
```

Must pass now.

### Step 6: Regression Suite

```bash
npm test
```

Zero regressions. If a test breaks, the fix is too broad — narrow it.

### Step 7: Verify

```bash
agf check <bug_node_id>
```

Confirm the reported behavior is fixed (validate AC + DoD).

### Step 8: Prevention

```bash
agf memory write bug-pattern-<name>
```

Include: root cause (5 Whys chain), symptoms, fix approach, prevention strategy. Enables future graph-bug-hunter scans to detect the pattern.

### Step 9: Close

```bash
agf done <bug_node_id>
```

Runs DoD, marks `done`, checks epic promotion, returns next task.

## Output Format

```
Bug Fix Report
Bug: <title> (<id>)  Root cause: <1-line>
Blast radius: N modules  Fix: <files>, <lines>
Tests: N new + M existing passing
Prevention: pattern documented  DoD: grade A-D (N/100)
```

> Loop link: `agf brief <id>` → fix → `agf submit <id> --result <json>` (validate→blast→DoD→done). Spiral: `agf savings` → `agf learning` → next.

## Anti-Patterns

- Reproduce first — failing test before touching prod code
- One bug, one fix, one commit
- Don't refactor during a fix — separate commits
- Don't skip 5 Whys — surface fixes recur
- Don't ignore blast radius
- Run the full regression suite, not just the bug test
- Document prevention; create the node before fixing untracked bugs

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
