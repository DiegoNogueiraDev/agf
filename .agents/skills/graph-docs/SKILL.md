---
name: graph-docs
description: Documentation health audit using JSDoc completeness, README freshness, example code validation, CLAUDE.md convention coverage, API documentation, and architecture doc generation from graph
triggers:
  - graph-docs
version: 1.1.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-docs

Documentation health audit using JSDoc completeness, README freshness, example code validation, CLAUDE.md convention coverage, API documentation, and architecture doc generation from graph. Identifies documentation gaps, stale content, and drift between docs and code.

## When to Use

- Before HANDOFF phase, to ensure documentation is complete
- During quarterly doc reviews
- When onboarding new developers
- When CLAUDE.md needs updating after significant changes
- During LISTENING phase for documentation improvements

## Mandatory Flow

```
CLAUDE.md audit --> README check --> JSDoc coverage --> API docs --> example validation --> architecture docs --> changelog --> report --> write_memory
```

## Living Documentation Principles

From [[pragmatic-programmer]] (Ch8 — Pragmatic Projects):

1. **Code is the truth; docs lie when they diverge.** If a doc cannot be generated from code, it will rot. Prefer active generators (scripts that extract API shapes, types, routes) over hand-written prose that describes what the code does.

2. **DRY applied to knowledge.** A business rule described in a README and also in a JSDoc comment and also in a test description is three representations of one fact. Collapse them: the JSDoc is authoritative, the README links to it, the test name reflects it.

3. **If you can't run it, you can't trust it.** Every code example in docs must be executable and verified on CI. A broken example is worse than no example — it signals "nobody checks this."

## DRY Docs Checklist

Generate (from code) — do NOT hand-write these:

- [ ] API endpoint list → generate from route definitions (e.g., `ts-morph` scan of `src/api/routes/`)
- [ ] MCP tool descriptions → generate from `server.tool()` registrations
- [ ] Type reference → generate from exported TypeScript types via `typedoc`
- [ ] CLI flag table → generate from the CLI parser schema
- [ ] Changelog → generate from conventional commits via `release-please` or `conventional-changelog`

Hand-write (cannot be derived from code):

- [ ] Architecture narrative — the "why" behind module boundaries
- [ ] Onboarding walkthrough — first-run sequence, mental model
- [ ] Decision log (ADRs) — rationale for non-obvious choices
- [ ] Gotchas and known limitations — tribal knowledge that tests don't encode

## Comment Quality Rubric

Comments explain WHY, not WHAT. The code already says what it does.

| Quality               | Example                                                                           | Verdict         |
| --------------------- | --------------------------------------------------------------------------------- | --------------- |
| Explains intent       | `// Skip deleted nodes — soft-delete tombstones must not appear in graph exports` | GOOD            |
| Documents invariant   | `// Cache must never exceed maxSize — OOM risk in long-running daemon`            | GOOD            |
| Flags known debt      | `// TODO(#412): replace linear scan with indexed lookup once nodes >10K`          | GOOD            |
| Restates the code     | `// Increment counter by 1` next to `counter++`                                   | BAD — delete it |
| Describes the obvious | `// Return the result`                                                            | BAD — delete it |

**Five-second test**: cover the comment and read the code. If you already understand it, delete the comment.

## Freshness Signal

A doc is stale when:

1. Any source file it references has a `git log` date newer than the doc's own `git log` date.
2. A type, function, or module name it mentions no longer exists in the codebase.
3. A command it lists exits non-zero when run.
4. Its last commit message is >90 days old and the referenced code has changed since.

**Staleness check (bash)**:

```bash
# Find docs older than their referenced source files
git log --follow -1 --format="%ci" -- docs/architecture/STORE.md
git log --follow -1 --format="%ci" -- src/store/index.ts
# If store/index.ts is newer → flag STORE.md as stale
```

Flag threshold: doc is stale if source is >14 days newer.

## Workflow

### Step 1: CLAUDE.md Audit

Verify CLAUDE.md covers all critical conventions:

- ESM imports (`.js` extension), Zod v4, strict mode, naming conventions
- Logger usage, testing rules, path-specific rules

Compare CLAUDE.md sections with actual codebase patterns. The docs dimension is measured, not argued:
`agf harness --select data.breakdown.docs`. Introspect what the code actually exposes with
`agf docs manifest` (tools, routes, docs) and compare it against what CLAUDE.md claims. Flag: outdated
conventions, missing new patterns.

### Step 2: README Freshness

Run `npm install` + `npm run dev`, `npm test`, `npm run build` to verify commands work. Apply **Freshness Signal** to the README itself. Flag broken commands, outdated screenshots, missing sections.

### Step 3: JSDoc Coverage

```
JSDoc coverage = functions with JSDoc / total exported functions
```

Apply **Comment Quality Rubric** to sampled comments. Flag: WHY-less comments and restating-the-code comments.

### Step 4: API Documentation

Apply **DRY Docs Checklist** — verify that API docs are generated, not hand-maintained. For MCP tools: verify each tool has description in `server.tool()`. Cross-reference with `docs/reference/`.

### Step 5: Example Code Validation

For each code example in `docs/` and README: verify syntax, verify referenced modules exist, verify output matches current behavior. Apply the **Living Documentation Principles** rule: if it can't be run, flag it.

### Step 6: Architecture Documentation

Generate/verify architecture docs from the graph with `agf export --format mermaid`. Library docs the
project depends on are cached and searchable: `agf docs list`, `agf docs search "<query>"`, `agf docs sync <lib>`.
Apply **Freshness Signal** — compare doc commit dates against referenced module dates.

### Step 7: Changelog Completeness

Verify CHANGELOG.md covers recent releases. Cross-reference with git tags. Check every `feat:`/`fix:` commit has a changelog entry. Apply **DRY Docs Checklist** — changelog should be generated, not hand-written.

### Step 8: Documentation Report

```
CLAUDE.md coverage: <N>%
README freshness: <days since last update>
JSDoc coverage: <N>%
API doc coverage: <N>%
Example validity: <N>%
Architecture drift items: <N>
Stale docs flagged: <N>
Changelog completeness: <N>%
Top 5 gaps: <list>
Overall grade: <A-F>
```

**Grading:**

- **A (90-100):** All docs current, JSDoc > 80%, no stale examples, no drift
- **B (75-89):** Minor gaps, JSDoc > 60%, few stale examples
- **C (60-74):** CLAUDE.md outdated, JSDoc < 60%, some broken examples
- **D (45-59):** Significant gaps, many undocumented APIs, architecture drift
- **F (< 45):** Critical doc debt, broken README, no JSDoc, stale architecture

Save findings:

```bash
agf memory write documentation-audit-<date> --content "<coverage scores, gaps, recommendations>"
```

## Anti-Patterns

- Do NOT treat docs as afterthought — write alongside code
- Do NOT let CLAUDE.md go stale — it's the AI pair programmer's primary context
- Do NOT skip JSDoc on public functions — they're the API contract
- Do NOT leave broken examples — they mislead developers
- Do NOT document what doesn't exist yet — document what IS
- Do NOT write docs without testing commands — broken setup instructions are worse than none
- Do NOT hand-write what can be generated — generated docs can't drift from code
- Do NOT write WHAT comments — explain WHY or delete the comment

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
