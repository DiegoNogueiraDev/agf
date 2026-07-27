/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * The whole `agf` surface, flattened: every top-level command and every subcommand under it,
 * with the description commander already knows.
 *
 * WHY this exists: RAG-IN answers "what command does X?" by ranking prose over a corpus. The
 * corpus was built from COMMAND_REGISTRY, a hand-kept list of 58 entries. The CLI exposes 384.
 * Two thirds of the surface was unreachable by retrieval — a capability nobody could find is a
 * capability that ships dormant.
 *
 * WHY it is not called at runtime: walking means importing all 132 command modules (~1.4s), and
 * `agf retrieve-command` answers in ~0.3s. So this walker feeds a generator
 * (`scripts/gen-command-surface.mjs`) that writes a committed manifest, and a drift test fails
 * when the CLI and the manifest disagree. The walk happens in CI, never on the agent's turn.
 *
 * Layering: lives in `cli/` because it imports command modules. `core/rag-in` consumes the
 * generated manifest, never this file.
 */

import type { Command } from 'commander'
import { commands } from './commands-list.js'

/** One invocable path, e.g. `{ path: 'code impact', description: 'Analyze blast radius…' }`. */
export interface SurfaceEntry {
  /** Space-separated command path, without the `agf` prefix. */
  path: string
  description: string
}

/** Commander lists `help` on every group; it is not a capability anyone retrieves. */
const NOT_A_CAPABILITY = new Set(['help'])

/** Depth-first walk of a commander subtree, yielding `parent sub subsub` paths. */
function walkSubcommands(command: Command, prefix: string): SurfaceEntry[] {
  const entries: SurfaceEntry[] = []
  for (const sub of command.commands) {
    const name = sub.name()
    if (NOT_A_CAPABILITY.has(name)) continue
    const path = `${prefix} ${name}`
    entries.push({ path, description: sub.description() })
    entries.push(...walkSubcommands(sub, path))
  }
  return entries
}

/**
 * Load every command module and flatten its tree. Slow by construction (~1.4s): call it from a
 * generator or a test, never from a command an agent is waiting on.
 *
 * A module that fails to load is skipped rather than fatal — a broken command should not erase
 * the other 131 from retrieval. The caller can compare counts to notice.
 */
export async function walkCommandSurface(): Promise<SurfaceEntry[]> {
  const entries: SurfaceEntry[] = []
  for (const { name, description, loader } of commands) {
    try {
      const command = await loader()
      // `commands-list` carries a one-liner so the CLI can print `--help` without loading
      // anything; the command itself usually says more. `agf harness` is "Run harnessability
      // scan" there and "Scan harnessability score (type, test, docs, architecture, naming,
      // errors, context)" here. Retrieval ranks prose, so the longer prose wins.
      entries.push({ path: name, description: richer(description, command.description()) })
      entries.push(...walkSubcommands(command, name))
    } catch {
      // Skipped: this command contributes its eager description and nothing deeper.
      entries.push({ path: name, description })
    }
  }
  return dedupeByPath(entries)
}

/** More words to match against, as long as they are words. */
function richer(eager: string, loaded: string): string {
  const clean = loaded.trim()
  return clean.length > eager.trim().length ? clean : eager
}

/** First description wins — the eager one from commands-list beats a re-declared empty one. */
function dedupeByPath(entries: readonly SurfaceEntry[]): SurfaceEntry[] {
  const seen = new Map<string, SurfaceEntry>()
  for (const entry of entries) {
    const existing = seen.get(entry.path)
    if (!existing || (!existing.description && entry.description)) seen.set(entry.path, entry)
  }
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path))
}
