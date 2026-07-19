/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Real I/O adapters for the preflight ports. Kept separate from the pure core
 * (preflight.ts) so the core stays dependency-free and unit-testable. These are
 * exercised via the CLI/E2E tier.
 */

import { execFileSync } from 'node:child_process'
import { searchNodes } from '../search/fts-search.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import type { GitProbe, GraphProbe, DedupeHit } from './preflight.js'

/**
 * execFileSync never invokes a shell — args reach `git` as a literal argv
 * array, so untrusted input (e.g. a user-supplied topic) needs no quoting or
 * escaping on any platform. The prior execSync(`git ${args.join(' ')}`)
 * variant required shell-quoting the one untrusted arg (topic); that quoting
 * was POSIX-specific and would not have held on Windows (different shell
 * metacharacters), a platform agf ships binaries for.
 */
function execGit(args: string[], cwd?: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return null
  }
}

function countLines(out: string | null): number {
  if (!out) return 0
  return out.split('\n').filter(Boolean).length
}

/** Git-history probe backed by the local `git` CLI. All methods are null-safe. */
export const realGitProbe: GitProbe = {
  branch(cwd?: string): string | null {
    return execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  },
  aheadBehind(cwd?: string): { ahead: number; behind: number } {
    // "<behind>\t<ahead>" relative to the upstream; null when no upstream is set.
    const out = execGit(['rev-list', '--left-right', '--count', '@{u}...HEAD'], cwd)
    if (!out) return { ahead: 0, behind: 0 }
    const [behind, ahead] = out.split(/\s+/).map((n) => Number.parseInt(n, 10) || 0)
    return { ahead: ahead ?? 0, behind: behind ?? 0 }
  },
  dirtyCount(cwd?: string): number {
    return countLines(execGit(['status', '--porcelain'], cwd))
  },
  stashCount(cwd?: string): number {
    return countLines(execGit(['stash', 'list'], cwd))
  },
  commitsMatching(topic: string, cwd?: string): Array<{ hash: string; subject: string }> {
    const out = execGit(['log', '--oneline', '-n', '50', '-i', `--grep=${topic}`], cwd)
    if (!out) return []
    return out
      .split('\n')
      .filter(Boolean)
      .slice(0, 8)
      .map((line) => {
        const sp = line.indexOf(' ')
        return {
          hash: sp > 0 ? line.slice(0, sp) : line,
          subject: sp > 0 ? line.slice(sp + 1).slice(0, 160) : '',
        }
      })
  },
}

/** Graph dedupe + WIP probe backed by the SQLite store (FTS search + queryNodes). */
export function makeGraphProbe(store: SqliteStore): GraphProbe {
  return {
    findDuplicates(topic: string): DedupeHit[] {
      // Exact FTS (implicit AND over all terms) — precision over recall. A dedupe
      // guard must avoid false positives: fuzzy fallback over-matches on common
      // words and erodes trust, so it stays off here.
      const results = searchNodes(store, topic, { limit: 8, fuzzy: false })
      return results.map((r) => ({
        id: r.node.id,
        title: r.node.title,
        status: r.node.status,
        score: r.score,
      }))
    },
    listWip(): Array<{ id: string; title: string }> {
      const { nodes } = store.queryNodes({ status: ['in_progress'], limit: 10 })
      return nodes.map((n) => ({ id: n.id, title: n.title }))
    },
  }
}
