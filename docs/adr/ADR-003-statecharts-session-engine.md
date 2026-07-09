# ADR-003: Statecharts Session Engine (Harel)

**Status:** Accepted  
**Date:** 2026-06-29  
**Epic:** node_a4431656a024 (graph-leaf-cutter)

## Context

The builder loop transitions through states: idle → scanning → pulling → in_progress → gating → done → learning.
Currently, this state machine is implicit in the skill SKILL.md text and the CLI action handlers.
Implicit state machines drift; transitions accumulate ad-hoc guards and become untestable.

## Decision

Model the builder session as an explicit **Harel Statechart** (hierarchical state machine):

```
session
├── idle
├── scanning (stats · harness · gaps)
├── pulling (next --aco)
│   └── [on NO_TASKS] → exhausted
├── investigating (preflight · rg · search)
├── building (in_progress)
│   ├── red (test failing)
│   ├── green (test passing)
│   └── refactoring
├── gating (blast · check · tdd-score · harness)
│   └── [on gate-fail, retries < max] → building.red
├── closing (done · memory write)
└── exhausted
```

State transitions are pure functions; side effects (runAgf, recordInManifest) are injected.
The statechart is encoded in `src/tui/skill-handler-port.ts` as a typed reducer.

## Implementation

- Each state is a discriminated union variant of `BuilderSessionState`.
- Transitions: `transition(state, event) → state` — pure, zero side effects.
- The TUI skill runner dispatches events (task-pulled, gate-passed, gate-failed, done) to advance state.
- `src/skills/graph-builder-leafcutter.ts` wraps the statechart and wires side effects.

## Consequences

- **+** Loop behavior is auditable and testable without running real CLI commands.
- **+** Retry logic (gate-fail → building.red) is encoded once, not scattered across handlers.
- **-** Adds ~200 lines of state machine code; justified by the complexity it tames.
- **-** TUI and CLI paths must both speak the same event protocol.
