---
name: graph-architecture
description: Architecture governance using C4 Model, ADR lifecycle, Architecture Fitness Functions, layer boundary enforcement, and drift detection
triggers:
  - graph-architecture
version: 1.1.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-architecture

Architecture governance using C4 Model (Context, Container, Component, Code), ADR lifecycle management, Architecture Fitness Functions, layer boundary enforcement, and architecture drift detection. Ensures the system's documented architecture stays aligned with the actual codebase over time.

## When to Use

- During DESIGN phase for new features
- Quarterly architecture reviews
- When coupling analysis shows degradation
- When onboarding new developers to understand system structure
- Before major refactors

## Mandatory Flow

```
C4 context → C4 container → C4 component → ADR inventory → fitness functions → layer boundaries → drift detection → report → write_memory
```

## Workflow

### Step 1: C4 Context Diagram

Map the system's external boundaries. Identify: users (developers, AI agents), external systems (GitHub, Context7, Playwright, SQLite), and the system under audit itself. Generate the mermaid diagram with `agf export --format mermaid --direction LR`. Document: who uses the system, what external dependencies exist, what data flows in/out.

### Step 2: C4 Container Diagram

Map internal containers: CLI (Commander.js), MCP Server (tools), REST API (Express), Dashboard (React), SQLite Store, Knowledge Store, Code Intelligence Engine. For each container: technology, responsibility, communication protocols. Verify containers match `src/` directory structure (`cli/`, `mcp/`, `api/`, `web/`, `core/store/`, `core/code/`).

### Step 3: C4 Component Diagram

For each container, map key components. Core modules: `parser/`, `importer/`, `planner/`, `context/`, `rag/`, `search/`, `insights/`, `integrations/`. Verify component boundaries: `core/` never imports from `cli/` or `mcp/` (dependency direction rule from CLAUDE.md). Use `agf code impact <file>` and `agf code callers <file:line>` for real dependency analysis.

### Step 4: ADR Inventory & Lifecycle

List the decision nodes with `agf query --type decision --limit 50 --select data.nodes`, and the
markdown ADRs with `agf adr list`. Verify each ADR has: Status (Proposed/Accepted/Deprecated/Superseded),
Context, Decision, Consequences. Check for stale ADRs (decisions no longer relevant). A missing decision
is authored with `agf adr create "<title>"`; the principles it must respect come from `agf constitution list`.

### Step 5: Architecture Fitness Functions

Define automated checks that verify architecture properties hold:

| Function                 | Tool                                                | What It Checks                          |
| ------------------------ | --------------------------------------------------- | --------------------------------------- |
| No circular dependencies | `agf harness --violations --select data.violations` | Dependency graph is acyclic             |
| Layer isolation          | `npm run test:import-boundary`                      | `core/` doesn't import `mcp/` or `cli/` |
| Coupling score           | `agf harness --select data.breakdown.fitness`       | Module coupling within thresholds       |
| Interface completeness   | `agf harness --select data.breakdown.types`         | Public contracts fully typed            |
| Reachable from a surface | `agf harness --select data.breakdown.connectivity`  | No capability ships dormant             |

Score each fitness function pass/fail. See **Fitness Function Scoring Table** below for thresholds.

### Step 6: Layer Boundary Enforcement

Verify the dependency direction rule: `schemas/` <- `core/` <- `mcp/` <- `cli/`. Check for violations: grep for imports that cross layer boundaries in the wrong direction. Flag: core importing from mcp, schemas importing from core, cli containing business logic. Cross-reference with CLAUDE.md rules. See **Layer Violation Remediation** below when violations are found.

### Step 7: Architecture Drift Detection

Compare current codebase structure with documented architecture (C4 diagrams, ADRs). Detect: new modules not in any diagram, deprecated modules still in use, component responsibilities that shifted, new external dependencies not documented. Run `agf code index` to refresh the symbol index, then `agf gaps --kind design_drift --json` for drift the graph can prove and `agf gaps --kind phantom_done --json` for nodes whose files never landed. Apply **Architecture Drift Severity** thresholds below.

### Step 8: Architecture Report

Score per dimension (C4 completeness, ADR quality, fitness functions, layer compliance, drift). Generate updated C4 diagrams as mermaid. List architectural debt items. Save with `agf memory write architecture-audit-<date> --content "<report>"`, and file each debt item as `agf node add --type risk`.

## Fitness Function Scoring Table

Numeric thresholds for each automated architecture check. [[pragmatic-programmer]] Tip 59 — test early, test automatically.

