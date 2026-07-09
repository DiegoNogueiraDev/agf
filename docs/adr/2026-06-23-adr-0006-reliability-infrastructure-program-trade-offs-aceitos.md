---
number: 6
title: Reliability Infrastructure Program: Trade-offs Aceitos
date: 2026-06-23
status: Accepted
---

# ADR-0006: Reliability Infrastructure Program: Trade-offs Aceitos

## Status

Accepted

## Context

Programa de 4-8 semanas focado em cobertura de testes, quality gates e observabilidade. Velocidade de entrega de features brutas é deliberadamente sacrificada para construir infraestrutura de qualidade.

## Decision

Aceitar três trade-offs explícitos no curto prazo: (1) zero features brutas novas, apenas infraestrutura; (2) DORA deploy frequency não muda automaticamente — depende de pipeline CI; (3) sensação de 'entreguei algo' baixa por 4-8 semanas.

## Consequences

O que NÃO muda no curto prazo: 1) Velocidade de features brutas — time foca exclusivamente em quality gates, testes e observabilidade. 2) DORA deploy frequency — sem pipeline CI, deploy freq permanece manual. 3) Sensação de entrega — sem features visíveis por 4-8 semanas. Critério de revisão: se quality gate não atingir 60% em 6 semanas, reavaliar escopo do programa.
