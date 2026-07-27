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
import { STATUS_MAX_FILES, STATUS_MAX_UNTRACKED } from '../constants.js'

/**
 * Extract untracked file paths from `git status --porcelain` output. Shared
 * by {@link gitStatus} (compression summary) and done-cmd.ts's auto-stage
 * check (a declared implementationFile/testFile that is untracked would
 * otherwise trip NO_FILES_MODIFIED even though it's correctly declared).
 */
export function parseUntrackedFiles(input: string): string[] {
  const untracked: string[] = []
  for (const raw of input.split('\n')) {
    if (raw.slice(0, 2) === '??') untracked.push(raw.slice(3))
  }
  return untracked
}

/** Compress `git status` output — reduces verbose listing to branch + staged/unstaged/untracked counts. */
export function gitStatus(input: string): string {
  const lines = input.split('\n')
  if (lines.length === 0 || (lines.length === 1 && !lines[0].trim())) {
    return 'Clean working tree'
  }

  let branch = ''
  const stagedFiles: string[] = []
  const modifiedFiles: string[] = []
  const untrackedFiles: string[] = parseUntrackedFiles(input)
  let staged = 0
  let modified = 0
  let untracked = 0
  let conflicts = 0

  for (const raw of lines) {
    if (!raw.trim()) continue

    const longBranch = raw.match(/^On branch (\S+)/)
    if (longBranch) {
      branch = longBranch[1]
      continue
    }

    if (raw.startsWith('##')) {
      branch = raw.replace(/^##\s*/, '')
      continue
    }

    if (raw.length >= 3 && /^[ MADRCU?!][ MADRCU?!] /.test(raw)) {
      const x = raw[0]
      const y = raw[1]
      const file = raw.slice(3)

      if (raw.slice(0, 2) === '??') {
        untracked++
        continue
      }

      if ('MADRC'.includes(x)) {
        staged++
        stagedFiles.push(file)
      } else if (x === 'U') {
        conflicts++
      }

      if (y === 'M' || y === 'D') {
        modified++
        modifiedFiles.push(file)
      }
      continue
    }

    const longMatch = raw.match(/^\s*(modified|new file|deleted|renamed|both modified):\s+(.+)$/)
    if (longMatch) {
      const kind = longMatch[1]
      const path = longMatch[2].trim()
      if (kind === 'both modified') {
        conflicts++
      } else if (kind === 'modified' || kind === 'deleted') {
        modified++
        modifiedFiles.push(path)
      } else if (kind === 'new file' || kind === 'renamed') {
        staged++
        stagedFiles.push(path)
      }
      continue
    }
  }

  let out = ''
  if (branch) out += `* ${branch}\n`

  if (staged > 0) {
    out += `+ Staged: ${staged} files\n`
    for (const f of stagedFiles.slice(0, STATUS_MAX_FILES)) out += `   ${f}\n`
    if (stagedFiles.length > STATUS_MAX_FILES) {
      out += `   ... +${stagedFiles.length - STATUS_MAX_FILES} more\n`
    }
  }

  if (modified > 0) {
    out += `~ Modified: ${modified} files\n`
    for (const f of modifiedFiles.slice(0, STATUS_MAX_FILES)) out += `   ${f}\n`
    if (modifiedFiles.length > STATUS_MAX_FILES) {
      out += `   ... +${modifiedFiles.length - STATUS_MAX_FILES} more\n`
    }
  }

  if (untracked > 0) {
    out += `? Untracked: ${untracked} files\n`
    for (const f of untrackedFiles.slice(0, STATUS_MAX_UNTRACKED)) out += `   ${f}\n`
    if (untrackedFiles.length > STATUS_MAX_UNTRACKED) {
      out += `   ... +${untrackedFiles.length - STATUS_MAX_UNTRACKED} more\n`
    }
  }

  if (conflicts > 0) {
    out += `conflicts: ${conflicts} files\n`
  }

  if (staged === 0 && modified === 0 && untracked === 0 && conflicts === 0) {
    out += 'clean — nothing to commit\n'
  }

  return out.replace(/\n+$/, '')
}

gitStatus.filterName = 'git-status'
