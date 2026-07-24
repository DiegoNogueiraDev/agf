import { describe, it, expect } from 'vitest'
import { readPrdFile } from '../core/parser/read-file.js'

describe('readPrdFile', () => {
  it('reads CLAUDE.md (exists in project root, relative path)', async () => {
    const result = await readPrdFile('CLAUDE.md')
    expect(typeof result.content).toBe('string')
    expect(result.content.length).toBeGreaterThan(0)
    expect(result.sizeBytes).toBeGreaterThan(0)
    expect(result.absolutePath).toContain('CLAUDE.md')
  })

  it('returns absolutePath, content, sizeBytes', async () => {
    const result = await readPrdFile('CLAUDE.md')
    expect(typeof result.absolutePath).toBe('string')
    expect(typeof result.content).toBe('string')
    expect(typeof result.sizeBytes).toBe('number')
  })

  it('sizeBytes equals actual content byte length', async () => {
    const result = await readPrdFile('CLAUDE.md')
    const computed = Buffer.byteLength(result.content, 'utf-8')
    expect(result.sizeBytes).toBe(computed)
  })

  it('throws for nonexistent file with .md extension', async () => {
    await expect(readPrdFile('nonexistent-prd-xyz-abc.md')).rejects.toThrow()
  })

  it('throws InvalidArgumentError for unsupported extension (.xyz)', async () => {
    await expect(readPrdFile('some-file.xyz')).rejects.toThrow()
  })

  it('throws for .js extension (not in allowed list)', async () => {
    await expect(readPrdFile('some-file.js')).rejects.toThrow()
  })

  it('throws for .json extension (not in allowed list)', async () => {
    await expect(readPrdFile('package.json')).rejects.toThrow()
  })

  it('throws PathTraversalError for absolute path outside project root', async () => {
    await expect(readPrdFile('/etc/passwd')).rejects.toThrow()
  })

  it('throws for empty path', async () => {
    await expect(readPrdFile('')).rejects.toThrow()
  })
})
