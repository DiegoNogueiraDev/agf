# Planning Methodologies — reference for graph-backlog-generation

Loaded on demand (progressive disclosure). These are the frameworks the project
already uses, consolidated here from the former phase skills. Apply the ones that
fit the cycle; do not mechanically run all of them.

## Problem framing

- **5W2H** — What, Why, Who, Where, When, How, How-much. One line each; the PRD
  problem statement must answer all seven.
- **JTBD (Jobs To Be Done)** — "When <situation>, I want to <motivation>, so I can
  <outcome>." Frame each requirement as a job, not a feature.
- **Cynefin** — size the uncertainty: obvious → just spec it; complicated → analyze
  before specifying; complex → prefer brainstorm/divergence; chaotic → spec the most
  urgent stabilizing task first.

## Goal & outcome framing

Anchor the cycle on a measurable goal _before_ enumerating features, so epics derive
from desired outcomes, not from a feature wishlist.

- **Impact Mapping (Gojko Adzic)** — `Goal (Why, measurable) → Actors (Who) → Impacts
(How their behavior changes) → Deliverables (What we build)`. Build the map
  right-to-left when validating: every top-level **epic should trace back to one Goal
  node** through an impact. A deliverable that maps to no impact is waste — drop it
  (Lean). Complements JTBD: JTBD frames the user's job, Impact Mapping connects that
  job to a business goal and the smallest deliverable that moves it.
- **OKR / outcome per epic** — every epic carries an **Objective** (qualitative,
  inspirational) + **≥1 measurable Key Result** (its success metric), authored so
  VALIDATE can later check it (e.g. "KR: p95 plan-injection latency < 800ms"). Keep the
  KR as the epic node's AC. Distinguish **outcome** (the KR — did behavior/metrics
  move?) from **output** (the tasks — did we ship them?). An epic with tasks but no KR
  ships output blind to outcome. Ties directly to the **Six Sigma** measurable-bar idea
  below.

## Scope & prioritization

- **Pareto 80/20** — pick the 20% of scope delivering 80% of value; defer the rest.
- **MoSCoW** — Must / Should / Could / Won't per requirement → drives task priority.
- **WSJF (Weighted Shortest Job First, SAFe)** — once MoSCoW has filtered and Pareto has
  picked the scope, **sequence** the Must/Should set by `WSJF = Cost of Delay ÷ Job
Size`. Cost of Delay ≈ user/business value + time criticality + risk-reduction /
  opportunity-enablement; Job Size ≈ the PERT estimate (`agf forecast`). Highest WSJF
  first → biggest value per unit effort, soonest. Complements, does **not** replace,
  MoSCoW + Pareto — MoSCoW says _whether_, WSJF says _in what order_.
- **Lean / Toyota** — eliminate waste: no overproduction (only Pareto-justified
  scope), no over-processing, surface loose ends as `risk` nodes not silent gaps.
- **JIT** — decompose to atomic tasks just-in-time per cycle; don't plan the whole
  roadmap to task granularity up front.

## Decomposition & distillation (epic → task → subtask)

The planner's core craft: distil a vague intent into the **smallest buildable units**.
Smaller, well-bounded leaves = cheaper builds, cleaner blast radius, honest progress.

- **Three levels, distinct roles:**
  - **Epic** = one coherent value theme (the _why_). A container — no AC of its own;
    its children carry the testability.
  - **Task** = one atomic outcome with 2–4 GWT AC + file/symbol pointers (the
    task-node contract). Completable and testable in one sitting (≤2h, INVEST-Small).
  - **Subtask** = a single step of a task (one function · one test · one wiring),
    `--parent`-ed to the task, still with ≥1 testable AC.
- **Vertical slices, not layers.** Each task ships an end-to-end thin slice of value
  the builder can run and test alone — never "the DB layer" then "the API layer".
- **Split heuristics — break a task down when ANY holds:** more than ~4 AC; AC spans
  multiple files/modules; the title contains "and"; mixed concerns (impl + test +
  docs); estimate > 2h; an L/XL size with no subtasks (fails the DoD).
- **One responsibility per node.** A node that does "X _and_ Y" is two nodes (SRP at
  task scale) — DRY/SoC applied to the backlog itself.
- **Distillation checklist (every leaf):** ① a single verb-prefixed outcome ·
  ② ≥1 testable GWT AC · ③ a parent · ④ explicit `depends_on` for build order ·
  ⑤ file/symbol pointers so the builder needn't re-investigate. Missing any → not
  distilled enough; split or enrich before injecting.
