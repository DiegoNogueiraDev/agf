/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runHarnessScan } from '../../core/harness/harness-scan-runner.js'

describe('runHarnessScan — robustez em projeto sem src/', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-harness-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('não crasha (ENOENT) quando o projeto não tem src/', () => {
    writeFileSync(join(dir, 'README.md'), '# proj\n', 'utf8')
    expect(() => runHarnessScan(dir)).not.toThrow()
    const result = runHarnessScan(dir)
    expect(result).toBeDefined()
    expect(typeof result.score).toBe('number')
  })
})
