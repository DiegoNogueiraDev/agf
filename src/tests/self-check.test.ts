/*!
 * TDD: self-check aggregates doctor probes → verdict (node_8a2da125ef23).
 *
 * AC: Given all probes pass, when self-check runs, then verdict == 'PASS'.
 */

import { describe, it, expect } from 'vitest'
import { runSelfCheck } from '../core/doctor/self-check.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeValidDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-self-check-'))
  const dbDir = join(dir, 'workflow-graph')
  mkdirSync(dbDir, { recursive: true })
  writeFileSync(join(dbDir, 'graph.db'), 'SQLite format 3') // stub file
  return dir
}

describe('self-check report', () => {
  it('returns PASS verdict when db is reachable and Node version is current', async () => {
    const dir = makeValidDir()
    const result = await runSelfCheck(dir)

    // db + node checks must pass
    const dbCheck = result.checks.find((c) => c.name === 'db')
    const nodeCheck = result.checks.find((c) => c.name === 'node-version')
    expect(dbCheck?.level).toBe('ok')
    expect(nodeCheck?.level).toBe('ok')
    // Overall verdict: PASS (no errors)
    expect(result.verdict).toBe('PASS')
    expect(result.summary).toMatch(/PASS/)
  })

  it('returns FAIL verdict when db is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-self-check-no-db-'))
    const result = await runSelfCheck(dir)

    const dbCheck = result.checks.find((c) => c.name === 'db')
    expect(dbCheck?.level).toBe('error')
    expect(dbCheck?.code).toBe('STORE_NOT_FOUND')
    expect(result.verdict).toBe('FAIL')
    expect(result.summary).toMatch(/FAIL/)
  })

  it('result has checks array with expected probe names', async () => {
    const dir = makeValidDir()
    const result = await runSelfCheck(dir)

    const names = result.checks.map((c) => c.name)
    expect(names).toContain('db')
    expect(names).toContain('node-version')
    expect(names).toContain('git')
    expect(names).toContain('providers')
  })
})
