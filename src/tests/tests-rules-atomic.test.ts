/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/tests-rules/tests-rules-atomic.ts — registerTestsRules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { registerTestsRules } from '../core/tests-rules/tests-rules-atomic.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'tests-rules-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('registerTestsRules', () => {
  it('creates the .claude/rules directory under the project', () => {
    registerTestsRules(dir)
    expect(existsSync(path.join(dir, '.claude', 'rules'))).toBe(true)
  })

  it('is idempotent — a duplicate registration does not throw', () => {
    registerTestsRules(dir)
    expect(() => registerTestsRules(dir)).not.toThrow()
  })
})
