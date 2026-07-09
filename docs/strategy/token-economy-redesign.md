# Token Economy Redesign

Status: v0.13 (active) | Last updated: 2026-06-05

## Philosophy

agent-graph-flow is designed from the ground up for **brutally low, predictable token costs**. Every architectural decision is evaluated through the lens of "how many tokens does this consume per task?"

## Core Architecture

### Three Pillars of Token Economy

1. **Deterministic Execution Graph** — Tasks are decomposed into a persistent SQLite graph. The agent traverses the graph deterministically rather than prompting an LLM for "what's next" on every cycle.

2. **Context Compaction** — `context()` replaces full `export()` in 73% of cases. Instead of sending the entire graph state to the LLM, only the relevant context window is compacted. PageRank-ranked repo-map keeps context at ~1k tokens.

3. **Diff-edits** — Rather than regenerating entire files, the system uses surgical diff edits (`apply_patch`). This eliminates retransmission of unchanged code.

### Tiered Model Routing

`TieredModelClient` routes tasks to the cheapest model capable of handling them:

- **Tier 1 (cheap):** Simple parsing, formatting, validation
- **Tier 2 (mid):** Code generation, analysis
- **Tier 3 (premium):** Architecture decisions, PRD synthesis

### Prompt Caching (deferred)

Infrastructure exists in `anthropic-cache-control.ts` and `llm_call_ledger` cache columns. Deferred per ADR `docs/decisions/0001-prompt-caching-deferred.md` because the current Copilot SDK adapter path does not expose `cache_control`. Will be wired when a direct provider adapter (Anthropic Messages API) is added.

### Token Ledger

`TokenLedger` tracks per-task token consumption in `llm_call_ledger`:

- `$/task` metrics for cost prediction
- Budget tracking with alerts at 80% threshold
- Circuit breaker on cost overruns

## Key Components

| Component         | Location                 | Role                             |
| ----------------- | ------------------------ | -------------------------------- |
| TieredModelClient | `src/core/llm/`          | Routes to cheapest capable model |
| TokenLedger       | `src/core/economy/`      | Tracks and predicts costs        |
| LLMCallLedger     | SQLite `llm_call_ledger` | Persistent call records          |
| ContextCompactor  | `src/core/context/`      | Reduces context window size      |
| DiffRenderer      | `src/core/`              | Surgical diff edits              |
| RepoMap           | `src/core/context/`      | PageRank-ranked file summaries   |

## Design Decisions

1. **No streaming by default** — Streaming costs more tokens (response chunks are padded). Reserved for TUI live feedback only.
2. **No React dashboard** — The Ink-based TUI consumes 0 tokens for rendering. A web dashboard would require SSR/CSR tokens.
3. **Deterministic-first** — Handlers operate via graph traversal, zero LLM calls. Skills that need reasoning are gated and budgeted.
4. **Single-pass context** — The agent gets one compact context window per task, not a conversation history. This prevents token creep over multi-turn interactions.

## Future Work

- Wire prompt caching when adapter path supports it (see ADR 0001)
- Implement tiered/deferred tool responses (RFC section 6.2/6.4)
- Sync OpenRouter prices for dynamic model selection
- Multi-provider failover with cost-aware routing
