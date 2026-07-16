---
name: harness-engineering
description: Evaluate project harnessability — composite agent-readiness metric across 9 dimensions (types, tests, architecture fitness, docs, naming, error handling, context density, provenance, connectivity). Also scans for dormant (exported-but-unwired) capabilities. Run during VALIDATE, REVIEW, and DEPLOY phases.
triggers:
  - harness-engineering
  - harnessability
  - agf harness
  - harness:scan
  - dormant capability
version: 2.0.0
author: Diego Nogueira
date: 2026-07-04
phases:
  - VALIDATE
  - REVIEW
  - DEPLOY
---

# harness-engineering

Evaluates **harnessability** — a composite, 9-dimension metric indicating how ready the
codebase is to be operated by an AI coding agent. Based on "Harness Engineering for Coding
Agent Users" (Böckeler, Thoughtworks 2026), extended with 5 dimensions this project added:
naming clarity, error-handling hygiene, context density (JSDoc), provenance, and
connectivity (dormant-code reachability).

> **Command-agnostic reminder:** the exact CLI surface below reflects this project's
> current `agf harness` implementation (`src/core/harness/`). If it drifts, trust
> `agf harness --help` and `agf retrieve-command "harness score"` over this file — this
> skill describes the _model_ (dimensions, weights, grading, dormant-triage), which stays
> stable much longer than any specific flag name.

## When to Use

- During **VALIDATE phase** — before marking a sprint or epic done, run to confirm agent-readiness did not regress
- During **REVIEW phase** — include the score + violations in the code review blast radius report
- During **DEPLOY phase** — `agf gate deploy` requires harness grade ≥ B (score ≥ 70)
- When **adding new modules** — verify type coverage, tests, and docs are in place
- After **large refactors** — architecture fitness catches dependency-direction violations early
- As a **periodic health check** — track score trend across releases (`--saturation`)
- Whenever you export a new public function/class — check `--dormant` catches it if nothing
  calls it yet, so it doesn't silently rot (see [[graph-woodpecker]], [[graph-builder-leafcutter]])

## Score Dimensions (9, weights sum to 1.0)

| Dimension    | Weight | What it measures                                                                                          |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------- |
| Types        | 0.25   | % of public functions/exports with explicit type annotations (no bare `any`)                              |
| Tests        | 0.25   | Structural module→test-file proximity match (not % lines covered)                                         |
| Fitness      | 0.10   | Architecture rules: dependency direction, no circular deps, barrel integrity, file-size compliance        |
| Docs         | 0.10   | % of public symbols with JSDoc + README/guide presence                                                    |
| Naming       | 0.10   | Generic-identifier detection (`data`, `result`, `temp`, `val`) and single-char names outside tight scopes |
| Errors       | 0.05   | Raw `throw` (untyped) usage, empty catch blocks, swallowed errors                                         |
| Context      | 0.05   | Missing JSDoc on exported functions (context density for an agent reading cold)                           |
| Provenance   | 0.05   | Untracked/unattributed changes — audit-trail gaps                                                         |
| Connectivity | 0.05   | % of exported symbols reachable from a real surface (CLI/TUI/MCP/web/tests) — see Dormant Scanning below  |

**Formula:** `score = types×0.25 + tests×0.25 + fitness×0.10 + docs×0.10 + naming×0.10 + errors×0.05 + context×0.05 + provenance×0.05 + connectivity×0.05`

Weights and dimension count are read from the live scorer (`src/core/harness/harnessability-score.ts`
in this project) — don't hardcode a number you haven't confirmed against that file, it has
changed more than once (this file used to describe a 4-dimension, 30/30/20/20 model that no
longer matched reality for months before this refresh).

## Grade Scale

