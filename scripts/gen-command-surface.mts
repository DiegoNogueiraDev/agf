#!/usr/bin/env npx tsx
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Writes `src/core/rag-in/command-surface.generated.ts` from the live CLI.
 *
 * WHY generated and committed instead of walked at runtime: the walk imports all 132 command
 * modules (~1.4s), and `agf retrieve-command` answers in ~0.3s. Paying five turns' worth of
 * latency on every retrieval to learn something that changes once a week is the wrong trade.
 * So the walk happens here, the result is committed, and `src/tests/command-tree.test.ts`
 * fails the build when the two disagree.
 *
 * Run: npm run gen:command-surface
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkCommandSurface } from '../src/cli/command-tree.js'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core', 'rag-in', 'command-surface.generated.ts')

const HEADER = `/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * GENERATED — do not edit. Run \`npm run gen:command-surface\`.
 *
 * The full agf command surface, flattened, so RAG-IN can retrieve any of it. Derived from the
 * live commander tree by scripts/gen-command-surface.mts; kept honest by
 * src/tests/command-tree.test.ts, which walks the CLI and fails when this file drifts.
 */

/** One invocable command path (no \`agf\` prefix) and the intent RAG-IN ranks against. */
export interface SurfaceEntry {
  path: string
  description: string
}
`

/** A description is prose from commander; it may hold quotes and newlines. JSON escapes both. */
function render(entries: ReadonlyArray<{ path: string; description: string }>): string {
  const rows = entries.map(
    (e) => `  { path: ${JSON.stringify(e.path)}, description: ${JSON.stringify(e.description)} },`,
  )
  return `${HEADER}\nexport const COMMAND_SURFACE: readonly SurfaceEntry[] = [\n${rows.join('\n')}\n]\n`
}

const surface = await walkCommandSurface()
const withoutIntent = surface.filter((e) => !e.description.trim())

writeFileSync(OUT, render(surface), 'utf8')

process.stdout.write(`${surface.length} commands (${surface.filter((e) => e.path.includes(' ')).length} subcommands)\n`)
if (withoutIntent.length > 0) {
  process.stdout.write(
    `${withoutIntent.length} without a description — unrankable: ${withoutIntent.map((e) => e.path).join(', ')}\n`,
  )
}
