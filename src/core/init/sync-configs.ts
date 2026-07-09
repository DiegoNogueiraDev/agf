/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { fingerprintProject, type IdeKind } from './detect.js'
import { emitClaudeSettings } from './emit-claude-config.js'
import { emitClaudeMd } from './emit-claude-md.js'

import type { ScaffoldChange } from './scaffold.js'

export interface ConfigSyncOptions {
  readonly force?: boolean
  /** Override the IDE detection — useful for `--ide vscode` overrides. */
  readonly ides?: ReadonlyArray<IdeKind>
  /** When true, compute changes but never write to disk. */
  readonly dryRun?: boolean
}

export interface ConfigSyncResult {
  readonly cwd: string
  readonly ides: ReadonlyArray<IdeKind>
  readonly changes: ReadonlyArray<ScaffoldChange>
}

/**
 * Coordinator: emits every config file the project should have, given its
 * detected IDE set. Idempotent — re-running on a synced project yields
 * `skipped-noop` for everything.
 *
 * CLI-first: NO `.mcp.json` / `.vscode/mcp.json` / `.cursor/mcp.json` are
 * emitted — the pivot drives everything through the `agf` CLI, zero MCP.
 *
 * Always emits:
 *   - `.claude/settings.local.json`
 *   - a starter `CLAUDE.md` (only when absent)
 */
export function syncConfigs(cwd: string, opts: ConfigSyncOptions = {}): ConfigSyncResult {
  const fp = fingerprintProject(cwd)
  const ides = opts.ides ?? fp.ides
  const changes: ScaffoldChange[] = []

  const passthrough = { force: opts.force, dryRun: opts.dryRun }
  changes.push(emitClaudeSettings(cwd, passthrough))
  // Drop a starter CLAUDE.md only when one is not already present (the emitter
  // is idempotent, returning skipped-existing). Kept in the change list so
  // dry-run surfaces the would-be created entry.
  if (!opts.dryRun) {
    changes.push(emitClaudeMd(cwd))
  }

  return { cwd, ides, changes }
}

export interface ConfigCheckResult {
  readonly inSync: boolean
  readonly drift: ReadonlyArray<ScaffoldChange>
}

/**
 * Dry-run: reports which files would change if `syncConfigs` ran.
 * Never touches the filesystem.
 */
export function checkConfigs(cwd: string): ConfigCheckResult {
  const { changes } = syncConfigs(cwd, { dryRun: true })
  const drift = changes.filter((c) => c.action !== 'skipped-noop' && c.action !== 'skipped-existing')
  return { inSync: drift.length === 0, drift }
}
