# ADR-004: Information Bottleneck Gate on Context Packing

**Status:** Accepted  
**Date:** 2026-06-29  
**Epic:** node_a4431656a024 (graph-leaf-cutter)

## Context

`agf context <id>` assembles a context pack for the builder. Without bounds, it can grow
unboundedly as epics accumulate dependencies, glossary entries, and related nodes.
Large context packs cost tokens and dilute the signal-to-noise ratio for the LLM.

## Decision

Apply an **Information Bottleneck (IB)** gate after context assembly:

1. Tokenize the assembled pack.
2. Compute relevance score per section: `rel(s) = MI(s; task_AC) / H(s)` (mutual information between section content and the task AC, normalized by section entropy).
3. Drop sections with `rel(s) < θ_IB` (default θ_IB = 0.15).
4. If `total_tokens > budget`, iteratively drop the lowest-rel section until within budget.

The IB gate runs as a post-assembly step in `agf context` — it never drops L1 (current task fields) or AC; only L2/L3 enrichment is subject to pruning.

**Token budget:** derived from `agf economy list` — the active `budget_kleiber` lever sets the per-task token ceiling via Kleiber's 3/4 power law scaling.

## Implementation

- `src/core/context/compaction.ts`: IB pruning logic (section scorer + drop loop).
- `agf context <id> --ib` flag: opt-in for IB gate (default off to preserve byte-identical output).
- `agf economy on ib_gate`: economy lever to enable globally.
- Unit tests in `src/tests/compaction.test.ts` (section scorer with mock MI estimator).

## Fitness Function Alignment

The IB gate is one dimension of the harness scoring:

- `context(0.05)` dimension: passes when context pack is within token budget AND IB gate applied.
- `fitness(0.15)` dimension: passes when the packed context correlates with task AC (rel > θ_IB for AC section).

## Consequences

- **+** Context packs stay within token budget automatically.
- **+** Reduces distraction: LLM sees only task-relevant material.
- **-** MI estimation is approximate (bigram proxy, not true MI); may drop useful sections.
- **-** θ_IB requires per-project tuning; default 0.15 is conservative.
