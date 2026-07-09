# agf capability atlas — full functional coverage

Load on demand. This maps **every functional area of `agf`** (the ~110 top-level
commands / 260+ with subcommands) to _when_ the loop reaches for it and the _entry_
command. It is a capability map, not a flag reference — names are illustrative
pointers; the **live source of truth is always `agf help`, `agf --help`, and
`agf retrieve-command "<intent>"`**. Every command takes `--help`, `--select <path>`,
and (where it lists) `--json` for token economy.

> Use this when the narrow build loop (SKILL.md) is not enough — i.e. you need to
> shape the backlog, gate a phase, govern with specs, inspect flow, tune economy,
> drive the colony/learning systems, or run the graph's data layer directly.

---

## The 9 lifecycle phases → commands

### 1. ANALYZE — intake an idea/PRD into the graph

| Need                                         | Command                                                |
| -------------------------------------------- | ------------------------------------------------------ |
| One-shot: request → PRD → graph → TDD build  | `agf deliver "<pedido>"` (`--file`/`--image`/`--live`) |
| Generate a PRD from an idea                  | `agf generate-prd "<desc>" [--import]`                 |
| Import a PRD file (md/pdf/html/docx) → graph | `agf import-prd <file> [--build-tree]`                 |
| Merge an exported graph JSON                 | `agf import-graph <file>`                              |
| Full lifecycle cycle with gates              | `agf build [--live]`                                   |
| Ad-hoc one-shot (gen→apply→test)             | `agf run "<prompt>"`                                   |
| Create the project graph                     | `agf init`                                             |

### 2. DESIGN — governance, decisions, interfaces

| Need                                                        | Command                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| Governing principles (indexed, gate-checked)                | `agf constitution` · `agf principles`                      |
| Architecture Decision Records                               | `agf adr create\|list`                                     |
| Generate/validate a spec by template                        | `agf spec --generate <tpl>` · `agf spec --validate <file>` |
| Living specs linked to nodes                                | `agf spec-sync register\|list\|status\|link`               |
| Workflow preset (default/strict-tdd/agile-light/enterprise) | `agf preset --apply <name>`                                |
| Config profiles                                             | `agf profile`                                              |
| Add design nodes/edges (ADRs, interfaces)                   | `agf node add` · `agf edge add`                            |

### 3. PLAN — decompose into atomic, testable tasks

| Need                                      | Command                               |
| ----------------------------------------- | ------------------------------------- |
| Decompose a task into subtasks (≤2h each) | `agf decompose <id>`                  |
| Reusable decomposition templates          | `agf template list\|apply`            |
| Completeness gaps + driver-agnostic fixes | `agf gaps --severity required --json` |
| Board view: status, WIP, flow metrics     | `agf kanban`                          |
| Query/search the backlog                  | `agf query` · `agf search "<text>"`   |

### 4. IMPLEMENT — the build loop (see SKILL.md)

| Need                                                  | Command                                              |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Golden-rule guard: git-history + dedupe before coding | `agf preflight "<topic>"`                            |
| Pipeline: wake-up + next + context + in_progress      | `agf start`                                          |
| Granular pull / context-pack                          | `agf next` · `agf context <id>`                      |
| Delegation spec / ingest executor result              | `agf brief <id>` · `agf submit <id> --result <json>` |
| Autonomous sprint loop (guardrails)                   | `agf autopilot [--simulate\|--live]`                 |
| Deterministic scaffold / RAG-OUT reuse                | `agf scaffold <name>` · `agf montar-output`          |
| Code intelligence: index, search, impact, LSP         | `agf code`                                           |
| Compound ops in one store cycle                       | `agf pipeline` · `agf exec`                          |
| Complete: DoD + store + mark done                     | `agf done <id>`                                      |

### 5. VALIDATE — prove it, don't claim it

| Need                                    | Command                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| Definition of Done checks               | `agf check <id>`                                        |
| Phase-readiness gates                   | `agf gate <design\|review\|handoff\|deploy\|listening>` |
| Quality gate 95/95                      | `agf quality`                                           |
| Agent-readiness score (8 dims, A–D)     | `agf harness [--saturation]`                            |
| TDD quality score 0–100                 | `agf tdd-score <id>`                                    |
| Run affected tests / lint (graph-aware) | `agf test` · `agf lint`                                 |
| Tokens/$ + cost-per-success             | `agf metrics [--economy-report]`                        |
| Real scenarios → scorecard              | `agf eval --models <ids> --live`                        |
| Epistemic-tier honesty ladder           | `agf provenance promote\|downgrade\|hash`               |

