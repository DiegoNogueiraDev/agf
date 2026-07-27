# 0003 — Reversible CCR: local-first on agf's SQLite/FTS5/tree-sitter (headroom as reference)

- **Status:** Accepted
- **Date:** 2026-06-15
- **Graph:** epic `node_a99f0ab04248` ("Reversible CCR — finish agf compress-cache-retrieve")

## Context

`../headroom` (Apache-2.0) is a context-compression layer whose standout capability is **reversible
compression (CCR — Compress-Cache-Retrieve)**: compress aggressively, keep the original in a local
store, and let the agent retrieve the full version on demand via a `headroom_retrieve` tool — zero
data loss. The owner asked whether we should reuse it, and emphasized keeping agf **local-first**.

Two facts shaped the decision:

1. **agf already locally reproduces headroom's content-router.** `src/core/economy/content-router.ts`
   routes by content type (code→tool-compress lossless, json→summarizer, log→dedup, text→caveman) and
   `src/core/economy/lossy-gate.ts` auto-reverts when compression breaks meaning. The router is not
   the gap.
2. **agf stubbed CCR but never built it.** `harness-lever-policy.ts` exposes a `ccr: boolean` flag,
   `economy-lever-ledger.ts` already tracks a `ccr_dropped` outcome, and `lossy-gate.ts` declares
   `GateOutcome.ccr_dropped` — but there is no CCR store, no marker injection, and no `retrieve`
   command.
3. **headroom's npm package is a client only** — it requires a running Python proxy (port 8787) plus
   model downloads (Kompress-v2). That conflicts with agf's local-first / zero-non-JS-toolchain /
   zero-infra constraints.

## Decision

**Build reversible CCR natively in TypeScript, 100% local-first, on agf's existing primitives** —
better-sqlite3 (the original store), FTS5/BM25 (query-within-original), tree-sitter (AST-aware code
compression), the content-router, and the lossy-gate's already-wired `ccr_dropped` outcome. Treat
headroom strictly as the **reference** for the contract (its `ccr/tool_injection.py` retrieve
semantics and marker format), never as a runtime dependency.

- **In:** CCR store, marker injection + lossy-gate wiring, `agf retrieve <hash> [--query]`, enabling
  the existing `ccr` lever, SmartCrusher-style JSON crushing, AST-aware code compression.
- **Optional / non-default:** an opt-in `agf compress --headroom` proxy bridge for users who want
  headroom's Kompress ML, off by default with graceful fallback.
- **Deferred / out:** bundling the Kompress-v2 ML model (model download breaks local-first); adopting
  headroom's MCP server (agf is zero-MCP — retrieval is exposed as a native command + slash-command).

## Consequences

- agf gains zero-data-loss aggressive compression with no external infra, advancing the token-cost
  pillar while honoring local-first. The `ccr_dropped` ledger column and policy flag finally have an
  implementation behind them.
- The proxy/ML path stays available but explicitly second-class, so the default install adds no
  Python/Rust/model dependency.
- Reference coupling to headroom is documentation-only; if headroom's contract changes, agf is
  unaffected.

## References

- headroom: `headroom/ccr/tool_injection.py`, `headroom/transforms/smart_crusher.py`,
  `headroom/transforms/content_router.py`, `sdk/typescript/`, `docs/content/docs/ccr.mdx`.
- agf: `src/core/economy/content-router.ts`, `lossy-gate.ts`, `economy-lever-ledger.ts`,
  `harness-lever-policy.ts`, `src/core/store/sqlite-store.ts`.
- Supersedes nothing; complements `0001-prompt-caching-deferred.md` and `0002-token-levers-b-c.md`.
