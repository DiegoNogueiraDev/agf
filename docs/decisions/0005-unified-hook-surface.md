# ADR 0005 — Unified Hook Surface (HookBus 28)

## Status

Accepted — 2026-06-17.

## Context

Quatro projetos explorados (tool-compress, Superpowers, ICM, e uma taxonomia de 28 hooks
do loop agêntico) sugeriam construir um sistema de hooks. A exploração do código
mostrou que **o motor (HookBus, GraphEventBus, plugin API) e as 28 capacidades
subjacentes já existiam** — economy ledger, compaction/lossy-gate/CCR, circuit
breaker, learning store, gates/DoD, retry/failover, memory, budget. O gap real
não era construir, e sim **expor + ligar (dispatch) + tornar plugável** os ~18
pontos de ciclo de vida que ainda não eram canais do HookBus.

## Decision

### 1. Taxonomia aditiva de 28 canais (Task 1.1)

Estender `HOOK_CHANNELS` de forma puramente **aditiva** (zero breaking change nos
16 canais existentes). Um mapa `HOOK_TAXONOMY` (28 pontos → canal) reusa os 5
canais sobrepostos (`task:pre-execute`, `tool:pre-call`/`post-call`,
`task:post-complete`, `task:error`) e adiciona 23 canais novos. Canal desconhecido
→ `UnknownHookChannelError` (typed, nunca string crua).

### 2. Action model (Task 1.2)

`HookActionResult` com ações `allow | deny | modify | record | halt`. Split
sync (determinístico, <10ms, qualquer ação) vs async (só `record`). `reduceHookResults`
define a precedência de composição: **halt > deny > modify(merge) > record > allow**.

### 3. Registry hook→capability (Task 1.3)

`hook-capability-registry.ts` mapeia cada um dos 28 pontos ao módulo que JÁ
implementa a capacidade, com teste de cobertura + existência on-disk — trava
drift e scope-creep (nenhuma capacidade nova é reconstruída).

### 4. Dispatch wiring (Tasks 2.1–2.6)

Um emissor por fase (`<fase>-lifecycle-hooks.ts`) usa o HookBus compartilhado +
guard `AGF_HOOKS=0` + `resolveHookChannel`. Dispatch inserido nos call sites
reais: LLM gateway, context builder + checkpoint, economy orchestrator + cache +
budget, circuit breaker + task-lifecycle, compaction + learning, status/gate/next.
`emitSync` isola erros de handler → **byte-identical com zero handlers**.

### 5. Surface de config plugável (Tasks 3.1–3.3)

- **TOML** (estilo tool-compress): `[[hook]]` com `channel`/`command`/`priority`; protocolo
  de exit-code `0=allow, 1=passthrough, 2=deny, 3=ask` → `HookActionResult`.
- **Programático**: `registerHook(channel, handler, {priority})` sobre o shared
  bus, com ordem de prioridade determinística e unregister.
- **CLI**: `agf hooks list | test <channel> | discover` (zero-MCP).

## Consequences

- (+) Surface unificado de 28 hooks, plugável via TOML e API, sem reescrever
  capacidades; backward-compatible; kill-switch global.
- (+) Custo no hot path comprovadamente <10ms/emit sem handler (suíte de
  não-regressão).
- (−) **Dois buses ainda coexistem**: task-hooks pelo store-bus, hooks 2.x pelo
  shared-bus (finding `node_ea0f86630c0e`). A ponte store→shared e o
  **enforcement** das ações `deny`/`halt` (agir no retorno para short-circuitar o
  fluxo) ficam como follow-up da camada de dispatch.
- (−) 5 falhas de teste **pré-existentes** (`output-profiles`, `pipeline-cmd`,
  finding `node_2998b42b3d59`) bloqueiam o gate `agf done` — os 11 dones usaram
  `--skip-test` com não-regressão verificada manualmente.

## Referências

- Épico: `node_6855d893367e` (root). ADRs de design: taxonomy/result-model/config.
- Skills: `agf hooks list` para inspeção; `src/core/hooks/*-lifecycle-hooks.ts`.
