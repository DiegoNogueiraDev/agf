---
name: graph-backlog-generation
description: 'Human-in-the-loop PLANNING skill — investigates the project (graph + git + harness/gaps) and runs the whole ANALYZE→DESIGN→PLAN chain in one faceted loop to produce a COMPLETE PRD injected as graph backlog (epics, tasks, testable AC) for a separate agent to implement. Applies the project''s planning methodologies — Impact Mapping + OKR per epic, JTBD, MoSCoW, WSJF/Cost-of-Delay, User Story Mapping, Example Mapping (Rules/Examples → Given-When-Then AC), SPIDR splitting, INVEST, Definition of Ready, Risk Matrix; the full catalogue lives in the skill body. Stops for the human after each complete PRD and iterates the next cycle from the project''s own findings (dogfood). Does NOT implement. Triggers — graph-backlog-generation, gerar backlog, criar PRD, planejar feature, detalhar épico, novo ciclo, "plan the next thing", "what should we build next".'
triggers:
  - graph-backlog-generation
  - gerar-backlog
  - criar-prd
version: 2.4.0
author: Diego Nogueira
date: 2026-07-03
tools_used:
  [
    deliver,
    generate-prd,
    import-prd,
    brainstorm,
    node add,
    edge add,
    decompose,
    gaps,
    gate,
    phase,
    query,
    search,
    insights,
    harness,
  ]
tokens: ~1000
---

# graph-backlog-generation

