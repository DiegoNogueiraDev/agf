/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { fileExists, safeReadFileSync, assertPathInsideProject, isReadableFile } from '../core/utils/fs.js'

let tmpDir: string
let origCwd: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fs-test-'))
  origCwd = process.cwd()
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

describe('fileExists', () => {
  it('returns true for existing file', async () => {
    const filePath = join(tmpDir, 'exists.txt')
    writeFileSync(filePath, 'hello')
    expect(await fileExists(filePath)).toBe(true)
  })

  it('returns false for non-existing file', async () => {
    expect(await fileExists(join(tmpDir, 'nope.txt'))).toBe(false)
  })
})

describe('safeReadFileSync', () => {
  it('reads a file inside the project directory', () => {
    const filePath = join(tmpDir, 'data.txt').replace(tmpDir + '/', '')
    writeFileSync(join(tmpDir, filePath), 'content')
    const result = safeReadFileSync(filePath)
    expect(result).toBe('content')
  })

  it('throws PathTraversalError for paths outside project', () => {
    expect(() => safeReadFileSync('../etc/passwd')).toThrow(/path traversal/i)
  })

  it('throws for non-existent file inside project', () => {
    expect(() => safeReadFileSync('nonexistent.txt')).toThrow()
  })

  it('validates file extension when allowedExtensions set', () => {
    const filePath = 'data.txt'
    writeFileSync(join(tmpDir, filePath), 'content')
    expect(() => safeReadFileSync(filePath, new Set(['.md']))).toThrow(/Unsupported file extension/)
  })

  it('passes for allowed extension', () => {
    const filePath = 'data.md'
    writeFileSync(join(tmpDir, filePath), '# Hello')
    const result = safeReadFileSync(filePath, new Set(['.md']))
    expect(result).toBe('# Hello')
  })

  it('passes extension check when no extension present', () => {
    const filePath = 'README'
    writeFileSync(join(tmpDir, filePath), 'content')
    const result = safeReadFileSync(filePath, new Set(['.md']))
    expect(result).toBe('content')
  })
})

describe('assertPathInsideProject', () => {
  it('resolves path inside project', () => {
    const result = assertPathInsideProject('sub/file.txt')
    expect(result).toBe(join(tmpDir, 'sub/file.txt'))
  })

  it('throws for traversal', () => {
    expect(() => assertPathInsideProject('../etc/passwd')).toThrow(/path traversal/i)
  })
})

describe('isReadableFile — guarda contra diretório (BUG2 node_0add0ba8fd29)', () => {
  it('arquivo real existente → true', () => {
    const f = join(tmpDir, 'real.ts')
    writeFileSync(f, 'export const x = 1')
    expect(isReadableFile(f)).toBe(true)
  })

  it('DIRETÓRIO existente → false (readFileSync nele lançaria EISDIR)', () => {
    const d = join(tmpDir, 'a-dir')
    mkdirSync(d)
    expect(isReadableFile(d)).toBe(false)
  })

  it('path inexistente → false (não lança)', () => {
    expect(isReadableFile(join(tmpDir, 'nope.ts'))).toBe(false)
  })
})
