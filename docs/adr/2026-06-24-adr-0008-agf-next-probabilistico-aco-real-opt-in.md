---
number: 8
title: agf next probabilistico (ACO real) opt-in
date: 2026-06-24
status: Accepted
---

# ADR-0008: agf next probabilistico (ACO real) opt-in

## Status

Accepted

## Context

Leafcutter descreve ACO mas agf next e guloso por prioridade; feromonio e escrito e nunca lido. Sinal de reward ~0 sem provider.

## Decision

Adicionar selecao por roleta P=tau^a\*eta^b opt-in (agf next --aco) que LE as trilhas; default permanece deterministico byte-identico; reward usa harness_delta/ac_pass/cycle_time quando tokens=0; evaporacao retroalimenta a leitura.

## Consequences

Compound learning entre sessoes; opt-in protege o fluxo atual; risco de calibracao de a/b mitigado por A/B (agf insights flow) e fallback deterministico.
