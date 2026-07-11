# ADR-001: ACO Pheromone Model (Dorigo 1992 + MMAS)

**Status:** Accepted  
**Date:** 2026-06-29  
**Epic:** node_a4431656a024 (graph-leaf-cutter)

## Context

The builder loop selects the next task from the backlog using a fitness function.
Without reinforcement, the loop has no memory of which approaches worked and which failed — it re-explores expensive dead-ends every cycle.

## Decision

Use **Ant Colony Optimization** (Dorigo 1992) with **Max-Min Ant System (MMAS)** bounds:

- Each task node carries a pheromone value `τ ∈ [τ_min, τ_max]`.
- On task completion: `τ ← (1-ρ)·τ + Δτ` where `Δτ = Q / cycle_time`.
- On failure: `τ ← (1-ρ)·τ` (evaporation only, no deposit).
- MMAS bounds: τ is clamped to `[τ_min, τ_max]` after every update.
- Stagnation detection: when entropy `H_norm < 0.30`, all τ ← τ_max (reset).

The fitness of a task combines pheromone with heuristic value (PERT estimate, Pareto bucket):

```
fitness(i) = τ_i^α × η_i^β
```

where `η_i = 1 / estimated_cycle_time_i`.

## Implementation

- `src/core/economy/colony/`: pheromone deposit, evaporation, stagnation reset.
- `src/core/economy/ga-loop.ts`: GA-inspired crossover of successful trails.
- Stagnation detection already shipped in node_9534afbf7ed4.

## Consequences

- **+** Loop reinforces winning task strategies without human tuning.
- **+** MMAS bounds prevent premature convergence.
- **-** Pheromone persistence in SQLite adds a new column to `nodes` (managed by migration).
- **-** Requires ρ and Q tuning for each project type.
