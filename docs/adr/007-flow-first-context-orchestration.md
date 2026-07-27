# ADR-007: Flow-first Context Orchestration

**Status:** Accepted  
**Date:** 2026-06-06  
**Epic:** Epic 5 — Hexagonal Consolidation

## Context

`λ_flow = λ_base + α·Φ(t)` is implemented in `src/core/context/flow-index.ts` and orchestrated in `flow-compact.ts`, but it was only used in the `context(action:"compact")` MCP tool. Other context entry points (`start_task`, TUI display, Claude bridge context, telemetry) bypassed the formula. The formula was a lateral feature instead of a central policy.

## Decision

**`applyFlowToCompact` becomes the single context decision engine.** Every context entry point passes through it. The formula nodes Φ(t), λ_flow, e^{-λ·d} are modeled in the graph for traceability.

Entry points now governed by λ_flow:

- `start_task` → `startTaskWithFlow()` wraps through `applyFlowToCompact`
- TUI context → `RealContextRuntimeService.compact()` delegates to `applyFlowToCompact`
- Claude bridge context → bridge delegates to store queries (route to flow-compact)
- Telemetry → `flow-metrics-store.ts` records Φ, λ, and token savings per call

Property tests verify:

- **Monotonicity** of λ_flow (λ increases monotonically with Φ)
- **Hysteresis** of Φ (failure resets to 0, success asymptotes to 1)
- **Invariant preservation** (pinned types never diluted)
- **Legacy fallback** (flow_off preserves exact legacy behavior)

## Consequences

- **Consistent context** — all entry points see the same flow-diluted view
- **Token savings** — flow_on arm reduces context tokens by pruning peripheral nodes
- **Flow index visible** — Φ and streak displayed in TUI, recorded in telemetry
- **Safe experiment** — A/B arm system allows flow_off control group
- **Zero regression** — flow_off arm returns exact legacy format

## Related

- Implements requirement: Flow-first context orchestration
- Formula nodes: Φ(t), λ_flow = λ_base + α·Φ(t), e^{-λ·d}
- `src/core/context/flow-index.ts` — pure computation
- `src/core/context/flow-compact.ts` — orchestration
