/*!
 * TDD: per-failure remediation hints map (node_6cacb5d21f6c).
 *
 * AC: Given STORE_NOT_FOUND, when rendered, then the hint contains 'agf init'.
 */

import { describe, it, expect } from 'vitest'
import { runSelfCheck } from '../core/doctor/self-check.js'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('per-failure remediation hints', () => {
  it('STORE_NOT_FOUND fix hint contains agf init', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hints-'))
    const result = await runSelfCheck(dir)

    const dbCheck = result.checks.find((c) => c.name === 'db')
    expect(dbCheck?.code).toBe('STORE_NOT_FOUND')
    expect(dbCheck?.fix).toMatch(/agf init/)
  })

  it('ok checks have no fix field', async () => {
    // Node version check always passes in current runtime
    const dir = mkdtempSync(join(tmpdir(), 'agf-hints-ok-'))
    const result = await runSelfCheck(dir)

    const nodeCheck = result.checks.find((c) => c.name === 'node-version')
    expect(nodeCheck?.level).toBe('ok')
    expect(nodeCheck?.fix).toBeUndefined()
  })
})
