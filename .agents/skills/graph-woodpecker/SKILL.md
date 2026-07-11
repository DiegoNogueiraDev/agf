---
name: graph-woodpecker
description: 'Use when you want to HARDEN the codebase — hunt and fix bugs, find and fix security vulnerabilities, catch quality rot, close logging/observability blind spots, and raise test coverage to ≥80% — end-to-end and autonomously, with every finding tracked as a graph node and every fix proven by a regression test. The third pillar after graph-backlog-generation (PLAN) and graph-builder-leafcutter (BUILD): this is HARDEN. NOT for planning a PRD (graph-backlog-generation) or building new features from the backlog (graph-builder-leafcutter). Triggers — graph-woodpecker, woodpecker, find bugs, fix bugs, hunt bugs, security audit, fix vulnerability, OWASP, STRIDE, quality audit, tech debt, raise coverage, add observability, logging gaps, achar bugs, corrigir bugs, falha de segurança, auditoria de qualidade, cobertura de testes, observabilidade, endurecer, hardening.'
triggers:
  - graph-woodpecker
  - woodpecker
  - hunt-bugs
  - harden
version: 1.2.0
requires_agf: '>=0.20.0'
author: Diego Nogueira
date: 2026-07-03
tools_used:
  [
    scan-repos,
    harness,
    lint,
    quality,
    gaps,
    check,
    tdd-score,
    test,
    insights,
    metrics,
    provenance,
    immune,
    heal,
    node add,
    node status,
    done,
    memory,
    retrieve-command,
    economy,
    savings,
  ]
tokens: ~1400
---

# graph-woodpecker

The hardener. An autonomous, perpetual loop that hunts flaws out of an existing
codebase — bugs, security vulnerabilities, quality rot, logging/observability blind
spots — files each as a graph node, and fixes it with a regression test first (TDD),
raising coverage to ≥80% and wiring observability as it goes. Like a woodpecker
extracting grubs from inside the wood: methodical, persistent, leaves the tree
healthier. The third pillar after PLAN and BUILD.

## When to Use

- The feature exists and works, but you want it **hardened**: bugs, vulns, debt removed
- A security/quality/coverage audit is due, or a flaky/regression hotspot needs attention
- Coverage is below 80%, logs are thin, or failures are silent (no observability)
- You want `agf` to continuously self-heal its own defects, autonomously

Do NOT use to plan a PRD (→ `graph-backlog-generation`) or to build a new backlog
feature (→ `graph-builder-leafcutter`). This skill improves what already exists.

## ⛔ Hard rule — every flaw becomes a node, every fix has a test (read this first)

When this skill is invoked you may **never fix a flaw silently**. The order is fixed:
**FIND → file a `bug`/`risk` node → reproduce with a FAILING test → fix → prove green.**
No regression test that first reproduces the defect = you have not fixed it, you have
guessed. No node for the flaw = it never existed and you cannot claim it `done`
(anti-vibe-coding). You **own git** (branch-per-fix → TDD → merge → commit → delete) and
you **never lower a bar to pass** — if a gate is red, fix the code or file a node, never
weaken the test, the lint rule, or the coverage threshold. Observability is part of the
fix, not a follow-up: a failure path with no log/metric is not done.

## Deterministic loop (low-reasoning fast-path)

