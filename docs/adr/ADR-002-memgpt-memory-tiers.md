# ADR-002: MemGPT-style Memory Tiers with Topological Decay

**Status:** Accepted  
**Date:** 2026-06-29  
**Epic:** node_a4431656a024 (graph-leaf-cutter)

## Context

The builder loop operates across hundreds of tasks. Relevant pheromone memories decay.
Hot context (current task) is tiny; cold context (past successes) is large but rarely needed.
Loading all memory into each prompt is prohibitively expensive (token budget).

## Decision

Adopt a **three-tier memory model** inspired by MemGPT (Packer et al. 2023):

| Tier          | Scope                       | Storage                  | Eviction             |
| ------------- | --------------------------- | ------------------------ | -------------------- |
| L1 — Working  | Current task + direct deps  | In-prompt                | Never (per-task)     |
| L2 — Episodic | Last 20 completed tasks     | SQLite `memory_episodes` | LRU by `accessed_at` |
| L3 — Semantic | Pheromone trails + patterns | SQLite `pheromone_log`   | Topological decay    |

**Topological decay** for L3: memories that are topologically far (many graph hops) from the current task decay faster. Implemented as `heat_kernel` lever (`e^{-tL}` diffusion on the graph Laplacian).

Context packing selects:

1. Always: L1 (current task context-pack).
2. On-demand: L2 episodes matching `agf memory search "<topic>"`.
3. Pointer-only: L3 pheromone file paths (never full content in prompt).

## Implementation

- `src/core/rag/memory-dynamics-tick.ts`: L3 decay tick.
- `src/core/memory/case-distillation.ts`: L2 episode compression.
- `agf memory write pheromone-<slug>`: deposits L3 trails.
- `agf context <id>`: assembles L1 + retrieves relevant L2 on demand.

## Consequences

- **+** Token cost per task stays bounded (L1 only by default).
- **+** Long-running loops learn without unbounded context growth.
- **-** L2/L3 retrieval adds latency (~20ms SQLite query).
- **-** Topological decay requires graph Laplacian recomputation on topology changes.
