# Field lessons — graph-backlog-generation

Jurisprudência do planner: cada item nasceu de um ciclo REAL, com a causa-raiz e
o blind-spot do gerador que o deixou passar. Fora do `SKILL.md` porque a skill é
lida inteira em toda invocação (node_891dff815566).

## ⛔ Hard rule — PLAN ONLY, zero code (read this first)

**graph nodes** (`node add` / `edge add` / `node update`) plus the plan/handoff text.
If you catch yourself opening an editor, creating a `*.ts` / `*.test.ts` file, or
editing a source file — **STOP: you have left the planner.** Revert it and put the
intent into a task node instead. Implementation and the TDD that proves it belong to
`graph-builder-leafcutter`, pulled later via `agf start`.

## Step 1 — Investigate & find white space (dogfood)

**Surface C — WIRE-tasks the builder already blocked with a real finding.** The
builder (graph-builder-leafcutter) triages `wire-dormant` harvest output into 5
buckets; only one is a mechanical wire it can close alone. The other four land as
`blocked` nodes with the investigation already written in the description — this is
**pre-digested planning material**, cheaper to consume than a fresh repomix pass:

## Step 2 — Frame the problem & confirm direction

**Checkpoint the human BEFORE injecting** — this is the **Three Amigos** moment (the
human plays Product + Test over your draft) — when the backlog is saturated or the
value direction is ambiguous: present 2–4 grounded, low-duplication value themes (an
AskUserQuestion-style multi-select, recommended option first) and let them steer.
Picking the wrong theme into a saturated backlog is the most expensive planner
mistake — one cheap question prevents a whole wasted injection. Skip the question
only when the user already named the exact scope.

## Step 5 — Close gaps & validate

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

## Completeness-Critic gate (MANDATORY — run it yourself, never wait to be asked)

**Definition of Ready (the stop gate).** Beyond per-task AC, the backlog as a whole
must pass DoR's **7 checks** (`has_requirements`, `has_acceptance_criteria`,
`no_orphans`, `no_cycles`, `has_constraints`, `has_risks`, `prd_quality_score ≥ 60` —
owned by `agf gate`; confirm the phase via `--help`). DoR green **+** AC present on
every task with AC-score ≥ 60 = ready to stop. Unresolved Example-Map questions or
unmapped Impact-Map deliverables block DoR — park them as `risk` nodes or
loop back to DESIGN first.

## Step 5.5 — Completeness critic (MANDATORY, tool-grounded — never hand over an uncriticised backlog)

**The one rule that decides whether this works — every critique MUST cite external evidence.**
The literature is blunt about the failure mode. Huang et al., _LLMs Cannot Self-Correct
Reasoning Yet_ (ICLR 2024, arXiv:2310.01798): **intrinsic** self-correction — a model
critiquing itself with no external signal — **degrades** the output through overcorrection;
merely asking "are you sure?" measurably drops quality (the FlipFlop effect, arXiv:2311.08596).
What works is Gou et al., **CRITIC** (ICLR 2024, arXiv:2305.11738): _tool-interactive_
critiquing — verify against external tools, then amend — whose stated conclusion is "the
crucial importance of external feedback".

**Answer each sweep from a FRESH read, not by re-reading your plan (Chain-of-Verification,
factored — Dhuliawala et al., ACL 2024, arXiv:2309.11495).** CoVe's measured result is that
verification questions answered by _re-reading the original draft_ just re-confirm it; the
**factored** variant — answer each question independently, from a source that does not include
your own reasoning — is what actually catches the error. Operationally: a sweep's evidence must
come from a NEW `grep`/`node show`/`ls` against the repo or graph, never from the plan text you
just wrote. "I described the flow correctly above" is the draft confirming itself; run the
query again over the graph. Factored verification is why the loop earned three passes this
cycle — each sweep re-read the world, not the plan.

**factored** variant — answer each question independently, from a source that does not include
your own reasoning — is what actually catches the error. Operationally: a sweep's evidence must
come from a NEW `grep`/`node show`/`ls` against the repo or graph, never from the plan text you
just wrote. "I described the flow correctly above" is the draft confirming itself; run the
query again over the graph. Factored verification is why the loop earned three passes this
cycle — each sweep re-read the world, not the plan.