- **Tools:** `agf decompose` auto-splits an oversized task; author fine-grained
  subtasks directly with `agf node add --parent <taskId> --ac "<GWT>" …`.

## Backbone & release slicing

Before injecting a flat pile of tasks, organize them into a journey and slice a thin
end-to-end release — so the builder ships running value early, not a half-finished layer.

- **User Story Mapping (Jeff Patton)** — lay the **backbone** left→right as the steps a
  user takes through the journey; stack candidate stories top→bottom under each step by
  priority. Map to the graph: **backbone steps → epics**; the stories under a step →
  that epic's tasks.
- **Walking skeleton / MVP first.** Slice **horizontally**: the first release slice is
  the thinnest path that is end-to-end runnable (one story per backbone step) — the
  walking skeleton. Commit only that slice's tasks as `must` this cycle; deeper stories
  stay as deferred epics/tasks (Pareto + JIT). Each task is still a **vertical slice**
  (see Decomposition) — slicing the _release_ horizontally ≠ building in layers.
- **A release slice = the set of `must`-tagged tasks across epics for this cycle.** Tag
  later slices `should`/`could` so the next cycle pulls them without re-planning.

## Requirement & AC quality

- **Example Mapping (Matt Wynne)** — the bridge from a story to discrete AC. For each
  story enumerate three colors: **Rules** (the acceptance criteria), 1+ concrete
  **Example** per rule (specific input → expected result — these _become_ the GWT `--ac`
  entries and their fixtures), and **Questions** (anything unknown). Signals it reads
  off the map: a **rule with no example = untestable** (don't inject it); a **pile of
  questions = not ready** — capture each as a `risk` node (the project's loose-end
  type) or send the story back to DESIGN / a human checkpoint. ~4 rules is the natural split point (see SPIDR).
- **INVEST** — Independent, Negotiable, Valuable, Estimable, Small, Testable. The
  `agf` DoD gate scores AC against this (≥60). Multiple discrete criteria score
  higher than one prose blob.
- **Given-When-Then** — every AC as `GIVEN <context> WHEN <action> THEN <result>`,
  one assertion each (repeatable `--ac` entries). Each comes from one Example above.
- **SPIDR splitting** — five canonical ways to split an oversized story (use alongside
  the Decomposition split heuristics): **S**pike (split off a research/unknown as its
  own node), **P**aths (separate happy/error/alternate flows), **I**nterfaces (split by
  UI/API/CLI surface or device), **D**ata (split by data type/range/source), **R**ules
  (split by business rule — one rule, one task).
- **Three Amigos** — review each story from three perspectives before calling it ready:
  **Product** (is it the right value?), **Build** (is it feasible / pointers correct?),
  **Test** (how do we prove it — are the examples sufficient?). In this planner the
  **human checkpoint (Step 2/6) plays Product + Test** over the planner's drafted nodes.
- **TDD-as-AC** — express the first failing test in the AC so the builder starts RED.
- **SOLID / Clean Code** — encode as AC/constraints (file <800 lines, fn <50, 1
  responsibility, immutability, typed errors) rather than prose guidance.
- **Scrum / XP** — atomic tasks ≤2h, WIP=1, vertical slices, definition of ready.

## Design principles (encode as AC / constraints, not prose)

Each is a constraint the PLAN turns into a testable AC for the builder to honor:

- **KISS** — the simplest solution that works; reject accidental complexity. AC: "no
  abstraction without ≥2 real call-sites".
- **YAGNI** — don't build speculative features; only the Pareto-justified scope.
- **DRY (Rule of Three)** — one authoritative representation per piece of knowledge;
  refactor duplication on the 3rd occurrence, not the 1st (avoid premature abstraction).
- **Law of Demeter** — talk only to immediate collaborators; ban `a.getB().getC().do()`.
- **Composition over Inheritance** — prefer composing behaviors; inheritance only for
  true is-a + LSP-safe substitution.
- **Separation of Concerns** — one responsibility per file/module/layer (SRP at file
  scale): file <800 lines, function <50, single reason to change.
- **Clean Code** — intention-revealing names (`getUserById`, not `get`), small focused
  functions, Boy-Scout rule (leave it cleaner), self-explanatory over commented.

## Documentation (as deliverables in the PRD)

- **ADRs** for architecture decisions (`agf adr`), **docstrings/JSDoc** on public APIs,
  README per module, OpenAPI for REST, C4 diagrams for structure.
- Comment the **why** (non-obvious decisions, warnings), never the **what**.

## Logging & Observability (NFR as measurable AC)

Plan these as acceptance criteria whenever a change touches runtime behavior:

- **Structured logging** (JSON, never free text), correct levels (DEBUG/INFO/WARN/ERROR),
  `trace_id`/`correlation_id` on every request, never log PII/secrets, actionable messages.
- **3 pillars** — Logs (what happened), Metrics (latency/throughput/errors), Traces
  (distributed). AC example: "WHEN a request is handled THEN it emits a structured log
  with trace_id and a latency metric". Tools: OpenTelemetry, Prometheus/Grafana, Loki/Jaeger.

## Non-functional as measurable AC

- **Risk Matrix** — likelihood × impact per risk node; link risks to the epics/tasks
  they threaten.
- **STRIDE / OWASP** — for any change touching authn/authz, external I/O, secrets:
  add security AC (e.g. "WHEN untrusted input arrives THEN it is validated by schema").
- **Six Sigma** — define measurable quality bars as AC (coverage %, harness grade,
  Web Vitals thresholds) so "done" is objective, not subjective.

## PERT (estimation, optional)

Three-point estimate (optimistic, most-likely, pessimistic) → expected = (o+4m+p)/6.
Feeds `agf forecast`, and supplies the **Job Size** denominator for WSJF sequencing.
Use only when an estimate is required for ordering/forecasting.

## Definition of Ready (the gate before you stop)

The explicit ANALYZE→DESIGN readiness bar the planner must satisfy before stopping for
the human — **7 checks** owned by `agf gate` / `_shared.md` (cited, not duplicated
here): `has_requirements`, `has_acceptance_criteria`, `no_orphans`, `no_cycles`,
`has_constraints`, `has_risks`, `prd_quality_score ≥ 60`. DoR green + the planner bar
(AC present on every task, AC-score ≥ 60) = the backlog is buildable. Open
Example-Map questions and unmapped Impact-Map deliverables must be resolved (or parked
as `risk` nodes) before DoR can pass — never silent gaps (Lean).

## Codebase investigation with Repomix (detect gaps · bugs · dormant features)

Repomix is the planner's lens on **Surface B** (the code) — understand a project
_without reading all of it_, and locate strong vs weak areas. The 3-pass golden path:
`--no-files --token-count-tree` (shape/hotspots) → `--compress` (structure to EXPAND)
→ `--include-diffs --include-logs` (WIP + churn). Read churn-sorted + oversized files
as bug/debt risk; exported-but-unwired symbols as EXPAND targets; small+low-churn+
tested as strong (leave alone, Lean).

> **Full command catalog** (scope, git, output-shaping, remote skeleton research, MCP
> `grep_repomix_output`, anti-patterns): [repomix-investigation.md](repomix-investigation.md).

## Mapping to `agf`

| Methodology output      | `agf` command                                                            |
| ----------------------- | ------------------------------------------------------------------------ |
| PRD draft               | `agf generate-prd "<idea>"`                                              |
| PRD → graph             | `agf import-prd <file> --build-tree`                                     |
| Goal/Impact-map epic    | `agf node add --type epic` (Objective in description, KR as `--ac`)      |
| Story-map release slice | tag `must` across epics this cycle; later slices `should`/`could`        |
| Divergent candidates    | brainstorm flow → `agf node add --type requirement`                      |
| Atomic tasks            | `agf decompose` · `agf node add --parent <id> --ac …`                    |
| Example-map examples    | `agf node add --ac "<GWT>" --ac "<GWT>" …` (one example → one `--ac`)    |
| Example-map questions   | `agf node add --type risk` — loose-end type; never a silent gap          |
| Per-task DoD            | `agf check <taskId>` (AC-present + AC-score ≥ 60)                        |
| Readiness gate (DoR)    | `agf gate <phase>` — confirm phase with `agf gate --help`                |
| Gap closure             | `agf gaps --severity required` (verify `--json`/`--select` via `--help`) |

> Stale-command guard: `agf gate analyze` does **not** exist (phases: design ·
> review · handoff · deploy · listening · all); `agf gaps --json` may be unsupported.
> Always confirm with `--help` or `agf retrieve-command` — never hardcode.
