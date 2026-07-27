# Architecture — agent-graph-flow

## Core Principle: Delegate-First

The external agent (Claude Code, Copilot CLI, etc.) is the primary orchestrator.
`agf` LLM integration is a **fallback** — `llm_call_ledger` showing 0 tokens is correct, not a bug.
See: `agf brief <id>` for the delegate handoff protocol.

## Graph as Source of Truth

All work flows through the SQLite graph (`workflow-graph/graph.db`).

- Every implementation task MUST have a node (`agf node add` or `agf import-prd`)
- Status lifecycle: `backlog → in_progress → done` (validated by `status_flow`)
- No code without a corresponding graph node — zero untracked work

## Layer Map

```
src/
├── cli/        — agf CLI commands (one file per command)
├── core/       — domain logic (graph, llm, gaps, harness, economy, ...)
│   ├── graph/  — SQLite store, node/edge CRUD, migrations
│   ├── llm/    — provider adapters, protocols, tier-router
│   ├── gaps/   — completeness gap detection
│   └── harness/— quality scoring (8 dimensions, A-D grade)
├── mcp/        — MCP server (optional; agf is primary CLI, zero MCP required)
├── plugins/    — plugin registry and loader
├── schemas/    — Zod schemas for config, permissions, fuzzy-search
├── skills/     — graph lifecycle skills (graph-implement, graph-validate, ...)
├── tui/        — Ink-based TUI components and state machines
└── tests/      — all Vitest test files (flat structure, stems match source names)
```

## Provider Model

10 providers auto-detected from env vars (`agf doctor --providers`).
Route: `agf provider use <id>` selects the active gateway.
Tier-router: cheap→mid→frontier auto-selects model by task complexity.

## Harness Dimensions (8)

types(0.25), tests(0.25), fitness(0.15), docs(0.10), naming(0.10),
errors(0.05), context(0.05), provenance(0.05) → overall grade A-D.
Target: A(85+). Run: `agf harness`.

## Key Invariants

- WIP = 1 at all times (Little's Law)
- Blast gate mandatory before `agf done`: `npm run test:blast`
- `agf check <id>` before `agf done` — 12-check DoD
- All tests in `src/tests/*.test.ts` — no co-located test files
