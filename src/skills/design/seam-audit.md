---
name: seam-audit
description: Classify dependencies into 4 seams to plan substitution + testability
category: design
phases: [DESIGN, REVIEW]
---

# seam-audit

## When to use

When a module is hard to test, brittle to change, or coupled to a vendor SDK. Categorize each import to know where to put a stand-in.

## Steps

1. Run `agf code impact <path>` to classify imports.
2. For each `true-external` (e.g. anthropic, openai), wrap behind an adapter; never import in core.
3. For each `local-substitutable` (better-sqlite3, fs), inject through an interface so tests get a stand-in.
4. For `remote-owned` (axios, MCP), enforce timeout + retry policy.
5. `in-process` imports stay free; consider merging if only one consumer.

## Anti-patterns

- Hiding SDK clients in core under "convenience" wrappers.
- Mocking `fs` with `vi.mock` instead of injecting; brittle to refactors.
- Untested timeouts on remote-owned (default infinite hangs).
