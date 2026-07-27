# 0004 — Goal-driven loop: independent grader gates exit; single-loop default; parallel behind a budget guard

- **Status:** Accepted
- **Date:** 2026-06-15
- **Graph:** epic `node_b590aec8342d` ("Goal-driven loop — checkable rubric + independent grader")

## Context

The owner shared a set of concept cards (@0verlens, summarizing Claude Code's `/loop` & `/goal`,
Boris Cherny's "my job is to write loops", and Anthropic's "Goal-driven loops: two implementations").
The core mechanic: **RODA → CONFERE → CORRIGE** — the AI runs, an **independent grader** checks the
output against a **checkable target/rubric**, corrects, and repeats until all criteria pass. Key
principles from the cards:

- The AI needs a _checkable_ target, and **the checker cannot be the model judging its own work — it
  must come from outside** (Anthropic's test: nine criteria, a separate verifier only let the loop
  stop when all passed).
- Two run-modes: **fixed/interval** (`/loop 5m`, for watching something that can't go down) and
  **dynamic** (iterate until the goal is met, bounded by turns/time/`max_iterations`).
- **Parallelism burns money**: firing dozens of attempts at once evaporated 5M tokens in 3 minutes,
  and because parallel attempts don't share discoveries they duplicate work — so start with one loop.

agf already implements most of the loop: `src/core/autonomy/autopilot-loop.ts` `runAutopilot` is a
bounded loop (`for i < maxIterations` = cost-runaway guard), enforces WIP=1, and runs
next→in_progress→implement→**DoD gate**→done|escalate; `delegate-parallel.ts` + `fiber-set.ts`
provide parallel fan-out. What is missing is the **external grader against a rubric**, the **interval
run-mode**, and a **parallelism cost guard + shared discovery**.

## Decision

**Extend agf's autopilot with a goal-driven mode** rather than build a new engine:

- **Rubric primitive + independent grader.** Add a gradable rubric (objective end-state criteria,
  distinct from per-task DoD) and a grader that scores against it using a **separate tier-router
  model** (cheap tier, never the builder model); deterministic criteria run with zero LLM. The grader
  is external by construction.
- **Iterate→grade→revise→exit.** `runAutopilot --goal <rubric>` exits `done` only on grader all-pass;
  a not-met verdict starts the next turn with grader feedback injected; still bounded by
  `maxIterations`/time; new stop reason `goal_met`. This complements, not replaces, the DoD gate.
- **Two run-modes.** Dynamic (`agf autopilot --goal …`) and interval (`agf loop --every <dur> <cmd>`,
  bounded by max-runs/time).
- **Single-loop default + parallelism budget guard.** Keep serial/WIP=1 the default; put parallel
  fan-out behind a hard token/cost ceiling with a kill-switch (logged to the ledger) and a shared
  findings store (reuse `lessons-store.ts`) so parallel attempts stop re-discovering the same thing.

## Consequences

- Loops converge on a _verified_ end-state instead of stopping at a deterministic per-task gate,
  improving best-practice-SWE confidence while keeping the cost-runaway guard.
- The external-grader rule operationalizes the existing `self-review` / `producer-reviewer` insights
  (cross-linked in the graph) — the grader _is_ the independent verifier.
- Parallelism remains available but cost-bounded and discovery-sharing, directly mitigating the
  "parallelism burns money" failure mode; the safe default (one loop) matches agf's WIP=1 doctrine.

## References

- Concept: Claude Code `/loop` & `/goal`; Anthropic "Goal-driven loops: two implementations"
  (Goal / Judge / Loop / Bound / Feedback / Exit); Boris Cherny, "my job is to write loops".
- agf: `src/core/autonomy/autopilot-loop.ts`, `delegate-parallel.ts`, `fiber-set.ts`,
  `lessons-store.ts`, `src/core/llm/tier-router.ts`, `src/cli/commands/autopilot-cmd.ts`.
