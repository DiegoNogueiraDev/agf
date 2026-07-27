/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Command surface — single source of truth for the registered `agf` command
 * names, derived from the CLI registry in `src/cli/commands-list.ts`.
 *
 * Why parse the source instead of importing it: keeping this in `core/` means it
 * must not import from `cli/` (layering). Parsing the registry block
 * (`export const commands: ... = [ ... ]`) is a deterministic, zero-dep,
 * side-effect-free derivation used by the context-coverage drift guard. It runs
 * against the source tree (tests, dev), not the bundled `dist/`.
 *
 * The registry lived in `cli/index.ts` until it was extracted to
 * `commands-list.ts` to stay under the 800-line file gate; this parser follows.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { McpGraphError } from '../utils/errors.js'

/** Absolute path to the CLI module that holds the command registry. */
function commandsListPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../cli/commands-list.ts')
}

/** Extract the `const commands … = [ … ]` registry block from the CLI source. */
function registryBlock(): string {
  const src = readFileSync(commandsListPath(), 'utf-8')
  const start = src.indexOf('const commands')
  if (start < 0) throw new McpGraphError('command registry not found in cli/commands-list.ts')
  // The array is the tail of the module (no bounding `for` loop as in index.ts),
  // so slice to EOF.
  return src.slice(start)
}

/** Every top-level `agf` command name, deduped, in registry order. */
export function listCommandNames(): string[] {
  const names = [...registryBlock().matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])
  return [...new Set(names)]
}

/** Render the full command surface as a deterministic Markdown table. */
export function buildCommandSurface(): string {
  const entries = [...registryBlock().matchAll(/name:\s*'([^']+)',\s*\n\s*description:\s*'([^']*)'/g)].map((m) => ({
    name: m[1],
    desc: m[2],
  }))
  return [
    '| Comando | O que faz |',
    '|---------|-----------|',
    ...entries.map((e) => `| \`agf ${e.name}\` | ${e.desc} |`),
  ].join('\n')
}
