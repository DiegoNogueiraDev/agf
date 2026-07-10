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
import { GIT_DIFF_HUNK_MAX_LINES } from '../constants.js'

/** Compress `git diff` output — skips unchanged hunks and truncates large diffs to `maxLines`. */
export function gitDiff(diff: string, maxLines = 500): string {
  const result: string[] = []
  let currentFile = ''
  let added = 0
  let removed = 0
  let inHunk = false
  let hunkShown = 0
  let hunkSkipped = 0
  let wasTruncated = false
  const maxHunkLines = GIT_DIFF_HUNK_MAX_LINES

  const lines = diff.split('\n')

  outer: for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (hunkSkipped > 0) {
        result.push(`  ... (${hunkSkipped} lines truncated)`)
        wasTruncated = true
        hunkSkipped = 0
      }
      if (currentFile && (added > 0 || removed > 0)) {
        result.push(`  +${added} -${removed}`)
      }
      const parts = line.split(' b/')
      currentFile = parts.length > 1 ? parts.slice(1).join(' b/') : 'unknown'
      result.push(`\n${currentFile}`)
      added = 0
      removed = 0
      inHunk = false
      hunkShown = 0
    } else if (line.startsWith('@@')) {
      if (hunkSkipped > 0) {
        result.push(`  ... (${hunkSkipped} lines truncated)`)
        wasTruncated = true
        hunkSkipped = 0
      }
      inHunk = true
      hunkShown = 0
      result.push(`  ${line}`)
    } else if (inHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        added += 1
        if (hunkShown < maxHunkLines) {
          result.push(`  ${line}`)
          hunkShown += 1
        } else {
          hunkSkipped += 1
        }
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removed += 1
        if (hunkShown < maxHunkLines) {
          result.push(`  ${line}`)
          hunkShown += 1
        } else {
          hunkSkipped += 1
        }
      } else if (hunkShown < maxHunkLines && !line.startsWith('\\')) {
        if (hunkShown > 0) {
          result.push(`  ${line}`)
          hunkShown += 1
        }
      }
    }

    if (result.length >= maxLines) {
      result.push('\n... (more changes truncated)')
      wasTruncated = true
      break outer
    }
  }

  if (hunkSkipped > 0) {
    result.push(`  ... (${hunkSkipped} lines truncated)`)
    wasTruncated = true
  }

  if (currentFile && (added > 0 || removed > 0)) {
    result.push(`  +${added} -${removed}`)
  }

  if (wasTruncated) {
    result.push('[full diff: tool-compress git diff --no-compact]')
  }

  return result.join('\n')
}

gitDiff.filterName = 'git-diff'
