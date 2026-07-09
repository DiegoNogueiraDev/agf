---
name: graph-performance
description: Performance engineering audit — build time, bundle size, runtime profiling, N+1 query detection, memory leaks, and Web Vitals. Run before DEPLOY, after major features, or on perf complaints.
triggers:
  - graph-performance
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-performance

Performance audit across build output, runtime, DB queries, memory, and frontend metrics. Drive via the `agf` CLI — zero MCP.

## When to Use

- Before DEPLOY — confirm perf baselines
- After major features — catch regressions early
- On perf complaints — systematic root cause
- During VALIDATE for UI — Web Vitals + Lighthouse

## Mandatory Flow

```
build analysis → bundle size → runtime profiling → N+1 detection → memory check → Web Vitals → benchmark → report → agf memory write
```

## Workflow

### Step 1: Build Analysis

```bash
time npm run build
```

- Record build duration; check TS warnings/deprecations
- Compare with prior builds (`agf memory read`)
- Flag builds >60s — investigate large modules or circular deps

### Step 2: Bundle Size

```bash
du -sh dist/
```

- Flag total >500KB; find largest files
- Catch un-tree-shaken deps, dev-only deps leaking to prod, duplicate packages, unnecessary transitive deps

### Step 3: Runtime Profiling

Node backend:

- Event loop lag, async timing
- Tool response times via `agf metrics`; RAG trace latency
- Flag any op consistently >500ms

Dashboard (React SPA):

- Lighthouse (perf score, FCP, LCP, CLS)
- React re-render counts; lazy-loading effectiveness for heavy tabs

### Step 4: N+1 Query Detection

Code patterns:

- `db.prepare().get()/.all()` inside loops
- `store.getNodeById()/getEdgeById()` inside `for`/`forEach`/`map`
- Sequential `await store.X()` inside iteration
- Flag functions making >5 DB calls per call

SQLite:

- Batch ops use `WHERE id IN (...)` not per-row queries
- Transactions wrap multi-writes
- Missing indexes on hot columns

### Step 5: Memory & Resources

- Unbounded caches — verify `maxSize`/TTL (SemanticCache, ResponseCache, QueryCache)
- Maps/Sets growing without eviction in long-running procs
- Event listeners — every `on()`/`addEventListener()` has matching cleanup
- File handles — `fs.open()` paired with `close()`, or use `readFile`/`writeFile`
- SQLite — `db.close()` on shutdown and in test cleanup
- Streams — destroyed on error

### Step 6: Web Vitals (UI)

| Metric | Good  | Needs Improvement | Poor  |
| ------ | ----- | ----------------- | ----- |
| FCP    | <1.8s | 1.8–3.0s          | >3.0s |
| LCP    | <2.5s | 2.5–4.0s          | >4.0s |
| CLS    | <0.1  | 0.1–0.25          | >0.25 |
| TTI    | <3.9s | 3.9–7.3s          | >7.3s |

If Playwright is available, automate via `performance.getEntriesByType('navigation')`. Check layout shifts from async loads without skeleton states.

### Step 7: Benchmark Comparison

- Run `npm run test:bench` if present
- DORA via `agf forecast` for lead time / deploy frequency trends
- Compare build time, bundle size, test duration with prior audit (`agf memory read`)
- Flag any metric >20% regression; establish baseline if none

### Step 8: Report

| Dimension  | Weight | Criteria                              |
| ---------- | ------ | ------------------------------------- |
| Build      | 10%    | Time, warnings, incremental           |
| Bundle     | 20%    | Size, tree-shaking, no dupes          |
| Runtime    | 25%    | Response times, event loop lag        |
| Queries    | 20%    | N+1 count, missing indexes, batch use |
| Memory     | 15%    | Leaks, cache bounds, cleanup          |
| Web Vitals | 10%    | FCP, LCP, CLS, TTI                    |

**Grades:** A (90–100) all in thresholds, no N+1, no leaks · B (75–89) minor issues · C (60–74) some N+1/memory · D (45–59) multiple failing · F (<45) blocking.

Save: `agf memory write "perf-audit-<date>" --content <report>`

## Output Format

```
Phase: PERFORMANCE AUDIT
Build: <N>s, <N> warnings
Bundle: <N>KB (<N> files, largest: <name> <N>KB)
Runtime: <N>/100 (avg <N>ms, p95 <N>ms)
N+1: <N> (<N> critical, <N> warning)
Memory: <N> issues (<N> unbounded caches, <N> leaked listeners)
Web Vitals: FCP <N>s, LCP <N>s, CLS <N>, TTI <N>s
Benchmark: <N> regressions (>20%)
Grade: <A-F> (<N>/100)
Recommendations: <top 3>
Saved: "perf-audit-<date>"
```

## Anti-Patterns

- Don't optimize without measuring — profile first
- Don't micro-optimize — fix bottlenecks (80/20), not run-once loops
- Don't ignore N+1 — they compound under load (#1 killer)
- Don't skip memory check — leaks are silent until OOM
- Don't deploy without bundle check — regressions are cumulative
- Don't compare without a baseline

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