| Metric                          | Pass | Warn     | Fail | Fix                                           |
| ------------------------------- | ---- | -------- | ---- | --------------------------------------------- |
| Circular dependency count       | 0    | —        | ≥1   | Break cycle via interface or move module      |
| Layer violation count           | 0    | —        | ≥1   | See Layer Violation Remediation               |
| Module coupling score (0–1)     | ≤0.3 | 0.31–0.5 | >0.5 | Extract shared abstraction; invert dependency |
| Interface completeness          | 100% | 80–99%   | <80% | Add missing type contracts                    |
| Undocumented external deps      | 0    | 1        | ≥2   | Add ADR or update C4 container diagram        |
| Stale ADRs (>90 days, Proposed) | 0    | 1        | ≥2   | Accept, reject, or supersede                  |

Overall: all pass = A, one warn = B, one fail = C, two+ fails = D/F.

---

## ADR Quality Rubric

Score each ADR 0–2 per criterion (max 10 points). [[pragmatic-programmer]] "There Are No Best Practices" — always record context and forces.

| Criterion        | 0       | 1                           | 2                                               |
| ---------------- | ------- | --------------------------- | ----------------------------------------------- |
| **Context**      | Missing | Vague situation description | Clear problem statement with constraints        |
| **Forces**       | Missing | One force listed            | ≥2 competing forces (cost, speed, correctness…) |
| **Decision**     | Missing | States what but not why     | States what + why this option over others       |
| **Alternatives** | Missing | One alternative named       | ≥2 alternatives with brief trade-off each       |
| **Consequences** | Missing | Only positive outcomes      | Both positive and negative consequences listed  |

- **8–10**: High quality — publish and link to affected modules
- **5–7**: Acceptable — add missing sections before next review
- **0–4**: Block merge — incomplete ADR provides false confidence

---

## Architecture Drift Severity

How many new undocumented modules or changes constitute real drift. [[humble-continuous-delivery]] — the pipeline fails fast; architecture governance should too.

| Signal                                  | Severity | Action                                           |
| --------------------------------------- | -------- | ------------------------------------------------ |
| 1 new undocumented module               | Monitor  | Note in next review; update C4 if it stabilizes  |
| 3+ new undocumented modules             | Flag     | Update C4 diagrams before next feature work      |
| Any layer violation                     | Block    | Do not merge; apply Layer Violation Remediation  |
| Deprecated module still imported        | Flag     | Schedule removal; create ADR if intentional keep |
| Component responsibility shift (no ADR) | Flag     | Write ADR retroactively; re-score quality        |
| New external dependency, no ADR         | Block    | Write ADR; add to C4 container diagram           |

---

## Layer Violation Remediation

When a violation of the `schemas/ ← core/ ← mcp/ ← cli/` rule is found, apply fixes in this order (lowest effort first):

1. **Move to correct layer** — if the import simply belongs in a different module, move it. No new abstraction needed. Best for: accidental misplacement.
2. **Dependency Inversion** — introduce an interface in the lower layer; the upper layer implements it. The lower layer depends on the abstraction, not the concrete upper module. Best for: core needing a capability that lives in mcp.
3. **Adapter layer** — create a thin adapter module that translates between layers without leaking internal structure. Best for: third-party integrations or legacy seams where inversion is impractical.
4. **Extract shared module** — if two layers both need the same code, extract it into `schemas/` or a new `shared/` module that both import. Best for: utility code duplicated across layers.

Never leave a violation with only a comment — board it up with a tracked issue and a target date ([[pragmatic-programmer]] Broken Window Theory).

---

## Early Decay Signals

Five broken-window signals that predict architectural decay before metrics degrade. [[pragmatic-programmer]] Tip 4 — fix or board up every sign of neglect immediately.

1. **TODO imports** — `// TODO: move this to core` comments in boundary-crossing imports. Signal: engineers know the violation exists but it wasn't fixed.
2. **God module growth** — a single module's line count or dependency count grows faster than the rest of the codebase. Signal: responsibilities are collapsing inward.
3. **Test isolation failures** — unit tests that require spinning up more than one layer to pass. Signal: layer isolation is already broken at the code level.
4. **ADR graveyard** — more than 20% of ADRs in Proposed status older than 30 days. Signal: decision-making is stalling; architecture is drifting without governance.
5. **Dependency version skew** — the same external library imported at different versions in different modules. Signal: modules are diverging; shared contracts are eroding.

When any signal appears: log it, assign an owner, set a resolution date. Do not normalize it.

---

## Anti-Patterns

- Do NOT document architecture only once — it drifts
- Do NOT skip C4 Context — it defines system boundaries
- Do NOT create ADRs without Consequences section — trade-offs matter
- Do NOT ignore layer boundary violations — they compound into spaghetti
- Do NOT skip fitness functions — automated checks catch drift early
- Do NOT let ADRs go stale — review quarterly
- Do NOT over-architect — document what exists, not what you wish existed

## Cross-References

- [[pragmatic-programmer]] — Broken Window Theory, Orthogonality, Ubiquitous Automation, DRY at architectural scale
- [[humble-continuous-delivery]] — Deployment pipeline as fitness function model; fail-fast gates; DORA metrics for delivery health

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
