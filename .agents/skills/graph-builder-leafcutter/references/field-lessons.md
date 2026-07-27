# Field lessons — graph-builder-leafcutter

Jurisprudência acumulada do loop de build: cada item nasceu de um caso REAL,
com a causa-raiz e o blind-spot que o deixou passar. Vive fora do `SKILL.md`
porque a skill é lida inteira em toda invocação — o corpo carrega o que decide
comportamento sempre; isto aqui é consultado quando a etapa correspondente
aperta (node_891dff815566).

## Step 2 — Pull, then INVESTIGATE before you touch code (golden rule)

- **A task says "write a build script" but the logic belongs in the tested core.**
  When a standalone script (a bundler `.mjs`, a CI helper) **cannot import the compiled
  core** (bundled entrypoints, not per-module output), do NOT re-implement the logic
  inside the script — that duplicates it AND leaves the tested core **dormant** (rule 9).
  Put the pure logic in the core (DIP-injected I/O, unit-tested), expose it as a **CLI
  command** that reuses it, and let the script/CI be a one-liner that calls the command.
  A shipped command must also be **discoverable** — register it wherever the context/RAG
  index derives from, or it stays invisible to the next agent even though it runs.

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

## Step 3 — BUILD with economy (TDD + Clean Code/SOLID)

- **Outside-in when the task is a surface control (the planner slices this way).** Start
  the RED test at the **consumer surface** the AC names — the screen/command/endpoint the
  user operates — not at an inner class. Then drive **only inward as the failing surface
  operation demands**: build the API, then the domain logic, then the store, each pulled by
  the surface test still being red. This is Cockburn's walking skeleton + Freeman & Pryce's
  outside-in TDD (GOOS): nothing inner exists that no outer test pulled into being — which
  is exactly why it delivers with zero speculative backend. `done` for such a leaf = the
  **control is wired and operable end-to-end** (clicks → real effect → rendered result) AND
  the epic's OKR/KR moves — observed at the surface, never "the unit is green". A surface
  task whose test only exercises an inner function (never the wired control) is the
  optimistic-oracle lie — it goes green while the button does nothing.
- Keep additive/opt-in (default OFF = byte-identical) so existing tests stay green
  — this is how you get **zero regression** for free.
- Output stays compressed (`--ai`, `--select`) to minimise tokens.

## Step 4 — Close out HONESTLY (self-review + gates + DoD)

- **The blast gate is BLIND to convention/isolation tests that read files via fs.** `test:blast`
  follows the Vite import graph — a test that asserts over source files with `readFileSync`/`readdirSync`
  (layer-isolation "src/X must not import ../cli", file-size sweeps, convention scanners) is never
  "affected" by your edit and never runs. A green blast can therefore hide a layering regression your
  new file just introduced. Whenever you CREATE a file in a layer-guarded dir (e.g. `src/swarming`),
  explicitly run that layer's convention test alongside blast — earned when a fresh adapter imported
  `../cli` and blast stayed green while the isolation test was red on the full suite.

- **Anti-hallucination gate (`PHANTOM_TESTFILE`).** `agf done` now refuses a task whose declared
  `testFiles` **or** `implementationFiles` do **not** exist on disk — a delivery no real code/test
  backs. This is the AC ↔ code ↔ **physical test** triangulation (both axes) enforced on entry, and
  it applies to ANY project agf drives (resolved against `--dir`). Fix it honestly: write the missing
  file, or repoint a stale reference with `agf node update <id> --test-files|--implementation-files
<real files…>` — never `--force` past it just to go green (that re-creates the hallucination).
- `agf done` runs the **full** suite by default. A _pre-existing, unrelated_
  failure will block it. Confirm it is not yours: `git stash -u` → rerun the
  failing test → `git stash pop`. If it fails on clean `main`, it is pre-existing.
  **In a SHARED tree (colony), never stash — it sweeps the other ant's dirty files
  (rule 4).** Colony-safe proof: `git worktree add <tmp> origin/main` + symlink
  `node_modules` → run the failing test there → `git worktree remove --force`.
  A throwaway _verification_ worktree is fine (the rejection of worktree-per-ant
  is about _working_ there); it proves pre-existence without touching the tree.
  Then file the bug node and, for a push blocked only by that proven-foreign
  failure, bypass the hook citing the proof — never bypass on an unproven red.
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
  The same applies to a **measurement/VALIDATE task whose deliverable is
  ledger/db evidence, not source** (an A/B run, a benchmark): `agf done` will
  refuse with NO_FILES_MODIFIED because nothing tracked changed — the honest
  close is the raw transition backed by the recorded numbers (decision node +
  green receipt tests), never a fake source edit to appease the gate.

- Pre-existing failure, a bug you discovered, or a deferred integration →
  `agf node add --type risk|task …` **before** `done`. Then complete your task on
  the real gate. Never mark done on a false claim (anti-vibe-coding).

Fold REVIEW (`agf insights` / blast radius), HANDOFF (`agf memory write`,
`agf snapshot`), and LISTENING (DORA retro) into the close-out.

**Close-out mechanics (the boring failures that eat a real loop — earned repeatedly):**

- **"The epic is complete" means reachable, not merely done — audit imports before you say it.**
  Closing every task under an epic feels like completion, and every gate agrees: tests green,
  DoD high, status done. But a module nobody imports delivers nothing, and the gates cannot
  see that, because they score the node in isolation. The shape is systemic rather than
  careless: a backlog that separates _mechanism_ tasks from _wire_ tasks will ship mechanisms
  whose wire was never planned, and the builder faithfully builds what is written. So before
  writing "epic complete" in a close-out, grep for importers of every module the epic created,
  and check each epic KR against that list — the KR that says a number will be "measured in a
  run" is unbacked if nothing in a command path can produce that run. Report unreachable
  modules as a finding, not as delivery. Watch the scan itself: excluding compiled-cache
  artifacts matters, since a module's own cached bytecode will match a naive grep and make
  everything look wired.

- **"The backlog is exhausted" is a claim that requires a command, never a recollection.**
  After a long run you carry a vivid mental model of what you built — and that model is
  organised around what you _touched_, so whatever you never touched is structurally absent
  from it. Summarise progress from memory and you will omit an entire untouched epic while
  reporting confident completion, because nothing in your recollection contradicts you. The
  failure is self-sealing: the omission and the confidence come from the same source. So
  before writing any "N of M done", "nothing left", or "only X remains", run the picker and
  the stats and let the graph tell you — and if a status table is going into the close-out,
  build its rows from that query, not from what you remember shipping. Reporting exhaustion
  that isn't real is the same lie this whole method exists to prevent: a confident assertion
  with no instrument behind it.

- **Announcing the next task is a graph query, not a judgement call.** Closing a task puts you
  in the best possible position to reason about what matters most next — and that reasoning
  runs on value, so it silently skips the one thing that can veto it: the node's own
  `depends_on` edges. The failure is quiet and repeatable, because a task whose dependency is
  unbuilt still looks perfectly pullable (`blocked: false`, AC present, priority high), and you
  only discover the gap after claiming it and reading an AC that references a function nobody
  wrote. Before you name the next task in a close-out, read its outbound `depends_on` and
  confirm each target is done. Value tells you which _branch_ to walk; the edges tell you which
  _node on that branch_ is actually reachable — and getting that backwards costs a claim, a
  correction, and the reader's trust in every other "next" you announce.

- **Extending an earlier task's module drags THAT task's test file into your scope.** The
  common shape: your task needs one new capability inside a module a previous task already
  closed (a new parameter, a new terminal state). Adding it changes behaviour the earlier
  tests asserted — often behaviour they asserted _incidentally_, not as their subject — so
  you must edit their test file too, and the done-gate flags it as scope creep. Declare the
  earlier task's test file in YOUR scope at claim time, not after the rejection. And when you
  do rewrite those assertions, re-point them at what the test actually exists to prove
  (that the work happened) rather than at the incidental value that changed — an assertion
  edited only to go green is how a suite stops meaning anything.

- **Adding a method to a structurally-typed interface has a blast radius equal to the number
  of test doubles, and it fails SILENTLY.** Protocols/traits/structural interfaces checked at
  runtime (`@runtime_checkable`, duck-typed conformance) do not fail with a missing-attribute
  error when a double lags behind — the conformance check simply starts returning FALSE, and
  every test that asserted "this stub is a valid port" inverts without naming the method that
  caused it. Worse, the doubles are rarely in one place: a shared fixture plus a private stub
  class inside each test file that wanted its own behaviour. So before adding a method to any
  such interface, grep for every class that implements it (not just the fixture) and declare
  them all in your scope at claim time; expect the count to be higher than the one obvious
  conftest. Earned when two methods on a browser port broke nine integration tests whose
  file-local stub nobody remembered existed.

- **A test that pins "additive / byte-identical" must compare against a BASELINE RUN, never a
  hardcoded expected value.** Writing `assert result.status == "explored"` encodes your
  assumption about what the shared test helper does — and when that assumption is wrong (the
  helper's default budget exhausts, its fixture has fewer rows than you thought) the failure
  looks exactly like a regression you just introduced, so the reflex is to "fix" working code.
  Run the same helper without your new parameter and assert the two results match field by
  field. That is both the honest claim (identical to what came before, whatever that was) and
  immune to being wrong about the helper. Earned when a hardcoded status sent a correct
  implementation into a debugging detour.

- **"Ran out" and "finished" need different names in any loop with a ceiling.** A budgeted
  loop that reports the same terminal state whether it exhausted its allowance or genuinely
  had nothing left is hiding the single most useful fact from whoever reads the output: was
  there more? The failure survives every test that only checks the happy path, because both
  cases produce a valid result — and it is invisible from inside the loop, which is why the
  _surface_ test is usually what exposes it. Give the exhausted case its own status, and let
  the exit code turn on whether the work actually happened at all, not on which ceiling
  stopped it.

- **`BLAST_RADIUS_EXCEEDED` from files you did NOT write in this task.** Two silent
  sources fill the tree behind your back: (1) a **format-on-save / lint hook reformats a
  file _after_ your commit** (a long line wrapped, an import re-sorted); (2) the **`done`
  hooks regenerate marker-wrapped context files** (CLAUDE.md · AGENTS.md · `.cursor` ·
  `.github/copilot-instructions.md` · generated command-surface). Neither is yours to
  claim. Fix: `git stash push -- <foreign paths>` before the next `done`, pop after; sweep
  them periodically in a separate `chore(docs)`/`style` commit. Do NOT `--force` past the
  gate — that skips the tests too.

- **Backticks in a double-quoted commit message are executed by the shell, not printed.**
  Writing a message that quotes an identifier the way you would in prose — around a variable,
  a flag, a function name — turns it into command substitution, and the shell silently splices
  in the command's output (usually nothing, plus a `command not found` on stderr you may not
  read). The commit succeeds, so no gate catches it; you only notice when the message is
  missing the very word it was explaining. Use plain quotes or none at all in shell-authored
  messages, or pass the message via a heredoc/file. And once it is pushed, prefer leaving a
  slightly degraded message over rewriting published history to fix cosmetics — the amend is
  the more expensive mistake.

