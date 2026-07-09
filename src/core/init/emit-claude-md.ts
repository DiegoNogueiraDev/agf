/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Emit a starter CLAUDE.md template at the project root pointing at the
 * `agf <cmd>` CLI workflow. CLI-first — zero MCP.
 *
 * Idempotent: skipped when CLAUDE.md already exists (we never overwrite
 * the user's project memory). Triggered from sync-configs when the
 * project doesn't yet have one.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ScaffoldChange } from './scaffold.js'

const CLAUDE_MD_BASE = `# CLAUDE.md

This project uses **agent-graph-flow** for structured execution. The CLI
binary is \`agf\` — drive everything through it (there is NO MCP server).
Slash commands inside Claude Code mirror the same surface — see \`agf help\`.

## Daily loop

1. \`agf next\` — pick the next unblocked task (pull, WIP=1).
2. \`agf start\` — wake-up + context + mark in_progress.
3. Implement with TDD (red → green → refactor).
4. \`agf check <id>\` — Definition of Done + AC + TDD adherence.
5. \`agf done <id>\` — store memory + mark done + suggest next.

## Where to look

- Tasks live in \`workflow-graph/graph.db\` (local SQLite). Use
  \`agf query\` / \`agf node show <id>\` to browse, \`agf status\` for the
  1-screen overview, \`agf kanban\` for the board.
- Reconcile state with \`agf stats\` / \`agf insights\` before planning.
- Configs are emitted by \`agf init\` (CLI-first context files per CLI).

## Graph operations (all via \`agf\`, zero MCP)

- Create/mutate: \`agf node add\`, \`agf node status <id> <state>\`,
  \`agf edge add <from> <to>\`, \`agf import-prd <file>\`.
- Inspect: \`agf context <id>\`, \`agf search "<q>"\`, \`agf export\`.
- Memory/snapshot: \`agf memory write|read|list\`, \`agf snapshot create\`.
- Quality: \`agf check <id>\`, \`agf harness\`, \`agf gate <phase>\`, \`agf forecast\`.

## Conventions

- Branch: feature branches off master; release-please manages
  versioning + CHANGELOG.
- Commits: conventional-commits (\`feat(scope):\`, \`fix(scope):\`, …)
  with a Signed-off-by trailer.
- Tests: vitest, TDD-first; tests live in \`src/tests/\` or alongside
  the module they cover (\`*.test.ts\`).

## Need more?

- \`agf help\` — full command catalogue (grouped index).
- \`agf <comando> --help\` — focused help + flags.
- \`agf skill list\` / \`agf skill show <name>\` — lifecycle skills.
- \`AGENTS.md\` — skill catalogue.

> Customize this file. Anything you add stays.
`

const CLAUDE_MD_TEMPLATE = CLAUDE_MD_BASE + '\n'

export function emitClaudeMd(cwd: string): ScaffoldChange {
  const path = join(cwd, 'CLAUDE.md')
  if (existsSync(path)) {
    return { path, action: 'skipped-existing', bytes: 0 }
  }
  writeFileSync(path, CLAUDE_MD_TEMPLATE, 'utf8')
  return { path, action: 'created', bytes: Buffer.byteLength(CLAUDE_MD_TEMPLATE) }
}
