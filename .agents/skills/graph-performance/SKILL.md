---
name: graph-performance
description: Performance engineering audit using Lighthouse, Web Vitals, N+1 query detection, memory profiling, and bundle size analysis
triggers:
  - graph-performance
version: 1.1.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-performance

Performance engineering audit using Lighthouse, Web Vitals, N+1 query detection, memory profiling, and bundle size analysis. Identifies performance bottlenecks across build output, runtime behavior, database queries, memory usage, and frontend metrics.

## When to Use

- Before DEPLOY phase — ensure performance baselines are met
- After major feature implementation — detect regressions early
- When performance complaints arise — systematic root cause analysis
- During VALIDATE for UI features — Web Vitals and Lighthouse audit

## Mandatory Flow

```
build analysis --> bundle size --> runtime profiling --> N+1 detection --> memory check --> Web Vitals --> benchmark comparison --> report --> write_memory
```

## Performance Threshold Reference

Use this table as the pass/warn/critical gate for every audit dimension:

| Metric                          | Target (Pass) | Warning   | Critical |
| ------------------------------- | ------------- | --------- | -------- |
| Build time                      | <30s          | 30-60s    | >60s     |
| JS bundle — landing page (gzip) | <150KB        | 150-250KB | >250KB   |
| JS bundle — app page (gzip)     | <300KB        | 300-450KB | >450KB   |
| JS bundle — microsite (gzip)    | <80KB         | 80-130KB  | >130KB   |
| CSS bundle                      | <30KB         | 30-50KB   | >50KB    |
| Event loop lag                  | <10ms         | 10-50ms   | >50ms    |
| Tool / API response (p95)       | <200ms        | 200-500ms | >500ms   |
| RAG query latency               | <300ms        | 300-800ms | >800ms   |
| FCP                             | <1.5s         | 1.5-3.0s  | >3.0s    |
| LCP                             | <2.5s         | 2.5-4.0s  | >4.0s    |
| CLS                             | <0.1          | 0.1-0.25  | >0.25    |
| Metric regression vs baseline   | <10%          | 10-20%    | >20%     |

## Complexity Decision Guide

From [[clrs-algorithms]] — choose the algorithm tier that fits the data size:

| Data size | Acceptable complexity               | Examples                                   |
| --------- | ----------------------------------- | ------------------------------------------ |
| n < 100   | O(n²) fine                          | Bubble sort, nested loops for small lists  |
| n < 1K    | O(n²) acceptable, prefer O(n log n) | Insertion sort, simple join                |
| n < 100K  | O(n log n) required                 | Merge sort, binary search, heap operations |
| n ≥ 100K  | O(n) or O(n log n) only             | Hash lookups, counting sort, BFS/DFS       |
| n ≥ 1M    | O(n) only                           | Streaming, linear scans, radix sort        |

**Rule of thumb**: if the inner loop touches n items and the outer loop also touches n items, verify n < 1K or replace with a hash-based O(n) approach.

## N+1 Fix Patterns

### Pattern 1 — Promise.all batch (JS/TS async)

```ts
// BEFORE — N+1: one DB call per task
for (const task of tasks) {
  task.node = await store.getNodeById(task.nodeId) // N queries
}

// AFTER — 1 call for all
const nodeIds = tasks.map((t) => t.nodeId)
const nodes = await store.getNodesByIds(nodeIds) // 1 query
const nodeMap = new Map(nodes.map((n) => [n.id, n]))
for (const task of tasks) {
  task.node = nodeMap.get(task.nodeId)
}
```

### Pattern 2 — IN clause grouping (SQL)

```sql
-- BEFORE — N queries
SELECT * FROM nodes WHERE id = $1;  -- called N times

-- AFTER — 1 query
SELECT * FROM nodes WHERE id IN ($1, $2, $3, ...);
```

In SQLite via better-sqlite3:

```ts
const placeholders = ids.map(() => '?').join(',')
const rows = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids)
```

