/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/rag/model-downloader.ts — computeFileSha256 + error classes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  computeFileSha256,
  ChecksumMismatchError,
  DownloadError,
  downloadIfMissing,
} from '../core/rag/model-downloader.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'model-dl-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('computeFileSha256', () => {
  it('computes the known SHA256 of a file', async () => {
    const fp = path.join(dir, 'f.bin')
    await writeFile(fp, 'hello')
    // sha256("hello")
    expect(computeFileSha256(fp)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})

describe('downloadIfMissing retry behavior', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('retries a transient network failure and succeeds without leaving a partial file', async () => {
    const dest = path.join(dir, 'model.bin')
    let calls = 0
    global.fetch = vi.fn(async () => {
      calls++
      if (calls < 3) throw new Error('fetch failed')
      return new Response(Buffer.from('hello'), { status: 200 })
    }) as unknown as typeof fetch

    const result = await downloadIfMissing('https://example.com/model.bin', dest)

    expect(calls).toBe(3)
    expect(result.cached).toBe(false)
    expect(result.sizeBytes).toBe(5)
  })

  it('does not retry a non-retryable checksum mismatch', async () => {
    const dest = path.join(dir, 'model-bad.bin')
    let calls = 0
    global.fetch = vi.fn(async () => {
      calls++
      return new Response(Buffer.from('hello'), { status: 200 })
    }) as unknown as typeof fetch

    await expect(downloadIfMissing('https://example.com/model.bin', dest, 'f'.repeat(64))).rejects.toThrow(
      ChecksumMismatchError,
    )
    expect(calls).toBe(1)
  })
})

describe('error classes', () => {
  it('ChecksumMismatchError carries url/expected/actual and a descriptive message', () => {
    const err = new ChecksumMismatchError('http://x/model', 'aaaa', 'bbbb')
    expect(err.name).toBe('ChecksumMismatchError')
    expect(err.url).toBe('http://x/model')
    expect(err.expected).toBe('aaaa')
    expect(err.actual).toBe('bbbb')
    expect(err.message).toContain('http://x/model')
    expect(err).toBeInstanceOf(Error)
  })

  it('DownloadError carries the url and message', () => {
    const err = new DownloadError('http://x/model', 'timeout')
    expect(err.name).toBe('DownloadError')
    expect(err.url).toBe('http://x/model')
    expect(err.message).toBe('timeout')
  })
})
