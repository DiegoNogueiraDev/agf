/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Regression test for node_16111cafed8c: shouldLaunchTui() in src/cli/index.ts
 * calls `program.parseAsync([..., 'tui'])`, but the top-level `commands[]`
 * array never actually registered a 'tui' subcommand — tui-cmd.ts existed and
 * was unit-tested (tui-cmd.test.ts) but was never wired to the Commander
 * program, so `agf` with no args (or anything hitting shouldLaunchTui) failed
 * to route. `commands` itself is a private const (not exported), so this is a
 * static contract test on the source rather than an import-based check.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The commands[] registry was extracted from index.ts to commands-list.ts to
// stay under the 800-line file gate; the tui wiring lives there now, while
// shouldLaunchTui() still routes from index.ts.
const INDEX_SRC = readFileSync(join(process.cwd(), 'src', 'cli', 'index.ts'), 'utf8')
const LIST_SRC = readFileSync(join(process.cwd(), 'src', 'cli', 'commands-list.ts'), 'utf8')

describe('cli — tui command registration', () => {
  it('registers a "tui" entry in the commands[] array, wired to tui-cmd.js', () => {
    expect(LIST_SRC).toMatch(/name:\s*'tui'/)
    expect(LIST_SRC).toContain("import('./commands/tui-cmd.js').then((m) => m.tuiCommand())")
  })

  it('shouldLaunchTui() still routes to the now-registered "tui" subcommand', () => {
    expect(INDEX_SRC).toContain("parseAsync([process.argv[0], process.argv[1], 'tui'])")
  })
})
