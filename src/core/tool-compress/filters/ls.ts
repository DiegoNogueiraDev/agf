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
import { LS_EXT_SUMMARY_TOP, LS_NOISE_DIRS } from '../constants.js'

const LS_DATE_RE = /\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(\d{4}|\d{2}:\d{2})\s+/

function humanSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)}M`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`
  return `${bytes}B`
}

interface LsParsed {
  fileType: string
  size: number
  name: string
}

function parseLsLine(line: string): LsParsed | null {
  const m = LS_DATE_RE.exec(line)
  if (!m) return null
  const name = line.slice(m.index + m[0].length)
  const beforeDate = line.slice(0, m.index)
  const beforeParts = beforeDate.split(/\s+/).filter(Boolean)
  if (beforeParts.length < 4) return null

  const perms = beforeParts[0]
  const fileType = perms.charAt(0)

  let size = 0
  for (let i = beforeParts.length - 1; i >= 0; i--) {
    const n = Number(beforeParts[i])
    if (Number.isInteger(n) && String(n) === beforeParts[i]) {
      size = n
      break
    }
  }
  return { fileType, size, name }
}

/** Compress `ls -la` output: strips noise dirs, groups files by extension, summarises the top-N extensions. */
export function ls(input: string): string {
  const dirs: string[] = []
  const files: Array<[string, string]> = []
  const byExt = new Map<string, number>()

  for (const line of input.split('\n')) {
    if (line.startsWith('total ') || line.length === 0) continue
    const parsed = parseLsLine(line)
    if (!parsed) continue
    if (parsed.name === '.' || parsed.name === '..') continue

    if (LS_NOISE_DIRS.includes(parsed.name)) continue

    if (parsed.fileType === 'd') {
      dirs.push(parsed.name)
    } else if (parsed.fileType === '-' || parsed.fileType === 'l') {
      const dot = parsed.name.lastIndexOf('.')
      const ext = dot > 0 ? parsed.name.slice(dot) : 'no ext'
      byExt.set(ext, (byExt.get(ext) || 0) + 1)
      files.push([parsed.name, humanSize(parsed.size)])
    }
  }

  if (dirs.length === 0 && files.length === 0) return input

  let out = ''
  for (const d of dirs) out += `${d}/\n`
  for (const [name, size] of files) out += `${name}  ${size}\n`

  let summary = `\nSummary: ${files.length} files, ${dirs.length} dirs`
  if (byExt.size > 0) {
    const ext = Array.from(byExt.entries()).sort((a, b) => b[1] - a[1])
    const parts = ext.slice(0, LS_EXT_SUMMARY_TOP).map(([e, c]) => `${c} ${e}`)
    summary += ' (' + parts.join(', ')
    if (ext.length > LS_EXT_SUMMARY_TOP) {
      summary += `, +${ext.length - LS_EXT_SUMMARY_TOP} more`
    }
    summary += ')'
  }

  return out + summary
}

ls.filterName = 'ls'
