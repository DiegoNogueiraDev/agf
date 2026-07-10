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
import { SEARCH_LIST_PER_DIR_MAX, SEARCH_LIST_TOTAL_DIR_MAX } from '../constants.js'

const HEADER_RE = /^Result of search in '[^']*' \(total (\d+) files?\):/

/** Compress search-list output by capping per-directory results to `SEARCH_LIST_PER_DIR_MAX` and total directories to `SEARCH_LIST_TOTAL_DIR_MAX`. */
export function searchList(input: string): string {
  const lines = input.split('\n')
  if (lines.length === 0) return input

  const header = lines[0] || ''
  const rest = lines.slice(1)

  const paths: string[] = []
  for (const raw of rest) {
    const t = raw.trim()
    if (!t.startsWith('- ')) continue
    paths.push(t.slice(2))
  }
  if (paths.length === 0) return input

  const byDir = new Map<string, string[]>()
  for (const p of paths) {
    const slash = p.lastIndexOf('/')
    const dir = slash === -1 ? '.' : p.slice(0, slash) || '/'
    const name = slash === -1 ? p : p.slice(slash + 1)
    if (!byDir.has(dir)) byDir.set(dir, [])
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    byDir.get(dir)!.push(name)
  }

  const dirs = Array.from(byDir.keys()).sort()
  let out = `${header}\n${paths.length} files in ${dirs.length} dirs:\n\n`

  for (const dir of dirs.slice(0, SEARCH_LIST_TOTAL_DIR_MAX)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const names = byDir.get(dir)!
    out += `${dir}/ (${names.length}):\n`
    for (const n of names.slice(0, SEARCH_LIST_PER_DIR_MAX)) out += `  ${n}\n`
    if (names.length > SEARCH_LIST_PER_DIR_MAX) {
      out += `  +${names.length - SEARCH_LIST_PER_DIR_MAX}\n`
    }
    out += '\n'
  }
  if (dirs.length > SEARCH_LIST_TOTAL_DIR_MAX) {
    out += `+${dirs.length - SEARCH_LIST_TOTAL_DIR_MAX} more dirs\n`
  }

  return out.replace(/\n+$/, '')
}

searchList.filterName = 'search-list'
export const SEARCH_LIST_HEADER_RE = HEADER_RE