### Pattern 3 — DataLoader pattern (deferred batching)

Use when callers are spread across the codebase and can't be co-located:

```ts
import DataLoader from 'dataloader'
const nodeLoader = new DataLoader(async (ids: readonly string[]) => {
  const rows = await store.getNodesByIds([...ids])
  const map = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => map.get(id) ?? null)
})

// Each caller uses nodeLoader.load(id) — batched automatically per tick
```

Detection signal: `store.getNodeById()` / `db.prepare().get()` inside `for`, `forEach`, or `map`.

## Memory Profiling Toolkit

### Command 1 — Heap snapshot

```bash
node --inspect --inspect-brk src/index.js
# Open chrome://inspect → take heap snapshot before and after a suspected leak
# Sort by "Retained Size" → look for growing arrays, Map, or EventEmitter entries
```

### Command 2 — Continuous heap monitoring

```bash
node --max-old-space-size=512 --expose-gc src/index.js
# Inside code: if (global.gc) global.gc(); then measure process.memoryUsage().heapUsed
```

### Command 3 — Map/Set size instrumentation

```ts
// Add to long-running cache objects
setInterval(() => {
  console.log('[mem]', {
    semanticCache: semanticCache.size,
    queryCache: queryCache.size,
    heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  })
}, 30_000)
```

**What to look for**: monotonically increasing `heapUsed` over 10+ minutes without GC reclaim = leak. Map `.size` growing without bound = missing eviction policy.

## Workflow

**Step 1 — Build**: `time npm run build`. Flag >60s. Check TypeScript warnings and circular deps.

**Step 2 — Bundle**: `du -sh dist/`. Apply **Performance Threshold Reference** table. Flag duplicates and tree-shaking failures.

**Step 3 — Runtime**: Measure via `agf metrics --economy-report` (tokens, cost, cache) and `agf eval --suite <name>` for scenario-level cost-per-success. Flag operations >500ms p95. For React SPA: run Lighthouse.

**Step 4 — N+1**: Apply **N+1 Fix Patterns** above. Search for `store.getNodeById()` / `db.prepare().get()` inside loops. Verify batch queries use `WHERE id IN (...)`.

**Step 5 — Memory**: Apply **Memory Profiling Toolkit** above. Also check: unbounded caches (no `maxSize`/TTL), `on()` without matching `off()`, `fs.open()` without `close()`.

**Step 6 — Web Vitals**: FCP <1.5s · LCP <2.5s · CLS <0.1 · TTI <3.9s. Use Playwright `performance.getEntriesByType('navigation')`.

**Step 7 — Benchmark**: `npm run test:bench`. Flag >20% regression vs baseline from memory.

### Step 8: Performance Report

| Dimension  | Weight | Score Criteria                          |
| ---------- | ------ | --------------------------------------- |
| Build      | 10%    | Time, warnings, incremental             |
| Bundle     | 20%    | Size vs thresholds, no duplicates       |
| Runtime    | 25%    | Response times, event loop lag          |
| Queries    | 20%    | N+1 count, missing indexes, batch usage |
| Memory     | 15%    | Leaks, cache bounds, cleanup            |
| Web Vitals | 10%    | FCP, LCP, CLS, TTI                      |

**Grading:** A (90-100) · B (75-89) · C (60-74) · D (45-59) · F (<45)

Save findings:

```bash
agf memory write performance-audit-<date> --content "<report>"
```

## Anti-Patterns

- Do NOT optimize without measuring first — profile before changing code
- Do NOT micro-optimize — focus on bottlenecks (Pareto 80/20), not hot loops that run once
- Do NOT ignore N+1 queries — they compound under load and are the #1 performance killer
- Do NOT skip memory check — leaks are silent until OOM crashes in production
- Do NOT deploy without bundle size check — bundle regression is common and cumulative
- Do NOT compare without baseline — use benchmark tests and previous audit data from memory
- Do NOT assume O(n²) is fine — verify n is truly small (<1K) before accepting it

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
