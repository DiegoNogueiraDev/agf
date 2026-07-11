/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runResolvedTestGate } from '../core/runner/execute-test-gate.js'

describe('runResolvedTestGate — execution-grounded test gate + receipt', () => {
  it('ran=false / passed=true when no runner is detected (empty dir, no explicit)', () => {
    const res = runResolvedTestGate('/nonexistent-dir-xyzzy-9912', [])
    expect(res.ran).toBe(false)
    expect(res.passed).toBe(true)
    expect(res.receipt).toBeNull()
  })

  it('passes and emits a receipt when the resolved command exits 0', () => {
    const res = runResolvedTestGate(process.cwd(), [], 'true')
    expect(res.ran).toBe(true)
    expect(res.passed).toBe(true)
    expect(res.exitCode).toBe(0)
    expect(typeof res.receipt).toBe('string')
    expect(res.receipt!.length).toBeGreaterThan(0)
  })

  it('fails (passed=false, exitCode!=0) when the resolved command exits non-zero', () => {
    const res = runResolvedTestGate(process.cwd(), [], 'false')
    expect(res.ran).toBe(true)
    expect(res.passed).toBe(false)
    expect(res.exitCode).not.toBe(0)
  })

  it('receipt is deterministic for the same run descriptor', () => {
    const a = runResolvedTestGate(process.cwd(), [], 'true')
    const b = runResolvedTestGate(process.cwd(), [], 'true')
    expect(a.receipt).toBe(b.receipt)
  })

  describe('monorepo sub-package cwd inference (node_a49c06cacc7a)', () => {
    let dir: string

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it("runs from the sub-package's own directory, not the repo root, when testFiles point at it", () => {
      dir = mkdtempSync(join(tmpdir(), 'agf-gate-subpkg-'))
      mkdirSync(join(dir, 'frontend'), { recursive: true })
      const marker = join(dir, 'cwd-marker.txt')
      // The test script writes its own $PWD to a marker file — proves which
      // cwd the gate actually ran from, not just that something exited 0.
      writeFileSync(
        join(dir, 'frontend/package.json'),
        JSON.stringify({ scripts: { test: `node -e "require('fs').writeFileSync('${marker}', process.cwd())"` } }),
      )

      const res = runResolvedTestGate(dir, ['frontend/probe.test.ts'])
      expect(res.ran).toBe(true)
      expect(res.passed).toBe(true)

      // Compare basenames, not full paths: macOS resolves /tmp -> /private/tmp
      // inside the spawned process, which would falsely fail a full-path match.
      const recordedCwd = readFileSync(marker, 'utf-8')
      expect(recordedCwd.endsWith('/frontend')).toBe(true)
    })
  })
})