**The critic's own tool can produce the false negative it exists to prevent.** A graph/text
search returning zero rows means _the index did not match_, which is not the same as _the node
does not exist_ — prefix-vs-whole-word matching, a stale index, or a synonym in the title all
return empty for something that is right there. Treat an empty sweep as a **lead**, then confirm
by reading the node directly (or by a second query with different wording). Two failures ride on
this: acting on a false absence duplicates work already in the graph, and — the worse one —
declaring "swept, nothing found" on the strength of a query that never matched anything is the
exact optimistic-oracle lie the whole method exists to design against. A sweep whose evidence is
an empty result set must say so explicitly and name the confirming read.

**When the theme is a COMPARISON, the shared input belongs to neither side — so nobody plans
it.** Benchmarks, A/Bs, bake-offs and migrations-with-parity all decompose naturally into "the
harness for A" and "the harness for B", and each of those has an obvious owner. What has no
obvious owner is the thing they must BOTH consume: the scenario set, the workload, the corpus,
the fixture matrix. Each side would happily define its own, and then every record is
well-formed while the two columns describe different work — a report that adds pears to apples
and looks complete doing it. The tell is a field that every consumer reads and no task writes
(`scenario_id`, `workload`, `case_id`): grep the producers of each field your record format
declares, and when the answer is nobody, that shared definition is a missing leaf that every
other leaf depends on. Related trap: the relationship between the shared input and the graded
artifact (one run per variant, or one run over all variants combined?) changes the resulting
numbers and is usually left implicit — make the matrix an explicit deliverable, not a decision
the builder makes silently at 2am.

**Adding a terminal state to a process obliges the RECORD FORMAT to represent it — otherwise
the fix poisons a different axis than the one it repaired.** Introducing a ceiling (timeout,
budget cap, retry limit, circuit breaker) feels self-contained: the run stops instead of
hanging. But the row written for that stopped run still has to say something in every column,
and with no explicit outcome field it silently reports the _absence_ of results as a _result_ —
"detected nothing", "returned zero", "scored 0" — which is indistinguishable from a complete
run that genuinely found nothing. You fixed the hang and manufactured a false measurement. So
whenever a critic finding adds a way for work to END EARLY, immediately re-read the contract it
writes into and ask what each field means for that ending; the usual answer is a new outcome
discriminator plus a rule that non-completed rows are excluded from aggregates and counted
separately. This is the concrete case of "closing a hole opens another" — and the second hole
lands in a different dimension than the first, which is why one sweep never catches both.

**A generator that emits the explore half reliably forgets the exploit half.** When a theme
names a paired mechanism — search _and_ refine, map _and_ deepen, discover _and_ optimize — the
breadth half is concrete and gets planned; the depth half stays a phrase in an epic description
and never becomes a task. Worse, the _feedback arrow_ that makes the pair a loop (the winner
returning to bias the next search) is promised in a KR and produced by nobody, so two epics ship
as two disconnected halves while the graph looks complete. So: whenever a theme describes a
cycle, name the task that WRITES the return path, not just the two that read it — and check the
theme's own vocabulary item by item against node titles, because an item that appears only
inside a description is prose, not backlog.

**Build ORDER is a planner deliverable, and a missing `depends_on` is invisible until value
ships empty.** An epic can name every stage — producer, reader, surface — and still hand the
builder the wrong one first, because the picker only knows the edges that exist. The tell:
query the DATA the downstream leaves consume and find zero rows, while the leaf that WRITES it
has no inbound dependency at all. Everything is well-formed; the route ships serving nothing and
the screen ships showing nothing, each passing its own tests. So when a producer leaf exists,
check who depends on it — and if the answer is "nobody", wire the consumers to it rather than
telling the builder to pull out of order. One edge fixes the sequence permanently; a note in a
handoff fixes it once and is forgotten next cycle.

**"Ready" is a status, not evidence — a task can be phantom-ready because its INPUT never
existed.** The picker reports what is unblocked by dependency edges; it cannot know whether the
measurement, export or run that a task is supposed to record ever produced data. A leaf like
"record the verdict", "publish the report", "document the result" is buildable only if the
producer already ran — and if it did not, pulling it forces the builder to either stall or
invent the number, which is the exact fabrication the KR exists to prevent. So before handing a
ready leaf to the builder, query the DATA it consumes (the table, the file, the ledger) and
confirm rows exist. When they do not, block the leaf WITH the evidence and the unblocking
condition written in it, rather than leaving it looking pullable. This is the planner's own
version of the reader-without-producer sweep, applied at handoff time.

