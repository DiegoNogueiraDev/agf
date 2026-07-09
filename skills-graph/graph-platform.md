---
name: graph-platform
description: Platform audits — Test Pyramid + FIRST, Web Vitals + N+1 + bundle, WCAG 2.2 AA + ARIA, Harness score, Kanban
trigger: /graph-platform
tools_used: [harness, check, metrics, forecast, kanban, insights, memory]
tokens: ~900
---

<!-- shared:principles,errors,harness -->

# graph-platform

Integrated platform audit: tests, performance, accessibility, harness engineering, kanban.

## When

- VALIDATE/REVIEW — full audits before ship
- DEPLOY gate — harness ≥ 70 mandatory
- `$graph-platform` or "platform audit", "test audit", "performance check", "accessibility", "harness", "kanban"

## Flow

```
test audit → perf audit → a11y audit → harness scan → kanban → report → agf memory write
```

---

## Test Audit (Pyramid + FIRST)

1. **Suite Gate:** `npm test` — zero failures, else STOP.
2. **Coverage:** statements/branches/functions/lines ≥ 70%.
3. **Pyramid:** target 70% unit / 20% integration / 10% E2E. Flag if E2E > unit.
4. **FIRST:** Fast (no >5s tests), Independent (no shared/ordered state), Repeatable (no unseeded random/Date, no flaky), Self-validating (asserts not console.log), Timely (TDD).
5. **Quality:** descriptive names (`it("should X when Y")`), 1 assert/test, edge cases (null, empty, boundary).

---

## Performance Audit (Web Vitals + N+1 + Bundle)

1. **Bundle:** `npx tsup --silent && ls -lh dist/` — chunks > 100KB? Tree-shaking effective?
2. **Vitals:** FCP < 1.8s, LCP < 2.5s, CLS < 0.1, TTI < 3.8s.
3. **N+1:** loops with SQLite queries, `forEach` + `store.getNode()`, un-batched queries. `agf insights`.
4. **Memory:** unbounded caches (Map no TTL), listeners without cleanup, unclosed file handles, unbounded arrays.
5. **Benchmark:** vs prior baseline. Regression > 10% → flag.

---

## Accessibility Audit (WCAG 2.2 AA)

1. **POUR:** Perceivable (text alternatives, captions, contrast), Operable (keyboard, time, seizure-safe, navigable), Understandable (readable, predictable, input help), Robust (assistive-tech compatible).
2. **ARIA:** correct roles/properties/states, input labels, image alt, heading hierarchy (no skipped levels).
3. **Keyboard:** logical tab order, visible focus, skip links, modal focus traps.
4. **Contrast:** normal ≥ 4.5:1, large ≥ 3:1. `agf check <id>`.
5. **Screen Reader:** `agf check <id>` — Playwright + axe-core.

---

## Harness Engineering

| Dimension            | Weight | CLI                                     |
| -------------------- | ------ | --------------------------------------- |
| Type Coverage        | 25%    | `agf harness`                           |
| Test Coverage        | 25%    | Coverage report                         |
| Architecture Fitness | 15%    | `agf insights` (coupling) + layer check |
| Docs Coverage        | 10%    | CLAUDE.md, README, rules/, docs/        |
| Naming Clarity       | 10%    | Descriptive names (no data/result/temp) |
| Error Handling       | 5%     | Typed errors, no empty catch            |
| Context Density      | 5%     | JSDoc on exports                        |
| Provenance           | 5%     | Nodes with source_file receipt          |

Grades: A≥85, B≥70, C≥55, D<55. Deploy gate: B (≥70) mandatory. `agf harness` (scan → trend → advice).

---

## Kanban Board

- **View:** `agf kanban` — swimlane per epic.
- **WIP (Little's Law):** WIP = 1/agent. cycle_time = WIP/throughput. Flag violations.
- **Bottleneck (TOC):** find the most-loaded column. VALIDATE piling up → stop IMPLEMENT, focus VALIDATE.
- **Suggestions:** `agf kanban` — unblock, wip_violation, bottleneck_alert, promote_ready, start_next.
- **Flow Metrics:** `agf metrics` — throughput, cycle/lead time, blocked %. Target flow efficiency > 40%.

## Exit

- [ ] Test suite green, coverage ≥ 70%
- [ ] Performance: 0 regressions > 10%
- [ ] A11y: 0 critical WCAG violations
- [ ] Harness score documented (≥ 70 for deploy)
- [ ] Kanban WIP ≤ 1, no critical bottlenecks
- [ ] Report saved via `agf memory write`

Loop: audits pass → next: graph-deploy.