If you are a low-reasoning model (Haiku 4.5, DeepSeek Flash v4, MiniMax, etc.), follow
THIS exactly — top to bottom, no judgement. Obey every **STOP**/**DEFAULT**. The rich
Workflow below is the same loop for stronger models; this is the compiled version.

1. **Gate check (version + pull next hardening target):**
   `agf next --aco --select data.id` → if `NO_TASKS`:
   - `hardBlocks[]` non-empty → log blocked runtimes, wait (do NOT signal exhausted).
   - `hardBlocks[]` empty + backlog non-empty → escalate: "blocked — nothing unblocked".
   - backlog empty → proceed to the Hunt scan below (harden the codebase directly).
2. **Hunt (collect findings, ~0 token, deterministic):** encapsule a varredura num
   único round-trip com `agf exec chain` (sem shell `&&`/`|`) — menos envelopes, menos tokens:
   ```bash
   agf exec chain "harness --violations --select data.violations; \
     gaps --severity required --select data; \
     gaps --kind phantom_done --select data; \
     lint --select data; \
     insights --select data.hotspots"
   # harness=quality/types/docs/naming/errors · gaps required=missing tests/AC/edge/errors
   # gaps phantom_done=ANTI-HALLUCINATION (done tasks whose testFiles não existem no disco)
   # lint=lint+security · insights=regression/churn hotspots
   ```
   > **Triangulation (anti-hallucination).** A task is only really delivered when AC ↔ code ↔
   > **physical test** all align. `phantom_done` crosses `status=done` against the filesystem on
   > BOTH axes — `testFiles` (test) and `implementationFiles` (code): a done task declaring a
   > file that isn't on disk is a hallucination — file it as a finding and remediate (write the
   > missing file, or fix the reference via `agf node update <id> --test-files|--implementation-files
<real files…>`). This is the hardening leg the graph-only gaps could not see.
   >
   > **A second, subtler phantom-value class: real code + real test, but the artifact never
   > reaches its actual consumer.** File-existence triangulation only proves code and test
   > exist — it does NOT prove the thing built ever ships. Found twice this session: a build
   > script (`build-linux-packages.sh`) was fully implemented and covered by 7 real tests, yet
   > was never called from any CI workflow — no user could ever download the artifact it
   > produced. A packaging script (`pack-offline.mjs`) wrote a correctly-named file, but the
   > release workflow's `gh release upload` step never included it, so it never reached the
   > public release either. Whenever a finding is "a script/module exists and is tested,"
   > trace the chain ONE HOP FURTHER: what invokes this in production (a CI workflow, a cron,
   > an npm script)? Does THAT invocation actually run, and does its output reach the real
   > consumer (a Release asset, a published package)? `grep` the script's own filename across
   > `.github/workflows/*.yml` and any orchestrating shell script — zero hits means the tested
   > code is dormant in the one place that matters.
3. **File every finding as a node (never fix silently):**
   `agf node add --type bug "<symptom + file:line>"` for a defect; `--type risk` for a
   vuln/quality/observability gap. One node per flaw. No node → it does not get fixed.
4. **Pick order (no math):** `security` → `data-loss/crash` → `failing test` →
   `quality/complexity` → `logging gap`. Tie → lowest id. One at a time (WIP=1).
5. `agf node status <id> in_progress`.
6. **Reproduce first (RED):** write the test that _fails because of this flaw_ — for a
   bug, the input that triggers it; for a vuln, the malicious input. Run it, see it FAIL.
   Cannot reproduce → add a `risk` note and **STOP** that item (do not blind-fix).
7. **Fix minimal → GREEN.** Then **observability in the same change:** the failure path
   gets a structured log (`createLogger`, never `console.log`) + a metric/counter if it
   is a hot path. A silent failure path = not done.
8. **Coverage gate ≥80%:**
   ```bash
   npm run test:blast            # transitively-affected tests, standalone, must be green
   agf tdd-score <id> --select data.score   # ≥80; below → add positive+negative+edge tests
   ```
   Below 80% → keep adding tests (this is mandatory). **Max 3 fix tries** on a red blast;
   still red → `agf node add --type bug` and **STOP**.
9. **Security pass (every fix):** run the OWASP/STRIDE checklist below; any new exposure
   → `agf node add --type risk`. Never introduce a `console.log`, secret, or `any`.
10. `agf check <id>` (DoD) → `agf done <id>` (honest gate). Red on an **unrelated**
    pre-existing test → `agf node add --type risk …`, then
    `agf done <id> --test-cmd "npx vitest run <your test file>"`.
11. `agf memory write pheromone-fix-<slug>` (root cause + the fix + the gotcha) → go to 1.

**Never:** fix without a reproducing test, weaken a gate to pass, leave a failure path
silent, mark done on a false claim, or hold >1 `in_progress`.

## Golden Rules (woodpecker edition)

> The full universal set lives in `_shared.md` → **Golden Rules (universal
> engineering)** — obey it verbatim; the list below is the hardening-specific slice.
> Sweep handoffs MUST follow `_shared.md` → **Close-out Report Format** (delivery
> table + Achado transversal + Honestidade + `Próximo: X — porque [fundamento]`).

1. **Find before you fix; reproduce before you trust.** A bug you cannot reproduce in a
   test is a hypothesis, not a defect. Differential debugging / bisection finds _when_;
   the test proves _what_.
2. **Graph is the source of truth.** Every flaw is a `bug`/`risk` node; code/graph beat
   memory. No node = no fix.
3. **Root cause, not symptom.** Apply **5 Whys** + **Ishikawa (fishbone)** until the test
   that fails maps to the true cause — fix that, not the surface.
4. **Security is a first-class flaw.** Treat input as hostile (**STRIDE** + **OWASP Top
   10** + CWE). Parameterize queries, validate at boundaries (Zod), no secrets in code,
   least privilege. A found vuln is filed and fixed like any bug.
5. **Quality is a gate, not prose.** Clean Code · SOLID · KISS · YAGNI + McCabe
   complexity, enforced by `harness`/`tdd-score`/`check` — file <800, fn <50, 1
   responsibility, no `any`, typed errors, zero dead code.
6. **Coverage ≥80%, tests that bite.** Test Pyramid + FIRST + AAA; positive + negative +
   edge per fix; mutation kill-ratio ≥0.60 where it matters. Characterization tests pin
   legacy behavior before you touch it.
7. **Observability from the start.** No silent failures: structured logs on error paths,
   metrics on hot paths (RED: Rate/Errors/Duration · USE: Utilization/Saturation/Errors).
8. **Honesty + dogfood.** Surface every loose end as a node; never fake-pass; in-repo use
   `npm run dev -- <cmd>`, never the stale installed binary.
9. **A guard is only a guard while it can still fail.** A mass rename or codemod rewrites
   the test alongside the code, and the test stays green — because it now asserts a
   tautology. The classic shape: a guard strips the allowed exception from a string, then
   greps the remainder for the forbidden term. Rename the term and the grep can never
   match again; the assertion passes for every input, forever, and nothing tells you.
   After any sweep that touches an assertion, **prove each guard still bites**: put the
   forbidden thing back — into the artifact the guard actually reads, not merely into a
   file whose name resembles it — and watch it go red. A guard that has never been seen
   to fail has not been tested; it has been assumed. Applies equally to the guards you
   write today: the first run of a new guard must be RED, before the fix exists.

## Mandatory Flow

```
HUNT (harness·gaps·lint·insights → findings) → FILE nodes (bug/risk) → pick by severity (WIP=1)
  → REPRODUCE (failing test, RED) → ROOT-CAUSE (5 Whys/bisect) → FIX minimal (GREEN)
  → OBSERVABILITY (log + metric on the failure/hot path) → COVERAGE ≥80% (tdd-score)
  → SECURITY pass (STRIDE/OWASP) → GATES (blast·check·harness) → done (honest)
  → learn (pheromone) → repeat until no findings → re-scan
```

WIP = 1 (Little's Law: CT = WIP/TH). Deep methodology lives in the knowledge-base skills
(load on demand): `effective-debugging` & `klein-bug-hunters-diary` (bug hunting),
`fowler-refactoring` (safe transforms), `khorikov-unit-testing` & `whittaker-google-testing`
(test design), `gregg-systems-performance` (observability/USE/RED). Never memorize
commands: `agf help` · `agf <cmd> --help` · `agf retrieve-command "<intent>"`.

## Workflow

### Step 1 — HUNT: collect findings deterministically (~0 token)

```bash
agf harness --violations   # 9-dim quality (types·tests·fitness·docs·naming·errors·context·provenance·connectivity)
agf gaps --severity required   # traceability, AC coverage, missing edge/error cases
agf lint   ·   agf quality   # lint + security rules + quality bars
agf insights --select data.hotspots   # churn/regression hotspots — where bugs cluster
agf provenance   # untracked/unattributed changes (audit trail gaps)
```

Multi-modal sweep — each lens is blind to the others: types (harness), behavior (gaps),
style/security (lint), history (insights/hotspots). Triangulate; don't trust one.

**A sixth lens — sibling-diff, found while wiring dormant code (leafcutter harvest), not
from any tool above.** When two modules implement the same concept and only one is wired,
do NOT assume the wired one is correct by default — diff them. Twice in one session the
dormant sibling turned out to encode the fix: a dormant module canonicalized a path via
`realpath` before hashing while the wired one hashed the raw string (two callers reaching
the same workspace through different symlink chains got different state dirs); a dormant
tree-sitter enrichment module read a modifier token correctly (`.text`) while the shipped
code compared the wrong field (`.type`) and silently dropped every modifier. Neither bug
had a failing test — both codebases "worked," just wrong. Whenever a WIRE-task's target
turns out to be superseded by a wired sibling, take five minutes to read the sibling's
actual logic against the dormant one before closing the finding as "superseded" — the
dormant code may be dormant _because it corrected a bug the wired copy still has_, not
because it lost a race.

### Step 2 — FILE: every finding becomes a node (traceable, honest)

```bash
agf node add --type bug  "FIX: <symptom> @ <file:line> — <repro hint>"
agf node add --type risk "SEC|QUAL|OBS: <exposure> @ <file:line> — <mitigation as AC>"
```

One node per flaw, with the **mitigation phrased as the AC** that will absorb it. No
silent fixes — if it is worth fixing, it is worth tracking (the graph is the audit log).

### Step 3 — REPRODUCE + ROOT-CAUSE (RED, scientific method)

Write the **failing test first**: the exact input that triggers the bug (or the malicious
payload for a vuln). Watch it fail — that is your proof the defect is real and the
oracle for the fix. Then **5 Whys** + **bisection** (`git bisect` / differential) to the
true cause. A regression that was passing → bisect to the breaking commit. Pin legacy
with a **characterization test** before refactoring (Feathers).

### Step 4 — FIX + OBSERVABILITY (GREEN, in one change)

Minimal change to pass the test, then **refactor** (Clean Code/SOLID) keeping green. In
the SAME change, close the observability gap that hid the bug: structured log on the
error path (`createLogger({ layer, source })`, never `console.log`), a metric/counter on
a hot path, a typed error instead of a swallowed one. Additive/opt-in stays byte-identical
for existing tests → zero regression for free.

### Step 5 — GATES: coverage ≥80% + security + quality

```bash
npm run test:blast                     # MANDATORY, standalone, green
agf tdd-score <id> --select data.score # ≥80 required; add positive+negative+edge until met
# optional robustness: agf check <id> --mutation --source <file>   # kill-ratio ≥0.60
agf harness --violations               # Clean Code/SOLID/naming/errors enforced
agf check <id>                         # DoD
```

**Security checklist (STRIDE × OWASP, run every fix):** Spoofing (authz?), Tampering
(input validated at boundary?), Repudiation (audit log?), Info-disclosure (no secret/PII
in code or error?), DoS (unbounded query/loop? add limit), Elevation (least privilege?).
Injection → parameterize; XSS → sanitize; path traversal → resolve+allowlist. Any new
exposure → a `risk` node, never a silent acceptance.

**Subprocess injection specifically:** `execSync`/`exec(`git ${args.join(' ')}`)` with
any interpolated untrusted string is a shell-injection vector even if you shell-quote
the one untrusted arg — that quoting is POSIX-specific and silently does not hold on
Windows (different metacharacters). Prefer `execFileSync(cmd, args, opts)` — it never
invokes a shell, so args reach the binary as literal argv with nothing to quote or
escape, on any platform. Live-test the fix with an actual malicious payload
(`'; touch /tmp/marker; echo '`) before and after, not just a lint pass.

**A gate/heuristic you just added is itself a hardening target.** A newly-wired
detector (regex, path pattern, threshold) can be too broad and generate friction that
erodes trust in the DoD process — e.g. a "flag core modules needing corpus-scale
tests" pattern that matched `(^|\/)core\//i` ended up matching almost every file under
`src/core/`, forcing `--force` bypasses on legitimate work with zero true positives.
When a gate fires repeatedly on work that is clearly fine, don't just `--force` past
it every time — check whether the gate's own pattern is measurably too broad (count
false positives this session), and narrow it with a regression test proving the
narrowed pattern still catches the real case.

### Step 6 — CLOSE + LEARN

```bash
agf done <id>   ·   agf memory write pheromone-fix-<slug>   ·   agf heal
```

Deposit the root cause + the fix + the gotcha as a pheromone trail so the next hunt skips
the diagnosis you already paid for. `agf heal` clears graph noise. Then re-run Step 1 —
the loop ends only when a full sweep finds nothing required.

**At a sweep boundary, render the handoff per `_shared.md` → Close-out Report Format** —
the DELIVERY TABLE (`Entrega | O quê | Prova`, every claim graph-backed: `N testes ·
<commit>`; a still-open finding gets its own row citing the `risk`/`bug` node; sweep row
shows `test:node`/coverage) + Achado transversal + Honestidade + the decided next step
(`Próximo: X — porque [fundamento]`, e.g. risco-primeiro = severity × blast radius). Obey
that section verbatim — single source, do not re-improvise the format here.

## Anti-Patterns

- Do NOT fix without a reproducing test — that is a guess, not a fix
- Do NOT fix the symptom — 5 Whys to the root cause, fix that
- Do NOT lower a gate (test, lint, coverage threshold) to go green — fix the code
- Do NOT raise a warning ceiling to silence a red gate — that moves the goalpost, and the
  next reader inherits a number that measures nothing
- Do NOT let a sweep (rename, codemod, find-and-replace) run over a test without proving
  the test can still fail afterwards — a rewritten assertion goes green by becoming empty
- Do NOT trust a guard whose failing run you have never seen
- Do NOT leave a failure path silent — log + metric is part of the fix
- Do NOT accept a found vulnerability without a `risk` node and a fix or explicit deferral
- Do NOT plan features or build new backlog here — that is the other two skills
- Do NOT mark done on a false claim, or below 80% coverage, or with `console.log`/`any` added

## Economy

Output is compressed automatically with `--ai`; project with `--select <path>`; recover
the exact command with `agf retrieve-command "<intenção>"`; reuse before you create.
Opt-in levers via `agf economy on <lever>` (`ncd_dedup`, `mdl_select`, `info_bottleneck`…);
measure with `agf metrics --economy-report` and `agf savings`. Route by cost with
`agf provider use <id>` + `agf model`/`--pin` (cheap model for mechanical fixes, frontier
only for hard root-cause). Hunting (Step 1) is deterministic and ~0 token by design.

See `_shared.md` → **Token Economy** for the full arsenal: gateway auto-levers
(diff-edits, repo-map, lossy-gate, CCR), `agf economy list`, and the compress guardrail.

## Related

- `graph-backlog-generation` — PLAN: produces the backlog (the what-to-build).
- `graph-builder-leafcutter` — BUILD: implements new features from the backlog.
- `graph-woodpecker` — HARDEN (this): finds & fixes flaws in what already exists.
- Knowledge bases (load on demand): `effective-debugging`, `klein-bug-hunters-diary`,
  `fowler-refactoring`, `khorikov-unit-testing`, `whittaker-google-testing`,
  `gregg-systems-performance`.
