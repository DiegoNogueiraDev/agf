---
number: 4
title: ADR-0012: Lessons-Store Injection at Context-Pack Assembly
date: 2026-06-22
status: Accepted
---

# ADR-0004: ADR-0012: Lessons-Store Injection at Context-Pack Assembly

## Status

Accepted

## Context

O lessons-store existe (lessons-store.ts) mas não está conectado ao autopilot-loop. Lições acumuladas de falhas anteriores não afetam execuções futuras. Hebb (1949): LTP ocorre quando pré-sinapse ativa pós-sinapse repetidamente. ACT-R (Anderson): activation = base-level + associative.

## Decision

Injetar lições do lessons-store no context-pack em task-prep.ts, ANTES do implement-attempt. Ranking por ACT-R activation score: W_i = B_i + Σ(W_j \* S_ji), onde B_i decai exponencialmente com o tempo. Top-3 lições, max 500 tokens, timeout async 200ms com degradação graciosa.

## Consequences

Positivas: agente aprende de falhas anteriores; taxa de retry deve cair. Negativas: latência de +200ms por attempt (tolerável com timeout). Risco: lessons irrelevantes podem poluir o contexto — mitigado com similarity threshold 0.7.
