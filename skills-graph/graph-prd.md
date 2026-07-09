---
name: graph-prd
description: Turn a vague idea into a structured PRD (5W2H, JTBD, MoSCoW, INVEST, GWT, Risk)
trigger: /graph-prd
tools_used: [import-prd, gate]
tokens: ~600
---

<!-- shared:phases -->

# graph-prd

Pre-lifecycle phase: idea → import-ready PRD with 7 product methods.

## When

- Feature/product idea with no written PRD
- Before ANALYZE — PRD must exist for `agf import-prd`
- Want a high `agf gate analyze` score

## Flow

```
5W2H → JTBD → Brainstorm+Pareto → MoSCoW → INVEST → Given-When-Then → Risk Matrix → PRD.md → agf import-prd → $graph-analyze
```

## Steps

### 1. Vision & Context (5W2H)

Ask: What (product/problem), Why, Who (users/stakeholders), Where (platform), When (timeline), How (tech), How much (budget). Consolidate into a "Vision" section.

### 2. Jobs-to-be-Done (JTBD)

Functional, emotional, social jobs. Each: situation → motivation → expected outcome.

### 3. Brainstorm + Pareto 80/20

List candidate features. Keep the top 20% delivering 80% of value. Drop/defer the rest.

### 4. MoSCoW

Must (MVP), Should (next increment), Could (if time), Won't (out of scope).

### 5. INVEST Decomposition

For each Must/Should: Independent, Negotiable, Valuable, Estimable, Small, Testable. Split features that violate INVEST.

### 6. Given-When-Then AC

BDD format: `Given [context], When [action], Then [result]`. Min 1 AC/feature, max 7/task.

### 7. Risk Matrix

Risks (tech, product, schedule, dependency): probability (1-5), impact (1-5), mitigation. Prioritize score ≥ 12.

### 8. Generate PRD.md

Compile: Vision, JTBD, Features (MoSCoW + INVEST), AC (GWT), Risks, Constraints. Save as `.md`.

### 9. Import

`agf import-prd <file>.md` — zero nodes → revise structure; ok → `$graph-analyze`.

## Exit

- [ ] PRD.md with all 7 methods
- [ ] `agf import-prd` produces ≥ 5 nodes
- [ ] `agf gate analyze` score ≥ 60

Loop: PRD imported → next: graph-analyze.
