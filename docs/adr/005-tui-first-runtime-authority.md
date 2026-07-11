# ADR-005: TUI-first Runtime Authority

**Status:** Accepted  
**Date:** 2026-06-06  
**Epic:** Epic 5 — Hexagonal Consolidation

## Context

The project has three consumers of runtime operations: TUI, CLI, and MCP bridge (Claude). Currently the bridge (`packages/mcp-server`) duplicates lifecycle/context logic in its own `store.ts` and `index.ts` handler functions. This dual-brain architecture creates drift risk — the bridge and TUI can produce different results for the same operations.

We need a single authority for all runtime operations: task lifecycle (start/finish/status/findNext), context queries (compact/summary/nodeDetail/children/backlog), DoD checks, and epic promotion.

## Decision

**The TUI is the primary interface. All core services live in `src/core/**`.\*\* The CLI and MCP bridge are secondary consumers that call the same services. No consumer implements business logic independently.

Core services:

- `TaskLifecycleService` — task start, finish (with 8 DoD checks), status transitions, next task pull
- `ContextRuntimeService` — flow-diluted compact context, graph summary, node details, children, backlog
- `HumanGateService` — human-in-the-loop questions/permissions/approvals
- `WorkspaceStateService` — snapshots, diffs, restores, file tracking
- `ClaudeBridgeAdapter` — thin MCP transport + delegation (no business logic)

## Consequences

- **Single source of truth** for lifecycle/DoD/context operations
- **Bridge is a thin adapter** (~89 lines of transport wiring, vs 473 previously)
- **TUI works without MCP running** — services are self-contained in `src/core/**`
- **Parity guaranteed** — TUI and bridge produce identical results because they call the same services
- **Testability** — services have pure TypeScript contracts; fakes exist for all boundaries
- **Zero vendor lock-in** — core never imports MCP SDK, Claude SDK, or vendor-specific types

## Related

- Implements requirement: TUI-first authority
- ADR-006: Claude Bridge as Thin Adapter
- ADR-008: Vendor-neutral Host Contracts
