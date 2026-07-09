---
name: graph-api-design
description: API governance audit — OpenAPI/Swagger spec, REST maturity, contract validation, breaking-change detection, naming, versioning, docs
triggers:
  - graph-api-design
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-api-design

API governance: spec generation, REST maturity, contract validation, breaking-change detection. Ensures consistent naming, validated contracts, backward compatibility, and docs across API surfaces.

## When to Use

- Pre-REVIEW when APIs change
- Adding endpoints or tools
- DESIGN for API-first work
- Before major releases

## Mandatory Flow

```
inventory → naming → contract validation → breaking changes → versioning → docs → report → agf memory write
```

## Workflow

### Step 1: Endpoint Inventory

Catalog routes (`src/api/routes/`) and tool registrations. Extract route defs (GET/POST/PUT/DELETE/PATCH); group by resource (`/nodes`, `/edges`); count per router/method. Flag verbs in paths (`/getNodes` → `GET /nodes`).

### Step 2: Naming Convention Audit

- REST: kebab-case paths (`/code-graph`), pluralized nouns (`/nodes`), no verbs in paths
- Tools: snake_case names (`import_prd`), consistent param naming
- Score = compliant / total endpoints

### Step 3: Contract Validation

- Each route uses `validateBody()`/`validateQuery()` middleware
- Each tool has Zod schema on every param
- Flag `req.body`/`req.query` access without validation; any tool param without Zod type
- Verify consistent response shapes (`{data,meta}`)
- Score = validated / total

### Step 4: Breaking Change Detection

```bash
git diff HEAD~10..HEAD -- src/api/routes/
```

Detect: removed handlers/tools, renamed params, changed response shapes, tightened validation (optional→required). Each breaking change needs a documented migration path / deprecation.

### Step 5: Versioning & Deprecation

Grep `@deprecated`/`deprecated`/`DEPRECATED`. Verify each deprecated item names its replacement, still functions during grace period, and is registered. Check version indicators (URL prefix/header/query).

### Step 6: Documentation Check

- Route handlers have JSDoc; tools have `description` + param descriptions
- Verify reference docs current with route/tool lists
- Flag undocumented public endpoints

### Step 7: Report

```bash
agf memory write api-design-audit-<date>
```

Content: scores per dimension (naming, validation, breaking, deprecation, docs), breaking changes, undocumented endpoints.

## Output Format

```
Phase: API DESIGN AUDIT
Endpoints: <N> REST + <N> tools
Naming: N%  Validation: N%
Breaking: N  Undocumented: N
Deprecated: N (migration N / none N)
Overall: A-F  Recommendations: top 3
Saved: "API Design Audit — <date>"
```

> Loop link → REVIEW (graph-review): `agf insights` + `agf gate review`.

## Anti-Patterns

- No endpoint without Zod validation — validate every input boundary
- Don't rename params without deprecation period
- Don't remove endpoints without a migration path
- No verbs in REST URLs — use HTTP methods
- Don't skip API docs — it's the producer/consumer contract
- Don't break compat without a major version bump

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
