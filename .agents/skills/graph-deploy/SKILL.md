---
name: graph-deploy
description: Execute the DEPLOY phase via the `agf` CLI — release, DORA metrics, provider choice, cost proof; strictest gate (harness ≥ 70). Zero MCP
triggers:
  - graph-deploy
version: 2.0.0
author: auto-generated
date: 2026-06-16
category: DEPLOY
phase: DEPLOY
tokens: ~623
phases: [HANDOFF, LISTENING]
---

# graph-deploy

Release, DORA, provider choice, cost proof. Drive via the `agf` CLI — **zero MCP**. Load context with `agf context <id>` before changing anything.

## When to Use

- HANDOFF approved
- Preparing a release (strictest gate: harness ≥ 70)

## Mandatory Flow

```
agf gate deploy → agf forecast → agf metrics --simulate
```

## Steps (DEPLOY phase)

| Command                          | Does                                             |
| -------------------------------- | ------------------------------------------------ |
| `agf provider use <id>`          | choose provider (openrouter/copilot/ollama)      |
| `agf deliver "<request>" --live` | autonomous end-to-end delivery                   |
| `agf forecast`                   | DORA (deploy freq, lead time, CFR, MTTR)         |
| `agf metrics --simulate`         | re-price real bill under all models (cost proof) |
| `agf gate deploy`                | DEPLOY gate (release_check + harness ≥ 70)       |

## Workflow

1. **Gate** — `agf gate deploy` (release_check + harness ≥ 70)
2. **DORA** — `agf forecast`
3. **Cost proof** — `agf metrics --simulate`
4. **Provider** — `agf provider use <id>` (if switching for release)
5. **Deploy** — run the project deploy pipeline
6. **Post-deploy** — verify health checks, logs, metrics
7. **Baseline** — `agf snapshot create` (post-deploy state)
8. **Transition** — `agf phase LISTENING`

## Exit

- [ ] Release validated
- [ ] Harness ≥ 70 (B)
- [ ] DORA baseline saved
- [ ] Cost simulation reviewed

## Output Format

```
Phase: DEPLOY → LISTENING
Release: validated  Harness: X (≥70)
DORA: deploy Y/day, lead P85 Zh, CFR W%, MTTR Vh
Cost: re-priced under N models
Snapshot: pre + post
Status: deployed, monitoring in LISTENING
```

> Loop link → LISTENING (graph-listening): `agf learning stats`. Spiral: `agf savings` → `agf learning` → next.

## Anti-Patterns

- Don't deploy with harness < 70 — strictest release gate
- Don't ignore cost — use `--simulate` for proof
- Don't deploy without a pre-deploy snapshot (rollback)
- Don't skip post-deploy validation

## Related Skills

- $graph-handoff — `agf skill show graph-handoff`
- $graph-listening — `agf skill show graph-listening`

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
