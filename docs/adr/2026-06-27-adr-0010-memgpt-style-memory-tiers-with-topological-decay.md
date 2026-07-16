---
number: 10
title: MemGPT-style Memory Tiers with Topological Decay
date: 2026-06-27
status: Accepted
---

# ADR-0010: MemGPT-style Memory Tiers with Topological Decay

## Status

Accepted

## Context

Session length is unbounded but context window is not; need graceful degradation.

## Decision

Three-tier memory architecture: hot (flow-compact), warm (episodic-outcomes), cold (archival/agf memory). Auto-paging when hot exceeds window.

## Consequences

Unbounded session length without token explosion; recall accuracy must be verified across tiers
