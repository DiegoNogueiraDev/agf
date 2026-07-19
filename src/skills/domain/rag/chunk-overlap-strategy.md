---
domain: rag
topic: chunk-overlap-strategy
triggers: [retrieval_quality, lost_context, chunk_boundary]
discovered_at: 2026-04-28T00:00:00.000Z
source_task: seed
confidence: 0.75
---

# Chunk Overlap Strategy

Default to ~15% overlap between adjacent chunks. Information at chunk
boundaries gets lost when there's no overlap; queries that span the cut
return either chunk and miss the bridging context.

## When to apply

- Retrieval quality drops on multi-sentence reasoning.
- Tables, code blocks, or definitions span chunk boundaries.
- Citations point to the wrong chunk by one position.

## Sizing rule

- Token budget for a chunk: 256–512 tokens.
- Overlap: 15% of chunk size (38–76 tokens).
- For code chunks, prefer overlapping by full statements, not byte counts —
  splitting an `if/else` block in half makes both chunks unhelpful.
