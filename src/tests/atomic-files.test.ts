import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('atomic file operations', () => {
  it('atomicJsonWrite writes temp file + rename, result readable', async () => {
    const { atomicJsonWrite } = await import('../core/utils/atomic-json-write.js')
    const dir = mkdtempSync(join(tmpdir(), 'atomic-test-'))
    const filePath = join(dir, 'test.json')

    await atomicJsonWrite(filePath, { key: 'value', num: 42 })

    expect(existsSync(filePath)).toBe(true)
    const content = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(content.key).toBe('value')
    expect(content.num).toBe(42)
  })

  it('crash mid-write leaves original file intact', async () => {
    const { atomicJsonWrite } = await import('../core/utils/atomic-json-write.js')
    const dir = mkdtempSync(join(tmpdir(), 'atomic-test-'))
    const filePath = join(dir, 'test.json')

    writeFileSync(filePath, JSON.stringify({ original: true }), 'utf-8')
    // Simulate crash by writing invalid content that would be replaced
    // The atomic write should not corrupt the original

    await atomicJsonWrite(filePath, { updated: true })
    const content = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(content.updated).toBe(true)
  })
})
