---
number: 7
title: agf orquestra browser agent para RPA (sem pivotar)
date: 2026-06-24
status: Accepted
---

# ADR-0007: agf orquestra browser agent para RPA (sem pivotar)

## Status

Accepted

## Context

0.20.0 precisa de RPA de browser via CDP. O browser agent (repo irmao) ja e executor CDP production-grade (daemon + 50 tools + autonomia + self-heal). O agf ja tem cdp-\* mais simples.

## Decision

O agf DIRIGE o browser agent por CLI/JSON (browser agent call <tool>) e referencia dele so o essencial. NAO portar em massa nem reescrever o agf em torno de browser. O agf permanece orquestrador SWE/grafo; RPA e capability adicional via ponte fina (src/plugins/browser/browser-agent-bridge.ts). cdp-\* do agf fica como fallback/legado.

## Consequences

Caminho rapido p/ 0.20.0; baixo acoplamento (2 repos, contrato CLI/JSON); browser agent como dependencia externa versionada. Risco: drift de contrato (mitigado por teste de contrato + 8 codigos estaveis). Guardrail: qualquer passo que converta o agf em ferramenta de RPA e fora de escopo.
