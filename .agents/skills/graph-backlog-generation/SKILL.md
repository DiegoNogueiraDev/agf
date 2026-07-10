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
6. `agf decompose`. Every leaf ≤2h and self-sufficient:
   - title `IMPLEMENT:|WIRE:|FIX:|DOCS: <one outcome>`
   - description: the WHY + **exact file paths** to touch (`src/…`) + "do not recreate"
   - 2–4 `--ac` lines, each **Given-When-Then** with a concrete number/boolean/string
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
10. **STOP for the human:** "backlog ready, N tasks — run `graph-builder-leafcutter`."

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
2. **Expand, never recreate (DRY).** search/query/grep/repomix for the owning module
   and plan to _extend_ it. Net-new only when it provably does not exist — the
   strongest epics wire dormant/partial code that already lives in the repo.
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

```
[investigate graph + git + code → find WHITE SPACE]  → (checkpoint human on direction)
  → generate-prd / import-prd → decompose → node add + edge add (epics·tasks·AC)
  → gaps (close required) → validate AC (agf check) → verify tree → STOP for human ⇆ iterate
```

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

**What "validated" means for fresh planner backlog.** `agf check` on a backlog task
will report `status_flow_valid: failed` — that is **expected and correct**, not a
planning defect: the task hasn't been taken through `in_progress → done` yet (that's
the builder's job). The binding signal for planning quality is **AC present on every
task + AC-score ≥ 60**. Confirm that, not a green DoD.

**Planner DoD — sweep ALL injected nodes before stopping.** Loop `agf node show` over
every new id and assert: each task has ≥1 AC; each non-epic node has a `parentId`;
epics are roots (`parentId` null) and carry an Objective + KR; `depends_on` edges
wired. Cheap, deterministic, and catches a half-built tree before the human (or the
builder) ever sees it.

**Definition of Ready (the stop gate).** Beyond per-task AC, the backlog as a whole
must pass DoR's **7 checks** (`has_requirements`, `has_acceptance_criteria`,
`no_orphans`, `no_cycles`, `has_constraints`, `has_risks`, `prd_quality_score ≥ 60` —
owned by `agf gate`; confirm the phase via `--help`). DoR green **+** AC present on
every task with AC-score ≥ 60 = ready to stop. Unresolved Example-Map questions or
unmapped Impact-Map deliverables block DoR — park them as `risk` nodes or
loop back to DESIGN first.

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

## Anti-Patterns

- Do NOT write code, tests, or stubs, and do NOT touch git (no commit, no new/switched
  branch) — the deliverable is graph nodes; implementation + branch-per-feature is the
  builder's. If you opened an editor, you left the planner — revert and node-ify it.
- Do NOT chase global `agf gaps` debt — filter to your own node ids; only your subtree
  must be required-clean
- Do NOT add a `requirement`/NFR/`contract` node without wiring a task that `implements`
  it — that creates a phantom required gap
- Do NOT try to edit AC with `node update` (no `--ac`) — get AC right at `node add`, or
  rm + re-add; enrich via `--description` otherwise
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
- **AC is write-once.** `node update` has **no** `--ac` flag and there is no AC-append;
  AC lives in the node's `ac[]` field. Get it right at `node add` time. To revise AC you
  must `node rm` + re-`add` (and re-wire every edge) — costly — so prefer pouring extra
  detail into the **description** (`node update --description` _can_ edit that) rather
  than recreating the node.
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
