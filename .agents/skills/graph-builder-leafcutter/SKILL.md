---
name: graph-builder-leafcutter
description: Use when an unblocked task exists in the agf graph and you want it built end-to-end — autonomously and perpetually — pulling the next task (WIP=1), investigating, implementing with TDD, learning, and selecting the next until the backlog is exhausted. Use right after graph-backlog-generation injects a backlog, or to make agf dogfood its own backlog. NOT for planning or writing a PRD (that is graph-backlog-generation). Triggers — graph-builder-leafcutter, leafcutter, golden-wren, build loop, implement the backlog, dogfood loop, continuous improvement, self-heal loop, loop de implementação, esgotar backlog, melhoria contínua.
triggers:
  - graph-builder-leafcutter
  - leafcutter
  - golden-wren
  - build-loop
version: 2.5.0
requires_agf: '>=0.20.0'
author: Diego Nogueira
date: 2026-07-03
tools_used:
  [
    start,
    next,
    preflight,
    search,
    context,
    brief,
    submit,
    done,
    check,
    tdd-score,
    node status,
    node add,
    harness,
    gaps,
    scaffold,
    retrieve-command,
    economy,
    learning,
    memory,
    savings,
    heal,
  ]
tokens: ~1300
---

# graph-builder-leafcutter

The builder. An autonomous, perpetual loop that consumes the backlog from
`graph-backlog-generation` and implements it with excellence — investigate, TDD,
review, tests, handoff, listening — while learning via ACO/pheromone stigmergy and
GA-inspired selection, and spending the fewest possible output tokens.

## When to Use

- An unblocked task exists in the graph and you want it built end-to-end
- You want `agf` to implement its own backlog autonomously, perpetually
- A backlog was just injected (by `graph-backlog-generation`) and needs execution
- You want a self-improving loop: investigate → implement → learn → reinforce → next

Do NOT use to plan or write a PRD — that is `graph-backlog-generation`.

## ⛔ Hard rule — BUILD ONLY, never plan (read this first)

When this skill is invoked you **implement tasks that already exist** — you do **not**
plan. No PRD, no new epic, no backlog decomposition, no "while I'm here let me design
the next feature". You consume nodes the planner already created; you never author the
backlog. If the work you need has **no task node**, do not invent the plan here —
**STOP and signal `graph-backlog-generation`** (or drop a one-line `task`/`risk` node
for the planner to triage), then pull the next _ready_ task. Designing scope is leaving
the builder.

The one thing you DO add to the graph is an **honesty node** — a `risk` / `bug` /
`task` stub for a loose end you hit mid-build, so nothing is faked done. That is
reporting for the planner to refine later, never a full PRD.

The builder **owns git** (the planner never touches it): branch-per-implementation →
TDD → merge to `main` → commit/push → delete the branch. The graph says _what_; you
decide _how_, prove it with tests, and ship it. This is the exact complement of the
planner, which produces only graph nodes + plan text and touches neither code nor git
— together they run as two agents in one loop: **plan → build → plan → …**.

## Deterministic loop (low-reasoning fast-path)

If you are a low-reasoning model (Haiku, DeepSeek Flash, MiniMax, etc.), follow THIS
exactly — top to bottom, no judgement. Obey every **STOP** and **DEFAULT**. The rich
Workflow below is the same loop for stronger models; this is the compiled version.

1. `agf next --select data.id` → got an id? (ACO is the smart-default now — plain `agf next`
   already pulls via the pheromone roulette when the field is informative, deterministic on a
   cold field; add `--no-aco` to force the deterministic sort, `--aco` to force the roulette.)
   **No** → check `code` in response:
   - `NO_TASKS` + `hardBlocks[]` non-empty → skip blocked tasks (runtime missing); log
     each `requiredRuntime` and continue waiting — do NOT signal the planner as exhausted.
   - `NO_TASKS` + `hardBlocks[]` empty + backlog non-empty (`agf stats`) → escalate:
     output "blocked: backlog non-empty but nothing unblocked" and surface to user.
   - `NO_TASKS` + backlog empty → **HARVEST, don't stop**: backlog-empty is the _trigger_, not the end. This is automatic — `agf autopilot` HARVESTS by default at NO_TASKS and re-pulls (generated WIRE-tasks re-feed the loop; stops only when harvest is also dry). Pass `--no-harvest` to opt out. To run it by hand: `agf migrate-ac --commit` (collapse AC-nodes into parents), close specs whose implementers are done, `agf risk triage` (surface/promote), `agf wire-dormant --ingest` (dormant capabilities → WIRE-tasks). Did harvest generate new tasks? → back to 1 (the loop self-feeds). **Only if harvest is ALSO dry** → STOP: output "backlog + harvest exhausted" and signal `graph-backlog-generation`.
