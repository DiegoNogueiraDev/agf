# ACO / GA-inspired selection + context economy — reference for graph-builder-leafcutter

Loaded on demand. Consolidates the leafcutter/golden-wren loop mechanics and the
graph-economy levers.

## Pheromone model (ACO — Dorigo 1992 + `stigmergy` lever)

- Each successful improvement **deposits** a pheromone trail: `agf memory write pheromone-<slug>` (or the `stigmergy` lever over `pheromone_trails`).
- Future cycles **retrieve and amplify** strong trails: `agf memory search "pheromone"`.
- Unreinforced trails **decay** (exponential evaporation by timestamp) — prevents lock-in on obsolete patterns.
- `agf dream` runs REM-style replay over the trails to consolidate/forget.
- Cross-project spread: `agf scan-repos` propagates winning patterns to neighbours.

## GA-inspired selection (no new core module)

- **Chromosome** = a backlog candidate (task/epic).
- **Fitness** = PERT (expected effort) × Pareto (value share) × pheromone weight.
- **Selection** = pick the highest-fitness unblocked task each cycle.
- **"Mutation"** = vary scope/approach when fitness stalls (try a sibling task or an alternate scaffold).
- **Reinforcement** = pheromone deposit on success closes the loop (ACO ⨯ GA hybrid).

## The perpetual loop (WIP=1, Little's Law CT=WIP/TH)

1. **Colony scan** — `agf stats` · `agf harness --saturation` · `agf gaps` · `agf learning stats`.
2. **Generate/select** — if backlog empty, signal `graph-backlog-generation`; else select by fitness.
3. **Pull one** — `agf next` (do NOT claim yet). **The default is deterministic, and `--aco` is opt-in.**
   Plain `agf next` / `agf start` sort by strict priority. The roulette was once the default and it
   was reverted: pheromone weight overrode priority, and a priority-3 task was observed being pulled
   ahead of a priority-2 one. A weak or delegated model following `agf next` blindly needs the safe path
   to be the predictable one. Overrides: `--aco` opts into the pheromone-weighted roulette, `--no-aco`
   states the default explicitly, `--seed <n>` makes the roulette reproducible. A system that learns
   also errs, so you must be able to turn it off.
4. **Investigate & reuse** — `agf preflight` + `rg`/`agf search` for the owning module;
   EXPAND, don't recreate (see engineering-practices.md). Then `agf node status <id> in_progress`.
5. **Build** — TDD Red→Green→Refactor with the economy arsenal below + Clean Code/SOLID.
6. **Verify (gates)** — `npm run test:blast` (standalone) + `agf check <id>` + `agf tdd-score <id>`
   - `agf harness --violations` (opt-in `agf check --mutation` for robustness).
7. **Close** — `agf done <id>` (DoD, epic promotion); fold review/handoff/listening.
8. **Learn** — `agf savings` · `agf metrics --economy-report` · `agf learning` · deposit pheromone · `agf heal`.
9. **Repeat** until exhausted → restart.

## Folded phases (former separate skills)

- **REVIEW** — `agf insights` (blast radius, code-sync), quality gate before done.
- **HANDOFF** — `agf memory write <name>`, `agf snapshot create`, `agf gate handoff`.
- **DEPLOY/PUBLISH** — `agf gate deploy` (harness ≥ 70), release pipeline.
- **LISTENING** — `agf insights` DORA retro → seeds the next cycle's findings.
- **HEAL** — `agf heal --apply` (MAPE-K self-repair of graph noise).

## Context economy arsenal

- **Always-on:** `--ai` compressed envelope; `--select <path>` to project output→input.
- **RAG-IN:** `agf retrieve-command "<intenção>"` → exact command (fallback `--help` below threshold).
- **RAG-OUT:** `agf montar-output "<objetivo>"` → reuse/fill a scaffold instead of regenerating.
- **RAG-CACHE:** repeated/similar prompts/plans are served from cache (CCR reversible; `agf retrieve <hash>`).
- **Scaffold:** `agf scaffold <name> --type class|fn|comp|iface|type` — deterministic boilerplate; write new only for genuinely novel code.
- **Opt-in levers** (`agf economy on <lever>`, default all-OFF, byte-identical when off):
  - reallocators (saved≈0, reshape): `budget_kleiber` (Kleiber 3/4), `heat_kernel` (e^{-tL} repo-map ranking).
  - cutters (reduce input tokens): `ncd_dedup` (Kolmogorov/NCD dup memories), `forage_stop` (Charnov MVT), `mdl_select` (Rissanen MDL), `memory_salience` (ACT-R), `info_bottleneck` (Tishby IB).
- **Measure, never estimate:** `agf metrics --economy-report` + `agf savings` read the real ledger.

## Honesty guardrails

- Surface loose ends as `risk`/`bug` nodes — never mark done with a false claim.
- Do NOT count reallocator levers as token cuts (their saved is ~0 by design).
- Do NOT skip the blast gate before `agf done`.
