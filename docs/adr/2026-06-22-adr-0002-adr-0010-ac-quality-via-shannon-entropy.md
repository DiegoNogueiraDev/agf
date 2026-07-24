---
number: 2
title: ADR-0010: AC Quality via Shannon Entropy
date: 2026-06-22
status: Accepted
---

# ADR-0002: ADR-0010: AC Quality via Shannon Entropy

## Status

Accepted

## Context

ACs com estrutura GWT válida mas conteúdo vago (GIVEN x WHEN y THEN z) passam a validação atual. Shannon (1948): H = -Σ p(x) log p(x). Um AC como 'THEN retorna 401 em <100ms' codifica mais informação que 'THEN sistema responde corretamente' independente da estrutura GWT.

## Decision

Usar entropia informacional de Shannon para medir qualidade de ACs, complementando a verificação estrutural GWT existente. Implementar em scoreAcTestability(): entropia léxica do THEN-clause + detector de valores concretos (números, status codes, booleanos) + similaridade cosine para redundância. Score final: estrutura GWT (40%) + entropia conteúdo (40%) + especificidade (20%).

## Consequences

Positivas: ACs gameable (estrutura sem conteúdo) são rejeitados; gates de qualidade ganham poder preditivo real. Negativas: risco de falso positivo em ACs curtos mas precisos — mitigado com bonus para valores numéricos explícitos. Implementado como recommended (não required) por 2 sprints antes de promover para required.
