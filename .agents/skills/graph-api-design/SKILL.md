---
name: graph-api-design
description: API governance and design audit using OpenAPI/Swagger spec generation, REST maturity model, contract validation, and breaking change detection
triggers:
  - graph-api-design
version: 1.1.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-api-design

API governance and design audit using OpenAPI/Swagger spec generation, REST maturity model, contract validation, and breaking change detection. Ensures consistent naming, validated contracts, backward compatibility, and comprehensive documentation across all API surfaces.

## When to Use

- Before REVIEW when APIs change
- When adding new endpoints or MCP tools
- During DESIGN for API-first development
- Before major releases

## Mandatory Flow

```
endpoint inventory --> naming conventions --> contract validation --> breaking changes --> versioning --> documentation --> report --> write_memory
```

## Workflow

### Step 1: Endpoint Inventory

Catalog all API routes (`src/api/routes/`) and MCP tools (`src/mcp/tools/`). Count endpoints per resource. Verify RESTful naming: pluralized nouns for resources, HTTP verbs for actions. Flag non-RESTful patterns.

- List all Express Router files and extract route definitions (GET, POST, PUT, DELETE, PATCH)
- List all MCP tool registrations via `server.tool()` calls
- Group endpoints by resource (e.g., `/nodes`, `/edges`, `/knowledge`)
- Count total endpoints per router and per HTTP method
- Flag routes using verbs in the URL path (e.g., `/getNodes` instead of `GET /nodes`)

### Step 2: Naming Convention Audit

Check route naming consistency: kebab-case paths, consistent pluralization, no verbs in URLs (use HTTP methods instead). For MCP tools: snake_case names, consistent parameter naming. Compare against existing patterns.

- REST routes: verify kebab-case (`/code-graph`, not `/codeGraph`)
- REST routes: verify pluralized resource nouns (`/nodes`, not `/node`)
- REST routes: verify no action verbs in paths — use HTTP methods instead
- MCP tools: verify snake_case naming (`import_prd`, not `importPrd`)
- MCP tools: verify consistent parameter naming across related tools (e.g., `nodeId` everywhere, not mixed `node_id`/`nodeId`)
- Score: compliant endpoints / total endpoints = naming compliance %

### Step 3: Hyrum's Law Checklist

From [[swe-at-google]] Ch1: "With a sufficient number of users of an API, all observable behaviors will be depended on by somebody." Apply this as the first design law — not a caution, a guarantee.

Seven behaviors that silently become implicit contracts:

1. **Response field order** — consumers parse positionally; even if your spec says "object", order locks in.
2. **Error message text** — clients string-match on error messages. Changing wording breaks them.
3. **Timing and latency** — clients set timeouts calibrated to current latency. Faster or slower can break.
4. **Undocumented fields** — extra fields in responses get parsed and depended on even if never in the spec.
5. **HTTP status codes for edge cases** — a 400 that should have been a 422 gets handled as 400 by all callers.
6. **Pagination shape** — `next_cursor` vs `nextCursor`, presence of `total` — all become expected.
7. **Idempotency behavior** — callers retry on failure; if repeat POSTs weren't always safe, they assumed they were.

For each of the 7: mark Y (currently documented + tested) or N (implicit, untested risk). Any N = design debt.

### Step 4: Contract Validation

Verify all endpoints have Zod schema validation on input (`validateBody`/`validateQuery` middleware). Check all MCP tools have `z.string()`/`z.number()` params. Flag endpoints accepting unvalidated input. Verify response shapes are consistent.

- Check each API route for `validateBody()` or `validateQuery()` middleware usage
- Check each MCP tool for Zod schema definitions on all parameters
- Flag any `req.body` or `req.query` access without prior validation middleware
- Flag any MCP tool parameter without a Zod type definition
- Verify response shapes use consistent patterns (e.g., `{ data, meta }` or `{ result }`)
- Score: validated endpoints / total endpoints = validation coverage %

### Step 5: Breaking Change Classification

From [[swe-at-google]] Ch1/Ch15/Ch21 — classify every detected change before deciding if it needs a version bump.

