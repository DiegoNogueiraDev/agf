/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/tests-rules/vitest-scaffold-atomic.ts — hasVitest.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hasVitest } from '../core/tests-rules/vitest-scaffold-atomic.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'vitest-scaffold-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('hasVitest', () => {
  it('returns false when there is no package.json', () => {
    expect(hasVitest(dir)).toBe(false)
  })

  it('detects vitest in devDependencies', async () => {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }))
    expect(hasVitest(dir)).toBe(true)
  })

  it('returns false when vitest is absent from deps', async () => {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^18' } }))
    expect(hasVitest(dir)).toBe(false)
  })
})
