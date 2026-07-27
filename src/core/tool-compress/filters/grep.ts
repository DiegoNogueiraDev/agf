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
import { GREP_PER_FILE_MAX } from '../constants.js'

/** Compress `grep` output by grouping matches per file and capping to `GREP_PER_FILE_MAX` lines per file. */
export function grep(input: string): string {
  const byFile = new Map<string, Array<[string, string]>>()
  let total = 0

  for (const line of input.split('\n')) {
    const first = line.indexOf(':')
    if (first === -1) continue
    const second = line.indexOf(':', first + 1)
    if (second === -1) continue
    const file = line.slice(0, first)
    const lineNumStr = line.slice(first + 1, second)
    const content = line.slice(second + 1)
    if (!/^\d+$/.test(lineNumStr)) continue
    total++
    if (!byFile.has(file)) byFile.set(file, [])
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    byFile.get(file)!.push([lineNumStr, content])
  }

  if (total === 0) return input

  const files = Array.from(byFile.keys()).sort()
  let out = `${total} matches in ${files.length}F:\n\n`

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const matches = byFile.get(file)!
    out += `[file] ${file} (${matches.length}):\n`
    const show = matches.slice(0, GREP_PER_FILE_MAX)
    for (const [lineNum, content] of show) {
      out += `  ${lineNum.padStart(4)}: ${content.trim()}\n`
    }
    if (matches.length > GREP_PER_FILE_MAX) {
      out += `  +${matches.length - GREP_PER_FILE_MAX}\n`
    }
    out += '\n'
  }

  return out
}

grep.filterName = 'grep'