- **A refutation from a blind instrument is not evidence — check the metric can MOVE before
  you trust the verdict.** The A/B you just built reports "no improvement", the lever stays
  off, every gate is green, and the honesty rule appears satisfied. But ask the prior
  question: on this fixture, could the treatment have won _at all_? Metrics go blind in
  ordinary ways — a count that is invariant to the ordering you are testing, a budget that
  every arm exhausts identically, a fixture with no variance in the dimension the policy
  optimizes. When the answer is no, "refuted" is not a result about the treatment; it is a
  result about the instrument, and reporting it as the former is the same lie as a green test
  over an empty result set. This is the A/B-level twin of "does the metric prove its own
  instrument is plugged in?": before recording a negative, construct (or reason through) the
  case where the treatment SHOULD win and confirm the harness would detect it. If it wouldn't,
  the finding to file is the blind experiment, not the rejected feature — and every sibling
  lever measured the same way inherits the same blindness.

- **A measured NEGATIVE result is a valid delivery — register it, never fake green.**
  When an A/B or benchmark you built comes back _against_ the feature (it cost more, it
  raised the defect rate), the honest close is a `decision` node + a `risk` node with the
  numbers, and leaving the lever OFF — not rewriting the fixture or the threshold to make
  it pass. The lever's default-OFF is the safety; the proof is the point, in either direction.

- **A derived key that must survive between RUNS cannot be built from the language's own
  hashing.** Any value persisted and re-read later — a state identity, a cache key, a dedupe
  fingerprint — must come from an explicit content hash over a canonical serialization, never
  from the runtime's `hash()`/object identity. Several runtimes randomize string hashing per
  process for security, so the naive version passes every unit test _inside one run_ and
  silently produces a different key on the next one; the consumer that breaks is exactly the
  persisted map the feature exists for, and nothing in the suite is red. Two rules: canonicalize
  before hashing (sort keys — insertion-ordered maps otherwise leak ordering into the key), and
  **prove the stability across processes empirically** (re-run under different hash seeds and
  diff the output) rather than asserting it in a docblock. Also version-prefix the key, so when
  the formula changes the old persisted data can never be mistaken for the new.

- **The AC names a PRODUCER; grep who actually writes that data before you implement against
  it.** A planner writing a consumer task has to say where the input comes from, and it names
  the most plausible upstream — which is frequently wrong in a specific, expensive way: the
  named module produces the SHAPE but deliberately leaves the FIELD empty, because its own job
  never needed it. Implementing against the AC then yields a consumer wired to a source that is
  structurally always null, and every unit test passes because the fixture supplies what the
  real producer does not. Meanwhile the true producer is often something the code already
  computes and DISCARDS — a validated-then-dropped return value, a parsed config used only for
  its exceptions, a compiled artifact built solely to prove it compiles. So: grep for who
  assigns the field (not who declares the type), and when the named producer writes `None` by
  design, say so in the close-out and name the real one. Earned when an AC said measurements
  came from an event trace that records counts as `None` on purpose, while the actual producer
  was a plan the command compiled and threw away on the next line.

- **When the AC's field names disagree with the real type, the code wins — read the type first.**
  A planner writes AC from the design, so an AC can say `x=True` where the shipped dataclass
  actually carries `status: Literal["ok","unreachable"]`. Implementing against the AC's wording
  produces something that type-checks against nothing and diverges from every existing consumer.
  Open the actual type before the first test line, implement against it, and note the divergence
  in the close-out so the planner's next AC matches reality. This is the AC↔code half of the
  triangulation: the AC states the _behaviour_ to satisfy, never the _shape_ to code against.

