---
name: graph-prd
description: 'Phase 0 of the agf lifecycle — turn a vague idea into a structured, import-ready PRD. Use when a request has no epic, no tasks and no acceptance criteria yet, and someone must decide what is worth building before anyone writes code. Applies 5W2H, JTBD, Pareto 80/20, MoSCoW, INVEST, Given-When-Then and a Risk Matrix, then emits a document `agf import-prd` can ingest. Drive it through the `agf` CLI — zero MCP. Does NOT implement. Triggers — graph-prd, escrever PRD, criar PRD, estruturar ideia, o que vale a pena construir, definir escopo, write a PRD, shape an idea.'
---

# graph-prd

Phase 0 — turn a vague idea into a structured, import-ready PRD using 7 methodologies: 5W2H, JTBD, Pareto 80/20, MoSCoW, INVEST, Given-When-Then, Risk Matrix. Drive via the `agf` CLI — zero MCP.

## When to Use

- Starting from a vague idea with no PRD yet
- Before ANALYZE when no PRD document exists
- Want structured requirements covering all angles
- Want a PRD that scores high on `agf gate analyze`

## Mandatory Flow

```
5W2H → JTBD → Brainstorm+Pareto → MoSCoW → INVEST → Given-When-Then → Risk Matrix → PRD.md → `agf import-prd <file> --dry-run` → $graph-analyze
```

Pre-lifecycle: does NOT change `agf phase`. Transition to ANALYZE happens via `$graph-analyze`.

## Workflow

### Step 1: Vision & Context (5W2H)

Ask the 7 questions as one block:

- **What** — product/feature? problem solved?
- **Why** — why now? business justification?
- **Who** — target users? stakeholders?
- **Where** — platform, environment, infra?
- **When** — timeline? MVP deadline? phased?
- **How** — high-level approach? key tech?
- **How Much** — constraints (team, budget, token limits)?

Synthesize a 2–3 sentence Vision Statement; confirm with user.

### Step 2: Jobs-to-be-Done

Extract user jobs: the job hired for, the current workaround (what gets "fired"), the success outcome. Format: **"When [situation], I want to [motivation], so I can [outcome]."** Present 2–5 for review.

### Step 3: Feature Brainstorm + Pareto (80/20)

Brainstorm ALL features (no filter). Then rate Value (1–10) and Effort (1–10), compute Value/Effort ratio, present sorted, highlight top 20%:

```
| Feature | Value | Effort | Ratio | Pareto? |
|---------|-------|--------|-------|---------|
| ...     | 9     | 3      | 3.0   | TOP 20% |
```

Confirm the shortlist.

### Step 4: MoSCoW

Categorize all features:

- **Must** — can't launch without (Priority 1–2)
- **Should** — important, not blocking (Priority 3)
- **Could** — nice to have, first to cut (Priority 4)
- **Won't** — out of scope this version (excluded)

Only Must + Should proceed.

### Step 5: Epic & Story Decomposition (INVEST)

Group Must+Should into Epics (`##` headings); decompose each into Tasks (`###`). Validate each task: **I**ndependent, **N**egotiable, **V**aluable, **E**stimable (`**Tamanho:** XS|S|M|L|XL`), **S**mall (decompose if L/XL), **T**estable.

Task metadata:

```
**Tamanho:** S
**Prioridade:** 2
**Tags:** auth, security
**Depende de:** Task 1.1
```

### Step 6: Acceptance Criteria (Given-When-Then)

Write testable AC per task. Primary — GWT:

```
**Criterios de aceite:**
- GIVEN user on login page WHEN enters valid credentials THEN receives JWT token
- GIVEN invalid password WHEN login attempted THEN shows error
```

Alternative — checklist:

```
**Criterios de aceite:**
- [ ] User can enter email and password
- [ ] System validates against database
- [ ] JWT returned with 1h expiry
```

Target 2–3 AC/task, each testable (concrete values, observable outcomes).

### Step 7: Risk & Constraint Analysis

Risks (Probability × Impact):

```
| Risk | Probability | Impact | Severity | Mitigation |
|------|------------|--------|----------|------------|
| ...  | Alta       | Alto   | Critical | ...        |
```

≥2 risks; mitigation for each High/Critical.

Constraints — technical, business, regulatory (stack, performance, compatibility). ≥2.

### Step 8: PRD Generation

Assemble the parser-compatible markdown:

```markdown
# PRD: <Title>

## Visao Geral

<Vision> <JTBD statements>

## Fase 1 — <Phase Name>

### Epic: <Name>

<Description>

#### Task N.M: <Title>

<Description>
**Tamanho:** S
**Prioridade:** 2
**Tags:** tag1, tag2
**Depende de:** Task X.Y
**Criterios de aceite:**
- GIVEN x WHEN y THEN z

## Riscos

### Risk: <Name>

<Description>. Probabilidade: Alta. Impacto: Alto.
Mitigacao: <strategy>

## Restricoes

### Constraint: <Name>

<Description>
```

**Parser contract:** `##` = Epics · `###`/`####` = Tasks/subtasks · `**Criterios de aceite:**` label required · `**Tamanho:**`/`**Prioridade:**`/`**Depende de:**` for metadata · Risk/Constraint keywords the classifier recognizes.

Save to `docs/_internal/prd/<kebab-name>.md`.

### Step 9: Dry Run

```
agf import-prd docs/_internal/prd/<name>.md --dry-run
```

Verify: epics detected, tasks have AC, risks/constraints found, deps inferred. Iterate and re-run if needed.

### Step 10: Transition

```
PRD ready at docs/_internal/prd/<name>.md
Next: $graph-analyze to import and begin the 9-phase lifecycle.
```

## Output Format

```
Phase: PRD (Phase 0 — Pre-lifecycle)
Methodologies: 5W2H, JTBD, Pareto, MoSCoW, INVEST, GWT, Risk Matrix
File: docs/_internal/prd/<name>.md
Epics: N · Tasks: M with AC · Risks: K · Constraints: J
Dry-run: `agf import-prd --dry-run` — X nodes extracted
Quality: `agf gate analyze` target ≥ 70/100
Next: $graph-analyze
```

## Loop Link

PRD (Phase 0) → ANALYZE: `agf import-prd <file>` then `$graph-analyze` imports it and starts the lifecycle.

## Anti-Patterns

- Don't skip methodology steps — each feeds the next
- Don't write code or make architecture decisions — that's DESIGN
- Don't run `agf import-prd` without `--dry-run` first
- Don't change `agf phase` — pre-lifecycle; transition via `$graph-analyze`
- Don't generate the PRD without user confirmation at each step
- Don't use `##` for tasks — `##` = epics, `###`/`####` = tasks
- Don't skip risk/constraint sections — ~30% of prd_quality score
- Don't omit `**Criterios de aceite:**` labels
- Don't produce vague AC — use concrete GWT with measurable outcomes

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