**A number a task quotes is a CLAIM — reproduce it before planning on top of it.** Titles like
"triar os 115 X" or "reduzir Y para <=20" carry a figure someone read from a tool, and if that
tool was wrong the whole task is wrong in a way no review catches: the prose is coherent, the AC
is testable, the scope looks bounded. Re-run the command that produced the figure as step one of
touching any cleanup task. Earned the hard way: a `--severity` flag that validated its argument
and never filtered made every "N required" count the TOTAL count, and two tasks were written
prescribing bulk cleanup of debt that was never urgent — one claimed 107 required items where
the true number was zero. When you find such an instrument, fix it first, then go back and
CORRECT the numbers written into the nodes it misled; a task left quoting a false figure will
be re-derived by the next agent.

**Not every task's evidence is a test file — say so in the node when it is not.** The rule to
link `testFiles` at injection assumes the deliverable is code. For a task whose output is graph
state, a migration, or a triage decision, naming a test file that will never exist arms the
physical-triangulation gate against a promise nobody intends to keep. Write the verification
method into the node instead (re-run this command, compare the before/after list, record the
decision per item) so the builder knows what proof looks like and the gate is not fed a lie.

**A deferral needs a TRIGGER, not just a rationale — and admit when it is advisory.** Accepting
debt is legitimate planning, but "we accept this for now" with no condition that revokes the
acceptance is how debt becomes invisible. Write the measurable condition that would change the
decision (the count grows, the module is touched again, the flag flips) — and then ask who fires
that check. If the honest answer is "whoever remembers", say that in the node and name what
would make it enforced. A deferral that silently depends on vigilance is a checklist wearing a
control's clothes.