- **A green RED is a lying fixture, not a passing test.** If your failing test never went
  red for the right reason, the fixture is wrong. Three real traps: bag-of-words cosine can't
  separate tokens that differ only by a number (`"módulo 3"` ≈ `"módulo 4"` → fixtures
  differing only by an index collide and the test asserts economy that isn't there); a
  text filter that only fires on one language (caveman: English hedges/fillers) shows no
  delta on a Portuguese fixture; and a **fixture that seeds a shared key/namespace in a
  different format than the real producer writes** (producer acquires `task:<id>`, the
  consumer's test seeds bare `<id>` → unit green, real flow a silent no-op). When two
  modules share a key format, either export ONE constant both use or write one
  integration test that runs producer→consumer for real. Make the fixture exercise the
  exact thing that differs.

- **A test asserting an ABSENCE inside a slice passes vacuously when the slice is empty.**
  The classic shape: you extract a region (a section by heading, a config subtree, a parsed
  block) and assert something is NOT in it. Before the feature exists the extractor returns
  empty — and empty contains nothing, so the test is green on day one while the feature is
  absent. It is the same optimistic-oracle lie as a sweep over zero rows, wearing a test's
  clothes. Rule: whenever you assert a negative over a derived slice, FIRST assert the slice
  is non-empty (or that the anchor was found); the emptiness must fail loudly, not satisfy
  you. Earned when a "the block cites no command" test passed in the RED phase because the
  block did not exist yet — 3 of 4 new tests went red honestly and the fourth lied.

- **Make "additive / opt-in" structural, not conditional.** When a task must add a capability
  without changing existing behaviour, the weak version is a flag checked at the call site —
  someone later inverts the default, or a second call site forgets the check. The strong
  version returns NOTHING for the disabled case: an empty fragment spread into the payload, a
  no-op adapter, an empty list. The key then cannot appear for an opted-out subject even if
  the underlying data exists, and the byte-identity claim is enforced by the shape rather than
  by discipline. Prove it with a test that iterates every possible state and asserts zero keys.

- **Before building the consumer a dormant capability lacks, check whether its leaf already
  exists — and query the STORE, not a convenience command.** Finishing a wire often reveals
  that nothing reads it, and the reflex is to design the reader yourself, which is planning.
  Look for the planned sibling first. When the graph tool's parent/children query returns empty,
  treat that as unreliable rather than as proof: read the parent field straight from the
  database. An empty convenience-query has twice caused work to be re-planned that was already
  sitting in the backlog.

- **Two vocabularies for the same concept mean the bridge is the deliverable, not the logic.**
  When a producer speaks three states and the consumer stores two (or one side says
  ok/error and the other pass/fail/skip), the code on both ends can be complete and correct
  while nothing crosses. Before writing any new evaluation, grep for a consumer of the value
  you are about to produce: a reader with no caller outside its own test is the actual gap.
  And when you do bridge, the third state must SURVIVE the crossing — collapsing "could not
  determine" into "failed" is the false-negative twin of a false success, and it teaches the
  gate to distrust real failures. Keep the composition at the edge (the caller or the test)
  so the lower layer does not gain a dependency on the higher one.

- **The first task that makes a command WRITE to disk turns the whole suite order-dependent
  — isolate the state root once, for every test.** Persistence usually arrives late in an
  epic, wired into a command that many tests already exercise for other reasons. Those tests
  never asked to write anything, so nobody isolates them, and from that commit on each run
  leaves artifacts in the developer's real state directory that a later test silently reads.
  The symptom is maddening: a test asserting "no memory yet" fails only when run after another
  test, only on your machine, and passes alone. Add an autouse fixture pointing the state root
  at a per-test temp dir the moment the first writer ships — not when the flakiness appears —
  and verify the repo is still clean after a full run. A suite that pollutes the working tree
  is also a suite whose green means less than it claims.

- **Where a validation lives is a design decision, not a detail — read the target's docblock
  before adding a raise to it.** A pure module can deliberately promise NEVER to fail (degrade
  to empty, return a default, swallow and count) because its own consumer must survive bad
  input. Adding your stricter check inside it looks like hardening and is actually a contract
  break for every other caller. When your AC demands loud failure and the module promises the
  opposite, both are right for different consumers: put the strict policy at the boundary that
  serves YOUR consumer and leave the module intact, saying in a comment why it is not pushed
  inward. Earned when a memory map documented "never raises" (losing learning must not kill a
  running test) while the operator command needed corruption to be fatal.

- **Formatter churn you keep stashing will keep coming back — commit the sweep once.** If a
  save/commit hook reformats your files and you stash them each time the done-gate complains
  about scope, they return every cycle and cost a stash per task forever. The loop ends by
  committing the formatting as its own `style` commit. If it recurs after that, the real cause
  is upstream (you are writing lines the formatter rewrites, or two tools disagree) — fix that
  rather than paying the toll again.

- **A check that SKIPS is scored as passing — audit the reason string, not the tick.** Guards
  routinely degrade gracefully ("no scope declared", "nothing to compare", "N/A"), and a skip
  counts as green. So a guard reading a field nobody writes, or keyed off state that is empty
  at the moment it runs, is INERT while every report says it passed — and the thing it was
  meant to protect is unguarded. When you touch any quality gate, read the reason text on a
  node you KNOW satisfies it: a "not applicable" where it should have work to do is the tell.
  Confirm by grepping where the field is written versus where it is read; the writer's path is
  the truth. Earned when two DoD checks had skipped on every node for their whole lifetime,
  and the first live run immediately found a real violation.

- **A physical (on-disk) check belongs only in the layer that knows the project root.** Adding
  an existence check to a function that resolves against the process cwd makes it fire falsely
  for any graph, fixture, or workspace rooted elsewhere — and the failures look exactly like
  real phantom declarations, so the reflex is to "fix" the fixture. Before editing a fixture
  your new check rejected, verify which of the two is wrong: if the file exists somewhere the
  checker cannot see, the CHECKER is the defect. Push the physical assertion to the entry point
  that takes an explicit directory, and say in the code why it is not duplicated inward.

- **An old test can encode a GUESS; correcting it is not weakening the guard.** When you
  replace an inference with a fact (a heuristic with a recorded stamp, a sniffed type with a
  declared one), tests written against the heuristic start failing — and the reflex is to make
  the new code reproduce the old verdict. Check first WHY the old assertion passed: if it
  asserted a conclusion the old code could not actually justify (and merely got right on that
  fixture), the assertion was the defect. Correct it to the honest verdict, and add the case
  where the new mechanism IS exact. A test that pins a lucky guess protects nothing.

- **Three-valued beats two-valued when one input class genuinely cannot be judged.** Forcing a
  binary verdict on data that lacks the evidence to decide guarantees you are confidently wrong
  on a whole class of inputs — and the wrong half is usually the one that accuses the user. Add
  the explicit "cannot tell" state, keep whatever inference remains SOUND for the rest, and make
  the remedy the message: what the user should do so future checks are exact.

- **A scripted edit that silently does not apply is the most dangerous kind of green.** Patching
  a file by string replacement (sed/python/perl) fails SILENTLY when the anchor drifted — an
  earlier formatter run, a previous edit's reindent — and you proceed believing the change
  landed. Unit tests stay green because they exercise the core, not the wiring you thought you
  changed, and a hand proof can "pass" for an unrelated reason. Two rules: assert the anchor
  exists before replacing (fail loudly when it does not), and when observed behaviour does not
  match your model of the code, READ the file instead of reasoning further — a second round of
  deduction over a wrong premise just builds a better wrong story.

- **Verify a "both/and" claim with genuinely DIFFERENT inputs, not two that happen to coincide.**
  Proving that a default and a user-supplied value coexist, that two sources merge, that a
  fallback does not clobber an override — none of it is proven when the two values are equal.
  The check passes for the wrong reason and hides the clobber. Construct the case where the two
  differ visibly, then assert both survive.

- **When YOU control the write, record provenance — heuristics are what you settle for when
  you did not.** Any feature that later has to ask "did we produce this, or did a human touch
  it?" (an installer overwriting files, a generator refreshing a marked region, a cache
  deciding staleness) is exact if the writer stamped a content hash at write time, and merely
  conservative if it did not — because a legitimate older output and a hand edit leave
  IDENTICAL evidence. So at the moment of writing, record the digest; do not defer it and plan
  to infer intent from the content later. Two constraints: hash the CONTENT explicitly (a
  runtime hash matches within one process and differs on the next run, turning every second
  pass into a false "you edited this"), and assess BEFORE writing anything, so a refusal can
  never leave a half-updated target.

- **For a destructive-capable action, the refusal must be the default and consent must be
  explicit.** Writing outside the project — a user's home, a shared volume, another repo —
  reaches files with no history to recover from. Classify the target first and let only the
  case you can vouch for proceed; the unrecognized case refuses. The temptation is to treat
  "I have no record of this" as harmless and overwrite; that is exactly the case most likely
  to be someone's own work.

- **Do not fabricate a convention to satisfy an AC — check whether the target actually reads
  it.** An AC written from design intent can ask for symmetry the world does not have ("one
  directory per CLI", "an endpoint per provider", "a config file per environment"). When only
  some targets have a real convention, inventing the rest produces writes that succeed into
  locations nothing loads — strictly worse than refusing, because success is reported and the
  user stops looking. Implement the truthful mapping, point the conventionless ones at the
  neutral home the codebase already serves from, and say plainly in the close-out that the AC
  was wrong about the world so the next plan matches reality.

- **Prefer a guard the compiler enforces over a test that remembers.** When work adds a
  per-variant mapping (one entry per CLI, per provider, per node type), type it as a TOTAL
  record over the variant union rather than a partial map with a runtime default. Adding a
  variant then fails to build instead of silently taking a fallback that no one chose. Pair
  it with one test asserting the mapping's outputs land inside whatever set consumes them —
  a destination outside the read paths, a status outside the accepted set, is the write-into-
  the-void failure that both compiles and passes.

- **When the deliverable consumes a REAL external artifact, your fixtures only cover what you
  already imagined.** A parser/installer/importer fed by someone else's repo, export, or API
  meets shapes you did not invent: a path prefix you dropped, prose that pattern-matches as
  data, an optional field used three ways. Green units prove your model of the input, never
  the input. Run it against the actual source before closing — expect it to fail there after
  the suite is green, and treat each failure as a real requirement rather than a fixture to
  patch. Earned when three consecutive green suites were each rejected by the live source.

- **Grade the STRENGTH of a reference before making it fatal.** Text that names a file is not
  the same as text that DEPENDS on it: a markdown link `[x](y.md)`, an import statement, an
  explicit include is unambiguous intent — a bare mention in prose is not. An extractor that
  treats every filename-shaped token as a hard dependency turns honest documents into hard
  failures (a skill discussing a generated file it does not ship becomes uninstallable).
  Fail on the unambiguous form, include the weak form when it resolves, ignore it when it
  does not — and when a token cannot be a path at all (a file with children), reject it as
  prose rather than reporting it missing.

- **A test that asserts a COUNT tells you something changed and never what.** Suites often
  pin `subcommands.length === 8`, `routes.length === 12`, `columns.length === 5`. Add one and
  it goes red with `expected 9 to be 8` — which names neither the thing you added nor the
  thing someone else silently deleted in the same file. When such a guard forces you to touch
  it, upgrade it to assert the sorted SET of names; the diff then reads as the actual change.
  Same failure family as a green sweep over zero rows: the assertion is technically true and
  informationally empty.

- **A disposable cache poisons every run after the first when the tool refuses a populated
  target.** Clone/extract/fetch steps that write into a cache dir usually fail hard if the
  directory already exists. The first run passes, every later run fails with the FETCH error —
  which also masks the real downstream result (a lookup that should report "not found" reports
  "clone failed"). No unit test sees it, because units never run the command twice. So: run any
  new fetch-then-act command TWICE against the real source before closing, and decide explicitly
  whether the cache is disposable (clear it) or authoritative (freshness logic) — the second is
  update semantics and usually belongs to a different task than the walking skeleton.

- **For a bug whose deliverable is a MESSAGE, the unit test proves the logic and never the
  delivery.** Diagnostics, warnings, error copy, CLI hints: the assertion that the classifier
  returns the right branch can be fully green while the surface the human reads still emits
  the old string — a second call site, a cached canonical, an untouched formatter. Always
  read the REAL output of the REAL command before closing such a task; a green suite plus an
  unread surface is the same optimistic oracle in a different costume. Earned when 43 tests
  passed and the actual diagnostic still accused a hand-edit that never happened.

- **When an AC demands a discrimination the available signals cannot make, pin the limitation
  — do not invent precision.** Planners write AC from intent, so an AC can ask you to tell
  apart two causes that leave IDENTICAL evidence (an old generated body vs. a deleted line;
  a timeout vs. a silent drop). Forcing a heuristic there yields confident wrong answers.
  The honest build: pick the conservative side explicitly, write the test that PINS that
  choice, document in the code WHY the other side is unreachable and WHAT signal would make
  it reachable (a stamped fingerprint, a recorded provenance, a sequence number) — then file
  the residual as its own node. A stated limit is engineering; a fragile guess is a lie with
  a test.

- **Changing a generated file's CANONICAL body makes every drift/staleness detector accuse
  a hand-edit that never happened.** Any repo that generates marker-wrapped files (agent
  instruction files, command surfaces, schema dumps) usually ships a checker comparing the
  file ON DISK against a freshly generated canonical body. Add a section to that body and
  the checker's message becomes actively false — "hand-edited" when the truth is "not yet
  regenerated". Two consequences to handle in the same cycle: reproduce it and attach the
  evidence to whichever node owns the reconciliation (do NOT silence the detector), and
  expect the same false alarm for every already-initialized project on upgrade. A false
  alarm is worse than none: it trains the user to ignore the detector.

- **When you start recording a quality/strength dimension, existing rows must count as UNKNOWN,
  never as the good value.** Adding a grade (corroboration, confidence, verification level) to
  data that already exists forces a choice about the rows written before it. Defaulting them to
  the passing bucket lets everything historical satisfy the stricter bar it was never measured
  against — and the bar silently becomes decorative. Give the absent case its own name, count it
  separately, and expect the metric to look WORSE right after the wire; that dip is the feature
  working. Pair it with an assertion that the buckets sum to the total, so a value in a bucket
  you forgot cannot vanish from the count without turning anything red.

- **A hand-built fixture proves the sentence you imagined; a corpus catches the one you did
  not.** Any module that parses prose, config, or third-party text fails silently — an
  unrecognised input becomes a no-op or a default and the pipeline still "runs", proving less
  than its author believes. Three strings you wrote yourself cannot find that. Collect real
  inputs into a checked-in corpus and iterate the whole directory in the test, including the
  ugly cases (trailing punctuation, both languages, missing fields). Guard the sweep itself
  with an assertion that the corpus is non-empty — otherwise an empty directory passes every
  case below it. Some repos gate this automatically; when a gate demands a corpus for a
  parser-shaped change, it is right, and creating the corpus is cheaper than the bug.

- **Test a filter by what it EXCLUDES — a filter that ignores its argument looks perfectly
  healthy.** It returns a well-formed list of the right type, so nothing about the output says
  "wrong". Assert the negative case (ask for a value nothing matches and require an EMPTY result)
  and assert the other direction too, or you are only checking that the command still runs.
  Earned by a `--severity` flag that validated its input and then dropped it: every count of
  "urgent" items in the backlog was the total count, and two tasks were written prescribing bulk
  cleanup of debt that was never urgent.

- **Two consecutive mis-scoped tasks from the same source is a signal about the SOURCE, not the
  planner.** When a task's premise does not survive first contact with measurement, check whether
  the number it quotes came from a tool. A defective report generates a family of plausible,
  well-formed tasks — each individually reasonable, all built on the same false figure. Fix the
  instrument, then go back and correct the numbers written into the nodes it misled; leaving them
  means the next agent re-derives the same wrong plan.

- **When you fix the root cause, delete the workaround you added for the symptom.** A rename, an
  extra field, a duplicated flag introduced to route around a defect becomes convention the
  moment the defect is gone — two things saying the same thing, and nobody left who remembers
  why. Closing the bug is the moment to remove it, in the same commit, so the history shows the
  detour and its end together.

- **A filter meant to cut BULK must test the value, not just the key.** Deny-lists and
  redaction rules written for heavy payloads (per-item breakdowns, catalogues, blobs) match by
  name, so the day another surface uses that same word for a scalar, the fact disappears
  silently. Split the list by REASON: names listed because they carry volume strip only when the
  value really is a collection; names listed for another reason (verbose config, secrets) keep
  stripping always. Then guard the split — assert no key is in both groups AND that the
  volume-only group is non-empty, or emptying it makes every other test pass for the wrong
  reason.

- **Fix a writer/reader divergence by binding BOTH to the same resolver, not by renaming.** When
  a component writes somewhere and another looks somewhere else, the tempting fix is to correct
  one side's path or flag name — which works today and drifts again at the next refactor, because
  the two still hold independent notions of "where". Have the writer ask the SAME function the
  reader scans with; then "created but not found" stops being representable. Renaming treats the
  symptom; a shared resolver removes the degree of freedom.

- **Removing a capability's default is not removing the capability — give the old behaviour a
  named home and make its risk visible.** When you change what a flag means, users who relied on
  the old meaning need somewhere to land: a distinct flag, and a warning when their choice lands
  outside what the rest of the system can see. Silently honouring an unreachable choice recreates
  the original defect through another door. Record the break as an ADR on the node with the
  alternative you rejected and the trigger that would revisit it.

- **When a report accuses mass debt, check that it reads the field the workflow actually
  writes.** The same fact often has two representations — an edge and a field, a flag and a
  status, a manifest and a directory — and a checker wired to the one nobody produces will
  indict work that was done correctly. Count the producers before you trust the number: if the
  signal exists six times across the whole store while the alternative exists everywhere, you
  have a representation mismatch, not debt. Unify by teaching the reader the real signal, never
  by mass-writing the dead one.

- **Accepting a DECLARED value as evidence re-opens the hole you just closed elsewhere.** When
  you widen a check to accept a second signal, require the physical form of it — the file on
  disk, the row in the table, the reachable endpoint — not the declaration that it should exist.
  A path in a field is intent; the artifact is proof, and the difference is exactly what lets a
  metric go green with nothing behind it. Reuse the project's existing existence-probe rather
  than trusting the string.

- **When an AC's numeric target is only reachable by deleting evidence, the AC is the defect —
  block with the analysis instead of hitting the number.** Cleanup tasks ("get metric X under
  N") assume the backlog they measure is bookkeeping. Measure the population first and split it:
  part is usually genuine debt, and archiving those rows makes the gauge green by removing what
  it measures. That is the Goodhart failure in its purest form, and it is worse than the original
  debt because afterwards nothing records it. Report the split with counts, propose the re-slice,
  and leave the historical records you did not create alone.

- **Search the path the record CITES, not the path you would have used.** A requirement naming
  `x/y/init-project.ts` is evidence about where the code lived; substituting your own guess about
  the layout and finding nothing produces a confident "never existed" that is simply a failed
  search. Before concluding something was never built, grep the literal path from the record and
  check git history for that exact file — twice this session the artifact was there under a
  directory I had not thought to look in.

- **"Marked done but missing" has a third explanation: deliberately removed.** Before filing a
  phantom-done, check the history of the file for a REMOVAL — a capability shipped and later
  dropped on purpose looks identical to one never built, and the difference decides everything:
  one needs implementing, the other needs the supersession recorded. The commit message that
  removed it usually states the reason, which is exactly the context the node is missing.

- **A traceability link is an ASSERTION that the thing exists — earn it from disk, not from
  status.** "Requirement done, epic done, so it shipped; just wire the edge" is the reasoning that
  turns a graph into a certifier of its own claims. Check the artifact the requirement describes:
  run the command in a clean sandbox, list the files, read the number. Earned in a batch of four
  where the very first one was refuted — a requirement marked done for generating N files, and
  the real run produced zero. Wire the ones you verified, file the ones you refuted, and leave
  the ones you cannot check alone; a partially-wired honest set beats a fully-wired fictional one.

- **Buckets from a count are not units of work — group by the real owner before estimating.** A
  triage list sorted by status looks homogeneous and gets planned as one sweep, but the rows
  usually span many parents with different histories, and each parent needs its own
  investigation. Before promising "the N in this bucket", group them by epic/module and check how
  many distinct investigations that actually implies.

- **Deleting a container takes its children — list them before, and verify the count after.**
  Archive/delete on a parent cascades in most stores, so removing what looks like an empty
  structural node can silently take real content with it. The tell is arithmetic: you removed two
  things and the metric moved by six. Enumerate children first; if the operation already ran,
  compare the delta against what you intended and restore immediately — a cascading delete
  usually has a cascading restore, but only while you still remember what you touched.

- **A triage AC needs the outcome "this was never valid input".** Cleanup criteria written as
  "wire it OR file a bug" assume every row is real work in one of two states. Imported backlogs
  also carry artifacts — section headings that became requirement nodes, hypotheses, template
  placeholders — which fit neither branch, and forcing them into one produces either a fabricated
  link or a bug report about nothing. Add the third outcome explicitly, and require the evidence
  that classifies a row as an artifact (empty AC, a title that is a section name, a parent that
  is a document section).

- **Before any bulk mutation of records you did not author, change ONE and re-measure.** A single
  change tells you whether the operation even moves the metric — twice this cycle the obvious
  bulk action would have done nothing (the detector ignored the field being changed) or would
  have required a destructive fallback nobody sanctioned. One row costs seconds; ninety-five is
  irreversible in practice.

- **Removing a duplicate ENTRY is not removing the IDENTIFIER behind it.** Menu items, routes and
  tabs are the present; their ids are a contract with the past, already living in saved URLs,
  bookmarks and localStorage. Drop the duplicate door and keep the destination reachable —
  invalidating the id breaks links people already hold, for a cosmetic win. And check what
  DEFAULTED to the thing you removed: an app opening on a tab the sidebar can no longer highlight
  is the half-done version of this change.

- **When a KR is met in part, leave it open and write down which clause failed and why.** The
  pull at the end of an epic is to round up — three clauses, two delivered, close it. That
  converts a measurable outcome into a story about effort. Record each clause against its
  evidence, and when one cannot be met without violating something the product stands for (a
  guard, a safety gate), say that explicitly and hand the choice back: reframe the target, or
  build the honest path that satisfies it. Moving the goalposts quietly is how a KR stops
  measuring anything.

- **Before you document a path, walk it — documentation is a promise the product must keep.**
  Writing "creates X, which then appears in Y" costs nothing and is trusted completely, so when
  it is wrong it is worse than silence: the operator concludes the tool is broken and cannot tell
  which half failed. Run the sequence you are about to write down, in a clean sandbox, as the
  reader would. Earned by documenting "appears in the list" for a scaffolder whose output the
  list could not see — caught only because the sequence was executed, not reasoned about.

- **An index or menu should be DERIVED from the registry, not hand-listed.** A hardcoded list of
  capabilities starts lying the day one is renamed or removed, and it lies silently — nothing
  fails, the entry simply describes something that no longer exists. Build the listing from
  whatever the program actually registers, and render a missing entry as explicitly unavailable
  rather than dropping it: a vanished row tells the reader the capability never existed, while a
  flagged row tells the truth.

- **The same flag name on sibling subcommands must mean the same thing.** When `--dir` means
  "destination" on one subcommand and "project root" on another, following the obvious sequence
  succeeds at every step and produces nothing findable — no error, no warning, just an artifact
  written where nothing looks. Check sibling subcommands for shared flag names whenever you touch
  a command family, and treat a divergence as a defect even though every individual command is
  behaving as documented.

- **When you cannot know the answer, show the evidence instead of choosing for the user.** An
  error or suggestion that names one concrete next step feels more helpful than a list — until
  the guess is wrong, and then it is worse than saying nothing specific, because a confident
  wrong instruction sends someone off in the wrong direction while a vague one leaves them
  investigating. Earned by "fixing" an unhelpful message with `git add <first-candidate>`, which
  in a real sandbox pointed at a file the tool itself had generated while the operator had
  written another. Heuristics to rank the candidates only moved the wrongness around. Final
  shape: list the candidates as evidence, put a `<placeholder>` in the command, and let the
  person who knows decide.

- **A hint that always shows stops being read — gate it on the condition that makes it true.**
  Diagnostic help earns its place by being rare: check whether the specific situation actually
  holds (are there untracked files? is the config really missing?) and fall back to the plain
  message otherwise. Assert both halves — the hint appearing when the condition holds, and NOT
  appearing when it does not.

- **To answer "does this already exist?", read the ENTRY POINT that would consume it — not just
  names you would have chosen.** Searching for your own synonyms is not searching: an onboarding
  seeder can be called a guided starter, a retry wrapper can be a resilience policy, a cache can
  be a memo table. Two failed searches feel like proof of absence and are only proof that your
  vocabulary missed. Open the command, route, or handler that would call the thing and read what
  it already calls; the answer is usually one string in there. Earned by writing a whole module
  plus seven tests that duplicated an existing, tested one — found afterwards by reading the CLI
  file instead of grepping for more synonyms.

- **When a capability exists but ships opt-in, the deliverable is usually the DEFAULT, not more
  code.** A flag that has to be discovered will not be discovered by the person who needs it
  most, so the feature delivers nothing while looking complete. Check what makes the default
  safe (the guard that already refuses the destructive case), flip it, and reconcile the flag's
  own help text — the smaller change is the whole value.

- **Walk the flow yourself before claiming a walkthrough works.** A task that promises "the user
  can go from A to Z" is only closable by doing A to Z in a clean sandbox, as that user, with no
  repo knowledge. Each wall you hit is a finding — and its error message is part of the product,
  because a gate that tells someone who just did the work that they did not do it is worse than
  a missing gate. File the walls you cannot fix in scope onto the node that owns them, with the
  reproduction written in.

- **When an old test breaks under an honesty fix, re-read its NAME before assuming you
  regressed.** A test whose title promises "files that pass", "user is authorised", "the cache is
  warm" — while its fixture never creates the file, the user, or the cache — is not a regression
  you caused; it is the same defect you are fixing, asserted as if it were correct. Fix the
  FIXTURE so it builds what the name claims, and leave the assertion alone: the intent was right
  all along, the setup was the lie. Deleting or weakening such a test removes the only record
  that the behaviour was ever expected.

- **When one shared result serves two different questions, read the field that separates them
  instead of changing the default.** A gate returning "did not run, so nothing failed" is correct
  for "may I block this?" and dangerously wrong for "is this already done?". The discriminating
  field usually already exists on the result type — flipping the default to satisfy your caller
  silently changes the verdict for the other one, which no test of yours covers. Fix the caller,
  and say in the code why the default stays.

- **A ceiling that stops work early must report ABSENCE, not a verdict.** When you add a timeout,
  budget cap, or retry limit, the natural instinct is to return failure — but that fabricates a
  defect in the code under test, while returning success approves out of exhaustion. Represent
  "no result exists" explicitly (a ran/completed flag) and let each caller decide what that means
  for it.

- **At a trust boundary, refuse non-finite values instead of clamping them.** Clamping assumes
  the number means something; NaN and Infinity do not. NaN slips past every `>=` comparison
  (which is always false) and lands in the store, where it contaminates each later sum and
  ordering — and the failure surfaces far from the write. Infinity is quieter and worse: it
  clamps to your maximum, so corrupt input is granted the highest confidence in the system and
  outranks everything legitimately learned. Validate finiteness where foreign data enters
  (imports, peer bundles, webhooks, parsed files), before any normalisation runs.

- **Do not anchor a fixture at the edge of the domain — it measures the clamp, not your rule.**
  Seeding the local value at exactly the ceiling makes "a stronger input still wins" impossible
  by construction, and the resulting red looks like a defect in the code you are testing. When a
  control case fails in a way that seems to contradict the implementation, check your fixture
  against the domain's bounds before editing the source. Anchor mid-range so both directions
  remain observable.

- **Close a performance KR with a CURVE and a control point, never a single run.** One
  measurement showing a 4x gain cannot distinguish real concurrency from an idle machine or a
  lucky cache. Vary the parameter the speedup should depend on and show the shape: if the
  parallel wall-clock stays flat while the serial one grows linearly, that IS the overlap. Then
  include the setting where the gain must DISAPPEAR (k=1, one worker, feature off) and show it
  disappearing — a number that only ever goes up is indistinguishable from a number that is not
  measuring anything. Report the caveat about what the harness actually exercised in the same
  breath as the figure.

- **A global deny/allow list keyed on a generic field name is a delayed trap.** Output
  compressors and profile whitelists that match `tasks`, `commands`, `levers` at ANY depth will
  eventually eat an unrelated field that legitimately shares the name, and the loss is silent —
  the value simply is not there. When a field you just added does not appear at the surface,
  check those lists before doubting your write path. Fix your own case by naming the field
  distinctly, and file the list itself as a defect (scope by path, not by key) instead of
  absorbing the workaround quietly.

- **Before planning how to DISPLAY a metric, find out where it is STORED.** A measuring function
  that returns a number and a command that prints it look like a finished producer, and the
  display task reads as pure wiring — but if nothing writes the number down, it dies when the
  process exits and the surface has nothing to read next session. The missing link is often
  persistence, not measurement or presentation. Ask "which table holds this?" first; when the
  answer is "none", that is the task, and shipping only the display leaves a panel that can
  never populate.

- **Ordering by a timestamp needs a tiebreak whenever the clock is coarser than the interval
  between writes.** Two rows written in the same millisecond make "the latest" a coin flip
  decided by the query planner — stable in your test run, different in production, and
  essentially impossible to debug later. Add a monotonic secondary key (rowid, an autoincrement,
  a sequence). This is worth a test of its own: write two records back to back and assert which
  one wins.

- **Test the systemic hypothesis against neighbours before you build the general fix.** Finding
  one broken case, you will reach for the structural explanation — the missing stemmer, the wrong
  abstraction, the whole class of inputs — because it explains more and feels like the deeper
  engineering. Run three or four sibling cases first. Often they all pass, and what you have is a
  single missing entry in a lookup table, not a missing mechanism. The general fix costs more,
  risks broad behaviour change, and is defended by nothing but your inference. Let the
  measurement earn the generalisation.

- **A capability can be registered, documented, and still undiscoverable.** Shipping a command,
  seeing it in `--help`, and confirming it is in the generated index proves it EXISTS; it does
  not prove anyone will find it. If the product's promise is "people can do X", the closing test
  is asking for X the way a person would phrase it — in their language, in their inflection — and
  getting the thing back. Search the way a stranger searches, not the way the author names.

- **When a task describes a STATE rather than a change, measure the state before planning any
  work.** "File X under N lines", "no call sites left on Y", "every route registered" — these
  keep looking pending long after they are true, because the node cannot know the world moved,
  and the picker will hand you one as if it were fresh. Run the one command that checks it
  (`wc -l`, a grep, the lint) before investigating how to do it. Often the honest close is
  verification plus a pointer to the twin that did the work — re-doing it wastes a cycle AND
  risks undoing someone else's fix. Check the sibling nodes too: a state task that is already
  satisfied usually has a done twin.

- **An empty test run is not a green test run.** Change-detecting runners (`--changed HEAD`) print
  nothing when the tree is clean, because zero changed files means zero affected tests. If you
  are closing work that is already committed, that gate tells you nothing at all — name the
  module's test file explicitly and read the count. Treat "no output" as "did not run".

- **Closing a constraint/spec node means MEASURING each of its clauses, not attesting to them.**
  These nodes read like paperwork ("additive, reuses existing metrics, files <800, fn <50, no
  any") and the cheap close is to mark them satisfied because the work felt disciplined. Run a
  command per clause instead — count the lines, grep the casts, list the imports that prove reuse
  — and expect to fail one, often one YOU caused while extending the code mid-epic. A constraint
  closed by assertion is a sticker; closed by measurement it is the only thing standing between
  the epic and quiet decay. Fix what fails before closing, and say which clause failed.

- **When you report an instrument's KR, give the ADOPTION number beside the CAPABILITY number.**
  "Lists 521 epics with zero invented figures" proves the instrument works; it does not say that
  521 things are measured — if only one has real data declared, that is the number that decides
  whether the feature delivers today. Reporting only the first is technically true and reliably
  misread, and the misreading always favours you. Two numbers, one sentence.

- **A guard tested only on the pure rule proves the rule is right, not that the rule is the one
  users meet.** Between a decision function and the screen sit a collector, a route, a command —
  and that is exactly where a safety property disappears quietly: someone wires the surface to a
  laxer path, every unit test stays green, and the product starts asserting things nobody
  measured. When the value at stake is honesty (no-data vs zero, unknown vs pass), put the
  instrument on the real surface with a real store, not only on the function.

- **Prefer an invariant to a pair of examples, and always include a control case.** An invariant
  ("no row is ever on-track without provenance, whatever the graph holds") catches the path the
  next author invents; examples only catch the ones you imagined. And a negative-only suite is
  satisfied by a surface that says nothing at all — "never wrongly green" passes trivially when
  the pipeline is broken end to end. Assert that the genuine positive still reads positive, or
  your honesty tests can be green for the worst possible reason.

- **A test that passes the moment you write it has proven nothing yet — break the code and watch
  it fail.** Characterization guards over already-correct behaviour are worth writing, but until
  you have seen each one go red for its own distinct reason, you have a comment with a test
  harness around it. Sabotage the specific decision each guard covers, one at a time, confirm
  only the matching guard fails, then restore. Report the sabotage result alongside the green
  run; "5 passed" on a new guard suite is not evidence on its own.

- **Run `git status` before committing a small fix — the index may not be empty.** Some
  close-out commands stage files as a side effect, so a quick `chore:` commit can swallow the
  real deliverable and ship it under a message about formatting. The history then misdescribes
  itself, and on a shared main you cannot cleanly take it back.

- **A filter is worthless until the state it filters can exist — check reachability before
  writing it.** Tasks phrased as "add a --failing / --at-risk / --stale filter" look like pure
  presentation work, and the obvious test ("none match ⇒ empty list") passes forever, including
  when the matching state is UNREACHABLE because nothing upstream can ever produce it. So before
  implementing a filter or a query, produce one row that the filter should catch, end to end. If
  you cannot, the real work is upstream — the missing producer, the missing field, the guard that
  short-circuits before the interesting branch — and shipping the filter alone delivers a control
  that is permanently empty while every gate agrees it works.

- **When a refusal message lists more than one requirement, read all of them before blaming your
  own last change.** Fresh from writing a field, you will read "missing X or Y" as "missing X",
  re-verify your write, and hunt a bug that is not there — the fault was Y all along, often a
  value absent in real data that your fixture happened to carry. Print the actual record and
  check each named requirement separately; recency makes your own edit the most available
  suspect, not the most likely one.

- **Delete the data you fabricated to prove something.** Demonstrating a state often means
  writing a value you invented — a deadline, a threshold, a fake owner. Left behind, it reads as
  a real commitment within a couple of sessions and nobody can tell which numbers were declared
  and which were props. Prove it, show the output, then restore the record and say you did.

- **On screen, absence of a measurement must not be drawn as a measurement of zero.** A null
  attainment, an unknown score, an unrun check — rendering any of them as `0%`, an empty bar, or
  a red badge turns "we do not know" into "we measured, and it is bad", and the viewer cannot
  tell the difference. The backend usually guards this carefully (a `no-data` status, a
  provenance field) and then the UI quietly discards the distinction in a formatter. Draw
  absence as absence (an em dash, "no data"), and assert it: a test that says the no-data row
  does NOT contain `0%` is the one that keeps the honesty guard alive across the last hop.

- **Splitting fetch from presentation is what makes a UI test possible without a doubled
  client.** A component that fetches can only be tested by faking its transport; a component
  that receives rows can be tested with real objects of the real shape. So when a tab needs
  data, put the request in a thin container and keep the view pure — the payoff is not tidiness,
  it is that the assertion is about what the user sees, driven by data the backend actually
  produces.

- **A second surface reading the same data needs the FIRST one's composition extracted, not
  copied.** When a route, tab, or export has to show what a command already shows, the cheap
  move is to re-assemble the same sources in the new file — it is a few lines and it passes.
  But two assemblies of one dataset drift silently: a filter added on one side, a fallback
  changed on the other, and now the screen and the terminal report different numbers for the
  same entity, each green in its own test and neither obviously wrong. Extract the composition
  into the owning core module and let both surfaces merely present it. Then make the new
  surface's central test compare BOTH paths field by field, rather than asserting a shape — a
  shape assertion cannot see divergence, which is the only defect this kind of task introduces.

- **Before filing a conservative verdict as a bug, read the field that explains WHY.** Honest
  systems report "unknown", "no-data" or "inconclusive" on purpose, and they usually carry a
  reason/provenance alongside. Seeing the cautious value after you supplied good input feels
  like a defect — but the guard may be demanding a second condition you have not met. Read the
  explanation field first, then the rule that produced it; only then decide. Filing the honesty
  guard as a bug is how a team ends up "fixing" the thing that was protecting them.

- **A validator should return DATA, and run before you open the resource it guards.** Validating
  inside the write path invites the half-applied state — first field accepted, second rejected —
  and a record assembled from mixed sources produces a number that looks real. Build the value
  first, refuse there, and only touch the store once the whole thing is known-good. Reuse the
  READER's own coercion helper rather than writing a parallel one, or producer and consumer will
  eventually disagree about what counts as valid.

- **A filter applied DURING a recursive walk destroys the distinction between "absent" and
  "pruned" — decide at the leaf, carry the signal as data.** Extracting things from a tree
  (DOM, AST, filesystem, org chart) invites filtering each level as you descend: skip the
  invisible node, skip the ignored directory, skip the private subtree. But the predicate that
  is true of a leaf is often FALSE of its ancestors — a zero-box wrapper whose children are
  painted, a directory with no matching name holding every match, a synthetic AST node wrapping
  real ones. Prune at level N and everything below it vanishes, and the consumer receives an
  empty list indistinguishable from "there was nothing there". Emit the whole walk with the
  predicate attached as a FIELD, then filter once at the end in the pure layer — that also moves
  the decision somewhere a unit test can reach, which the traversal (usually inside the I/O
  adapter) is not. Earned when an ancestor-visibility filter made a real page yield zero controls
  while every hand-built fixture passed.

- **"Alive" is not "useful" — read what a health check MEASURES before trusting its ok.** A
  liveness probe answers "is the process up / is the port open", which is not "can it do its
  job". A daemon with zero connections to the thing it proxies, a worker with an empty queue
  binding, a pool with no members: all report healthy, and the failure surfaces later as a
  confusing error from deep inside a call that had no business being attempted. When a component
  looks up but behaves broken, run its own diagnostic and read every line rather than the
  headline — the FAIL is usually already printed next to the ok, naming exactly what is missing.
  And when the fix turns out to be configuration rather than code, say so plainly: a config
  root-cause recorded as a code defect sends the next person to rewrite something that works.

- **A "never throws / best-effort" contract needs a test that observes the EFFECT, not just the
  absence of an exception.** Code that swallows errors passes `not.toThrow()` even when it does
  nothing at all — so a happy-path test against such a module proves nothing unless it asserts
  the artifact appeared (file on disk, row in the table, message emitted). Then test the unhappy
  path by breaking the REAL dependency — close the database, point at a path that cannot be
  written — because a stub that throws proves only that the stub threw. Enumerate the whole
  exported set in one case so a function added later without the same defence fails there.

- **Writing the first direct test for extracted code is when its comments get audited.** Prose
  carried over during a refactor is rarely re-read against the code it now sits beside, so a
  claim that was already wrong travels into the new module wearing your name. When a test
  contradicts a docblock, check the implementation before adjusting the test: the comment is the
  likelier defect, and pinning the true behaviour stops the next reader from "fixing" working
  code to match prose.

- **To split an oversized file, find the OBJECTIVE criterion — not "what feels unrelated".**
  Taste-based extraction produces arbitrary modules that the next person re-splits differently.
  Look for a property that partitions the code cleanly: does this block influence the DECISION
  the function exists to make, or does it merely happen afterwards? Side effects that run after
  the verdict — telemetry, memories, snapshots, audit records, all best-effort — leave together
  and belong with whatever module already owns that phase. Extending the existing owner beats
  creating a third file, and the criterion is what makes the boundary defensible later.

- **When you lift code out of an `if`, decide explicitly where the condition now lives.** The
  guard can stay at the call site or move inside the extracted function, and both are valid —
  but silently dropping it changes behaviour in exactly the case the guard existed for, and no
  type checker notices. State the choice, then read the result back to confirm it: an
  unconditional call whose guard moved inward is identical; an unconditional call whose guard
  vanished is a regression that ships green.

- **"Additive" is only real when the empty case produces IDENTICAL output.** Extending a shared
  artifact with optional content usually ships as a heading plus "none configured", or an empty
  section, or a trailing newline — and every downstream consumer, golden test and byte budget
  now differs for projects that opted into nothing. Assert equality against the pre-feature
  output for the empty case, not merely that it "looks fine": that single assertion is what
  turns additive from intent into property. Then assert the inverse — that no volume of added
  content displaces what was inherited.

- **Keep the pure core pure by having the CALLER read.** When a feature needs data from disk, a
  store or a network, the reflex is to reach for it inside the function that renders. Take the
  already-read value as a parameter instead: the renderer stays testable without fixtures, and —
  more importantly — a malformed source becomes the caller's failure to absorb rather than an
  exception that takes down output which must never be missing.

- **Budget the SHARE in the leanest configuration, not just the total.** Adding mandatory
  content to a shared artifact (a context file, a base image, a bundled preamble) is almost
  always fine against the global ceiling — there is headroom, so the guard stays green while the
  addition quietly captures the minimal profile it was never meant to dominate. Measure the
  fraction it occupies in the smallest mode and bound THAT; and never raise the global ceiling
  to fit a floor, because a floor that pushes the ceiling up has stopped being a floor. Also
  check WHAT the existing guard measures: one that reads committed files cannot see what the
  generator produces today, so it certifies the past while the future regresses.

- **When prose has to carry verifiable metadata, convert the prose to DATA and render it.** The
  tempting path is to append a marker to each line and parse it back in the test — fragile, and
  it lets the text and the metadata drift apart silently. Model the items as records carrying
  both, render the document from them, and assert against the source. The type then forces the
  decision: a new item cannot exist without someone choosing its value, which is exactly what a
  convention enforced "by discipline" never achieves.

- **Never let the absent case default to the strong claim.** Marking something enforced,
  verified, or covered when no mechanism backs it teaches readers to trust a check nobody runs —
  strictly worse than admitting there is none, because it removes the doubt that would have made
  them look. Make the honest count part of the deliverable, even when it is unflattering: two of
  fourteen is the finding, not a shortfall to smooth over.

- **When a KR counts N consumers, find the smaller set they actually reduce to — then cover ALL
  of it.** Consumers routinely share a destination (twelve CLIs reading six files, twenty
  services hitting four endpoints), so the honest unit of proof is the shared artifact, not the
  consumer. Two traps ride on this: covering a few and generalising ("the rest work the same
  way"), and never computing the distinct set at all. Derive the set mechanically from the
  mapping table rather than listing it from memory — that is what reveals the members you
  forgot. Earned by covering three of six files and nearly closing the KR on them.

- **Two maps describing opposite sides of one bridge, keyed by DIFFERENT unions, hide a seam the
  compiler cannot see.** A config map keyed by one enum and a generator map keyed by another
  will type-check perfectly while a member of the first points at something the second never
  produces — the consumer silently gets nothing. Testing either side alone passes. The only
  cover is a test that COMPOSES them: join on the shared value (the file, the id, the route),
  and assert every entry of the wider union resolves. Count the members of each union first;
  a mismatch is the tell.

- **Anchor-proof by removing BEHAVIOUR, not by breaking syntax.** Sabotaging a file until it
  fails to compile makes the runner report "no tests" — which proves nothing about whether your
  guard would catch a real regression. Delete or neutralise the specific line the guard exists
  to protect, keep the file valid, and confirm the failure message names the thing that broke.
  Restore immediately.

- **A field read at the wrong moment is the twin of a field nobody writes.** When an assertion
  compares two values, check WHERE each is produced: if one is known early (a route at the
  navigate step) and the comparison happens late (at the terminal step), the value must be
  carried forward or the comparison silently never fires — the object is well-formed, the code
  looks right, and the check is simply always skipped. Grep for where the field is assigned and
  where it is consumed, and confirm the same object holds both at the moment of the comparison.

- **A process that never returns may have already done the work — look for the side effect
  before you diagnose the hang.** A command that blows past its timeout without printing looks
  like a total failure, and the reflex is to grep for a missing deadline and file that as the
  cause. Check the database, the file, the log it was supposed to write FIRST: an open socket,
  an unclosed handle or a live timer keeps the event loop alive long after the real work
  finished, so the effect is there and only the exit is missing. Diagnosing from a grep instead
  of from the artifact produced a confidently wrong root cause in one cycle here; the corrected
  one was a close() that existed and had no caller.

- **A long-lived resource opened by a command needs its shutdown wired at the same time.** When
  you introduce a socket, watcher, pool or daemon connection into a CLI path, the close belongs
  in the same change, in a `finally`, alongside whatever store/db teardown already exists —
  never on the happy path only. Reaching for a forced exit instead masks the leak rather than
  releasing it, and the command becomes unusable in scripts and CI, where "never returns" is
  indistinguishable from "broke".

- **If a consumer must tell failure CATEGORIES apart, the producer has to emit a canonical
  vocabulary — matching prose downstream always rots.** The tempting shortcut is to sniff the
  error message ("contains 'unreachable'"), and it passes your unit test because the fixture
  uses the wording you wished for. The real producer says something else, so the classifier
  silently mis-files every real failure while every test stays green. Fix it at the source:
  emit the stable code the project's schema already defines, from ONE constant rather than
  repeated string literals, and let the consumer match the code. Check how many literals exist
  before you start — the same sentence duplicated a dozen times is the tell that nobody owned it.

- **An error swallowed "so the run is never thrown away" still has to keep its CAUSE.** A
  defensive layer that converts a rejected dependency into a normal failure result is usually
  right — but if it drops the reason while doing so, everything downstream is left unable to
  distinguish infrastructure from the thing under test, and the honest three-valued verdict you
  built upstream collapses back to two. When you find such a conversion, check what it discards.

- **The output layer hides a new payload field in TWO independent places, not one.** Besides the
  noise deny-list (below), CLIs commonly carry a per-command output PROFILE: an explicit
  whitelist of dot-paths projected out of the envelope for each consumer. A field absent from
  that list is dropped even though no deny-list mentions it — and on an ERROR path this is
  worst, because the caller receives a code with no machine-readable state and retries blindly.
  After wiring any new payload key: read the real command output, and if it is missing, check
  BOTH the strip-list and the per-command projection. Register it in EVERY profile variant and
  add a test that iterates the profiles and fails when one drops it.

- **When a guard must stay opt-in, make the weakness COUNTABLE instead of pretending it is
  closed.** Backward compatibility often forces the strong check to fire only when the caller
  supplies extra fields — which means the failure mode is still live for everyone who omits
  them, and the weakest possible success is indistinguishable from the strongest. You usually
  cannot make it mandatory without breaking every artifact written before the check existed.
  So have the producer REPORT how strongly the result was corroborated, and let the metric
  count the hollow greens. Grade only the success path: attaching a strength to a failure
  invites it being read as partial evidence.

- **Build the metric so that breaking the thing it measures MOVES it.** A number that is
  written as a literal — `false_positives: 0`, `errors: 0`, `drift: none` — reads exactly the
  same whether the mechanism works or was never wired, so it certifies nothing. Derive it by
  running the REAL decision function over the REAL rows, and sanity-check by asking: if someone
  inverted the logic tomorrow, would this number change? If not, it is decoration. Pair it with
  a one-bit counter-proof in the test (same path, single input flipped, opposite outcome) —
  without it, a mechanism that always blocks passes a "it blocks" test while proving nothing.

- **A counter keyed on a NAME silently over-counts when that name also matches something
  structural.** Reusing an existing label to identify the things you want to count is the
  cheap path, and test/build frameworks routinely expose a match set that includes path
  segments, module names, class names and parent nodes alongside the real annotations. So a
  counter that asks "does this item carry label X" starts matching every item that merely
  LIVES in a directory called X. The result is a metric inflated by two orders of magnitude
  that nobody questions, because a big number reads as strength. Two defences, both cheap:
  introduce a DEDICATED label rather than reusing a generic one, and resolve it where the real
  annotations are readable (collection/metadata time) instead of against the loose match set.
  Then sanity-check the first run against a number you can count by hand — "how many of these
  actually need the expensive resource?" Earned when a freshly-built gate reported 140 proofs
  in a repo that contains exactly one.

- **The instrument you just built will make an uncomfortable number visible — report THAT, not
  the green.** A gate's first honest run is also the first measurement of the thing it guards,
  and it routinely shows the guarded property is far worse than assumed: one proof where the
  objective claims five, two documented behaviours where the spec lists ten. The temptation is
  to report that the gate passes (it does) and move on. But "the gate is green" and "the
  objective is met" are different claims, and conflating them re-creates, one level up, exactly
  the false assurance the gate was built to remove. When a new measurement contradicts a
  standing claim, the measurement is the deliverable — file it against the objective it
  undermines, and say plainly that the passing gate does not mean what it looks like.

- **Wired is not adopted — report the population, not just the mechanism.** A gate, lever or
  policy can be fully built, tested and proven and still govern NOTHING because no real subject
  opts into it. Before calling the outcome delivered, measure how many real subjects it applies
  to today; zero means the capability is dormant one level up, and the honest close-out says so
  rather than declaring the outcome met on the strength of temporary fixtures you created and
  deleted.

- **Prefer an allow-list for any gate decision.** Writing the condition as "block when state is
  failed or missing" means a state added later (a new verdict, a new status) silently becomes a
  way through. Write it as "proceed only when state is exactly the approved one" so unknown
  future states block by default. The same inversion applies to permissions, routing, and
  destructive-action classification: the unrecognized case must land on the safe side.

- **The OUTPUT layer can delete your feature silently — a generic-sounding payload key
  gets stripped as noise and the unit tests never notice.** A CLI whose default mode
  compresses envelopes usually carries a deny-list of "drill-down noise" keys removed at
  ANY depth (`rationale`, `summary`, `reason`, `explanation`, `detail`, `notes`…). Ship a
  command whose PRIMARY payload happens to use one of those names and the value is stripped
  on the way out: core tests green, command "works", human sees nothing — dormant capability
  with a passing suite. Two rules: (1) after wiring any new output, READ THE REAL COMMAND
  OUTPUT in the default mode (not `--select`, which bypasses the trim) and grep for your key
  — its absence is the bug; (2) these compressors ship a per-command **owned-keys exemption
  table** for exactly this case — register your command's payload key there with a comment
  saying why, and add BOTH regression assertions (survives for the owning command, still
  stripped for a non-owner). Earned when `--explain`'s entire "why" payload shipped invisible.

**Skill hardening (MANDATORY close-out — see `_shared.md` → Golden Rule 17):** before you
hand back, ask "what durable lesson from this cycle must the NEXT builder read _here_?" A
reproducible gotcha, a root-cause, a gate-reality, an architecture decision → **edit THIS
skill** (command-agnostic: the why/how, never "run command X"), propagating to every synced
destination (project `.agents/skills` ↔ global `~/.claude/skills` ↔ any distributed copy)
and scanning for secrets before any public push. A transient fact (a count, a version, a
current status) goes to memory/pheromone, not the skill. The skill is what the next ant
reads to ACT — a lesson left only in memory does not harden the process.

## The colony as a separate, installable orchestrator (delegate-first, opt-in)

- **Opt-in that is byte-identical when absent.** The delegation is behind a flag that
  **only short-circuits when the capability is detected** (a handshake with the
  installed binary); with the binary absent — or the flag off — the current
  delegated/live path is untouched. A flag that changes the default when its target
  isn't present is not opt-in, it's a regression. Prove the deep-equal: absent-binary
  output must match the no-flag output.

- **Capability without a surface is dormant (rule 9), so the delegation IS the
  surface.** Building the orchestrator and never wiring a way to reach it delivers
  zero; the wire (a flag on the existing loop) is what turns it on.

**Proving the colony's value is the ATTRIBUTION, not the dollar cost.** Each task the
colony closes records its tokens against that task's node in the ledger; the value
proof (rule 16) is `tokens > 0 attributed per node` read back through the normal
metrics surface — a real number, not a claim. In delegate-first mode a **zero dollar
cost is CORRECT, not a bug** (the ledger prices real provider calls; there are none).
Never fake a cost to "show value" — show the attribution.

**Colony runtime (live + delegated):** the async colony path has shipped (B4, B5).
`runColony()` executes tasks through the async provider adapter when a provider is
connected (via `--swarm` or the colony binary's `run` command). When no provider is
available, the colony returns the **delegated envelope** — proving zero-dollar cost
is correct (the ledger records real calls; with none, attribution is empty).
The sync execution port still exists for tests/stubs; the async path is the default
for live runs.

**Instrumenting the colony (the operator-facing "how to turn it on").** The section above
is the _why_; this is the durable _how_, command-agnostic (the exact verbs always come
from `agf help` / `agf retrieve-command`, never hardcoded here):

- **It is a second binary in the SAME repo, not a separate package.** Building the repo
  produces the colony bin alongside the main one; it becomes reachable to the opt-in flag
  only once it is on the PATH (installed/linked) — that is precisely what the flag's
  handshake probes before delegating. In-repo, drive it through the dev entrypoint
  (dogfood), never a stale globally-installed bin.

- **Providers are a single shared source with the main CLI — never wire them twice.** The
  colony has NO provider config of its own; it reads the SAME project settings the main
  `provider use` writes. So connecting a provider once (its env-var key present + selecting
  it, e.g. OpenRouter) serves the main loop AND every ant: when that key is detected the
  router prefers it and maps each complexity-caste → model-tier automatically. Duplicating
  provider wiring for the colony would violate single-source (rule 5).

- **Fallback is TWO-level, both delegate-first, both `$0`-ledger-correct:** (1) opt-in flag
  set but the colony binary ABSENT → the main loop's existing delegated/live path runs
  untouched (the byte-identical invariant above); (2) binary present but NO provider
  connected → the colony returns the **delegated envelope** ("drive it with your own LLM"),
  never a command pretending to run autonomously. Instrumentation is therefore purely
  additive: turning the flag on can never regress the no-colony behavior, and a missing
  provider degrades to delegation, not failure.

- **Nothing to pull is not a colony failure.** A perfectly-instrumented swarm still needs
  `task`-type nodes in the backlog; a backlog that is all spec-artifacts (risk/epic/
  requirement/…) leaves every ant idle. Verify pullable work exists (the picker returns a
  task) BEFORE blaming the swarm wiring — instrumentation and fuel are separate concerns.

## Refactor em massa exige a suíte completa

**Ao mover conteúdo em massa por regra de FORMA (tamanho, regex, posição), rode a suíte
COMPLETA — não o gate incremental.** Uma extração de "todo bullet com ≥5 linhas" levou junto uma
instrução operacional (`agf submit`, como uma task delegada fecha) que uma guarda de convenção
exigia no corpo. Critério de forma não distingue jurisprudência de instrução. E o gate de
pre-push não viu: ele roda testes relacionados ao range commitado, e teste de convenção que lê
arquivos por `fs` é invisível ao grafo de imports. O que quebra nesse tipo de refactor é
exatamente o que o gate incremental não enxerga.

## Gate deve medir o inacabado, não o iniciado

**Um gate de release que exige "100% do grafo" mede acúmulo histórico, não prontidão — e nunca
fica verde num projeto que enfileira backlog continuamente.** Gate que nunca fica verde é
decoração: ninguém o consulta e ele deixa de cobrar o que importa. Re-escope para o que está
INACABADO (acionável: ready/backlog/in_progress) e trate adiamento explícito como decisão. O que
torna isso um APERTO e não um afrouxamento: exija a JUSTIFICATIVA — adiado com investigação
escrita não bloqueia, adiado em silêncio bloqueia. E mantenha a contagem de adiados visível no
próprio check, além de NOMEAR os pendentes: sair de "2422/2628" para oito ids é a diferença entre
um número e uma lista de trabalho.

## Sinal inacionável: mude a pergunta, não o volume

**Quando 100% dos achados de um check são inacionáveis, a saída não é baixar severidade nem
filtrar — é reclassificar.** Um check de planejamento ("redistribua isto entre as subtasks") não
faz sentido depois que tudo fechou: a única forma de satisfazê-lo seria escrever justificativa
retroativa, que é ficção. Mas silenciar esconde o risco que ele acidentalmente cobria. Divida em
dois kinds com PERGUNTAS diferentes — o de planejamento cala onde não é acionável, e um novo
assume o caso com outra ação e outro dono. Mesma contagem, natureza diferente, nada apagado; e
garanta por teste que os dois são mutuamente exclusivos, senão você duplicou o ruído em vez de
separá-lo.

## A métrica auto-reportada e a superfície sem executor (node_b1d2aafb4b0a)

Duas armadilhas irmãs, colhidas no mesmo ciclo do épico de auto-ativação de levers.

**1. Quem escreve o número decide se ele vale.** A tarefa pedia um gate que ligasse
o default de um lever "com delta de ledger provando ganho líquido". A fonte óbvia
(`economy_lever_ledger.saved`) está ERRADA: o lever `flow` soma +7.112 tokens
"poupados" ali em 32 eventos, enquanto o A/B real mediu economia **negativa**
(−105,5%) e uma decisão registrada o manteve OFF. O motivo é estrutural — aquele
ledger grava o que cada lever acha que poupou LOCALMENTE (o `flow` poda contexto) e
não enxerga o custo que ele provocou do outro lado (puxa nós pinados). Goodhart em
uma linha de SQL. A autoridade tem de medir os DOIS braços sobre o MESMO input.

Corolário de projeto: exija que o campo derivado e o número bruto CONCORDEM
(`recommendation` vs `savedTokens`); divergência é fail-safe OFF, nunca "escolha o
mais otimista dos dois".

**2. Superfície viva ≠ capacidade viva.** `agf economy ab-lever` existe, tem help,
está no índice do RAG e devolve `ok:true` — e nunca pôde produzir dado: o CLI passa
`NO_LIVE_LEVER_AB_EXECUTOR`, cujo `available()` é `false` por construção. Com a
chave carregada do `.env.local` e o provider selecionado, ainda volta `delegated`.
Eu quase propus GASTO para obter a evidência antes de ler o executor.

Custo de não checar: teria pedido dinheiro ao dono para rodar algo estruturalmente
incapaz de rodar. Um `grep` no executor responde em 3 segundos.

**3. Byte-idêntico por construção, não por `if`.** A porta nova entrou como membro
OPCIONAL da interface (`getProvenLevers?`). Quem não a implementa resolve como
antes — a garantia vive no TIPO e não num condicional que alguém pode remover.
Gotcha: isso cria ciclo de import legítimo (config → gate → config), então monte
qualquer `Set` derivado SOB DEMANDA; no topo do módulo a constante chega `undefined`.

## Quando um teste falha 3 vezes, o errado pode ser a ASSERÇÃO (node_583654b9f480)

Escrevi um teste afirmando "o braço ON manda entrada menor que o OFF" para provar
que o A/B mede algo. Falhou três vezes; troquei o payload três vezes (JSON
homogêneo → código → mais código), cada vez supondo que o executor estava errado.

A verificação determinística encerrou em 3 segundos: chamar o colaborador direto
(`routeContent` com `mdl:true` e `mdl:false`, lado a lado) devolveu saída
BYTE-IDÊNTICA. O lever `mdl_select` não é um compressor — é um **gate que reverte
compressão marginal**, e com ganho folgado ele corretamente não intervém.

**A regra:** um teste que assere o EFEITO de outro módulo está medindo o payload
daquele módulo, não o seu código. Asserte o que o SEU módulo controla; trate o
resultado neutro como veredito válido, não como defeito. E ao ver o mesmo teste
falhar repetidamente, pare de mexer na entrada — instrumente o colaborador e
compare as duas saídas.

**Corolário de cast:** `as unknown as X` entre dois contratos é o mesmo erro na
camada de tipos. `TieredModelClient.run(kind, prompt)` e `ModelAdapter.generate(req)`
são incompatíveis; o cast compila e quebra em runtime. Escreva o adaptador.

**Corolário de preço/lookup:** um `get*` que devolve DEFAULT para id desconhecido
transforma "não sei" em número plausível. Cheque pertinência explícita ao catálogo
e caia num fallback declarado — senão você cobra pelo modelo errado.

## Prove ATRIBUIÇÃO por ablação antes de creditar um ganho (node_204a6111227e)

O A/B por lever ficou vivo e mediu: com context-pack real (971 tokens),
`savedTokens` deu ZERO para três levers. A tentação é ler "o A/B está quebrado" e
sair trocando payload. A pergunta certa é de ATRIBUIÇÃO: quem está produzindo a
compressão que eu vejo?

A ablação respondeu em uma execução: desligando `ECONOMY_CONTENT_ROUTER` o corpo
cai 0%; com ele ligado (default) cai 69% (616 → 192 chars). Toda a economia vinha
de um componente **default-ON**, e nenhuma dos levers **opt-in** sob teste.

**A regra:** antes de creditar economia (ou qualquer efeito) a um componente,
DESLIGUE-O e meça. Um número que não muda quando você remove a causa alegada não
é evidência daquela causa. Vale para lever, cache, índice, heurística de rota.

**Corolário desconfortável, e o mais valioso:** o resultado pode refutar a
premissa do épico inteiro — aqui, "auto-ativar levers por evidência" pressupõe
levers que movem o número. Isso NÃO é falha do instrumento; é o instrumento
funcionando. Registre como `risk` com a medição, e leve a decisão de escopo a
quem é dono dela em vez de seguir construindo sobre evidência vazia.

**Corolário de AC:** uma AC que você mesmo escreveu prevendo um resultado
("existe ao menos um veredito com savedTokens != 0") pode ser REFUTADA pela
medição. Declare-a refutada com o número; forçá-la a passar é fabricar.

## Antes de medir um lever, veja se algo o FORÇA ligado no caminho escolhido

Ao investigar por que um A/B media zero, o mapa `isLeverEnabled` mostrou o seam
dominante (um único módulo lia 7 levers). Parecia a resposta: medir ali. Mas o
resolvedor daquele módulo fazia `enableBundle(...)` incondicionalmente quando um
agente estava dirigindo — os 5 levers do bundle chegariam LIGADOS nos dois braços,
e o A/B mediria zero por confundimento, não por ausência de efeito.

**A regra:** antes de medir o efeito de uma flag, verifique se algum override a
força no caminho que você escolheu (detecção de ambiente, bundle, preset, env
var). Um braço "off" que na verdade está on transforma o experimento inteiro em
ruído com aparência de resultado.

**O achado maior que isso destravou:** existiam DUAS políticas de ativação
discordando — uma exigindo evidência (o gate que acabáramos de construir) e outra
ligando por detecção de driver, sem número algum. Quando duas políticas governam
a mesma decisão, a que roda primeiro vence em silêncio; procure a segunda antes
de concluir que a sua está no comando.

**Disciplina de citação:** ao relatar, separe o que foi MEDIDO do que não foi. Eu
medi dois caminhos (middleware, comando de contexto) e NÃO consegui medir o
terceiro — o probe travou em inicialização de workspace. Dizer "os levers não
entregam" seria estender a conclusão a um seam que não foi observado.

## Leia os TESTES do módulo antes de anunciar uma descoberta sobre o comportamento dele

Encontrei um resolvedor que ligava 5 levers incondicionalmente ao detectar um
agente-driver e reportei como contradição oculta com a regra do épico. Estava
errado no enquadramento: era decisão deliberada e shipada, com nó próprio — e o
arquivo de teste daquele módulo JÁ documentava o comportamento em um comentário,
fixando a env var para ter baseline determinístico.

Custo: um relatório que descrevia trabalho intencional de outra pessoa como
descuido. Isto aconteceu DUAS vezes na mesma sessão (a outra: concluir que uma
cadeia inteira estava desligada por um grep que não casou o formato usado).

**A regra:** antes de afirmar "o código faz X e ninguém percebeu", leia o teste
do módulo. Comportamento deliberado quase sempre tem um teste que o fixa, com o
porquê no comentário — é o lugar mais barato onde a intenção do autor está
escrita. Se um nó do grafo é citado ali, abra o nó.

**O que sobra depois da correção costuma ser o achado de verdade:** aqui, que
duas políticas de ativação passaram a coexistir e discordar (uma exigindo
evidência, outra por detecção de ambiente), e que a segunda confunde qualquer A/B
naquele seam. Isso continua real, acionável e é o que merece a decisão — separe
o fato verificado do enquadramento que você inventou em volta dele.

## Dê a cada efeito o instrumento do TIPO dele (node_28c3420006fc)

Uma bateria de zeros num A/B por provider parecia dizer "os levers não
entregam". Estava medindo cortadores de ENTRADA com um instrumento de SAÍDA.

O efeito de um lever que corta contexto está no tamanho do payload — observável
ANTES de qualquer chamada, de graça, sem variância de modelo. Medi-lo pelo
provider gasta dinheiro real e importa ruído para ver algo já visível. Trocado o
instrumento, o mesmo conjunto de levers deu: um cortando **74%** e quatro
cortando zero — número atribuível, determinístico, custo zero.

**A regra:** antes de escolher o instrumento, classifique o efeito. Muda a
ENTRADA (contexto, prompt, payload) → meça a entrada, determinístico e sem
provider. Muda a SAÍDA ou a ROTA (troca de modelo, escalada, retry) → aí sim o
custo só aparece na fatura e o A/B por provider é o certo. Um instrumento caro
aplicado ao efeito errado produz zeros que se lêem como veredito.

**E o resultado corrigiu a mim mesmo:** eu havia relatado, com números, que os
levers não entregavam. Entregavam — eu media no lugar errado. Quando um
instrumento novo contradiz sua conclusão anterior, diga isso explicitamente no
fechamento; a correção é parte da entrega, não uma nota de rodapé.

## Um zero exige DUAS provas: que o instrumento vê, e que havia entrada

Medi 5 levers com braços limpos: um cortou 74%, quatro cortaram zero. A conclusão
"os quatro são peso morto" estava a um passo — e teria sido errada.

Duas verificações mudaram a leitura, e as duas são baratas:

1. **O instrumento consegue ver o efeito?** Uma régua de TAMANHO é cega a um
   lever que muda ORDEM dentro de um orçamento fixo. Comparei o HASH do conteúdo,
   não só o comprimento: byte-idêntico. Régua inocentada — mas eu não saberia sem
   comparar.
2. **Havia entrada sobre a qual agir?** A composição do payload mostrou
   `priorMemories=0`. Um dos levers só age com ≥2 memórias injetadas: estava
   ESTRUTURALMENTE impedido. O zero dele é ausência de dado, não ausência de
   efeito — e o projeto tinha memórias, o rankeador é que não casou nada.

**A regra:** antes de reportar zero como veredito, prove que o instrumento
detectaria um efeito não-nulo E que o componente tinha insumo. Sem as duas, "não
entregou" e "não foi exercitado" ficam indistinguíveis — e a diferença decide se
você remove capacidade ou coleta mais dado.

**Assimetria que fecha a decisão:** remover capacidade com base numa amostra
enviesada é irreversível na prática; medir mais custa minutos quando o
instrumento é determinístico. Na dúvida entre "peso morto" e "não exercitado",
o custo de errar não é simétrico — meça de novo.

## O mesmo artefato pode te pegar TRÊS vezes — verifique o insumo POR AMOSTRA

Medi 5 levers e vi zeros. Suspeitei do instrumento, adicionei a passagem de
`projectDir` que faltava (o memory-inject vivia atrás de um `if` que eu nunca
satisfazia), re-medi — zeros de novo. Só na terceira passada instrumentei o
insumo em vez de assumi-lo: `0/10` tasks tinham memória injetada.

A causa foi troca silenciosa de amostra: uma sondagem usou `ORDER BY RANDOM()`
(6/10 com memória) e a medição usou `ORDER BY id` (0/10). Duas amostras do mesmo
universo, conclusões opostas, e nada no output dizia qual eu estava olhando.

**A regra:** verifique o insumo NA MESMA amostra em que vai medir, e imprima a
verificação junto do resultado. "Confirmei que existe insumo no projeto" não é o
mesmo que "confirmei que ESTAS N unidades têm insumo".

**Corolário — selecione por elegibilidade, não por conveniência.** A medição só
ficou honesta quando escolhi as tasks que provadamente tinham ≥2 memórias. Varrer
45 para achar 3 elegíveis também É um resultado: revelou que o alcance daquele
lever no projeto é ~7% das tasks, número que nenhuma média teria mostrado.

**Corolário de ruído:** antes de ler um delta pequeno como efeito, meça a
variação do BASELINE consigo mesmo. O meu oscilava ±5 chars porque a ativação de
memória depende de `Date.now()` — então "−1" era ruído, não inflação. Um efeito
menor que o ruído do seu instrumento não é um efeito.

## Quando um gate reprova, conserte a REGRA se o dado estiver certo

O gate de deploy acusava trabalho pendente. Investigado: 196 tasks bloqueadas,
todas com motivo escrito (portanto adiadas, corretamente), e UMA em quarentena —
um achado investigado e RETRATADO como falso-positivo, com 681 caracteres
explicando por quê. Essa única task travava a release inteira.

Duas saídas erradas eram tentadoras: marcar como `done` (mentira — não foi
feita, foi retratada) ou arquivar (esconderia a investigação). O certo era a
REGRA: o gate pergunta "sobrou trabalho ACIONÁVEL?", e um falso-positivo
retratado não é trabalho. Passou a aceitar `quarantined` junto com `blocked` —
mantendo a exigência de motivo escrito nos dois, senão qualquer pendência
sumiria com uma troca de status e o gate viraria decoração.

**A regra:** antes de mexer no dado para satisfazer um gate, pergunte se o dado
está certo e a regra é que está incompleta. Adaptar o dado ao gate é como
Goodhart entra; e o sinal de que você está fazendo isso é sentir que precisa
"arrumar" um registro que descreve a realidade corretamente.

**Corolário — verifique a premissa antes de implementar.** Outra task pedia
recapturar um baseline "quando um lever virar default". Nenhum lever tinha
veredito de vitória: a condição nunca ocorreu. Construir a máquina para um estado
inexistente seria especulação; entreguei o invariante que ela precisaria
preservar (o gate ainda morde numa regressão real), provado por sabotagem.

**Corolário — confira a SUA fixture antes de acusar o código.** Duas vezes
seguidas o teste "provou" que o gate de regressão não mordia. Era a fixture: o
campo lido é `costPerSuccess` (não `costUsd`) e o parâmetro é um MAPA (não a
lista de linhas). Um mapa vazio faz o laço não iterar e o gate "passa" sem ter
comparado nada. Quando um teste novo acusa defeito em código antigo e testado,
a fixture é a primeira suspeita.