The planner. One faceted, human-in-the-loop chain that turns a vague idea (or the
project's own findings) into a **complete PRD injected as graph backlog** — epics,
tasks, and testable AC — so a separate agent (`graph-builder-leafcutter`) only
implements. Plans only; never writes production code.

## ⛔ Hard rule — PLAN ONLY, zero code (read this first)

When this skill is invoked you **cannot write code**. Not a stub, not a test, not a
one-line edit, not "just to verify a shape". The **only** artifacts you produce are
**graph nodes** (`node add` / `edge add` / `node update`) plus the plan/handoff text.
If you catch yourself opening an editor, creating a `*.ts` / `*.test.ts` file, or
editing a source file — **STOP: you have left the planner.** Revert it and put the
intent into a task node instead. Implementation and the TDD that proves it belong to
`graph-builder-leafcutter`, pulled later via `agf start`.

The planner also **never touches git**: no `commit`, no new/switched branch. The
backlog lives in the shared, gitignored `workflow-graph/graph.db` — it persists across
branches, so stay where you are. Branch-per-implementation is the builder's job.

## When to Use

- Start of any cycle: a vague idea, a new feature, or "what should we build next?"
- Backlog is empty / stale, or a cycle just shipped (iterate the next from findings)
- You have a PRD to import and structure into the graph
- You explicitly want planning/PRD/AC work — NOT implementation (that's the builder)

Do NOT use when an unblocked task already exists and you just need to code → use
`graph-builder-leafcutter`.

## Deterministic plan (low-reasoning fast-path)

If you are a low-reasoning model (Haiku, DeepSeek Flash, MiniMax, etc.), follow THIS —
the framework names used later (Cynefin, WSJF, MoSCoW, INVEST…) are expanded here as
plain rules, so you never need to know them. **PLAN ONLY: emit graph nodes + text,
never code/git.** Top to bottom, obey every **STOP**/**DEFAULT**.

1. `agf preflight "<theme>"` → verdict `wip-conflict`/`duplicate-risk` on **another**
   epic → **STOP**, report (someone already owns it). Else continue.
2. `agf exec chain "stats --select data.byStatus; gaps --severity required"` (1 round-trip,
   sem shell `&&`) → is there already ready backlog? **Yes → STOP**: tell the user to run
   `graph-builder-leafcutter`.
3. Frame in one line each (no jargon): **WHO** needs it · **WHAT** changes for them ·
   **WHY** (one measurable win). Uncertainty rule: you can see how to build it → write
   tasks now; you cannot → add ONE `risk` node `spike: investigate <X>` and stop on that area.
4. `agf generate-prd "<idea>"` (or `agf import-prd <file>`).
5. Per epic: `agf node add --type epic …` with **Objective + 1 measurable Key Result**
   in the description (a number/percent/latency — not "improve X").
6. `agf decompose`. **Slice outside-in from the surface the user operates** (web → the
   frontend screen; agf → the CLI command; API → the endpoint). Every leaf ≤2h and
   self-sufficient:
   - each leaf = **ONE control on that surface proven end-to-end** (button/field/screen),
     not a backend layer — e.g. "the _Run_ button on the rules screen returns true/false",
     not "build the rule engine"
   - backend/data work is only a leaf wired `depends_on` a surface AC that fails without
     it — pull it, never plan it top-down
   - title `IMPLEMENT:|WIRE:|FIX:|DOCS: <one outcome>`
   - description: the WHY + **exact file paths** to touch (`src/…`) + "do not recreate"
   - 2–4 `--ac` lines, each **Given-When-Then** with a concrete number/boolean/string,
     observable at the surface (números batem / estado renderizado / true|false)
   - the exact test file `src/tests/<stem>.test.ts`
7. Priority tag — use this table, no judgement:

   | situation                       | tag      |
   | ------------------------------- | -------- |
   | breaks/blocks others without it | `must`   |
   | clear value, not blocking       | `should` |
   | nice-to-have                    | `could`  |

   Order within `must`: blocks-most-others first; tie → smallest job.

8. `agf gaps --severity required --json` → for each gap run its `applyVia` → repeat until
   `ready: true`.
9. `agf check <each task id>` → AC score <60 → rewrite the AC concretely (add the missing
   number/fixture), retry.
10. **Completeness critic — NOT optional. Run a COMMAND for each, never just think.** A
    finding with no tool output behind it is invented — discard it. A "no" becomes a node:
    - a. Write the flow `A → B → C → …`. Does **every arrow** have an owning epic? (An
      arrow with no owner is a missing epic — that is how a backlog looks complete and isn't.)
    - b. `node show` each contract → can **each consumer** do its job with ONLY those fields?
      (A target/id/budget nobody carries is the classic hole; no gate sees it.)
    - c. For each promise in a milestone/KR → which task **produces** it? (grep it.)
    - d. `ls` the module you're extending → which files did you **never open**? `grep -rn`
      each exported symbol → any with no caller that you're about to duplicate?
    - e. Query the graph per axis: security · credentials · wall-clock timeout · logging ·
      concurrency · reproducibility. Owned, or deferred **with a node**?
    - f. Could a KR go green **without** the value? (Then the KR is the defect.)
    - g. What is the laziest wrong implementation that still passes? (→ AC or `risk`.)
      Includes: does any metric prove its own instrument is plugged in?
11. **STOP for the human:** "backlog ready, N tasks, critic swept with evidence (findings: …)
    — run `graph-builder-leafcutter`."

**Never:** write/edit code, create/switch a git branch or commit, or inject a task whose
AC has no concrete, checkable value.

## Golden Rules (planner edition)

> The full universal set lives in `_shared.md` → **Golden Rules (universal
> engineering)** — obey it verbatim; the list below is the planner-specific slice.
> Each planning handoff MUST follow `_shared.md` → **Close-out Report Format**
> (what was injected + proof + `Próximo: X — porque [fundamento]`).

The project's golden rules, distilled for ANALYZE/DESIGN/PLAN. Non-negotiable:

1. **Investigate first, never duplicate.** `agf preflight "<theme>"` + scan existing
   epics + a repomix code-map BEFORE planning. A `wip-conflict` / `duplicate-risk`
   verdict = STOP; another agent or a shipped epic already owns it.
2. **Expand, never recreate (DRY) — and point at the WIRED module, not a legacy
   twin.** search/query/grep/repomix for the owning module and plan to _extend_ it.
   Net-new only when it provably does not exist — the strongest epics wire dormant/
   partial code that already lives in the repo. **Trap: two files can share the same
   stem** (a legacy `core/llm/tier-router.ts` beside the live `model-hub/tier-router.ts`);
   a task whose EXPAND-pointer names the dead twin makes the builder edit the wrong
   file. Before you write a file path into a task, `grep -rn` its consumers and name
   the one that is actually _imported by the live path_ — code wins the plan.
3. **Graph is the source of truth.** No task without a node; code/graph beat
   memory/plan (counts in memories go stale — reconcile with `agf stats`/`query`).
4. **Dogfood.** Drive the whole cycle with `agf` itself; in-repo use `npm run dev --
<cmd>`, never the stale installed binary.
5. **Distill to atomic.** Every leaf ≤2h, INVEST-Small, GWT-testable AC; one
   responsibility per node; decompose oversize into subtasks; WIP=1 (pull, don't push).
6. **Quality as AC, not prose.** Clean Code · SOLID · KISS · YAGNI encoded as testable
   constraints (file <800, fn <50, 1 responsibility, immutability, no `any`, typed errors).
7. **Plan only.** Never implement/test/review here — hand the backlog to the builder.

## Mandatory Flow

This chain is a **Generator–Critic (Reflection) loop**, not a straight line: the injection
half generates, Step 5.5 attacks it with tools, findings become nodes, repeat until the
critic comes back empty **with evidence**.

```
        ┌──────────────────────── GENERATOR ────────────────────────┐
[investigate graph + git + code → find WHITE SPACE] → (checkpoint human on direction)
  → generate-prd / import-prd → decompose → node add + edge add (epics·tasks·AC)
  → gaps (close required) → validate AC (agf check) → verify tree
        └───────────────────────────┬───────────────────────────────┘
                                    ▼
            COMPLETENESS CRITIC (Step 5.5 — 7 tool-grounded sweeps)
                     findings → nodes ──┐
                                    ▲   │ (loop until empty, with evidence)
                                    └───┘
                                    ▼
                          STOP for human ⇆ next cycle
```

The critic is **mandatory and self-triggered**. A human asking "did anything get left out?"
means the loop never closed — that pass must run before they ever see the backlog.

The chain ends by **stopping for the human** with a complete PRD in the graph. It
never enters IMPLEMENT — it hands the backlog to the builder.

## Workflow

Detailed methodology playbooks live in [references/methodologies.md](references/methodologies.md)
(**Impact Mapping** + **OKR-outcome per epic** · 5W2H · JTBD · Cynefin · Pareto ·
MoSCoW · **WSJF/Cost-of-Delay** · Lean/Toyota · JIT · **Decomposition & distillation**
(epic→task→subtask) · **User Story Mapping / walking-skeleton slicing** · **Repomix
codebase analysis** · **Example Mapping** (Rules/Examples/Questions) · **SPIDR
splitting** · INVEST · GWT · **Three Amigos** · **Definition of Ready** · TDD-as-AC ·
SOLID · KISS · YAGNI · DRY/Rule-of-Three · Law of Demeter · Composition · SoC · Clean
Code · Documentation/ADR · Logging & Observability · Risk Matrix · PERT · Six Sigma ·
STRIDE/OWASP). Load it on demand.

> **Command-agnostic:** the commands below are illustrative. The source of truth for
> the exact, current command is always `agf retrieve-command "<intent>"` (RAG-IN) or
> `agf help` — so this skill never goes stale when commands are added or renamed.

### Step 1 — Investigate & find white space (dogfood)

Read the project's real state across **three surfaces**, not just the graph:

**Surface A — the graph & process state:**

```bash
agf preflight "<theme>"                  # WIP/dedupe/branch guard — is another agent already on this?
agf stats · agf insights bottlenecks · agf harness --violations · agf gaps --severity required
agf query --type epic --status backlog   # what's ALREADY planned — do not re-plan it
```

**Surface B — the codebase, via Repomix (deterministic, ~0 LLM tokens to produce).**
The point is to understand the project **without reading all of it** — extract signal,
then drill into the one area that matters. The 3 cheap passes:

```bash
repomix --no-files --token-count-tree 200            # SHAPE: dir tree + per-file token counts → complexity/debt HOTSPOTS
repomix --compress --remove-comments --stdout --include "src/**"  # STRUCTURE: Tree-sitter skeleton (no bodies) → API surface to EXPAND
repomix --include-diffs --include-logs --stdout      # MOTION: uncommitted WIP (other agents) + recent churn/trajectory
```

Read the map for **strong vs weak areas**: weak = oversized files (>800 lines),
git-churn hotspots (default sort is most-changed-first = bug-prone), missing
tests/error-paths in the compressed structure; dormant = exported-but-unwired symbols
(best EXPAND targets); strong = small + low-churn + tested → leave alone (Lean). Secret
scan is on by default; never use `--no-security-check`.

> **Full repomix catalog** (scope/git/output-shaping/remote/MCP `grep_repomix_output`):
> [references/repomix-investigation.md](references/repomix-investigation.md). Always
> `repomix --help` for the live flags. **Repomix is an optional external tool** — where
> it is not installed, fall back to Surface A (`agf` graph-map) + `agf search` / `grep -rn`
> over `src`; the investigation still completes, just less compressed.

The deliverable of this step is **white space**: value that is real, grounded in
findings, and NOT already covered by an existing epic or in-flight by another epic.
A backlog of 1000+ nodes is normal — the planner's hardest job is _not adding
duplicates_. Prefer wiring dormant/partial code over net-new (golden rule); the
strongest epics come from code that existed but was unwired.

**Surface C — WIRE-tasks the builder already blocked with a real finding.** The
builder (graph-builder-leafcutter) triages `wire-dormant` harvest output into 5
buckets; only one is a mechanical wire it can close alone. The other four land as
`blocked` nodes with the investigation already written in the description — this is
**pre-digested planning material**, cheaper to consume than a fresh repomix pass:

```bash
agf query --type task --status blocked --select 'data[].{id,description}'
```

Group what you find by finding-shape, not by reading each node cold:

- **Half an epic** (mechanism ready, no consumer built) → usually a real, scopeable
  epic on its own: decompose the missing consumer as tasks with AC.
- **Systemic scaffolded family** (N files, same shape, one root cause) → **one**
  epic/decision covering all N, never N separate tasks — the builder already named
  the whole family in one of the blocked nodes; don't re-derive it file by file.
- **Overlaps an already-wired system** → usually NOT an epic; either retire the
  dormant module (a `task` to delete it) or scope a narrow task for just the
  non-overlapping differentiator the finding already named.
- **Superseded by a sibling** → usually a cleanup task (retire the loser), not a
  feature epic — verify the finding's claim (`agf harness --dormant`) before trusting
  it blind, since a stale finding may have been fixed since.

A blocked node with no finding text (just the harvest boilerplate, never triaged) is
still raw signal — treat it like an untriaged repomix hotspot, not pre-digested.

### Step 2 — Frame the problem & confirm direction

Apply 5W2H + JTBD to state the problem; Cynefin to size uncertainty; Pareto to pick
the 20% scope that delivers 80% value. **Impact Mapping** anchors it on the goal:
`Goal (Why, measurable) → Actors (Who) → Impacts (How behavior changes) → Deliverables
(What)` — each candidate epic must trace back to one goal through an impact, and each
epic carries an **OKR-style measurable outcome** (Objective + ≥1 Key Result) so it
ships outcome, not just output. Order the Pareto-selected Must/Should set by **WSJF**
(Cost of Delay ÷ Job Size) to sequence biggest-value-soonest. See references.

**Checkpoint the human BEFORE injecting** — this is the **Three Amigos** moment (the
human plays Product + Test over your draft) — when the backlog is saturated or the
value direction is ambiguous: present 2–4 grounded, low-duplication value themes (an
AskUserQuestion-style multi-select, recommended option first) and let them steer.
Picking the wrong theme into a saturated backlog is the most expensive planner
mistake — one cheap question prevents a whole wasted injection. Skip the question
only when the user already named the exact scope.

### Step 3 — Generate / import the PRD

```bash
agf generate-prd "<idea>"        # LLM draft from a prompt
agf import-prd <file> [--build-tree]   # import an existing/edited PRD → graph
```

PRD covers: vision · problem · objectives · architecture · functional reqs ·
NFRs (perf/security/a11y as measurable AC) · risk matrix.

Organize epics along a **User Story Map backbone** (journey steps left→right) and
commit only the **walking-skeleton / MVP release slice** this cycle — the thinnest
end-to-end runnable path (Pareto + JIT). Deeper stories stay as deferred
`should`/`could` epics for the next cycle to pull without re-planning.

#### Slice CONSUMER-SURFACE-FIRST (outside-in) — the DEFAULT decomposition axis

agf is a factory that generates **N different apps** depending on what the dev drives it
toward. Whatever the app, the backbone starts where the **user actually operates** the
product, and every slice must PROVE itself there. The surface differs per app; the axis
is the same:

| app kind         | consumer surface = where you slice first                                              |
| ---------------- | ------------------------------------------------------------------------------------- |
| web / admin      | **the screen + its controls** (a route, its buttons/fields/tables) — the primary case |
| CLI (agf itself) | the **command** (`agf <cmd>` output)                                                  |
| API / service    | the **endpoint** (request → response)                                                 |

**Why outside-in wins — the foundations (this is not a preference, it's grounded):**

- **Walking Skeleton + Outside-In TDD** — Cockburn's walking skeleton ("the thinnest
  possible slice of real functionality built, deployed, and tested end-to-end") + Freeman &
  Pryce's _Growing Object-Oriented Software, Guided by Tests_ (2009): drive tests from the
  outside-in — the acceptance test lives at the surface the user touches, and it PULLS every
  inner class into existence. Nothing inner gets built that no outer test demands.
- **OKR** — Grove (Intel, 1970s; popularised by Doerr, _Measure What Matters_): the Key
  Result measures the **outcome, not the output**. So the epic's KR is the surface
  _operating_, observed — not "the service exists".
- **Stigmergy / ant colonies** — Grassé (1959) → Dorigo's ACO (1992), which agf already runs
  in the builder: no ant holds the global plan; each completes **one local action** and the
  colony converges by reinforcing successful traces. A green AC at the surface is the
  pheromone that marks the path toward the objective — outside-in slicing IS the colony
  rule, and the OKR is the gradient it climbs. (The builder is literally `leafcutter`:
  cut from the leaf's edge — the surface — inward.)
- **Little's Law / Lean pull** — thin end-to-end slices keep WIP small → shorter cycle time
  → faster time-to-market; the app demos from the tip on day one instead of a backend that
  "compiles" for weeks behind a dead UI. Value, assertiveness, quality, speed — all from
  making the promised behaviour observable early, in the consumer's mode (`_shared.md`
  Golden Rule 16).

**How it lands in the graph:**

- **Each leaf = ONE control on the surface, proven end-to-end.** Not "build the rules
  service" but "the _Run_ button on the rules screen evaluates and renders true/false" — the
  whole vertical (control → API → domain logic → store → rendered result) for that one
  control, wired and clicking.
- **Backend/data work is PULLED, never pushed.** Do NOT plan a backend epic top-down. A
  backend task exists only as a leaf wired `depends_on` a **surface AC that fails without
  it** — the failing surface operation is what justifies the descent. Every inner node stays
  traceable to a control the user can see.
- **The epic's Key Result is the surface operating whole**, observable at the surface: _"the
  batch screen processes a real batch — the totals reconcile, eligible vs non-eligible each
  carry a reason, and export/upload/bulk-insert are all wired and clickable"_ — a number + a
  boolean + a rendered state, never "it works". A control on the screen with no leaf that
  proves it = incomplete epic (the arrow/seam sweep, applied to UI controls).
- **Order:** a screen's controls become sibling leaves; a control another depends on (create
  the record **before** you run it) gets a `depends_on` edge. Screens order left→right along
  the journey — unless a screen must exist first because others read what it configures
  (a rules screen sits **above** the flow that consumes those rules).

### Step 4 — Structure as graph + decompose to atomic tasks

```bash
agf node add --type epic|requirement   ·   agf edge add <from> <to> --type <rel>
agf decompose                          # large tasks → atomic (≤2h) subtasks
```

Each task gets MoSCoW priority + INVEST-scored, Given-When-Then **testable AC**
(multiple discrete `--ac` entries — never one prose blob). Derive the AC by **Example
Mapping**: list the story's **Rules** → one concrete **Example** per rule becomes one
GWT `--ac` (with its fixture); open **Questions** become `risk` nodes, never
silent gaps. A rule with no example is untestable — don't inject it. Split oversized
stories with **SPIDR** (Spike · Paths · Interfaces · Data · Rules) alongside the
distillation heuristics. TDD/SOLID/security expressed as AC, not prose.

#### The task-node contract (what makes a leaf buildable)

Every leaf the builder pulls must be self-sufficient — if it would have to
re-investigate the codebase to start, the node isn't done. **Epic nodes** carry the
**Objective + Key Result** (the success metric) in their description/AC; leaves carry:

- **Title** — imperative verb prefix signalling work type: `WIRE:` `IMPLEMENT:`
  `RELEASE:` `FIX:` `DOCS:`. One atomic outcome (≤2h).
- **Description** — the _why_ + exact EXPAND pointers: the real file paths and symbols
  the executor must touch in **your** repository, and an explicit "do not recreate".
  **Trap: spell each path out — never a brace-glob shorthand.** Writing
  `src/cli/commands/{init,start,doctor}-cmd.ts` in a description trips the
  `phantom_pointer` gap: the detector reads the whole glob as ONE nonexistent file and
  flags the node (and misleads the builder into hunting a path that isn't there). List
  the three real paths separately (`…/init-cmd.ts, …/start-cmd.ts, …/doctor-cmd.ts`).
- **AC** — 2–4 discrete `--ac` Given-When-Then criteria, each independently testable
  with a concrete fixture (`new Database(':memory:')`, stub-LLM token counter). Make
  them **observable**: a number, a boolean, a status code, an exact string. Weak
  phrasing with no threshold trips `has_testable_ac` — put the concrete value in the AC.
- **Contract pointer** — name the boundary's `contract` node (see enrichment layer) so
  the leaf carries the exact shape, not a vague "returns JSON".
- **Test file** — the exact `src/tests/<stem>.test.ts` path + the fixture to use, so the
  builder writes the RED test without re-deriving it.
- **Tags** — MoSCoW (`must|should|could`) + theme; tags become ACO trails for the builder.
- **Edges** — `depends_on` to any sibling that must land first (encodes build order).

#### Backlog enrichment layer (what a _light_ model needs to ship effortlessly)

A buildable epic is more than tasks + AC. Inject the supporting nodes a junior/light
model would otherwise have to infer — each with the right **type** and **edge
semantics**. This is the difference between "a list of tasks" and "implementable with
zero re-investigation":

| Node type                | Carries                                                                                                              | Wire with                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `contract` / `interface` | the **exact** request/return shape **+ the source of each field** (which existing helper to reuse, with `file:line`) | task `implements` → contract; consumer `consumes` → contract |
| `risk`                   | the failure mode **+ its mitigation phrased as the AC that absorbs it**                                              | risk `related_to` the task(s) it threatens                   |
| `constraint`             | global guardrails — zero-deps, file <800, fn <50, no `any`, layer boundary, read-only                                | `parent_of` the epic                                         |
| `requirement` / NFR      | perf · security · a11y as measurable criteria                                                                        | **a task must `implements` it** (see the trap in Step 5)     |
| `performance_budget`     | a concrete budget (e.g. fluid ≤300 nodes, poll ≤2s)                                                                  | `related_to` the affected task                               |

The `contract` node is the highest-leverage artifact — for every API/module boundary,
give the exact TS shape and where each value comes from (`summarizeLedger(...).totals`
at `file:line`), so a cheap model fills the body without exploring. Every Example-Map
**Question**/**risk** becomes a node, never a silent gap; the mitigation you write on
the risk reappears as a concrete AC on the owning task (traceable via `related_to`).

#### Spec-driven layer (opt-in, raises rigor without code)

Maximise agf's planning surface — all still PLAN-only, zero code:

```bash
agf constitution                 # governing principles — indexed, enforced at every gate
agf preset --apply <name>        # default | strict-tdd | agile-light | enterprise
agf spec --generate <template>   # phase spec for a high-stakes epic
agf spec-sync link <specId> <nodeId>   # bind the living spec to its graph node
```

Encode the non-negotiables (immutability, no `any`, layer boundaries) **once** in the
`agf constitution` instead of repeating them per task — gates validate against it. For a
high-stakes epic, generate a phase spec and `spec-sync link` it to the node so spec and
graph never drift. `agf preset` sets the cycle's workflow rigor up front.

### Step 5 — Close gaps & validate

```bash
agf gaps --severity required          # close every required gap (traceability, AC coverage)
agf check <taskId>                    # per-task DoD; the planner bar is AC-present + AC-score ≥ 60
agf gate <phase>                      # phase-readiness gate — confirm the phase with `agf gate --help`
```

**Verify before you call (command-agnostic).** Phase names and flags drift between
versions — `agf gate analyze` does **not** exist in current builds (valid phases:
`design · review · handoff · deploy · listening · all`), and `agf gaps` may not
accept `--json` yet (parse the text envelope or use `--select`). Always confirm with
`agf gate --help` / `agf gaps --help` (or `agf retrieve-command`) rather than assuming.

**`agf gaps` scans the WHOLE graph, not your subtree.** In a repo with a 1000+ node
backlog it returns piles of _pre-existing_ required gaps that are **not yours** — do
not chase them. Filter the report to the node ids you just created (grep your ids) and
close only those; `ready: false` and a red DoR gate usually reflect the whole graph,
not your epic. **Trap:** every `requirement`/NFR (and often `contract`) node you add
becomes a NEW required gap — _"requirement with no implementing task"_ — until you wire
a task → it via `implements`. Always close that loop on the support nodes you create,
then re-run gaps filtered to your ids to confirm **0 required in your subtree**.

**Two required-gap traps on fresh backlog (earned empirically — budget them at `node add`
time, or fix later via `node update --ac` which replaces `ac[]` in place):** (1) `missing_edge_case` reads the task's OWN `ac[]` and
wants an explicit error/failure/limit case — a happy-path-only AC set trips it even when the
_description_ mentions edge cases, and adding a child `acceptance_criteria` node does **NOT**
close it (only the task's inline `--ac` counts). Budget one error/limit GWT `--ac` per task
up front. (2) An epic with children but an empty own `ac[]` trips `blocking_container`; close
it by adding `acceptance_criteria` **child** nodes carrying the epic's Key Result (the epic's
own `ac[]` legitimately stays empty). And treat `status_flow_valid` + `no_unresolved_blockers`
"failures" on fresh backlog as EXPECTED, never a defect: deps aren't built yet and nothing has
passed through `in_progress` — the planner bar remains AC-present + AC-score >= 60 + subtree
required-clean.

**What "validated" means for fresh planner backlog.** `agf check` on a backlog task
will report `status_flow_valid: failed` — that is **expected and correct**, not a
planning defect: the task hasn't been taken through `in_progress → done` yet (that's
the builder's job). The binding signal for planning quality is **AC present on every
task + AC-score ≥ 60**. Confirm that, not a green DoD.

On the same fresh backlog, `consumer_proof` and `no_unresolved_blockers` also fail by
construction — nothing is built and the deps don't exist yet. Read the DoD's own
`ac_quality_pass` line (it prints the score against its minimum) as the planner's real
signal; the aggregate `ready:false` is about the builder's future, not your tree.

**Some quality checks are opaque heuristics — do NOT reverse-engineer them.** Checks like
`has_testable_ac` (DoD) and `adr_quality` (design gate) classify prose by undocumented rules:
ACs carrying explicit values (`llm_calls == 0`, `probes_recorded == 3`) still get labelled
`weak_concrete`, and rephrasing toward the error message's own wording can score _worse_ than
where you started. Budget **at most one** probe; if it doesn't flip, stop and say so. The AC a
light model can execute beats the AC a regex likes — the builder reads the criterion, not the
classifier. Binding bar: required-gaps-clean + `ac_quality_pass`.

**Link `testFiles` at injection, not later.** `node update --test-files <path>` raises the DoD
score _and_ arms the physical-triangulation gate (`phantom_done` cross-checks `testFiles`
against the disk). A task naming its test only in prose leaves that axis unarmed — the builder
can then claim done against a file that never existed.

**ADR nodes carry the human's decisions or they evaporate.** Every choice made at the Step-2
checkpoint is an ADR: context · decision · consequences · **alternative rejected and why** ·
revisit trigger. Left as prose in a plan file, that reasoning is invisible to the builder and
gets silently re-litigated cycles later. Run the adversarial ADR-challenge gate too — an ADR
can pass it on substance while a separate format grader still scores it low (see the
opaque-heuristics rule: don't chase the grader).

**Planner DoD — sweep ALL injected nodes before stopping.** Loop `agf node show` over
every new id and assert: each task has ≥1 AC; each non-epic node has a `parentId`;
epics are roots (`parentId` null) and carry an Objective + KR; `depends_on` edges
wired. Cheap, deterministic, and catches a half-built tree before the human (or the
builder) ever sees it. **Use `node show` per id — NOT `query --select`:** `query` returns a
compressed `{id,title}` envelope, so a sweep built on it silently reports 0 rows and every
invariant "passes". Assert the read first (`N/N` rows, every row typed) and **fail loudly** if
not — a green check over an empty result set is the exact optimistic-oracle lie the planner
exists to design against. Earned the hard way: a sweep reported "38/38 ✓, no task missing AC"
while its task list was empty, because the fields sat one level deeper than the code read.

#### Completeness-Critic gate (MANDATORY — run it yourself, never wait to be asked)

This gate is the **Reflection / Generator-Critic** pattern (a.k.a. CRITIC) made
mandatory: the same failure mode — a backlog that looks done and isn't — is what
Reflection exists to kill, by **separating generation from evaluation**. You already
played the _generator_ (injected the epics/tasks). Now **switch roles and become an
adversarial critic** whose only job is to prove the backlog INCOMPLETE. This is a
distinct pass in the _same_ loop — a change of posture and a fresh evaluation against
rigid criteria, **not** a spawned sub-agent (no fan-out; golden rule 13). Run it as a
tight cycle: **Generate → Critique → Revise → re-Critique** until the critic returns
zero open holes; only then stop for the human.

The critic's stance is **assume-incomplete-until-proven**. Do not ask "is this done?"
(the generator always answers yes). Ask "what is MISSING that would block a builder?"
and **force yourself to emit the list explicitly** — every missing risk, dependency,
seam, driver, or surface — _before_ concluding, reasoning end-to-end (chain-of-thought
over the value flow, not a glance at the node count). An empty critic list is only
credible after the six lenses below have each been answered out loud; "I looked and it's
fine" is the generator talking, not the critic.

The DoD sweep proves the nodes that EXIST are well-formed. It says nothing about the
nodes that SHOULD exist and don't. That is the hole a human keeps catching by feel —
and "the human noticed" is not a process (golden rule 8: the trigger must be the
method, not someone remembering). So **before** you stop for the human, run these six
lenses over the whole injected backlog yourself, out loud in the close-out. Each is a
question that has caught a real missing node; a "no" answer is a node to add (or a
`risk` to park). Report the sweep result — `Completeness sweep: 6 lenses, N holes
found + closed` — so the human never has to ask "algo mais?".

1. **Value-chain walk — arrows AND seams.** Write the theme's end-to-end flow as an
   explicit chain and name the owner of every **arrow** (a stage) _and_ every **seam**
   (the data contract crossing between two stages). Unowned arrow → missing task;
   unowned seam → missing `contract` node. (The "WALK IT" guidance in Step 3 is this
   lens for arrows; the seam half is just as load-bearing — two epics can each be
   complete while nobody owns the record-shape that passes between them.)
   **Aggregator-without-producer — the seam's most expensive shape.** When the theme is
   "prove/aggregate/score X" (a verdict fusing N signals into one confidence), the
   generator blind-spot is shipping the READER of each signal but not its PRODUCER. It
   looks complete because on the happy path the signals are green — but the signal that
   is usually EMPTY (a consumer-proof, an outcome, an attestation nobody records) has no
   task that FILLS it, so the verdict is structurally stuck at its incomplete band and
   the "means" are never legible. For every pillar an aggregation epic reads, name the
   task that PRODUCES it (grep the writer); a pillar with a reader and no producer is an
   unowned seam. And when the theme is "make the means explicit," the contract must carry
   a per-signal `rationale`/why field — otherwise the explain surface invents it.
2. **Set-coverage.** Any gate/router/activation keyed on evidence must produce evidence
   for **every** unit it can act on, not just the flagship (see the measure→activate
   anti-pattern). Measure 1 of N → the gate defaults 1 of N.
3. **Consumer-surface matrix.** For every "prove value" claim, is it proven in **each**
   surface the project ships — CLI · web/dashboard · CI-gate? A value proven only in the
   CLI leaves the web (and the gate) consumer blind; that is a missing `COBRAR(<surface>)`
   task, one per surface the theme touches.
4. **Claim-staleness / reconciliation.** Does any change flip a claim asserted
   elsewhere — generated docs (CLAUDE.md/AGENTS.md), memory, a **CI baseline**, a default
   flag? Every flipped claim needs a reconciliation owner (a `DOCS:` or rebaseline task).
   A default that changes from OFF→ON silently turns three things stale: the doc that
   says "OFF", the regression baseline that priced "OFF", and the memory that recorded it.
5. **Foundational-driver exists?** Any task that assumes a harness / suite / fixture /
   runner — verify that thing **exists in the repo** (`ls`/`grep`), don't assume. A gate
   that references a suite dir that was never created, or a measurement that "runs via" a
   driver nobody built, is a missing foundational task the rest silently depends on.
6. **Latent-inventory triple.** Enumerate every latent capability the theme names, then
   check each has all three: **measured** ∧ **wired** ∧ **charged**. A capability with a
   wire but no measurement (or a measurement but no consumer-surface charge) is still
   value leaking — the theme is "activate the latent", so partial coverage is the defect.

> **Direction of travel (make it deterministic).** Lenses 3–5 are mechanical enough to
> become `agf gaps` detectors (consumer-surface coverage, claim-staleness, missing-driver)
> — the same medir→wirar→cobrar the project preaches, applied to the planner's OWN
> completeness so the tool fires the check instead of the human's feel. Until then, the
> six-lens sweep is a MANDATORY manual gate, reported every cycle.

**Definition of Ready (the stop gate).** Beyond per-task AC, the backlog as a whole
must pass DoR's **7 checks** (`has_requirements`, `has_acceptance_criteria`,
`no_orphans`, `no_cycles`, `has_constraints`, `has_risks`, `prd_quality_score ≥ 60` —
owned by `agf gate`; confirm the phase via `--help`). DoR green **+** AC present on
every task with AC-score ≥ 60 = ready to stop. Unresolved Example-Map questions or
unmapped Impact-Map deliverables block DoR — park them as `risk` nodes or
loop back to DESIGN first.

### Step 5.5 — Completeness critic (MANDATORY, tool-grounded — never hand over an uncriticised backlog)

This step is the **Critic half of a Generator–Critic (Reflection) loop**: Steps 1–5 generate,
this step attacks what they produced, findings become nodes, repeat. It is **not optional and
never human-triggered**. If someone has to ask "did anything get left out?", the skill already
failed — their intuition is not a control. `gaps`, DoR and `check` score **the nodes that
exist**; nothing scores **the node you never wrote**. This is that missing scorer.

**The one rule that decides whether this works — every critique MUST cite external evidence.**
The literature is blunt about the failure mode. Huang et al., _LLMs Cannot Self-Correct
Reasoning Yet_ (ICLR 2024, arXiv:2310.01798): **intrinsic** self-correction — a model
critiquing itself with no external signal — **degrades** the output through overcorrection;
merely asking "are you sure?" measurably drops quality (the FlipFlop effect, arXiv:2311.08596).
What works is Gou et al., **CRITIC** (ICLR 2024, arXiv:2305.11738): _tool-interactive_
critiquing — verify against external tools, then amend — whose stated conclusion is "the
crucial importance of external feedback".

So: **a sweep is not a thought, it is a command.** Each finding below must name the tool
output that produced it — a `grep` hit, a file you opened, a `node show`, a graph query. A
finding with no external evidence is hallucinated critique and must be discarded, not
injected. A sweep that "looks fine on reflection" was not run. This is the same principle as
golden rule 8 (enforcement = deterministic trigger, not an agent remembering), applied to
critique itself: the critic must be grounded in something outside the model.

**Answer each sweep from a FRESH read, not by re-reading your plan (Chain-of-Verification,
factored — Dhuliawala et al., ACL 2024, arXiv:2309.11495).** CoVe's measured result is that
verification questions answered by _re-reading the original draft_ just re-confirm it; the
**factored** variant — answer each question independently, from a source that does not include
your own reasoning — is what actually catches the error. Operationally: a sweep's evidence must
come from a NEW `grep`/`node show`/`ls` against the repo or graph, never from the plan text you
just wrote. "I described the flow correctly above" is the draft confirming itself; run the
query again over the graph. Factored verification is why the loop earned three passes this
cycle — each sweep re-read the world, not the plan.

Run **all seven** before Step 6, every cycle, and report the result — including "swept,
nothing found". Each sweep pairs a question with the tool that answers it:

| #   | Sweep                      | The question                                                                                                                        | Grounded by                                                                                                                         |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Arrows, not boxes**      | Write the flow `A → B → C`. Does **every arrow** have an owning epic?                                                               | graph query per stage; an arrow with no owner = missing epic                                                                        |
| 2   | **Contract sufficiency**   | For each `contract`, can **each consumer** do its job with ONLY those fields?                                                       | `node show` the contract; list consumers; a field everyone needs and nobody carries (target, id, budget) is invisible to every gate |
| 3   | **Promise ownership**      | For each claim in a milestone/KR: which task **produces** it?                                                                       | grep the milestone text; search tasks per promise. A promise with no producer is the thing you'd report as delivered                |
| 4   | **Modality not run**       | Which files of the module you extend did you **never open**? Any exported-but-uncalled symbol you're about to duplicate?            | `ls` the module, `grep -rn` each symbol's callers. Unread file = unverified DRY claim                                               |
| 5   | **NFR axes**               | Owned or _consciously deferred with a node_: security · credentials · wall-clock timeout · logging · concurrency · reproducibility? | graph query per axis. "Nobody thought about it" is not deferral                                                                     |
| 6   | **Goodhart**               | Could a KR go green **without** delivering the value?                                                                               | read each KR against a plausible trivial implementation — the outcome-level twin of a weak AC                                       |
| 7   | **Failure-mode inversion** | What is the **laziest wrong implementation that still passes**?                                                                     | read each AC set adversarially → the answer is a missing AC or a `risk`                                                             |

Sweep 7 has a special case worth naming: **instruments lie by omission.** A ledger reports
`cost == 0` just as happily when nobody wired the counter as when nothing was spent. Any KR
measured by your own instrument needs an AC proving the instrument **moves** (inject a fake
cost → the counter must rise). Otherwise the metric proves only that it is unplugged.

Sweep 7's twin, earned the hard way: **evidence lies by provenance.** An oracle that keys on
_absence_ of evidence (`data is None → inconclusive`) is structurally blind to _evidence from
the wrong source_ — which is the likelier failure. The generator blind-spot: a target contract
that carries WHERE to go (`url`) but makes proving-you-arrived optional (`ready_probe: Probe|None`)
looks complete, because on the happy path you always land on the right page. Then reality
redirects — an auth wall, a consent gate, an error page, a stale SPA route — and the wrong page
loads _perfectly_: HTTP 200, a valid read, a plausible number (usually 0). That number becomes a
false `fail` (the system never broke; the test never arrived), or a false `pass` when the KR
happens to expect 0. Every gate stays green because every node is well-formed. So: **any node
that reads a value from somewhere must carry the provenance of that read, and identity of the
source is asserted BEFORE the value is compared.** When you write a contract with an optional
validate/identity field, ask what loads successfully when you're in the wrong place.

Findings are not prose — each becomes a node (task · contract update · risk · ADR) or an
explicitly recorded deferral. Then re-run `gaps` and re-sweep. **Report every finding to the
human with its evidence**, so the critique is auditable rather than trusted.

**Convergence — TWO consecutive empty sweeps, not one.** A single clean pass does not mean
done: **closing a hole can open another** (a new node has its own arrows, contracts, and
instruments to critique). So the stop condition is a sweep that finds nothing **run against
the backlog the previous sweep already revised** — i.e. two clean passes back-to-back. Earned
this session: round 1 added a timeout risk + an instrument-fidelity AC; round 2, sweeping the
revised tree, found a fresh unowned seam (two `cobrar` tasks reading a shape no `contract`
described); round 3 came back empty. Three passes, because each revision is new surface.

**The stop signal is convergence, NOT an exhausted budget.** If session write-capacity remains
after two clean sweeps, that is not a reason to keep injecting — manufacturing speculative
nodes to fill capacity is over-production (Lean), the opposite of completeness. Spend any
remaining budget on **depth** the sweeps already justified (a missing contract's exact
`file:line` field sources, an ADR's rejected-alternative, a risk's mitigation-as-AC), never on
inventing new scope the critic did not surface. Empty critic + required-clean = stop, regardless
of budget left.

### Step 6 — Stop for the human ⇆ iterate (the loop)

When the PRD is complete and DoR passes, **STOP and present it** for the **Three Amigos
sign-off** — the human (Product + Test) may interrupt, adjust scope, or approve. On
approval, the next cycle re-enters Step 1, seeded by the freshly-updated project
findings (continuous dogfood evolution).

**Close by DECIDING the next step** (`_shared.md` rule 14 — decide, don't ask). The planner
delivers backlog, not code, so it has no DELIVERY TABLE; instead recommend the SINGLE
epic/task the builder should attack first, with the named principle: **`Próximo: run
graph-builder-leafcutter começando por X — porque [fundamento]`** (e.g. "por E1 do
walking-skeleton — porque ordem-de-dependência: todo o resto depende dele"; WSJF/Pareto
also apply here). Alternatives as a one-line note, never an open question — except a
genuinely owner-only call (scope / cost / risk), where you ask with your recommendation first.

**Skill hardening (MANDATORY close-out — `_shared.md` → Golden Rule 17):** before you stop
for the human, ask "what durable planning lesson from this cycle must the NEXT planner read
_here_?" A recurring mis-scope, a wrong EXPAND-pointer pattern, a KR framing that misled the
builder → **edit THIS skill** (command-agnostic), propagating to every synced destination
(project `.agents/skills` ↔ global `~/.claude/skills`) and scanning secrets before any public
push. Frame KRs as **prove OR disprove**: an A/B that comes back against the feature is a
successful cycle, not a failure — the default-OFF lever is the safety. Transient facts (counts,
versions) go to memory, never the skill.

**Record WHY the hole existed, not just that it did (Reflexion — Shinn et al., NeurIPS 2023,
arXiv:2303.11366).** Reflexion's result is that an agent improves across attempts only when it
writes a _verbal reflection on the cause of the miss_ and the next attempt reads it — the fix
alone doesn't transfer, the reason does. So when Step 5.5 catches a hole, the durable lesson is
not "I added a timeout risk" (a transient fact → memory) but the **generator blind-spot that let
it through** ("a live-measurement task looks complete without a timeout owner because the happy
path never hangs") — that sentence, command-agnostic, is what belongs in THIS skill so the next
generator never emits the blind spot again. The skill IS the persistent reflection buffer; each
cycle's critic findings are its training signal.

## Anti-Patterns

- Do NOT write code, tests, or stubs, and do NOT touch git (no commit, no new/switched
  branch) — the deliverable is graph nodes; implementation + branch-per-feature is the
  builder's. If you opened an editor, you left the planner — revert and node-ify it.
- Do NOT hand over a backlog whose completeness critic (Step 5.5) never ran. If the human has
  to ask "did anything get left out?", the skill failed. Report the sweep every cycle — even
  when it finds nothing.
- Do NOT critique by introspection — "let me re-read my plan and see if it's complete" is
  **intrinsic** self-correction, which measurably makes output WORSE (Huang et al. 2023);
  every sweep must cite a tool result (grep/file/graph), per CRITIC (Gou et al. 2023).
- Do NOT mistake green gates for completeness. `gaps`, DoR and `check` score the nodes that
  EXIST; none can see the epic you never wrote. A fully green tree with a missing stage is
  the normal way this fails.
- Do NOT chase global `agf gaps` debt — filter to your own node ids; only your subtree
  must be required-clean
- Do NOT add a `requirement`/NFR/`contract` node without wiring a task that `implements`
  it — that creates a phantom required gap
- Do NOT `node rm` + re-add just to fix AC — `node update --ac "<c1>" "<c2>" …` REPLACES
  the whole `ac[]` in place (repeatable; pass every criterion you want to keep) and
  preserves all edges; enrich prose via `--description`
- Do NOT implement, test, or review here — that is `graph-builder-leafcutter`
- Do NOT emit one run-on AC — use multiple discrete, testable Given-When-Then criteria
- Do NOT skip the investigate step — the backlog must be grounded in real findings
- Do NOT over-produce (Lean): plan only the Pareto-justified scope per cycle. When the
  backlog is already saturated, scan existing epics first (`agf query --type epic
--status backlog`) and **EXPAND/wire dormant code rather than recreate** — confirm
  white space with the human before injecting overlapping epics
- Do NOT hardcode a gate phase or flag that may not exist — verify with `--help` first
- Do NOT treat a failing `status_flow_valid` on fresh backlog as a defect — it is
  expected; the planner bar is AC-present + AC-score ≥ 60
- Do NOT ship an epic with tasks but no measurable outcome/KR — that is output blind to
  outcome; give every epic an Objective + Key Result
- Do NOT plan a backend/data epic top-down. Slice **outside-in from the consumer surface**
  (screen/command/endpoint the user operates); a backend leaf exists only wired
  `depends_on` a **surface AC that fails without it** — pull it, never push it. A backend
  node with no surface control tracing back to it is speculative work (Walking Skeleton /
  GOOS outside-in TDD) and inflates time-to-market for zero observable value
- Do NOT frame a KR as an inner artifact ("the service exists", "the parser is done"). The
  KR is the **surface operating whole**, observed in the consumer's mode — a number, a
  boolean, a rendered state (`_shared.md` Golden Rule 16). A control on the screen with no
  leaf that proves it end-to-end = incomplete epic
- Do NOT let a **measure→activate** pair measure only the flagship unit. When an epic
  gates activation on evidence (smart-defaults, auto-tuning, a router that flips a
  behaviour per item), the paired measurement task must produce evidence for **every**
  unit the gate can flip — not just the one you started with. Measure 1 of N and the
  gate can only ever default that 1; the other N−1 stay dark. Budget one measurement
  leaf covering the whole activatable set (or a loop over it), wired `depends_on` before
  the gate.
- Do NOT call a story "ready" with rules but no examples, or with unresolved Example-Map
  questions — convert each to a `risk` node or send it back to DESIGN

## Graph mechanics (CLI contract)

- **Parent/child:** `agf node add --parent <id>` sets `parentId` directly (one call) —
  no separate containment edge needed. `agf query --parent <id>` does **not** reliably
  list children; verify structure via each child's `parentId` (from `agf node show`).
- **AC at creation:** pass repeatable `--ac "<Given… When… Then…>"`. `import-prd` and
  `generate-prd` extract AC from the PRD markdown and synthesize testable Given-When-Then
  criteria for tasks that lack them — the output envelope includes `data.acCoverage` with
  per-task coverage. Use `node add --ac` to add or refine ACs after import.
- **Dependencies:** `agf edge add <from> <to> --type depends_on` to enforce build order
  inside an epic (e.g. release-task depends_on the wiring-task).
- **`edge add` is POSITIONAL:** `agf edge add <from> <to> --type <rel>` — there is **no**
  `--from/--to` (passing them silently no-ops). Relations you'll use: `depends_on`,
  `parent_of`, `implements` (task→requirement/contract), `consumes` (consumer→contract),
  `related_to` (risk/perf→task). Confirm the live set with `agf edge add --help`.
- **AC is revisable in place (NOT write-once).** `node update --ac "<c1>" "<c2>" …` is
  repeatable and **REPLACES** the node's whole `ac[]` — it does **not** append, so to
  revise AC pass the COMPLETE set (the criteria you keep + the new ones). Edges are
  preserved — **never `node rm` + re-add just to fix AC** (that needlessly re-wires every
  edge; earned the hard way — a 5-task epic was rebuilt before this flag was noticed).
  `node update --description` edits the prose independently.
- **Status is forward-only — planner never sets `in_progress`.** Leave tasks in
  `backlog` (or `ready` once DoR passes). `in_progress`/`done` are the builder pulling.
  If a node slipped to `in_progress`, valid transitions are `done|blocked|ready|`
  `quarantined` — you **cannot** go back to `backlog`; set it `ready`.

## Token Economy

Output is auto-compressed with `--ai`; no manual flags needed. Levers:

- **`--select <path>`** — shape every read down to the field you need (output→input lean).
- **`agf retrieve-command "<intent>"`** (RAG-IN) — the exact current command, no guessing.
- **`agf montar-output "<objetivo>"`** (RAG-OUT) — reuse PRD scaffolds instead of re-drafting.
- **`agf savings` / `agf metrics`** — the ledger logs token economy automatically.

See `_shared.md` for the full arsenal.

## Pilot Protocol

Planning chain is human-in-the-loop, not autonomous. The build/execute loop
(next→brief→submit) lives in `graph-builder-leafcutter`. See `_pilot-protocol.md`.

## Related

- `graph-builder-leafcutter` — consumes this backlog and implements it autonomously (ACO + GA-inspired learning loop).
