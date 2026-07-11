---
name: graph-mega-brain
description: >-
  Use when the user wants Claude to act as a full-cycle orchestrator ("mega
  brain") driving a feature or PRD through ALL 9 agent-graph-flow phases
  (ANALYZE→…→LISTENING) via the `agf` CLI — briefing and delegating the build
  (to the driving CLI itself in delegated mode, or to cheap headless executors),
  then validating gate-by-gate. Trigger (often Portuguese): "conduz/orquestra o
  ciclo inteiro pelo grafo", "leva o PRD da análise ao deploy", "roda as 9
  fases", "mega-brain isso", "ponta-a-ponta com custo baixo". Do NOT trigger for
  a single-phase task (use graph-<phase>) or planning-only (use graph-lead).
triggers:
  - graph-mega-brain
  - mega-brain
  - orchestrate-full-cycle
version: 2.0.0
author: Diego Nogueira
date: 2026-06-18
phases: [ANALYZE, DESIGN, PLAN, IMPLEMENT, VALIDATE, REVIEW, HANDOFF, DEPLOY, LISTENING]
---

# graph-mega-brain

Drive a problem through the **entire** 9-phase lifecycle as one conductor. Sit on
top of the per-phase `graph-*` skills: detect the phase, run its `agf` commands,
pass its gate, delegate the build, validate, advance. **CLI-first — zero MCP:**
every command is a real `agf <cmd>`.

## Spiral, not circle (the secret)

A loop that only repeats is dumb. A loop that **measures and learns each turn** is
a spiral — it improves every pass. The conductor's job is to close the feedback,
not just the cycle:

```
next → brief → build → submit|done → check/gate → savings → learning/heal → next
                                                   └── feedback calibrates next turn ──┘
```

Each turn cuts token cost (savings calibrates RAG/tier thresholds), compiles what
worked (learning → ~0-token fast-path), and raises the quality floor (gaps/heal).
Economy, learning, quality improve **together** — that is the living evolution.

## Two build modes — read the mode, don't assume

**First: `agf status` → `data.mode`.** agf decides delegated vs autonomous by precedence:
a modern CLI driving (Claude/Copilot/Codex/opencode) **is** the provider → **delegated**, even if a
provider key (OpenRouter, …) is configured; only standalone or explicit `--provider` → **autonomous**.

- **Delegated** (you are the brain): implement the brief with your own model, apply the edits, close
  with `agf submit`. agf's LLM spend = 0.
- **Autonomous** (agf has its own provider): `agf autopilot|run|deliver --live` build directly.

**Mismatch guard:** if you ARE a modern CLI but `data.mode` says `autonomous` (check `data.modeReason`),
your env marker wasn't recognized — drive **delegated** anyway (brief→submit) and report it so the
one-line marker fix lands (e.g. Claude sets `CLAUDECODE`, not `CLAUDE_CODE`). Never let a marker miss
silently spend a provider.

So the conductor works with or without a provider. Same graph, same gates.

## Mandatory flow

```
pre-flight (agf stats/query — reconcile) →
per phase: ANALYZE → DESIGN → PLAN → IMPLEMENT → VALIDATE → REVIEW → HANDOFF → DEPLOY → LISTENING
```

Pull, don't push (`agf next`). **WIP = 1.** Never mark `done` on a false claim —
surface loose ends as `finding`/`risk` nodes.

## Pre-flight: reconcile

Memory ≠ live state; code and graph win.

```bash
agf stats                 # counts by type & status
agf query --status done   # what the graph claims is done
```

Fix the graph first (`agf node update` / `agf node status`) before driving.

## Phase cadence (all 9)

| Phase     | Cadence (`agf`)                                                       | Gate                            | Depth skill                                 |
| --------- | --------------------------------------------------------------------- | ------------------------------- | ------------------------------------------- |
| ANALYZE   | `agf import-prd` / `agf node add` → `agf edge add` → `agf gaps`       | `agf gate analyze`              | graph-analyze, graph-prd                    |
| DESIGN    | `agf adr create` / `agf node add --type decision` → `agf code impact` | `agf gate design`               | graph-design                                |
| PLAN      | `agf decompose` → testable AC → `agf forecast` → `agf insights`       | `agf insights`                  | graph-plan                                  |
| IMPLEMENT | brief → build → close (see below)                                     | `agf check <id>`                | graph-implement                             |
| VALIDATE  | `agf check <id>` · `agf test` · `agf metrics` · `agf harness`         | `agf check <id>`                | graph-validate                              |
| REVIEW    | `agf insights` → `agf export` → `agf metrics`                         | `agf gate review`               | graph-review, graph-quality, graph-security |
| HANDOFF   | `agf memory write` → `agf snapshot create` → `agf export`             | `agf gate handoff`              | graph-handoff                               |
| DEPLOY    | `agf export` → `agf forecast`                                         | `agf gate deploy` (harness ≥70) | graph-deploy                                |
| LISTENING | `agf learning stats` → `agf node add` → `agf import-prd` (new cycle)  | `agf gate listening`            | graph-listening                             |

## IMPLEMENT — brief → build → submit/done

1. **Pull** — `agf next` (WIP=1). Confirm ready, AC testable (`agf check <id>` ≥60), no blockers.
2. **Reuse before generating** (anti-meme) — apply the chain in order, generate only the genuine delta:
   `rag-in` (`agf retrieve-command`) → `rag-out` (`agf scaffold`/`agf montar-output`) → `artifact_reuse` (exact-hit)
   → `repo_map` (input cut) → `flow` (`agf context` dilutes the neighbourhood by Φ; pinned invariants kept —
   PIN what matters first; flow only drops UNPINNED peripheral nodes; ~77–88% input cut with zero defect
   increase when pinned, proven causally) → `rag-cache` (response_cache, autonomous only).
3. **Brief** — `agf brief <id>`. Fill the `<fill:>` judgment calls (imitate, read/touch, contract, testWith).
4. **Build** — autonomous: `agf autopilot --live` / `agf run`. Delegated: implement the brief yourself, apply the edits.
5. **Close**:
   - delegated → `agf submit <id> --result '{"arquivos":[...],"testes":{"passed":N,"failed":0},"desvios":[...]}'`
     (validates → runs blast → DoD → marks done; `desvios` become findings).
   - autonomous → `agf check <id>` → `agf done <id>`.
6. **Feed back (close the spiral)** — `agf savings` / `agf metrics --economy-report` + `agf insights flow`
   (A/B verdict). `agf submit`/`agf done` already record the success outcome, so Φ(flow) rises → the next
   turn's `agf context` dilutes more. Then `agf learning stats` + `agf heal` + `agf gaps` to re-verify and
   calibrate. Loop to `agf next` — the next turn is smarter.

## Token discipline (instrument, don't trust)

- Measure every turn — `agf savings` / `agf metrics --economy-report`: tokens/$ per task, what levers saved, labeled by baseline.
- Close the loop — adjust the RAG/tier threshold from data, then re-measure. Telemetry is not passive.
- Honest cost — orchestration spends tokens on purpose; keep net economy positive and say so.

## Honesty (hard rule)

- Never mark `done` on an unverified claim — run the gate first (`agf check` / `agf submit` does this).
- A gap becomes a `finding` memory **and** a `risk` node (`agf node add --type risk`) — and you report it.
- Distinguish unit-green from real-source-green; say which you have.

## Output format

```
Cycle: <feature/PRD> | Phase: <CURRENT> → <NEXT>
Reconcile: <graph delta, if any>
Mode: <autonomous|delegated>
Build: <N tasks closed via submit/done, validated M/N>
Gate: <agf gate/check> — <pass/fail, score/harness>
Economy: <tokens/$ this turn, saved vs baseline (method)>
Learned: <thresholds/routing adjusted this turn>
Findings: <loose ends as finding/risk, or "none">
Next: <next action / phase>
```

## Anti-patterns

- **One-shot the whole system** — never; decompose (`agf decompose`), delegate per task.
- **Generate what you could retrieve** — RAG first; that's the economy.
- **Frontier for everything** — route by tier; frontier only for reasoning.
- **Trust memory counts** — reconcile graph + code (`agf stats`/`agf query`).
- **Skip the gate to go green** — fix it or record the gap.
- **Re-read the diff to validate** — use `agf submit` (parse the structured return).
- **Circle without feedback** — measure + learn each turn, or it never improves.

## Cross-tool

Drive everything via `agf` — no MCP. In delegated mode the executor is whatever
CLI is driving (Claude/Copilot/Codex/OpenCode). In Plan Mode use read commands
only (`agf stats`/`query`/`context`); don't mutate. Per-phase depth lives in
`graph-<phase>`; `graph-lead` is the reason-only conductor.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