2. **Pick when many are ready (no math):** lowest-id `must`; no `must` → lowest-id
   `should`; tie → lowest id. Ignore the fitness formula unless you can compute it.
3. `agf preflight "<task title>"` → verdict `wip-conflict`, or a match on **another**
   id → **STOP** and report. (`duplicate-risk` on the picked id itself = expected → go on.)
4. `agf context <id>` → read it. `agf search "<feature>"` (always present) + `rg "<key symbol>" src` (or `grep -rn "<key symbol>" src` where ripgrep is absent).
   **DEFAULT: the file already exists → edit it (EXPAND).** Only `agf scaffold` if search
   returns nothing.
5. `agf node status <id> in_progress`.
6. Write the **failing test first** from the AC → run it → see it fail → minimal code to
   pass. No test written = **STOP** (TDD is mandatory).
7. `npm run test:blast` → red? fix; **max 3 tries**, still red → `agf node add --type bug …`
   and **STOP**. Green → continue.
8. `agf check <id>` → a required check fails → fix it, or file a `risk` node, then retry.
9. `agf done <id>` → red on an **unrelated/pre-existing** test → `agf node add --type risk …`,
   then `agf done <id> --test-cmd "npx vitest run <your test file>"`.
10. `agf memory write pheromone-<slug>` (what worked **+ the gotcha**) → go to 1.

**Never:** plan/PRD, create a file that already exists, mark done with a red gate or a
false claim, or hold >1 task `in_progress`.

## Golden Rules (builder edition)

> The full universal set (spec-first, single-source DRY, static contract tests for
> UI without unit infra, physical AC↔code↔test triangulation, prove-value-in-the-
> consumer's-mode, honesty nodes) lives in `_shared.md` → **Golden Rules (universal
> engineering)** — obey it verbatim; the list below is the builder-specific slice.
> The cycle handoff MUST follow `_shared.md` → **Close-out Report Format** (delivery
> table + Achado transversal + Honestidade + `Próximo: X — porque [fundamento]`).

The project's golden rules, distilled for IMPLEMENT. Non-negotiable:

1. **Investigate & reuse before writing.** `agf preflight` + `rg`/`agf search` for the
   owning module FIRST; **EXPAND, don't recreate** (DRY/Rule-of-Three). Net-new only
   when it provably does not exist — recreating from scratch is the top failure here.
