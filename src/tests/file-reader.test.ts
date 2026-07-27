/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/parser/file-reader.ts — readFileContent + isSupportedFormat.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFileContent, isSupportedFormat } from '../core/parser/file-reader.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'file-reader-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('isSupportedFormat', () => {
  it('accepts known import extensions and rejects unknown ones', () => {
    expect(isSupportedFormat('spec.md')).toBe(true)
    expect(isSupportedFormat('data.json')).toBe(true)
    expect(isSupportedFormat('image.png')).toBe(false)
  })

  it('accepts .xlsx as a supported extension', () => {
    expect(isSupportedFormat('tasks.xlsx')).toBe(true)
  })
})

describe('readFileContent', () => {
  it('reads a markdown file as utf-8 text with metadata', async () => {
    const fp = path.join(dir, 'doc.md')
    await writeFile(fp, '# Title\n\nbody')

    const result = await readFileContent(fp)
    expect(result.text).toContain('# Title')
    expect(result.format).toBe('.md')
    expect(result.originalName).toBe('doc.md')
    expect(result.sizeBytes).toBeGreaterThan(0)
  })

  it('passes json/txt through as raw text', async () => {
    const fp = path.join(dir, 'data.json')
    await writeFile(fp, '{"a":1}')
    const result = await readFileContent(fp)
    expect(result.text).toBe('{"a":1}')
  })

  it('rejects an unsupported extension with a ValidationError', async () => {
    const fp = path.join(dir, 'image.png')
    await writeFile(fp, 'binary-ish')
    await expect(readFileContent(fp)).rejects.toThrow(/Unsupported file format/)
  })

  it('routes .xlsx through the PRD format parser (surfaces install hint since xlsx is an optional dep)', async () => {
    const fp = path.join(dir, 'tasks.xlsx')
    await writeFile(fp, 'not-a-real-xlsx-buffer')
    await expect(readFileContent(fp)).rejects.toThrow(/Install with: npm install xlsx/)
  })
})
