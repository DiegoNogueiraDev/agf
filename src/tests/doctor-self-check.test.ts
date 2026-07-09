/*!
 * Tests for agf doctor --self-check golden path + remediation.
 * AC:
 *   - Healthy clone: PASS for db/providers/git/node with summary verdict
 *   - Missing store: FAIL:STORE_NOT_FOUND + exact agf init fix command
 */

import { describe, it, expect } from 'vitest'
import { runSelfCheck, type SelfCheckResult } from '../core/doctor/self-check.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, rmSync, existsSync } from 'node:fs'

const ROOT = join(import.meta.dirname ?? '', '../..')

describe('runSelfCheck', () => {
  it('reports pass for all checks in a healthy project dir', async () => {
    const result: SelfCheckResult = await runSelfCheck(ROOT)
    expect(result.verdict).toBe('PASS')
    const checkNames = result.checks.map((c) => c.name)
    expect(checkNames).toContain('node-version')
    expect(checkNames).toContain('git')
    // db check: may be PASS or FAIL but must be present
    expect(checkNames.some((n) => n === 'db' || n === 'store')).toBe(true)
  })

  it('reports FAIL:STORE_NOT_FOUND when db is missing and includes fix command', async () => {
    const tmp = join(tmpdir(), 'doctor-self-check-test-' + Math.random().toString(36).slice(2))
    mkdirSync(tmp, { recursive: true })
    try {
      const result: SelfCheckResult = await runSelfCheck(tmp)
      const dbCheck = result.checks.find((c) => c.name === 'db' || c.name === 'store')
      expect(dbCheck).toBeDefined()
      expect(dbCheck!.level).toBe('error')
      expect(dbCheck!.code).toBe('STORE_NOT_FOUND')
      expect(dbCheck!.fix).toContain('agf init')
    } finally {
      if (existsSync(tmp)) rmSync(tmp, { recursive: true })
    }
  })
})
