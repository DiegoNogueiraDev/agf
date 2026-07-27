/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/hooks/providers/cursor.ts — importCursorRules.
 * The function is pure: it only reads .cursor/rules and reports what it found,
 * leaving persistence to the caller.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { importCursorRules } from '../core/hooks/providers/cursor.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cursor-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('importCursorRules', () => {
  it('returns null rules and imported=0 when .cursor/rules is absent', () => {
    const result = importCursorRules({ source: path.join(dir, 'rules') })

    expect(result.provider).toBe('cursor')
    expect(result.rulesText).toBeNull()
    expect(result.imported).toBe(0)
  })

  it('reads the rules file content and reports imported=1 when present', async () => {
    const source = path.join(dir, 'rules')
    await writeFile(source, 'Always prefer immutable updates.')

    const result = importCursorRules({ source })

    expect(result.rulesText).toBe('Always prefer immutable updates.')
    expect(result.imported).toBe(1)
    expect(result.source).toBe(source)
  })
})
