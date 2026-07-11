---
number: 5
title: ADR-0013: Adaptive Quality Thresholds via Homeostatic Calibration
date: 2026-06-22
status: Accepted
---

# ADR-0005: ADR-0013: Adaptive Quality Thresholds via Homeostatic Calibration

## Status

Accepted

## Context

O quality-gate documenta thresholds 95/95% mas DEFAULT_THRESHOLDS reais são {tests:35, logs:40} em quality-gate.ts:39. Cannon (1926) homeostase: variáveis reguladas têm setpoints que ajustam com contexto, não constantes fixas. Histerese: threshold de falha = setpoint - 5pp para evitar oscilação.

## Decision

Substituir DEFAULT_THRESHOLDS hardcoded {tests:35, logs:40} por thresholds calibrados via P75 da distribuição histórica do projeto. Floor mínimo: tests>=50%, logs>=50%. Phase-dependent: IMPLEMENT usa setpoint×0.85, DEPLOY usa setpoint×1.0. Calibração ativa após 10+ tasks done.

## Consequences

Positivas: gate calibrado ao projeto real; corrige discrepância documentação vs código; 95/95 passa a ser o default real quando sem histórico. Negativas: projetos novos (<10 tasks) usam defaults; risco de calibrar para baixo mitigado pelo floor 50/50.