**A planner action that feeds a verification tool must be re-verified THROUGH that tool.** Linking
a test file, setting a check hint, declaring an implementation path — these look like inert
metadata, but detectors read them, and a detector's verdict can flip from honest-unknown to
false-confident the moment you supply the input it was missing. Earned the hard way: linking
`testFiles` on unimplemented backlog tasks (the skill's own advice, correctly applied) made a
verification command report them **satisfied**, because the declared test did not exist and "no
test ran" was being scored as "tests passed" — four ready tasks briefly looked done. Depth is
not free: after enriching a node, run the tool that consumes that field and read its verdict. If
the verdict got MORE confident without the world changing, you have found a defect — file it,
and revert the enrichment until it is fixed rather than leaving the trap armed for the builder.

**An empty search result is a LEAD, not white space — confirm with a second, differently-shaped
query before planning anything net-new.** The graph's own search can return nothing for a
capability that is right there under a name your phrasing never matched. Earned this cycle: a
themed search came back empty, and a crude title-pattern query over the same store immediately
surfaced a shipped, done command that already implemented the exact capability about to be
planned as a gap. Planning over that emptiness would have injected a duplicate of working code —
the most expensive planner error there is. So: when a search says "nothing", say so out loud, then
run a mechanically different query (title pattern, symbol grep in `src/`, the module's directory
listing) and only claim white space when BOTH come back empty.

**A cycle that just shipped is not a licence to plan a new theme — check for READY work first,
including your own unfinished epic.** The pull to open fresh scope right after a delivery is
strong, and it is the most expensive form of over-production: the graph gains a second front
while the thing the human actually asked for sits half-built. Before framing any theme, ask the
picker for the next unblocked task and look at WHICH epic it belongs to. If work is ready, the
planner's entire deliverable is to say so and hand back — plus, optionally, DEPTH on the nodes
already there (linking the test file each task names, noting a KR that measurement may already
have satisfied, correcting an EXPAND pointer). That is real planner value with zero new scope.
Injecting a new epic over ready backlog is how a session ends with three started themes and
none finished.

**Reader-without-producer repeats WITHIN one epic, not just once — sweep for it every round.**
The known shape is planning the consumer of a signal nobody writes. What this epic showed is
that closing one such pair immediately creates the next: persist a verdict and no gate reads it;
wire the gate and no plan declares what it expects; grade the pass and no report counts the
grade. Four rounds, each looking complete on its own. So when the theme is a judge, an oracle,
a score or a gate, list EVERY field the evaluator reads and name the writer of each — then
repeat that list after each revision, because the leaf you just added reads something too. The
tell that you are mid-chain: a capability whose tests are green while its metric sits at zero.

**Sweep 4 is the highest-yield sweep when the theme is "wire the missing piece" — and the
generator's blind-spot is believing the piece is missing.** Discovering that a chain has no
production caller feels like proof that the implementation does not exist. It usually proves
only that nobody CALLS it. Before writing a single "IMPLEMENT: build the adapter/client/driver"
leaf, `ls` the whole owning directory and read the docblock of every file you have not opened —
not just the ones the chain names. A module that already solves it hides under a name your
search never matched (a bridge, a factory, a lifecycle helper), and its own header usually says
so in one line. Earned the hard way in a single cycle: three consecutive corrections, each
found by opening one more unread file — a task to "build an HTTP client" became a task to
"build a mapper", and then dissolved entirely when a complete, tested factory turned up in the
very file that declared the interface. A leaf that recreates working code is worse than a
missing leaf: it ships a second twin, and the next planner has to choose between them.

**When the theme is "wire the empty defaults", NEVER plan only the seams the human handed you —
re-derive the list from the entry point itself.** The blind-spot is treating the reported list as
the inventory. It is a sample. Empty defaults (`x or (lambda: [])`, `param=None`, a well-formed
zero-tuple) are not independent bugs: they were all introduced by the same convenience — making
the entry point injectable for tests — so they cluster in the SAME function, added one per
feature over many cycles. Whoever noticed them noticed the ones that bit them. So read EVERY
injectable parameter of the consumer entry point and check what each falls back to when the
consumer passes nothing; the ones nobody reported are the dangerous ones, because no test and no
gate has ever looked at them. Earned in one cycle: a closed scope of four named seams became six
— a port defaulting to `None` sat two lines from a named one (its feature could not act without
it), and the flagship command's own evidence parameter defaulted to `None`, so the entire oracle
silently reported "not evaluated" on every real invocation. Both were the same class as the four,
in the same file, found by reading the signature instead of the list.

**The corollary at the gate, not just in the code: ask what the proof does when the environment is
absent.** A wiring epic's every AC is necessarily proven against a real dependency, so every proof
lands in a test that skips honestly when that dependency is missing. Honest skip is correct design
— and it means the whole epic's KR is satisfiable with zero executions, exit 0, all green. Any
epic whose value can only be observed in a real environment needs one leaf that makes the
difference between PROVEN and SKIPPED observable, gated behind an explicit "I am claiming this is
done" flag so ordinary local and CI runs keep skipping. Without it the epic reproduces, in its own
acceptance gate, precisely the defect it was written to remove.

**When two complete implementations exist and neither is wired, CHOOSING is the deliverable.**
The reflex is to plan construction; the actual work is a decision node that names both paths,
why one wins for this consumer, and the trigger that would revisit the other. Left implicit,
the builder picks by whichever grep it ran first, and the loser stays dormant forever with
nothing recording why.

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

## Step 6 — Stop for the human ⇆ iterate (the loop)

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

## Fundações do outside-in (por que a regra existe)

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

## Falso negativo de busca vira premissa

**Um falso negativo de busca não erra sozinho — ele vira PREMISSA e contamina tudo que você
derivar dele.** Grepei um formato de string que o arquivo não usava (`'/run'` quando o catálogo
usa `name: 'run'`), o resultado veio vazio, e construí uma avaliação inteira em cima: "a
superfície não opera X", "os outros épicos são acabamento em volta de uma sala vazia". A
capacidade existia, catalogada, wirada e testada. A regra de confirmar vazio com uma segunda
consulta já estava nesta skill — eu a aplicava ao decidir se algo JÁ EXISTE (para não duplicar) e
esqueci ao decidir se algo FALTA. É o mesmo risco nas duas direções: antes de reportar ausência
de capacidade, confirme com uma consulta mecanicamente diferente e diga qual você rodou.
