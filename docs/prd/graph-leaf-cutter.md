# PRD: graph-leaf-cutter Continuous Dogfood Improvement Loop

**Epic:** node_a4431656a024  
**Status:** ANALYZE → DESIGN → IMPLEMENT  
**Owner:** agf team

---

## 1. 5W2H

| Field        | Value                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- |
| **What**     | Perpetual ACO-driven builder loop that implements its own backlog with self-improving orchestration |
| **Why**      | Reduce human intervention per iteration; let pheromone trails reinforce winning patterns            |
| **Who**      | All agf users running `/graph-builder-leafcutter` skill                                             |
| **Where**    | `src/skills/`, `src/core/economy/`, `src/cli/`                                                      |
| **When**     | Every `agf done` cycle — continuous                                                                 |
| **How**      | ACO trails + MMAS reset (stagnation) + tool-routing + HTN decomposition                             |
| **How much** | Budget: zero new deps; reuse existing colony + economy modules                                      |

---

## 2. JTBD (Jobs To Be Done)

- **Core job:** "When I run `agf next`, I want the loop to automatically select the highest-fitness task and implement it correctly the first time, so I don't need to review trivial failures."
- **Supporting job:** "When a pheromone trail ages out, I want the loop to explore new approaches rather than repeat the same mistake."
- **Constraint job:** "When my token budget is constrained, I want the loop to forage-stop before I exhaust it."

---

## 3. Pareto Analysis (80/20)

Top-3 causes of loop reruns (80% of wasted iterations):

1. **Wrong tool selection** — loop picks a CLI command that doesn't match intent (40%)
2. **No decomposition** — atomic task is actually composite; first attempt fails at blast gate (25%)
3. **Stagnation** — pheromone trail collapsed → identical approach repeated (15%)

Stagnation addressed by node_9534afbf7ed4 (done). Remaining: tool-routing + decomposition.

---

## 4. MoSCoW

| Priority   | Feature                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| **Must**   | Tool-routing: `retrieve-command` used before any `runAgf` call in the loop             |
| **Must**   | MMAS integration already wired (node_9534afbf7ed4 done)                                |
| **Should** | HTN decomposition: detect composite tasks → auto-`agf decompose` before start          |
| **Should** | Petri-net concurrency model: safe parallel sub-tasks (WIP>1 only when no shared state) |
| **Could**  | GA-inspired crossover: combine two successful trails into a hybrid approach            |
| **Won't**  | Full LLM-in-loop planning — stays delegate-first (agf brief → external agent)          |

---

## 5. INVEST Checklist (for each child task)

All child tasks must be:

- **I**ndependent — no shared file edits in the same blast window
- **N**egotiable — AC can be refined until DoR gate passes
- **V**aluable — maps to a Pareto bucket above
- **E**stimable — XS/S/M (no L without subtasks)
- **S**mall — completable in ≤2h
- **T**estable — has ≥1 Given-When-Then AC

---

## 6. GWT Acceptance Criteria (Epic-level)

| Given                              | When                                 | Then                                                   |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| A backlog with 5 tasks             | Loop runs `agf next --aco`           | Selects highest-fitness task via pheromone score       |
| A composite task detected          | Before `agf start`                   | Loop calls `agf decompose` and picks the first subtask |
| H_norm < 0.30 (stagnation)         | After pheromone deposit              | MMAS reset fires; all trails reset to τ_max            |
| `retrieve-command` returns top hit | Before any `runAgf` in safe pipeline | Correct command used; no wrong-command failures        |

---

## 7. Risk Matrix

| Risk                              | Probability | Impact | Mitigation                                          |
| --------------------------------- | ----------- | ------ | --------------------------------------------------- |
| Tool-routing miss (wrong command) | Medium      | High   | Unit-test `retrieve-command` mock in exec-safe path |
| HTN over-decomposes a simple task | Low         | Medium | Gate: only decompose when XS complexity + no AC     |
| Petri-net adds blocking overhead  | Low         | Low    | Opt-in flag `--concurrent`; default=off             |
| MMAS reset fires too aggressively | Low         | Medium | Tunable threshold config; default H_norm=0.30       |

---

## Requirements

Linked requirement nodes created in graph (see `agf node add --type requirement` calls below).

- **REQ-LCR-001:** Tool routing gate — every `exec safe` step resolves command via `retrieve-command` before dispatch
- **REQ-LCR-002:** HTN detection — tasks with XS complexity and empty AC trigger `agf decompose` guard
- **REQ-LCR-003:** Concurrency model — WIP>1 permitted only when tasks have no shared file overlap (Petri-net token model)
