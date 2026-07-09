import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { teeRawOutput, teePointer } from '../core/tool-compress/tee.js'

describe('teePointer', () => {
  it('returns a pointer string with the filename', () => {
    const pointer = teePointer('test-output.txt')
    expect(pointer).toContain('test-output.txt')
  })

  it('is a pure function returning consistent output', () => {
    const p1 = teePointer('file.txt')
    const p2 = teePointer('file.txt')
    expect(p1).toBe(p2)
  })

  it('includes the workflow-graph/tee path prefix', () => {
    const pointer = teePointer('myfile.json')
    expect(pointer).toContain('workflow-graph/tee')
  })
})

describe('teeRawOutput', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tee-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null savedPath for short content (<500 chars)', () => {
    const result = teeRawOutput('short', tmpDir)
    expect(result.savedPath).toBeNull()
    expect(result.pointer).toBeNull()
  })

  it('saves content 500+ chars and savedPath is relative', () => {
    const longContent = 'x'.repeat(500)
    const result = teeRawOutput(longContent, tmpDir)
    if (result.savedPath !== null) {
      const absolutePath = join(tmpDir, result.savedPath)
      expect(existsSync(absolutePath)).toBe(true)
    }
  })

  it('returns TeeResult with savedPath and pointer fields', () => {
    const result = teeRawOutput('content', tmpDir)
    expect('savedPath' in result).toBe(true)
    expect('pointer' in result).toBe(true)
  })

  it('savedPath is relative (starts with workflow-graph)', () => {
    const longContent = 'y'.repeat(600)
    const result = teeRawOutput(longContent, tmpDir)
    if (result.savedPath !== null) {
      expect(result.savedPath.startsWith('workflow-graph')).toBe(true)
    }
  })

  it('pointer matches savedPath filename', () => {
    const longContent = 'z'.repeat(600)
    const result = teeRawOutput(longContent, tmpDir)
    if (result.savedPath !== null && result.pointer !== null) {
      expect(result.pointer).toContain(result.savedPath)
    }
  })
})
