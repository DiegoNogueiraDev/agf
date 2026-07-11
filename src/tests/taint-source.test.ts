/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for taint-source — analyzeTaint wired into `agf scan` as the 'taint' source.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanTaint } from '../core/scan/taint-source.js'

describe('scanTaint — heuristic source→sink taint analysis wired into agf scan', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-taint-'))
    mkdirSync(join(dir, 'src'), { recursive: true })
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('flags an unsanitized req.body -> execSync flow as a scan finding', () => {
    writeFileSync(join(dir, 'src', 'risky.ts'), ['const cmd = req.body.cmd', 'execSync(cmd)', ''].join('\n'))

    const findings = scanTaint(dir)
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings[0].source).toBe('taint')
    expect(findings[0].file).toBe('src/risky.ts')
    expect(findings[0].message).toMatch(/req\.body/i)
  })

  it('returns no findings for clean code with no source/sink pairs', () => {
    writeFileSync(join(dir, 'src', 'clean.ts'), 'export const x = 1\n')
    expect(scanTaint(dir)).toEqual([])
  })

  it('excludes test files from the scan', () => {
    writeFileSync(join(dir, 'src', 'risky.test.ts'), ['const cmd = req.body.cmd', 'execSync(cmd)', ''].join('\n'))
    expect(scanTaint(dir)).toEqual([])
  })
})
