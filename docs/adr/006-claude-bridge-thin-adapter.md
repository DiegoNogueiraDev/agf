# ADR-006: Claude Bridge as Thin Adapter

**Status:** Accepted  
**Date:** 2026-06-06  
**Epic:** Epic 5 — Hexagonal Consolidation

## Context

`packages/mcp-server` currently implements its own `GraphStore` with direct SQLite access, lifecycle logic, DoD checks, and service handlers (473 lines in `index.ts`). This duplicates the core runtime and creates drift risk — the bridge can diverge from TUI behavior.

The bridge also imports `@modelcontextprotocol/sdk` directly and has no contract boundary with core services.

## Decision

**`packages/mcp-server` becomes a pure MCP transport + delegation layer.** Every tool handler calls a core service. The bridge contains zero SQL, zero lifecycle logic, zero DoD checks.

Architecture:

```
packages/mcp-server/src/
├── index.ts           (~89 lines) — transport wiring only
├── tools-catalog.ts   (~134 lines) — pure tool schemas
├── tool-delegates.ts  (~290 lines) — thin dispatch to store
└── store.ts           (~232 lines) — DB adapter (read-only queries)
```

The bridge:

1. Opens the shared SQLite graph database
2. Registers MCP tool schemas (10 tools)
3. Delegates every tool call to store queries (which will eventually delegate to core services)

## Consequences

- **Bridge is maintainable** — each module has a single responsibility
- **Can be swapped** — transport could change from stdio to HTTP without touching core
- **Tools catalog is reusable** — other transports (HTTP, gRPC) can import the same schemas
- **Zero business logic** — the bridge has no lifecycle/DoD/context implementation
- **Backward compatible** — all 10 MCP tools preserved with identical behavior

## Related

- Implements requirement: Claude bridge thin adapter
- ADR-005: TUI-first Runtime Authority
- ADR-008: Vendor-neutral Host Contracts
