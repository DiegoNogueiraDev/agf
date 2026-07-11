---
number: 13
title: HTN Skill Planner
date: 2026-06-27
status: Accepted
---

# ADR-0013: HTN Skill Planner

## Status

Accepted

## Context

Flat skill delegation misses formal decomposition guarantees; need provably correct multi-step planning.

## Decision

Each graph-\* skill declares HTN operators with preconditions/effects. New htn-planner.ts auto-decomposes epics into task trees.

## Consequences

agf build generates full task trees from PRD; formal decomposition replaces ad-hoc chains
