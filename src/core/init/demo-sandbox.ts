/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type ScaffoldResult, scaffoldProject } from './scaffold.js'

export interface DemoSandbox {
  readonly path: string
  readonly scaffold: ScaffoldResult
  cleanup(): void
}

/**
 * Create an ephemeral demo project under `~/.mcp-graph/demos/<timestamp>-<rand>/`.
 *
 * Returns the sandbox path + a `cleanup()` function the caller can wire to
 * SIGINT/exit to remove the directory. We deliberately put it under `~/.mcp-graph/`
 * (not the OS tmpdir) so users can revisit the sandbox after the CLI exits if
 * they want to keep poking at it — `cleanup()` is opt-in.
 */
export function createDemoSandbox(): DemoSandbox {
  const root = join(homedir(), '.mcp-graph', 'demos')
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomSlug()}`
  const path = join(root, stamp)

  mkdirSync(path, { recursive: true })
  const scaffold = scaffoldProject(path)

  let cleaned = false
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    try {
      rmSync(path, { recursive: true, force: true })
    } catch (err) {
      void err // best-effort; never throw on cleanup
    }
  }

  return { path, scaffold, cleanup }
}

function randomSlug(): string {
  return Math.random().toString(36).slice(2, 8)
}
