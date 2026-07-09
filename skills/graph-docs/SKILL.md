---
name: graph-docs
description: Documentation health audit — JSDoc completeness, README freshness, example validation, CLAUDE.md coverage, API docs, architecture-doc generation via the `agf` CLI
triggers:
  - graph-docs
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-docs

Doc-health audit: JSDoc completeness, README freshness, example validation, CLAUDE.md coverage, API docs, architecture docs from the graph. Finds gaps, stale content, doc/code drift. Drive via the `agf` CLI (zero MCP).

## When to Use

- Pre-HANDOFF (docs complete)
- Quarterly doc reviews / onboarding
- CLAUDE.md needs updating after big changes
- LISTENING phase improvements

## Mandatory Flow

```
CLAUDE.md → README → JSDoc → API docs → examples → architecture docs → changelog → report → agf memory write
```

## Workflow

### Step 1: CLAUDE.md Audit

Verify it covers: ESM imports (`.js`), Zod v4, strict mode, naming (kebab/Pascal/camel), logger (no `console.log`), TDD rules, path-specific rules. Compare sections with actual patterns; flag outdated conventions, missing patterns, stale migration notes. Use `agf gaps` for completeness signals.

### Step 2: README Freshness

Verify `npm install`, `npm run dev`, `npm test`, `npm run build` work; architecture overview matches structure; badges valid. Run setup commands. Flag broken commands, outdated screenshots, missing sections.

### Step 3: JSDoc Coverage

Scan exported functions in `src/core/`. Coverage = with-JSDoc / total exported. Quality: `@param` per param, `@returns`, description. Flag undocumented public functions and `@param`/type mismatches.

### Step 4: API Documentation

- REST routes (`src/api/routes/`): method, path, description, request/response schema documented
- Tools: `description` in registration + Zod param descriptions
  Cross-ref reference docs.

### Step 5: Example Validation

For each example in `docs/` + README: valid syntax (no broken imports), referenced functions/modules still exist, output matches current behavior. Flag deleted-module imports and deprecated API calls.

### Step 6: Architecture Docs

Generate/verify from graph: module dependency diagram via `agf export --format mermaid`; component inventory from `src/`; data flow store→core→cli/tui. Compare with `docs/architecture/`; flag drift.

### Step 7: Changelog Completeness

Verify CHANGELOG.md covers recent releases; cross-ref git tags. Every `feat:`/`fix:` has an entry; breaking changes highlighted; migration notes for schema changes.

### Step 8: Report

```bash
agf memory write documentation-audit-<date>
```

Grades: A(90+) all current, JSDoc>80, no drift; B(75+) minor gaps, JSDoc>60; C(60+) CLAUDE.md outdated, JSDoc<60, broken examples; D(45+) significant gaps, drift; F(<45) critical debt, broken README, no JSDoc.

## Output Format

```
Phase: DOCUMENTATION AUDIT
CLAUDE.md: N%  README: N days  JSDoc: N%  API docs: N%
Examples: N%  Architecture drift: N  Changelog: N%
Top 5 gaps: ...  Overall: A-F
Saved: "Documentation Audit — <date>"
```

> Loop link → HANDOFF (graph-handoff): `agf gate handoff` (doc completeness is part of the gate).

## Anti-Patterns

- Docs aren't an afterthought — write alongside code
- Keep CLAUDE.md current — it's the AI's primary context
- JSDoc public functions — they're the API contract
- Fix broken examples; document what IS, not what's planned
- Test commands before documenting them
- Don't forget architecture docs

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
