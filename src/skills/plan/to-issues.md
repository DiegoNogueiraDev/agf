---
name: to-issues
description: Break a plan or PRD into independently grabbable issues using tracer-bullet vertical slices; complements plan_sprint by producing the issue list that feeds it
category: plan
phases: [PLAN]
---

# to-issues

Port of `skills-main/to-issues`. Use after `to-prd` (or when the PRD already exists) to produce the slice list that `plan_sprint` and `gh issue create` consume.

## Process

### 1. Gather context

Work from the PRD node or GitHub issue passed in. `gh issue view <n>` if you need comments.

### 2. Draft vertical slices

Each slice is a **tracer bullet** — thin path through ALL layers (schema, API, UI, tests). NOT a horizontal layer cut.

Rules:

- Each slice is independently demoable
- Prefer many thin slices over few fat ones
- Mark slices **HITL** (needs human decision/review) or **AFK** (agent can ship alone). Prefer AFK.

### 3. Quiz the user

Present as a numbered list:

| #   | Title | Type | Blocked by | Stories covered |
| --- | ----- | ---- | ---------- | --------------- |
| 1   | …     | AFK  | none       | US-1, US-2      |

Ask:

- Granularity right? (too coarse / too fine)
- Dependencies correct?
- Any slices need to merge or split?
- HITL/AFK assignments correct?

Iterate until approved.

### 4. File issues

For each slice, create with `gh issue create` in dependency order so blockers get real numbers first.

```markdown
## Parent

#<parent-issue-number>

## What to build

End-to-end behavior for this slice. No layer-by-layer how-to.

## Acceptance criteria

- [ ] …

## Blocked by

- #<n> (or "None — can start immediately")
```

Do not close or modify the parent issue.

## Anti-patterns

- Horizontal slicing ("schema PR, then API PR, then UI PR") — none of those demo on their own
- Treating every slice as HITL — block on human availability instead of shipping
- Skipping the quiz step — user will reject the breakdown later, costing more