### 6. REVIEW — read the flow, not the vibes

| Need                                        | Command           |
| ------------------------------------------- | ----------------- |
| Graph analytics (DORA, bottlenecks, phases) | `agf insights`    |
| DORA forecast metrics                       | `agf forecast`    |
| Board + WIP + flow efficiency               | `agf kanban`      |
| Change impact / blast radius                | `agf code impact` |

### 7. HANDOFF — make the next session resumable

| Need                                   | Command                                    |
| -------------------------------------- | ------------------------------------------ |
| Write/read/search/rm project memory    | `agf memory write\|read\|list\|search\|rm` |
| Create/list/restore graph snapshots    | `agf snapshot create\|list\|restore`       |
| Serialize the graph as JSON            | `agf export`                               |
| Inspect the unified session read-model | `agf session show\|grants\|events`         |

### 8. DEPLOY — ship gate

| Need                                   | Command                       |
| -------------------------------------- | ----------------------------- |
| Deploy-readiness gate (harness ≥ 70)   | `agf gate deploy`             |
| Export + forecast for release          | `agf export` · `agf forecast` |
| Unified panel (provider/model/cache/$) | `agf status`                  |

### 9. LISTENING — new cycle / maintenance

| Need                                     | Command                            |
| ---------------------------------------- | ---------------------------------- |
| Add nodes / import the next PRD          | `agf node add` · `agf import-prd`  |
| Neighbor-repo capability diff → insights | `agf scan-repos`                   |
| Knowledge consolidation (REM-inspired)   | `agf dream start\|status\|history` |
| Self-heal graph noise (MAPE-K)           | `agf heal`                         |

---

## Cross-cutting families

### Provider · model · auth (3rd pillar — token cost)

`agf provider use <id> [--base-url]` · `agf provider current` · `agf model set <id|auto>`
· `agf login` / `agf logout` · `agf doctor --providers`. 10 providers auto-detected
from env vars; tier-router (cheap→build→frontier) or `--pin <model>`.

### Token economy — measure & tune

`agf economy on|off|list <lever>` (opt-in bio/math levers: `ncd_dedup`, `forage_stop`,
`mdl_select`, `heat_kernel`, `budget_kleiber`, `info_bottleneck`, `memory_salience`…) ·
`agf metrics --economy-report` · `agf savings [--reset]` · `agf calibrate` (RAG gate
threshold) · `agf compress` (tool-output compressor) · `agf retrieve <hash>`
(rescue a CCR-dropped original) · `agf retrieve-command` / `agf montar-output` (RAG-IN/OUT)
· `agf usage` (analytics → auto-wrappers).

### Learning · colony · self-improvement (ACO/GA/bio)

`agf learning` (per-agent perf, routing, export) · `agf memory write pheromone-<slug>`
(stigmergy trails) · `agf colony-health [--history]` · `agf caste list|show` ·
`agf swarm session|claim|mailbox|consensus` (multi-agent fabric, opt-in) ·
`agf dream` (REM consolidation) · `agf immune` (Danger-Theory source defense) · `agf heal`.

### Graph data layer (zero MCP)

`agf node add|show|update|status|move|clone|rm` · `agf edge add|rm|ls` ·
`agf query` · `agf context <id>` · `agf search` · `agf snapshot` · `agf export` · `agf import-graph`.

### Ops · runtime · extensibility

`agf status` · `agf stats` · `agf doctor` · `agf phase` (lifecycle detection) ·
`agf hooks list|test|discover` (28-point taxonomy) · `agf plugin` · `agf skill list|show` ·
`agf daemon` · `agf gc` · `agf ui` / `agf tui` · `agf loop` (interval / goal-rubric) ·
`agf scan-repos`.

---

## Discovery (never memorize — ask agf)

- `agf help` — friendly grouped index + first steps
- `agf --help` / `agf <cmd> --help` — full command/flag list (commander)
- `agf retrieve-command "<intenção>"` — RAG-IN: natural-language intent → exact command
- `agf skill list` — lifecycle skills available to drive each phase
