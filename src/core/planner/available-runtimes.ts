/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Detects which external runtimes/corpora are present so `agf next` can explain
 * *why* a backlog is stuck (hard-block detection). Pairs with hard-block-detector:
 * a task whose required runtime is absent here is reported as hard-blocked instead
 * of silently sitting unpulled — closing the "loop stuck, no reason given" gap.
 */

import { spawnSync } from 'node:child_process'

export type RuntimeProbe = (runtime: string) => boolean

/**
 * Returns the subset of `candidates` that are actually available.
 *
 * - `node` is implicit — we are running inside it.
 * - `corpus` is a data dependency, not a probeable binary, so it is never
 *   reported available (a corpus-dependent task stays hard-blocked by design).
 * - everything else is probed via `probe`.
 *
 * Pure given `probe` — injectable for tests.
 */
export function detectAvailableRuntimes(candidates: readonly string[], probe: RuntimeProbe): string[] {
  const available: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const rt = candidate.toLowerCase()
    if (seen.has(rt)) continue
    seen.add(rt)
    if (rt === 'node') {
      available.push(rt)
      continue
    }
    if (rt === 'corpus') continue
    if (probe(rt)) available.push(rt)
  }
  return available
}

/** Cross-platform binary probe: `where` on Windows, `which` on POSIX. */
export function defaultRuntimeProbe(runtime: string): boolean {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    return spawnSync(cmd, [runtime], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}
