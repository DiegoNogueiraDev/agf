---
number: 9
title: ACO Pheromone Model with MMAS (Max-Min Ant System)
date: 2026-06-27
status: Accepted
---

# ADR-0009: ACO Pheromone Model with MMAS (Max-Min Ant System)

## Status

Accepted

## Context

Need a formal optimization algorithm for the colony loop that avoids premature lock-in and monopoly.

## Decision

Use MMAS variant of ACO (Stützle & Hoos 2000) with τ_min=0.1, τ_max=5.0, ρ=0.10, α=1.0, β=2.0, q0=0.70, ξ=0.10 for the graph-leaf-cutter improvement selection algorithm.

## Consequences

MMAS prevents lock-in (τ_min) and monopoly (τ_max), ACS rule q0 balances exploit/explore, requires persistent pheromone store
