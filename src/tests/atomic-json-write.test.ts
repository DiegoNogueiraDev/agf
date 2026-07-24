/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { atomicJsonWrite } from '../core/utils/atomic-json-write.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'atomic-json-'))
})

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

describe('atomicJsonWrite', () => {
  it('writes JSON file at the given path', async () => {
    const filePath = join(tmpDir, 'test.json')
    const data = { hello: 'world', count: 42 }

    await atomicJsonWrite(filePath, data)

    expect(existsSync(filePath)).toBe(true)
    const content = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(content).toEqual(data)
  })

  it('creates intermediate directories', async () => {
    const filePath = join(tmpDir, 'sub', 'nested', 'data.json')
    const data = { deep: true }

    await atomicJsonWrite(filePath, data)

    expect(existsSync(filePath)).toBe(true)
    const content = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(content).toEqual(data)
  })

  it('overwrites existing file', async () => {
    const filePath = join(tmpDir, 'overwrite.json')
    await atomicJsonWrite(filePath, { version: 1 })
    await atomicJsonWrite(filePath, { version: 2 })

    const content = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(content).toEqual({ version: 2 })
  })

  it('cleans up temp file on success (rename replaces .tmp)', async () => {
    const filePath = join(tmpDir, 'cleanup.json')
    await atomicJsonWrite(filePath, { key: 'val' })

    // No .tmp files should remain
    const dirContent = await new Promise<string[]>((resolve, reject) => {
      const fs = require('node:fs')
      fs.readdir(tmpDir, (err: Error | null, files: string[]) => {
        if (err) reject(err)
        else resolve(files)
      })
    })
    expect(dirContent.some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  it('writes valid formatted JSON', async () => {
    const filePath = join(tmpDir, 'formatted.json')
    await atomicJsonWrite(filePath, { a: 1, b: { c: [1, 2, 3] } })

    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed).toEqual({ a: 1, b: { c: [1, 2, 3] } })
    // Should be pretty-printed with indentation
    expect(raw).toContain('\n  ')
  })

  it('handles large JSON payloads', async () => {
    const filePath = join(tmpDir, 'large.json')
    const largeArray = Array.from({ length: 10_000 }, (_, i) => ({ index: i, value: `item-${i}` }))
    const data = { items: largeArray }

    await atomicJsonWrite(filePath, data)

    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(parsed.items).toHaveLength(10_000)
    expect(parsed.items[0].index).toBe(0)
    expect(parsed.items[9999].index).toBe(9999)
  })
})
