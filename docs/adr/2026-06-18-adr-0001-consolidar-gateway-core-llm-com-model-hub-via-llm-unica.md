---
number: 1
title: Consolidar gateway core/llm com model-hub (via LLM única)
date: 2026-06-18
status: Proposed
---

# ADR-0001: Consolidar gateway core/llm com model-hub (via LLM única)

## Status

Proposed

## Context

Auditoria dogfood (2026-06) achou duas vias LLM paralelas: model-hub (ativa, usada por deliver/run/autopilot --live) e core/llm gateway (rica: failover, tool-calls, streaming, OpenRouter, mas dormente — só doctor/agent-driver referenciam). Os levers de economia nasceram divididos: response_cache vive no model-hub; compress/CCR/content-router/caveman no gateway ou no economy-orchestrator (morto). Isso fragmenta o 3o pilar (custo de token) e gera código que se passa por feature.

## Decision

Tratar model-hub como a via canônica e migrar os recursos ricos do gateway (failover-chain, tool-calling, streaming, responses API, OpenRouter) para ele de forma incremental, em vez de manter duas vias. Até a migração: levers seguros são cablados na via ativa (content-router, repo_map, artifact_reuse, response_cache — feito em WS-A/B); orchestrator/caveman/CCR-writer/aaak/economy-pipeline ficam dormentes/mortos documentados em dormant-modules.md.

## Consequences

Prós: uma via, levers num só seam, ledger íntegro, menos superfície morta. Contras: migração não-trivial (failover/tool-calls/streaming exigem testes); risco no hot-path — fazer incremental e gated. aaak-compressor e economy-pipeline viram candidatos a deleção.