| Grade | Score | Recommendation                                               |
| ----- | ----- | ------------------------------------------------------------ |
| **A** | ≥ 85  | Agent-ready. Maintain.                                       |
| **B** | ≥ 70  | Mostly ready. Review the lowest-scoring dimension.           |
| **C** | ≥ 55  | Usable but agent friction. Prioritize the weakest dimension. |
| **D** | < 55  | Urgent — refactor before expecting reliable agent operation. |

## How to Use

### 1. Run the scan

```bash
npm run harness:scan          # plain scan: grade + score + breakdown per dimension
npm run harness:gate          # CI gate: exit 1 when architecture fitness < threshold
agf harness --violations      # attach file-level violations + per-dimension remediation advice
agf harness --saturation      # attach a deterministic dimension-saturation signal (needs prior history)
agf harness --dormant         # list exported capabilities with no surface consumer (see below)
```

`--violations` output includes an `advice` field (grouped by dimension, top files, a
fix suggestion) **only when at least one dimension scores below 70** — an empty/healthy
project omits the field entirely rather than returning an empty array; don't treat a
missing `advice` key as an error.

### 2. Interpret each dimension

**Types < 70:** add return types to public functions; annotate exported interfaces; run
`tsc --noEmit` to confirm the type-check itself passes (a high types score with a failing
type-check means the scanner is being fooled by an unsafe cast — check for `as unknown as`).

**Tests < 70:** create `src/tests/<module-name>.test.ts` matching the module's basename —
this is a proximity/existence check, not a coverage-percentage check, so even a thin test
counts toward the score; but a thin test does NOT satisfy TDD or the DoD gate, which check
assertion quality separately. Write real tests regardless of what moves the number.

**Fitness < 70:** check dependency direction (`core/` must not import `cli/`/`mcp/`/`api/`/`web/`),
circular deps, barrel-export completeness, oversized files (>800 lines). A configurable
custom-rule engine exists (`contract-engine.ts`, markdown-compilable rules) but is NOT the
live scorer — the fitness score comes from hardcoded checks in `fitness-functions.ts`. Do
not assume adding a rule to a `.claude/rules/*.md` file changes this score; it currently
doesn't (a real gap, filed as a WIRE-task finding — verify it hasn't been closed since).

