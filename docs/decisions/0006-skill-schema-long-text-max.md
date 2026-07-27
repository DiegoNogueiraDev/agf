# ADR-0006: Raise LONG_TEXT_MAX to 100,000 characters

**Date:** 2026-06-21
**Status:** Accepted

## Context

`LONG_TEXT_MAX` in `src/schemas/skill.schema.ts` was set to 10,000 characters. After enriching all 19 `graph-*` skills with canonical sections from the shared skills baseline (Walking Skeleton, Test Data Builder, DoD Grade A, Blocker Decision Tree, Pilot Protocol, etc.), five skills exceeded the limit:

- graph-brainstorm: 11,596 chars
- graph-catalyst: 13,811 chars
- graph-mega-brain: 10,502 chars
- graph-prd: 10,658 chars
- graph-publish: 12,509 chars

Skills that fail the Zod schema are silently dropped by `loadSkillsFromDir` — they disappear from `agf skill list` without any console warning.

## Decision

Raise `LONG_TEXT_MAX` from 10,000 to 100,000 characters.

## Consequences

- All 19 enriched skills now parse and load correctly.
- The limit remains a safety net against runaway skill files.
- Future skill authors should keep individual SKILL.md files under 800 lines (the general file-size guideline from CLAUDE.md) — the 100k char limit is a schema floor, not a target.
- If a skill exceeds 800 lines, split into sub-skills rather than relying on the high char limit.