| Change Type                         | Classification    | Action Required                          |
| ----------------------------------- | ----------------- | ---------------------------------------- |
| Add optional field to response      | Additive — safe   | None                                     |
| Add optional request parameter      | Additive — safe   | None                                     |
| Add new endpoint                    | Additive — safe   | None                                     |
| Remove field from response          | Breaking          | Major version bump + migration path      |
| Remove or rename endpoint           | Breaking          | Major version bump + migration path      |
| Change field type (string → number) | Breaking          | Major version bump + migration path      |
| Make optional param required        | Breaking          | Major version bump + migration path      |
| Change observable behavior (Hyrum)  | Breaking by Hyrum | Treat as breaking even if spec says safe |
| Change error message text           | Breaking by Hyrum | Announce in changelog; avoid if possible |

Run: `git diff HEAD~10..HEAD -- src/api/routes/ src/mcp/tools/` to enumerate recent changes, then classify each.

### Step 6: Compatibility Matrix

Three compatibility types to verify per change (from [[swe-at-google]] Ch21):

| Type           | Breaks When                                               | Check                                    |
| -------------- | --------------------------------------------------------- | ---------------------------------------- |
| **Source**     | A client must change its source code to compile           | Parameter rename, type change, removal   |
| **Behavioral** | A client's runtime behavior changes without source change | Semantics shift, Hyrum-covered behaviors |
| **Contract**   | A documented guarantee is revoked                         | SLA, idempotency, ordering, pagination   |

A change that is source-compatible can still be behavioral-breaking. All three axes must be evaluated.

### Step 7: Deprecation Timeline

From [[swe-at-google]] Ch15 — advisory-only deprecations rarely complete. Use compulsory pattern with staffed migration:

```
Announce → Warn → Sunset → Remove
```

| Phase        | Duration           | Action                                                                            |
| ------------ | ------------------ | --------------------------------------------------------------------------------- |
| **Announce** | Day 0              | Publish changelog; mark `@deprecated` with replacement reference                  |
| **Warn**     | 30–90 days         | Surface warning at call time (log line, response header); provide migration guide |
| **Sunset**   | End of warn period | Stop accepting new dependents; existing callers still work                        |
| **Remove**   | After sunset       | Delete endpoint; callers get 410 Gone or tool registration removed                |

Deprecation warnings must be **actionable** (link to replacement) and **relevant** (surface at call time, not in batch emails). From [[swe-at-google]] Ch15: alert fatigue is real — one clear warning beats ten vague ones.

### Step 8: Documentation Check

Verify API routes have JSDoc comments. Check MCP tools have description strings in `server.tool()` registration. Flag undocumented public endpoints. Verify parameter descriptions exist.

- Check each route handler file for JSDoc comments on exported functions
- Check each MCP tool for a `description` string in its registration
- Check MCP tool parameters for description strings
- Verify `docs/reference/MCP-TOOLS-REFERENCE.md` is up to date with current tool list
- Verify `docs/reference/REST-API-REFERENCE.md` is up to date with current route list
- Flag any public endpoint without documentation as undocumented

### Step 9: API Report

Generate the full audit report. Score 0-100 per dimension.

```bash
agf parse-api openapi.yaml --select data.endpoints   # spec → endpoints + schemas, deterministic
agf spec --validate openapi.yaml                     # spec conformance before the review reads prose
agf memory write api-design-audit-<date> --content "<scores, breaking changes, undocumented endpoints>"
```

Each breaking change is a node: `agf node add --type risk --tags api,breaking`.

## Anti-Patterns

- Do NOT add endpoints without Zod validation — every input boundary must be validated
- Do NOT rename parameters without deprecation period — consumers depend on the current contract
- Do NOT remove endpoints without migration path — provide alternatives before removal
- Do NOT use verbs in REST URLs — use HTTP methods (GET, POST, PUT, DELETE) instead
- Do NOT skip API documentation — it is the contract between producer and consumer
- Do NOT break backward compatibility without major version bump — semver is mandatory
- Do NOT treat "undocumented" as "safe to change" — Hyrum's Law applies regardless of what the spec says
- Do NOT use advisory-only deprecation for large API surfaces — it will not complete without a compulsory timeline

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
