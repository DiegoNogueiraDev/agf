/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Static contract test for the hive proof-of-value scorecard (a DOCS deliverable).
 * Asserts the artifact exists and cites the REAL measured numbers — not estimates —
 * so the proof can't silently rot into vague claims.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SCORECARD = join(process.cwd(), 'docs', 'proof', 'hive-scorecard.md')

describe('hive scorecard — proof-of-value artifact', () => {
  it('exists on disk', () => {
    expect(existsSync(SCORECARD)).toBe(true)
  })

  it('reports the harness grade for the foreign repo', () => {
    const md = readFileSync(SCORECARD, 'utf8')
    expect(md).toMatch(/harness/i)
    expect(md).toMatch(/grade[^\n]*\bA\b/i)
  })

  it('lists the biggest oversized file caught by lint-files (agent_loop.py 4501)', () => {
    const md = readFileSync(SCORECARD, 'utf8')
    expect(md).toContain('agent_loop.py')
    expect(md).toContain('4501')
  })

  it('cites the REAL oversized-file count (73), not an estimate', () => {
    const md = readFileSync(SCORECARD, 'utf8')
    expect(md).toContain('73')
    // must state the total scanned so the ratio is verifiable, not hand-waved
    expect(md).toContain('998')
  })

  it('gives the reproduce commands so the numbers are auditable', () => {
    const md = readFileSync(SCORECARD, 'utf8')
    expect(md).toMatch(/agf lint-files --dir/)
    expect(md).toMatch(/agf init --graph-only/)
  })
})
