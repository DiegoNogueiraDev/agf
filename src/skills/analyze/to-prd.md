---
name: to-prd
description: Synthesize the current conversation context into a PRD ready for agf import-prd; do not interview the user, just consolidate what you already know
category: analyze
phases: [ANALYZE]
---

# to-prd

Port of `skills-main/to-prd`: the output is consumed by `agf import-prd` (or filed as a GitHub issue when the user already runs spec-kit).

## When to use

You have an exploratory conversation that's converged on a feature, but no PRD node exists in the graph yet. Stop coding. Synthesize first.

## Process

1. **Explore the repo** if you haven't already — `agf query`, `agf code callers <symbol>` for callers.
2. **Sketch deep modules**: list the modules you will build/modify. Prefer deep modules (simple interface, lots of behavior, rarely changes) over shallow facades.
3. **Confirm** module boundaries with the user; ask which modules they want test coverage for.
4. **Write the PRD** using the template below, then `agf import-prd` it as a draft epic.

## PRD template

```markdown
## Problem Statement

The user's pain, in the user's words.

## Solution

What changes from the user's perspective.

## User Stories

1. As a <actor>, I want <feature>, so that <benefit>
   … long, exhaustive list

## Implementation Decisions

- Modules to build/modify (no file paths — they rot)
- Module interfaces
- Architectural decisions, schema changes, API contracts

## Testing Decisions

- What "good test" means here (test behavior, not implementation)
- Modules to test
- Prior art (similar tests already in the codebase)

## Out of Scope

What this PRD does NOT cover.

## Further Notes

Anything else.
```

## Anti-patterns

- Interviewing the user from scratch when context already exists
- Pasting file paths or code into the PRD (they go stale)
- Single mega-story instead of many user stories
