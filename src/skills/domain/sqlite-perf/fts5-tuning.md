---
domain: sqlite-perf
topic: fts5-tuning
triggers: [slow_search, fts5_queries, search_relevance]
discovered_at: 2026-04-28T00:00:00.000Z
source_task: seed
confidence: 0.78
---

# FTS5 Tuning

`bm25()` ranking + `unicode61` tokenizer + content-rowid linking is the
default fast path. Use external content tables to avoid double-storing.

## When to apply

- Search queries scan thousands of rows.
- Relevance ranking feels off (BM25 needs explicit weights per column).
- Index size is bloating the database.

## Tips

- Rebuild the FTS index after bulk inserts: `INSERT INTO fts(fts) VALUES('rebuild');`
- Use `MATCH` with prefix tokens (`foo*`) instead of `LIKE`.
- For Portuguese/Spanish content, append `remove_diacritics 1` to the tokenizer.
