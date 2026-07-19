---
number: 11
title: Statecharts Session Engine (Harel)
date: 2026-06-27
status: Accepted
---

# ADR-0011: Statecharts Session Engine (Harel)

## Status

Accepted

## Context

Flat session state causes mode-confusion bugs in autopilot/live-implement; need structured state management.

## Decision

Replace flat session-state.ts with hierarchical FSM following Harel Statecharts: IDLE→ANALYZE→DESIGN→... with sub-modes and orthogonal regions.

## Consequences

Eliminates mode-confusion bugs; history states enable zero-loss resume; replaces flat v2 model
