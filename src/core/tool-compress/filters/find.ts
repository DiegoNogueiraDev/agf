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
import { FIND_PER_DIR_MAX, FIND_TOTAL_DIR_MAX } from '../constants.js'

/** Compress `find` output — groups paths by directory and truncates per-dir and total counts. */
export function find(input: string): string {
  const lines = input.split('\n').filter((l) => l.trim())
  if (lines.length === 0) return input

  const byDir = new Map<string, string[]>()

  for (const path of lines) {
    const lastSlash = path.lastIndexOf('/')
    let dir: string
    let basename: string
    if (lastSlash === -1) {
      dir = '.'
      basename = path
    } else {
      dir = path.slice(0, lastSlash) || '/'
      basename = path.slice(lastSlash + 1)
    }
    if (!byDir.has(dir)) byDir.set(dir, [])
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    byDir.get(dir)!.push(basename)
  }

  const dirs = Array.from(byDir.keys()).sort()
  let out = `${lines.length} files in ${dirs.length} dirs:\n\n`

  const showDirs = dirs.slice(0, FIND_TOTAL_DIR_MAX)
  for (const dir of showDirs) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const files = byDir.get(dir)!
    out += `${dir}/ (${files.length}):\n`
    const showFiles = files.slice(0, FIND_PER_DIR_MAX)
    for (const f of showFiles) out += `  ${f}\n`
    if (files.length > FIND_PER_DIR_MAX) {
      out += `  +${files.length - FIND_PER_DIR_MAX}\n`
    }
    out += '\n'
  }
  if (dirs.length > FIND_TOTAL_DIR_MAX) {
    out += `+${dirs.length - FIND_TOTAL_DIR_MAX} more dirs\n`
  }

  return out
}

find.filterName = 'find'