2. **Graph is the source of truth.** No code without a node; code/graph beat memory/plan.
3. **WIP = 1, pull not push** (Little's Law: CT = WIP/TH).
4. **TDD is mandatory** — Red → Green → Refactor; no test = no implementation.
5. **Quality is a gate, not prose.** Clean Code · SOLID · KISS · YAGNI verified by
   `harness`/`tdd-score`/`check` — file <800, fn <50, 1 responsibility, no `any`, typed errors.
6. **Honesty.** Surface loose ends as `risk`/`bug` nodes; never mark `done` on a false
   claim; read savings from the ledger (`agf metrics`/`savings`), never estimate them.
7. **Dogfood.** In-repo use `npm run dev -- <cmd>`, never the stale installed binary.

## Mandatory Flow

```
scan (stats·harness·gaps) → next (WIP=1) → INVESTIGATE (preflight·rg·search → EXPAND, don't recreate)
  → mark in_progress → BUILD (TDD Red→Green→Refactor + Clean Code/SOLID + economy)
  → self-review → GATES (blast·check·tdd-score·harness[·mutation]) → done (honest gate)
  → learn (pheromone) → select next by fitness (ACO + GA) → repeat until exhausted → restart
```

WIP = 1 at all times (Little's Law: CT = WIP/TH). The **HOW to implement excellently**
(Clean Code · SOLID · DRY/KISS/YAGNI · TDD · XP · docs · logging), the **code-reuse
decision tree**, and the **practice→gate map** live in
[references/engineering-practices.md](references/engineering-practices.md); the ACO/GA +
pheromone + economy mechanics in [references/aco-economy.md](references/aco-economy.md).
Load on demand.

> The loop below is the **IMPLEMENT slice** of agf's 9-phase lifecycle. For the
> _full_ command surface — analyze · design · plan · validate · review · handoff ·
> deploy · listening, plus the provider/economy, learning/colony, graph-data, and
> ops families (every one of the ~110 commands) — load
> [references/capability-map.md](references/capability-map.md) on demand. Never
> memorize commands: `agf help` · `agf <cmd> --help` · `agf retrieve-command "<intent>"`.

> **Command-agnostic:** commands below are illustrative — the source of truth for the
> exact, current command is always `agf retrieve-command "<intent>"` (RAG-IN) or `agf help`.
> This skill never goes stale when commands are added or renamed.

## Workflow

### Step 1 — Scan & select (Monitor + ACO/GA)

```bash
agf stats --select data.byStatus · agf harness --saturation · agf gaps --severity required · agf learning stats --select data.accuracy
```

Pick the next task by **fitness = PERT × Pareto × value**, biased by pheromone
trails (`agf memory search "pheromone"`) — winning patterns reinforce, stale ones
decay. This is the ACO + GA-inspired selection.

### Step 2 — Pull, then INVESTIGATE before you touch code (golden rule)

```bash
# Encapsule os passos agf num só round-trip (sem shell &&/|) — economia de tokens:
agf exec chain "next --select data.node.id; preflight '<topic>'; context <id> --compressed"
agf search "<feature>" ; rg "<module|feature|symbol>" src   # find what exists (rg → grep -rn where no ripgrep)
agf node status <id> in_progress  # claim it only AFTER you know what you'll touch
```

> Prefira `agf exec chain "a; b; c"` a rodar `a`, `b`, `c` em linhas separadas: 1 ciclo de store, 1 envelope, menos tokens. Use `agf exec pipe` quando o passo seguinte precisa do `.data` do anterior.

- **Most tasks are EXPAND-not-create.** In real loops the core module / table /
  lever usually already exists — find it and extend the owning module. Greenfield
  `agf scaffold <name>` is the exception, not the default. Recreating from scratch
  is the most common failure here (violates DRY + the golden rule).
- **A task says "write a build script" but the logic belongs in the tested core.**
  When a standalone script (a bundler `.mjs`, a CI helper) **cannot import the compiled
  core** (bundled entrypoints, not per-module output), do NOT re-implement the logic
  inside the script — that duplicates it AND leaves the tested core **dormant** (rule 9).
  Put the pure logic in the core (DIP-injected I/O, unit-tested), expose it as a **CLI
  command** that reuses it, and let the script/CI be a one-liner that calls the command.
  A shipped command must also be **discoverable** — register it wherever the context/RAG
  index derives from, or it stays invisible to the next agent even though it runs.
- **`preflight` returns `duplicate-risk` matching the picked task ITSELF — that is
  expected.** Only stop for an _other_ node match or a `wip-conflict` verdict.
- **GOTCHA — `agf next` has NO epic/tag/session scope.** It picks 100% globally by
  priority, then by smallest id (FIFO) among unblocked tasks. Priority ≠ recency: an
  OLD task from another PRD with the same priority beats a freshly-planned one just by
  having a lower id (by design, not a bug). So when your intent is to continue a
  specific epic you (or the planner) just built, **do NOT accept the global pull
  blindly** — check the returned id belongs to the target epic (`agf node show <id>`
  → confirm `parentId`); if it doesn't, pull the epic's tasks manually by id
  (`agf node status <targetTaskId> in_progress`) instead of `agf next`. A correct
  backlog (right parentId/AC/depends_on) does NOT make `agf next` epic-aware — the
  picker simply has no notion of "the epic I meant".
- For a genuinely trivial task you may collapse this into `agf start` (next +
  context + in_progress), but never skip the `rg`/`search` reuse check.
- Delegating? `agf brief <id>` emits the spec; close with `agf submit <id> --result <json>`.
- **GOTCHA — Commander.js silently drops a subcommand's own flag when the parent
  command defines the same flag name.** A parent `Command` and a `.addCommand()`-
  attached subcommand both declaring e.g. `-d, --dir` causes Commander to silently
  fall back to the parent's default, ignoring the value passed after the subcommand
  name — no error, just wrong data flowing downstream. Reproduce it in isolation with
  a throwaway `node -e` script before assuming the bug is elsewhere. Fix: add
  `.enablePositionalOptions()` to the parent `Command` (options before the subcommand
  name bind to the parent, options after bind to the subcommand). Found and fixed
  twice in this codebase (`context-cmd.ts`, `loop-cmd.ts`) — check for it whenever a
  new subcommand under an existing parent command misbehaves on a flag that "should"
  work.
- **GOTCHA — a lifecycle/process port taking a `pid: number` must guard `pid > 0`
  before calling `process.kill`/`kill(pid, sig)`.** Unix `kill()` treats `pid === 0`
  as "signal the entire process group" and negative pid as "signal a process group by
  id" — never a single-process target. A registry that persists `pid` before the real
  spawned pid is known (e.g. registering, then spawning) can silently write `0`,
  turning a later `stop`/`kill` into a broadcast that can take down the caller's own
  shell. Whenever you wire a stop/kill path for a background process: (1) persist the
  pid only AFTER the real spawn resolves, never before, and (2) guard the kill call
  itself with `if (pid > 0)` as defense in depth.

### Step 3 — BUILD with economy (TDD + Clean Code/SOLID)

- **RAG-IN first:** `agf retrieve-command "<intenção>"` for the exact command.
- **Expand the owning module; reuse helpers (DRY).** Create new files only for
  genuinely new concerns. Cache repeated generations in RAG-OUT (`agf montar-output`).
- **TDD Red→Green→Refactor:** write the failing test from the AC's Given-When-Then →
  watch it fail → minimal code to pass → **refactor applying Clean Code + SOLID**
  (tests stay green). One assertion focus per test; positive + negative + edge cases.
- Keep additive/opt-in (default OFF = byte-identical) so existing tests stay green
  — this is how you get **zero regression** for free.
- Output stays compressed (`--ai`, `--select`) to minimise tokens.

### Step 4 — Close out HONESTLY (self-review + gates + DoD)

**Self-review first (~30 tokens, replaces an expensive round-trip):** any placeholder
left? did scope leak? are all AC covered? is the default still intact?

```bash
npm run test:blast        # MANDATORY gate — run STANDALONE; must be green
agf check <id>            # DoD (required checks must pass)
agf tdd-score <id>        # TDD quality 0–100 (coverage + assertion diversity)
agf harness --violations  # Clean Code/SOLID/naming/errors enforced, not claimed
# optional: agf check <id> --mutation --source <file>   # robustness (kill-ratio ≥ 0.60)
agf done <id>             # marks done + suggests next
```

**Hierarchical test gates (cost ∝ risk):** `npm run test:blast` per task (above);
`npm run test:node` when an epic is promotion-ready; `npm test` once pre-PR. Promote a
phase only through `agf gate <phase>` (DoD/harness/readiness) — e.g. `agf gate deploy`
requires harness ≥ 70. Don't run the full suite per task; don't push on a red gate.

**Gate reality (earned in real loops — read before fighting a red `done`):**

- **Anti-hallucination gate (`PHANTOM_TESTFILE`).** `agf done` now refuses a task whose declared
  `testFiles` **or** `implementationFiles` do **not** exist on disk — a delivery no real code/test
  backs. This is the AC ↔ code ↔ **physical test** triangulation (both axes) enforced on entry, and
  it applies to ANY project agf drives (resolved against `--dir`). Fix it honestly: write the missing
  file, or repoint a stale reference with `agf node update <id> --test-files|--implementation-files
<real files…>` — never `--force` past it just to go green (that re-creates the hallucination).
- `agf done` runs the **full** suite by default. A _pre-existing, unrelated_
  failure will block it. Confirm it is not yours: `git stash -u` → rerun the
  failing test → `git stash pop`. If it fails on clean `main`, it is pre-existing.
- `agf done --test-cmd "npm run test:blast"` can fail with a **DB lock / code 1
  when the changed set is wide** (done holds `graph.db` open while spawning the
  gate) even though blast passes standalone. Workaround: run blast standalone for
  real coverage (above), then give `done` a _targeted_ receipt:
  `agf done --test-cmd "npx vitest run <changed-area test files>"`.
- **Closing a `risk`/spec node whose mitigation you just built:** the task-DoD `done`
  gate requires acceptance criteria, and a `risk` node has none — so `agf done` will
  fail on `has_acceptance_criteria`. That is a node-shape mismatch, NOT a false pass:
  the honest signal is your real gates (blast + `check` + `harness` green + the test
  proving the behavior). Close it with the raw forward transition (`agf node status
<id> done`), not `agf done`. Never invent AC just to satisfy the task gate.

- Pre-existing failure, a bug you discovered, or a deferred integration →
  `agf node add --type risk|task …` **before** `done`. Then complete your task on
  the real gate. Never mark done on a false claim (anti-vibe-coding).

Fold REVIEW (`agf insights` / blast radius), HANDOFF (`agf memory write`,
`agf snapshot`), and LISTENING (DORA retro) into the close-out.

### Step 5 — Learn & reinforce (stigmergy)

```bash
agf savings · agf metrics --economy-report · agf learning · agf memory write pheromone-<slug>
```

Deposit a pheromone trail for what worked **and the gotchas you hit** (so the next
iteration skips the diagnosis you already paid for); link related trails with
`[[other-pheromone]]`. Weak trails decay. `agf heal` self-repairs graph noise.
Then loop to Step 1.

**At a batch/cycle boundary (before handing back), render the handoff per `_shared.md` →
Close-out Report Format** — the DELIVERY TABLE (`Entrega | O quê | Prova`, every claim
graph-backed: `N testes · <commit>`; blocked items get their own row citing the honesty
node; epics show `test:node` promotion) + Achado transversal + Honestidade + the decided
next step (`Próximo: X — porque [fundamento]`). Obey that section verbatim — it is the
single source; do not re-improvise the format here.

### Step 6 — Exhaustion → harvest → restart

When no unblocked task remains, **harvest before stopping** — `agf autopilot` does this by default at NO_TASKS (`--no-harvest` opts out)
(or the manual pass in Step 1) — it collapses AC-nodes, surfaces risks, and turns dormant
capabilities into WIRE-tasks, re-feeding the loop. Only when the harvest is **also** dry do
you signal `graph-backlog-generation` to inject the next cycle, then resume the loop.

**WIRE-task triage — a harvest hit is raw output, not a pre-validated backlog.** Before
touching code, classify the dormant module into one of five buckets; only the first is a
mechanical wire, the rest are honest `blocked` findings:

1. **False positive — check `src/tests/` before anything else.** The dormant-scanner only
   walks CLI/TUI/MCP/web surfaces; it cannot see that a module is a deliberate test-only
   fixture/stub. `grep -rln "<exportedSymbol>" src/tests/*.ts` first — if a real test
   imports and exercises it (not just re-exports), close the node immediately as a
   confirmed false positive, no further investigation needed.
2. **Superseded, not incomplete.** A sibling module already solves the same problem
   better (and is the one actually wired) — e.g. an in-memory prototype replaced by a
   SQLite-backed store, or a naive regex duplicate replaced by a tokenize+stopword+Jaccard
   version. Tell-tale sign: the REAL wired module's own docblock explains why the dormant
   one can't work here ("each command is a fresh process, so the in-memory X cannot
   survive between tasks"). Forcing a wire here would be a regression, not a fix — block
   it citing the superior sibling.
3. **Half an epic.** The mechanism is complete and well-designed, but the consumer it was
   built for was never built (a docblock naming a specific caller that doesn't exist or
   doesn't call it; a whole plugin/subsystem directory with zero registry wiring). Building
   the missing consumer from scratch is planning-scale work — block it, name the missing
   piece precisely, and let the planner decide whether to build it.
4. **Systemic scaffolded family.** Multiple files share the exact same shape/purpose across
   different lifecycle-phase directories (e.g. one `validation.ts` per phase, all Zod
   schemas for the same never-built tool surface). Don't triage these one at a time — name
   the whole family in the first finding and block the rest with a one-line cross-reference,
   so the planner makes ONE decision instead of N.
5. **Overlaps an already-wired system.** A "generic engine" whose built-in rules duplicate
   a hardcoded checker that's already live (e.g. a configurable architecture-rule engine
   vs. the harness's own hardcoded fitness functions). Shipping it as a second, parallel
   surface confuses users more than leaving it dormant — find the one genuinely
   differentiating capability (if any) and scope a wire to _only_ that, or block with the
   overlap named explicitly.

**Only bucket 0 (genuine, safe mechanical wire) gets code.** Two safe sub-patterns worth
naming: (a) a **typed-error swap** — a dormant `XError extends GraphError` almost always has
a real throw-site in the sibling module matching its name-prefix (`grep "throw new
McpGraphError" <sibling-dir>`); safe to swap when no `instanceof` check on the generic type
exists anywhere and both extend the same base — update the one test that asserts the old
type, that's intentional, not a regression. (b) **new standalone command** — when a pure,
already-correct function has no natural existing call site (the flow that "should" call it
is detection-only, or forcing it into a tested flow risks behavior change), add a small new
`agf <verb> <arg>` command rather than bending an existing one. Zero risk: nothing calls it
unless a user explicitly does.

**Rigor check when a wire's integration test passes green on the first run** (no visible
RED): don't just trust it — `git stash -- <implementation-file>` to temporarily remove the
wire, re-run the test to confirm it now fails for the right reason, then `git stash pop`.
Proves the test is actually anchored to your change, not passing by coincidence.

## Anti-Patterns

- Do NOT plan/PRD here — consume the backlog; planning is `graph-backlog-generation`
- Do NOT write code before investigating — `rg`/`agf search` first; **expand, don't recreate**
- Do NOT break WIP=1 — one `in_progress` task at a time
- Do NOT mark done on a false claim — file a risk/task node for any loose end
- Do NOT claim savings a lever did not make — read the ledger (`agf metrics`)
- Do NOT skip the quality gates — `agf tdd-score` + `agf harness --violations` enforce SWE practices
- Do NOT mark done without `npm run test:blast` (standalone) + `agf check` green

## Economy

Output is compressed automatically with `--ai`; project with `--select <path>`;
recover the exact command with `agf retrieve-command "<intenção>"`; delegate with
`agf brief <id>`; reuse before you create. Opt-in levers via `agf economy on
<lever>` (`ncd_dedup`, `forage_stop`, `mdl_select`, `heat_kernel`,
`budget_kleiber`, `info_bottleneck`…); measure with `agf metrics --economy-report`
and `agf savings`. Reallocators reshape (saved≈0); cutters reduce input tokens.

**Route the call by cost (3rd pillar):** `agf provider use <id>` picks the gateway and
`agf model` / `--pin <model>` the tier — let the tier-router auto-pick (cheap→build→
frontier by task complexity) or pin a cheap model for mechanical work. Every call is
attributed per-node in the `llm_call_ledger`; `agf metrics --simulate` re-prices the
real bill under any model.

See `_shared.md` → **Token Economy** for the full arsenal: gateway auto-levers
(diff-edits, repo-map, lossy-gate, CCR), `agf economy list`, and the compress guardrail.

## Concurrent Multi-Agent Protocol (2+ agents, one graph)

Two or more agents can safely share one SQLite graph using the claim/lease system.
Each agent sets a unique identity; the WIP guard becomes per-agent, not global.

### Setup

```bash
# Agent A (terminal 1)
export AGF_AGENT_ID=agent-a

# Agent B (terminal 2)
export AGF_AGENT_ID=agent-b
```

Alternatively, pass `--agent <id>` to every `agf next` call.
Priority: `--agent` flag > `AGF_AGENT_ID` env var > auto-generated UUID.

### Claim lifecycle

```
agf next --agent agent-a       # atomically claims a task; others skip it
  → claim: { agentId, leaseToken, expiresAt }

# … Agent A implements + TDD …

agf done <id> --agent agent-a  # marks done + releases the lease
```

If Agent A crashes mid-task, the lease TTL (default 30 min) auto-expires and
the task becomes reclaimable. Use `agf claims` to inspect live leases.

### 2-agent runnable example

```bash
# Terminal 1
export AGF_AGENT_ID=agent-a
agf next --agent agent-a       # pulls task X, claims it

# Terminal 2 (concurrently)
export AGF_AGENT_ID=agent-b
agf next --agent agent-b       # pulls task Y (X is locked), claims it

# Both complete independently:
agf done <X-id> --agent agent-a
agf done <Y-id> --agent agent-b
```

### Override: --force

`agf next --force` bypasses the per-agent WIP=1 guard and pulls a second task
for the same agent, emitting a `WIP_OVERRIDE` warning. Use only in exceptional
circumstances (e.g. the prior task is blocked and cannot be done yet).

## Related

- `graph-backlog-generation` — produces the PRD/backlog this loop consumes.
