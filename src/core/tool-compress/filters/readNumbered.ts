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
import { SMART_TRUNCATE_HEAD, SMART_TRUNCATE_TAIL, SMART_TRUNCATE_MIN_LINES } from '../constants.js'

const LINE_RE = /^\s*\d+\|/

/** Compress numbered-file output (line-prefixed by `Read`) keeping the first `SMART_TRUNCATE_HEAD` and last `SMART_TRUNCATE_TAIL` lines with a gap marker. */
export function readNumbered(input: string): string {
  const lines = input.split('\n')
  if (lines.length < SMART_TRUNCATE_MIN_LINES) return input

  const head = lines.slice(0, SMART_TRUNCATE_HEAD)
  const tail = lines.slice(lines.length - SMART_TRUNCATE_TAIL)
  const cut = lines.length - head.length - tail.length

  return [...head, `... +${cut} lines truncated (file continues)`, ...tail].join('\n')
}

readNumbered.filterName = 'read-numbered'
export const READ_NUMBERED_LINE_RE = LINE_RE
