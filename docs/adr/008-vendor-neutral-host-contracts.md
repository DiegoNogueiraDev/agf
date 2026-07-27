# ADR-008: Vendor-neutral Host Contracts

**Status:** Accepted  
**Date:** 2026-06-06  
**Epic:** Epic 5 — Hexagonal Consolidation

## Context

The core had no explicit interface boundary for external consumers. The MCP bridge imports the MCP SDK directly and could leak vendor types into shared code. Without contracts, there's no enforcement that vendor code stays in the adapter layer.

## Decision

**Define pure TypeScript interfaces in `src/core/contracts/` for all services.** The adapter layer implements these interfaces using vendor SDKs. Core never imports vendor SDKs. Import-boundary test enforces this at build time.

Contracts defined:

```typescript
// src/core/contracts/
├── task-lifecycle.ts      // TaskLifecycleService
├── context-runtime.ts     // ContextRuntimeService
├── human-gate.ts          // HumanGateService
├── workspace-state.ts     // WorkspaceStateService
└── claude-bridge.ts       // ClaudeBridgeAdapter
```

Enforcement:

- `npm run test:import-boundary` — scans 885 core files for vendor imports
- Zero tolerance: any `@modelcontextprotocol/sdk` import in `src/core/**` fails CI
- Pattern: `scripts/enforce-import-boundary.mjs`

## Consequences

- **Clear contracts** — adapter and core communicate through well-defined interfaces
- **Swappable adapters** — MCP bridge can be replaced with HTTP/gRPC without touching core
- **Import boundary enforced** — automated check prevents vendor leakage
- **Vendor code contained** — MCP SDK lives only in `packages/mcp-server/`
- **Testability** — contract tests verify any implementation (fake or real) conforms

## Related

- Implements requirement: Vendor-neutral core contracts
- ADR-005: TUI-first Runtime Authority
- ADR-006: Claude Bridge as Thin Adapter
- `scripts/enforce-import-boundary.mjs` — enforcement
