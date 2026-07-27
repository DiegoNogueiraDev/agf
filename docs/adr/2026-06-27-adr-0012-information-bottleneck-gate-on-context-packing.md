---
number: 12
title: Information Bottleneck Gate on Context Packing
date: 2026-06-27
status: Accepted
---

# ADR-0012: Information Bottleneck Gate on Context Packing

## Status

Accepted

## Context

Aggressive context truncation in compact-context L2-L4 can drop key constraint/AC words silently.

## Decision

Gate lossy context compression with IB criterion: accept only when compressionRate - β·infoLoss ≥ 0 (β=2).

## Consequences

Prevents silent quality regression; slightly lower compression ratio but zero regression risk
