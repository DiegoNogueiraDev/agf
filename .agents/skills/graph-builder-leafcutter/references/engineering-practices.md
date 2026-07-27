# Engineering practices — reference for graph-builder-leafcutter

Loaded on demand. HOW to implement excellently while the loop runs. Stable knowledge
(command-agnostic): discover exact `agf` commands via `agf retrieve-command "<intent>"`.

## Clean Code (Robert C. Martin)

- Intention-revealing names (`getUserById`, not `get`); names say exactly what they do.
- Small functions — one thing each; ideally a handful of lines.
- Boy-Scout rule: leave every file cleaner than you found it.
- Self-explanatory code over comments. Comment the **why** (non-obvious decisions,
  warnings, complex algorithms) — never the **what** (the name already says it).
- Consistent formatting; reads top-to-bottom like prose.

## SOLID (applied while coding)

- **S**RP — one reason to change per unit (split `OrderService` → service + tax calc + notifier).
- **O**CP — extend via interfaces/strategy/registry; don't modify working code to add a variant.
- **L**SP — subtypes substitute base types without breaking callers (the Square/Rectangle trap).
- **I**SP — many small interfaces over one fat one; don't force unused methods.
- **D**IP — depend on abstractions (ports/adapters), inject implementations.
- In this repo: ports/adapters pattern, named exports, no `any`, typed errors.

## DRY · KISS · YAGNI · Demeter · Composition

- DRY with the **Rule of Three** — abstract on the 3rd duplication, not the 1st.
- KISS — simplest thing that works; no accidental complexity.
- YAGNI — build only what the task needs now.
- Law of Demeter — talk to immediate collaborators only.
- Composition over inheritance — compose behaviors; inheritance only for LSP-safe is-a.

## Code reuse (investigate before writing) — the golden rule, operationalized

Recreating from scratch is the #1 failure of the build loop. Before writing ANY code:

1. **Find the owning module.** `agf search "<feature>"` / `agf query` over the graph +
   `rg "<module|symbol>" src` (or `grep -rn` where ripgrep is absent; and the repomix
   compressed-structure pass for the API skeleton). The core module / table / lever
   usually already exists.
2. **Decide EXPAND > scaffold > net-new:**
   - **EXPAND** the owning module/helper — the default. Strongest changes wire
     dormant, exported-but-unwired symbols that already live in the repo.
   - **scaffold** (`agf scaffold <name> --type …`) — deterministic boilerplate for a
     genuinely new but conventional unit.
   - **net-new** — only when it provably does not exist anywhere.
3. **Reuse generations.** Repeated/similar plans come from RAG-OUT (`agf montar-output`)
   / rag-cache instead of being re-drafted.
4. **DRY check.** If you're about to copy logic, extract/reuse on the 3rd occurrence.

## TDD (the inner loop, mandatory here)

- **Red** → failing test from the AC (start from the AC's Given-When-Then).
- **Green** → minimal code to pass.
- **Refactor** → apply Clean Code + SOLID, tests stay green, no regressions.
- One assertion focus per test; positive + negative + edge cases; descriptive names
  (`calculates_discount_when_qty_over_10`). Verify with the project's blast gate.

## XP practices

- Continuous integration (small, frequent), continuous refactoring, simple design
  (KISS+YAGNI), collective ownership, coding standards, small releases. The
  delegate/executor handoff (`agf brief`/`agf submit`) is the pairing analogue here.

## Documentation

- Module docblock explaining the **why** + pointers (agentic navigation); ADRs for
  decisions; docstrings on public APIs; OpenAPI for REST; C4 for structure. No comment-rot.

## Logging & Observability

- Structured logs (JSON), correct levels (DEBUG/INFO/WARN/ERROR), `trace_id`/`correlation_id`
  on every request, never log PII/secrets, actionable messages.
- 3 pillars: Logs (what), Metrics (latency/throughput/errors), Traces (distributed).
  Use the project's logger — never raw stdout in command code (output-contract guard).

## Self-review & quality gates (practice → gate)

Verify the practices; never just claim them. Each bar maps to a concrete `agf` gate run
at close-out (SKILL.md Step 4):

| Practice / bar                                              | Gate that enforces it                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| Clean Code · SOLID · naming · error handling · file/fn size | `agf harness --violations`                                      |
| TDD quality (coverage, assertion diversity)                 | `agf tdd-score <id>` + `agf check <id>`                         |
| Transitive coverage of the change (no regression)           | `npm run test:blast` (standalone)                               |
| Robustness (tests actually catch breakage)                  | `agf check <id> --mutation --source <file>` (kill-ratio ≥ 0.60) |
| Definition of Done (required checks)                        | `agf check <id>` / `agf done <id>`                              |

A self-review pass (~30 tokens) before the gates catches the cheap misses: leftover
placeholder? scope leak? all AC covered? default still intact?

## How this folds into the loop

These are the quality bars the BUILD step honors at GREEN/REFACTOR and the close-out
gates verify before `done`. A failure feeds a pheromone-weighted lesson (see
aco-economy.md) so the next cycle is better — the practices compound, they are not
re-learned each time.
