# Diagnóstico de Entrega — agent-graph-flow (rumo à v1.0.0)

> Snapshot de 2026-06-14, branch `feat/connect-ported-engine-cli` (v0.13.2).
> Fonte: leitura do código + do **grafo vivo** (653 nós, 463 `done` = 71%).

## Promessa (filtro de avaliação)

> Um agente de IA que entrega software **rápido**, com **as melhores práticas de
> engenharia**, a **custo de token brutalmente baixo**.

A avaliação abaixo mede cada entrega contra esses 3 pilares.

---

## ✅ Entregue e testado — a espinha dorsal madura

| Capacidade                         | O que entrega                                                                                                                                                                    | Pilar          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Motor de grafo + autopilot FSM** | Loop autônomo puro/determinístico: WIP=1, DoD gate, escalation, ciclo TDD (reuse→gerar→parse→exec→retry com feedback compacto)                                                   | Rápido + SWE   |
| **45 comandos CLI (`agf`)**        | Todos registrados/lazy-loaded: `deliver`, `build`, `run`, `autopilot`, `eval`, `metrics`, `provider`, `status`, `kanban`, `phase`, `next`, `check`, `init`, `doctor`…            | Rápido         |
| **Tier-router + multi-provider**   | 3 tiers (cheap/build/frontier) + fallback frontier; Copilot HTTP/CLI, OpenRouter, Ollama local, OpenAI, Groq, Cerebras; failover chain                                           | Custo          |
| **Medição de tokens real**         | `llm_call_ledger` (SQLite) + `cost-tracker` (44 modelos); `metrics --baseline` (decompõe a fatura em 3 termos) + `--simulate` (re-precifica em todos os modelos)                 | Custo          |
| **Pipeline `deliver`**             | pedido → PRD → grafo → build TDD, autônomo; intake OCR-first com sumarização 0-token                                                                                             | Rápido + Custo |
| **Harness de eval**                | `scenario-runner` + dual test-runner (vitest+node:test) + `scorecard` (resolve% · custo-por-sucesso · tokens · p50/p95); suite T0–T5 + graph-crud + delivery-pipeline            | SWE            |
| **TUI Ink**                        | dashboard, kanban (swimlanes/sort/filter), graph tree, diff, 180+ slash-commands, vim-nav, busca FTS, toasts, error-boundary                                                     | Rápido         |
| **Alavancas de economia**          | tool-compress output-compressor (15 filtros, lossless), wake-up L0–L3 (orçamento de contexto), cache stack (FNV-1a key-composer, adaptive/provider-TTL, anthropic cache-control) | Custo          |
| **Spec-kit & governança**          | constitution, preset (default/strict-tdd/agile-light/enterprise), spec/spec_sync, plugin, principles (doctrine λ_flow), harness scan                                             | SWE            |

**Veredito do entregue:** os 3 pilares têm sustentação real. O grafo determinístico +
TDD obrigatório + token-ledger são o núcleo do diferencial, e funcionam.

---

## 🟡 Em voo — código existe, **não fechado no grafo**

| Frente                                                         | Estado                                                                                                                                                                  | Evidência no grafo                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **ICM Fusion** (`node_b0b785195719`, `ready`)                  | EP-1 (CLI Provider), EP-2 (Output Compression), EP-6 (TUI): **tasks todas `done`**, mas **épicos + AC ainda `backlog`**. EP-3 (cache), EP-4 (DX), EP-5 (testes) abertos | corresponde ao WIP `cli-provider/`, `output/`, ~20 arquivos TUI  |
| **Token Economy Unification** (`node_85e4c85aafd0`, `backlog`) | ADRs (001–005 + P1–P8 de porte) e contratos INV-1..6 desenhados, mas **0 tasks decompostas**; código existe uncommitted                                                 | `economy/` (wake-up, aaak, content-router), intake, skeletonizer |
| **Eval Framework** (`node_1d16255616dd`, `backlog`)            | ADRs 012–015 `ready`, suite existe, mas oracle bugs e benchmark sem repeats                                                                                             | `evals/suite/`, `evals/results/` (uncommitted)                   |
| **WIP não commitado**                                          | **47 modificados + 94 untracked**                                                                                                                                       | `git status`                                                     |

**Leitura:** o trabalho de v1 está **majoritariamente feito, mas não encerrado**. O grafo
não reflete a verdade do código pronto — falta promover, validar AC e decompor.

---

## ❌ Lacunas — o que falta para a v1 oficial

| Lacuna                        | Detalhe                                                                                      | Severidade                 |
| ----------------------------- | -------------------------------------------------------------------------------------------- | -------------------------- |
| **Stubs `start` / `done`**    | Pipeline puro pronto; ação é `cmd.help()`                                                    | Média (wiring leve)        |
| **Harness 65.6 (C) < 70 (B)** | Gate de release. Débitos: Arch Fitness 33→70, Error Handling 0→70, Provenance 22→50          | **Alta**                   |
| **Testes ausentes**           | `implementer/` (0), `deployer/` (0), `listener/` (0); `analyzer/` 38 impl : 5 testes         | **Alta**                   |
| **E2E nunca rodado**          | Caminho `deliver` com provider autenticado real nunca validado (limitação do sandbox)        | **Alta**                   |
| **Benchmark fraco**           | 24/~84 modelos; n=5 sem repeats; full-suite só 1 modelo; vários resultados 0-byte (timeouts) | Média                      |
| **Custo não comprovado E2E**  | A promessa "2–4x" ainda não é número medido e documentado                                    | **Alta** (é o diferencial) |

---

## Métricas de saúde (do grafo vivo)

- **Progresso:** 463/653 `done` (71%), 1 `in_progress`, 0 blocked, 189 backlog.
- **Harness trend:** 56.5 → 65.6 (Grade C), **melhorando** (+9.1). Gate de DEPLOY: ≥70 (B).
- **Backlog health:** `cleanForNewCycle: false` — há débito técnico aberto (harness A/B/D, stub integrations, test:blast drift).
- **Dormentes** (fundações limpas, não conectadas): `guardian`, `sandbox`, `event-store`, `session`, `patch`, `core/llm` gateway, `services/{workspace-state,human-gate}`.

---

## Veredito final

O produto é **funcionalmente completo** e o diferencial (custo + grafo + TDD) é **real**.
O caminho para a v1.0.0 oficial **não é construir mais — é encerrar e provar**:

1. **Encerrar** as 3 frentes em voo no grafo (promover, validar AC, decompor o que falta).
2. **Provar** o custo brutalmente baixo com número medido (`metrics --baseline`/`--simulate`).
3. **Endurecer** até grade B (harness ≥70) e validar E2E com provider real.

O backlog formal desta release está em `prd-v1-oficial.md`, importado no grafo como o épico
**`v1.0.0 — Release Oficial`**.