**Docs / Context < 70:** add JSDoc to exported functions — but only where the _why_ is
non-obvious (see the project's own Golden Rule on comments); a docstring that just repeats
the function name doesn't help an agent reading cold and may not move this score either,
since the scanner checks presence not quality.

**Naming < 70:** rename generic identifiers (`data`, `result`, `temp`, `res`) to describe
what the value IS, and single-char names outside genuinely tight scopes (loop counters,
short lambdas) to something a cold reader doesn't have to trace back to find meaning.

**Errors < 70:** replace raw `throw new Error(...)` with a typed error class from
`utils/errors.ts`; remove empty `catch {}` blocks (log or re-throw, never swallow silently).

**Provenance < 70:** run the project's provenance backfill/scan tooling to attribute
untracked historical changes; new changes should already carry attribution by convention.

**Connectivity < 70 — read this one carefully, it is the newest and most-abused dimension:**
a symbol scores as "connected" only if reachable from a **production surface**
(CLI/TUI/MCP/web). It does **not** currently credit a symbol whose sole real consumer is a
test file (`src/tests/*.test.ts`) — a known scanner blind spot, not a code problem. Before
chasing this score down, `agf harness --dormant` and read the finding; see **Dormant
Scanning** below before writing any code.

### 3. Dormant Scanning (`--dormant`) — triage, don't blind-wire

`agf harness --dormant` (via `dormant-report.ts`) lists exported symbols with zero callers
from a production surface. This is **raw signal, not a validated backlog** — the same
harvest [[graph-builder-leafcutter]] consumes to generate `WIRE-task` nodes. Before writing
a line of code for any dormant finding, classify it:

1. **False positive.** `grep -rln "<exportedSymbol>" src/tests/*.ts` — if a real test
   genuinely imports and exercises it (not just re-exports), it's already reachable; the
   scanner just can't see test-only reachability. Close, no code needed.
2. **Superseded, not incomplete.** A sibling module already solves the same problem, and
   is the one actually wired — often a cruder/older prototype (in-memory state that can't
   survive a fresh-process CLI, a naive regex vs. a tokenized+scored version). Verify by
   reading the wired sibling's logic, not just its existence — twice in one session the
   _dormant_ code held the correct fix and the _wired_ code had the bug.
3. **Half an epic.** The mechanism is complete, but its named consumer was never built (a
   docblock naming a caller that doesn't exist, or call it; a whole subsystem directory
   with zero registry wiring). Scope the missing consumer as a real task — don't build it
   inline without design (that's planning work, see [[graph-backlog-generation]]).
4. **Systemic scaffolded family.** The exact same shape repeats across several
   directories (e.g., one file per lifecycle phase, all designed for a tool surface that
   was never built). Name the whole family once; don't triage N files as N unrelated
   findings.
5. **Overlaps an already-wired system.** A "generic" engine whose behavior duplicates a
   hardcoded checker that's already live. Wiring it as a second surface would confuse users
   more than leaving it dormant — find the one genuinely differentiating capability (if
   any) and scope narrowly to just that.
6. **Genuine, safe wire.** None of the above — the symbol is pure, correct, and has either
   a natural existing call site (an option/field nobody threads through yet) or deserves a
   small new command. Wire it with TDD, exactly as any other feature.

Only bucket 6 gets code in the same cycle; buckets 1–5 are legitimate findings on their
own — file them with the specific evidence (which sibling, which family, which overlap),
don't leave a bare "investigated, unclear" note.

### 4. Act on the grade

```
Grade A → No action. Log score in sprint/session review.
Grade B → Open a task for the lowest-scoring dimension. Fix in the next cycle.
Grade C → Block ship until at least one dimension improves.
Grade D → Escalate. Refactor before shipping new features.
```

### 5. Integrate with lifecycle gates

- `agf gate deploy` requires harness grade ≥ B (score ≥ 70) as one of its checks —
  a failing harness score blocks the deploy gate, not just a soft warning.
- `--saturation` compares the current scan to the persisted `harness_history` table
  (needs at least one prior scan) and reports whether a dimension has plateaued —
  useful before investing more effort in a dimension that's already near its ceiling.

## Anti-Patterns

- **Do NOT ignore a D grade** and ship anyway — agent operations will be unreliable.
- **Do NOT fake test files** to boost the tests score — the scanner checks proximity, not
  assertion quality, but a fake test still fails the DoD/TDD gates separately.
- **Do NOT skip fitness violations** — dependency-direction breaks compound across releases
  and get expensive to unwind later.
- **Do NOT treat a dormant-scan hit as a validated task** — triage it into one of the 6
  buckets above before writing code; most hits are NOT a clean mechanical wire.
- **Do NOT assume the wired sibling is correct** when closing a "superseded" finding —
  read both implementations; the dormant one may hold the fix.
- **Do NOT hardcode this file's dimension weights/count into other docs or memory** — they
  drift; point at the live scorer file instead of copying numbers forward.

## Related

- Implementation: `src/core/harness/` (scorer: `harnessability-score.ts`, scan orchestrator:
  `harness-scan-runner.ts`, dormant scan: `dormant-report.ts`)
- CLI: `src/cli/commands/harness-cmd.ts`
- npm scripts: `harness:scan`, `harness:gate`
- Companion skills: [[graph-woodpecker]] (fixes what harness finds), [[graph-builder-leafcutter]]
  (consumes `--dormant` output as its harvest backlog), [[graph-backlog-generation]] (plans
  epics from unresolved dormant/gap findings)

## Codex Notes

- In Codex Plan Mode, use this skill for planning only and do not mutate files.
- During implementation, follow the project `AGENTS.md` rules and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
