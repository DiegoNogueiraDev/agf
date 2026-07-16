/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compressFile, decompressFile, readFile, runCompaction } from '../core/thread-store/rollout-compression.js'

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'rollout-compression-test-'))
}

function writeJsonl(dir: string, name: string, lines: string[]): string {
  const path = join(dir, name)
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8')
  return path
}

function bigPayload(): string {
  const lines: string[] = []
  for (let i = 0; i < 100; i++) {
    lines.push(
      JSON.stringify({
        kind: 'SessionMeta',
        data: { id: `session-${i}`, content: 'x'.repeat(200) },
        timestamp: new Date().toISOString(),
      }),
    )
  }
  return lines.join('\n') + '\n'
}

describe('rollout-compression', () => {
  let dir: string

  beforeAll(() => {
    dir = createTempDir()
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('compressFile', () => {
    it('creates .gz file from .jsonl', () => {
      const payload = bigPayload()
      const src = join(dir, 'test.jsonl')
      writeFileSync(src, payload, 'utf-8')
      const dest = join(dir, 'test.jsonl.gz')

      compressFile(src, dest)

      expect(existsSync(dest)).toBe(true)
      const compressed = readFileSync(dest)
      expect(compressed.length).toBeGreaterThan(0)
      expect(compressed.length).toBeLessThan(readFileSync(src).length)
    })

    it('throws on nonexistent input', () => {
      expect(() => {
        compressFile(join(dir, 'nope.jsonl'), join(dir, 'out.gz'))
      }).toThrow()
    })
  })

  describe('decompressFile', () => {
    it('restores original content', () => {
      const lines = [
        JSON.stringify({ kind: 'SessionMeta', data: { id: 'abc' } }),
        JSON.stringify({ kind: 'ResponseItem', data: { role: 'assistant' } }),
      ]
      const src = writeJsonl(dir, 'roundtrip.jsonl', lines)
      const compressed = join(dir, 'roundtrip.jsonl.gz')
      const restored = join(dir, 'roundtrip-restored.jsonl')

      compressFile(src, compressed)
      decompressFile(compressed, restored)

      expect(existsSync(restored)).toBe(true)
      const content = readFileSync(restored, 'utf-8').trim()
      const resultLines = content.split('\n')
      expect(resultLines).toHaveLength(2)
      expect(JSON.parse(resultLines[0]).data.id).toBe('abc')
      expect(JSON.parse(resultLines[1]).data.role).toBe('assistant')
    })

    it('throws on nonexistent input', () => {
      expect(() => {
        decompressFile(join(dir, 'nope.jsonl.gz'), join(dir, 'out.jsonl'))
      }).toThrow()
    })
  })

  describe('readFile', () => {
    it('reads plain .jsonl', () => {
      const lines = [JSON.stringify({ kind: 'SessionMeta', data: { id: 'plain' } })]
      const src = writeJsonl(dir, 'plain.jsonl', lines)

      const result = readFile(src)
      expect(result).toBe(readFileSync(src, 'utf-8'))
    })

    it('reads .jsonl.gz transparently', () => {
      const lines = [JSON.stringify({ kind: 'SessionMeta', data: { id: 'gzipped' } })]
      const src = writeJsonl(dir, 'transparent.jsonl', lines)
      const gzPath = join(dir, 'transparent.jsonl.gz')

      compressFile(src, gzPath)

      const result = readFile(gzPath)
      const parsed = JSON.parse(result.trim())
      expect(parsed.data.id).toBe('gzipped')
    })
  })

  describe('runCompaction', () => {
    it('compresses old files and skips recent ones', () => {
      const sessionDir = join(dir, 'sessions')
      mkdirSync(sessionDir, { recursive: true })

      const now = Date.now()
      const dayMs = 86_400_000

      writeFileSync(
        join(sessionDir, 'old-session.jsonl'),
        JSON.stringify({ kind: 'SessionMeta', data: { id: 'old-session' } }) + '\n',
        'utf-8',
      )
      writeFileSync(
        join(sessionDir, 'recent-session.jsonl'),
        JSON.stringify({ kind: 'SessionMeta', data: { id: 'recent-session' } }) + '\n',
        'utf-8',
      )

      utimesSync(join(sessionDir, 'old-session.jsonl'), new Date(now - 8 * dayMs), new Date(now - 8 * dayMs))
      utimesSync(join(sessionDir, 'recent-session.jsonl'), new Date(now - 1 * dayMs), new Date(now - 1 * dayMs))

      const result = runCompaction(sessionDir, 7)
      expect(result.compressed).toBe(1)
      expect(result.skipped).toBe(1)

      expect(existsSync(join(sessionDir, 'old-session.jsonl'))).toBe(false)
      expect(existsSync(join(sessionDir, 'old-session.jsonl.gz'))).toBe(true)
      expect(existsSync(join(sessionDir, 'recent-session.jsonl'))).toBe(true)
      expect(existsSync(join(sessionDir, 'recent-session.jsonl.gz'))).toBe(false)
    })

    it('skips files younger than threshold', () => {
      const sessionDir = join(dir, 'sessions-young')
      mkdirSync(sessionDir, { recursive: true })

      writeFileSync(
        join(sessionDir, 'fresh.jsonl'),
        JSON.stringify({ kind: 'SessionMeta', data: { id: 'fresh' } }) + '\n',
        'utf-8',
      )

      const result = runCompaction(sessionDir, 7)
      expect(result.compressed).toBe(0)
      expect(result.skipped).toBe(1)

      expect(existsSync(join(sessionDir, 'fresh.jsonl'))).toBe(true)
      expect(existsSync(join(sessionDir, 'fresh.jsonl.gz'))).toBe(false)
    })

    it('returns { compressed: 0, skipped: 0 } for empty dir', () => {
      const emptyDir = join(dir, 'empty')
      mkdirSync(emptyDir, { recursive: true })
      const result = runCompaction(emptyDir, 7)
      expect(result.compressed).toBe(0)
      expect(result.skipped).toBe(0)
    })

    it('returns zeros for nonexistent dir', () => {
      const result = runCompaction(join(dir, 'ghost'), 7)
      expect(result.compressed).toBe(0)
      expect(result.skipped).toBe(0)
    })
  })
})
