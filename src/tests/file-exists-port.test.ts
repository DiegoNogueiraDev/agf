/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for makeFileExists — the CLI-shared filesystem probe factory used by the
 * phantom_done triangulation (gaps-cmd audit + done-cmd gate).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFileExists } from '../cli/shared/file-exists-port.js'

describe('makeFileExists', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-file-exists-'))
    writeFileSync(join(dir, 'real.test.ts'), 'export const x = 1\n', 'utf8')
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('resolves a relative path against the project dir → true when it exists', () => {
    expect(makeFileExists(dir)('real.test.ts')).toBe(true)
  })

  it('returns false for a relative path that does not exist', () => {
    expect(makeFileExists(dir)('ghost.test.ts')).toBe(false)
  })

  it('honours an absolute path as-is', () => {
    expect(makeFileExists(dir)(join(dir, 'real.test.ts'))).toBe(true)
    expect(makeFileExists('/nonexistent')(join(dir, 'real.test.ts'))).toBe(true)
  })
})
