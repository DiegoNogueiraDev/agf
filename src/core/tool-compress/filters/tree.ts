/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */
import { TREE_MAX_LINES } from '../constants.js'

/** Compress `tree`-command output by filtering redundant directory/file labels and capping at `TREE_MAX_LINES`. */
export function tree(input: string): string {
  const lines = input.split('\n')
  if (lines.length === 0) return input

  const filtered: string[] = []
  for (const line of lines) {
    if (line.includes('director') && line.includes('file')) continue
    if (line.trim() === '' && filtered.length === 0) continue
    filtered.push(line)
  }

  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
    filtered.pop()
  }

  if (filtered.length > TREE_MAX_LINES) {
    const cut = filtered.length - TREE_MAX_LINES
    return filtered.slice(0, TREE_MAX_LINES).join('\n') + `\n... +${cut} more lines`
  }

  return filtered.join('\n')
}

tree.filterName = 'tree'
