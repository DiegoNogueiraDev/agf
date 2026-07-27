import { describe, it, expect } from 'vitest'
import { detectStack } from '../core/sandbox/stack-detector.js'
import { SandboxError } from '../core/errors/sandbox-error.js'

describe('detectStack', () => {
  it('throws SandboxError for non-existent directory (node_wire_e6cbf52b518b)', () => {
    expect(() => detectStack('/nonexistent/path/that/does/not/exist')).toThrow(SandboxError)
  })

  it('detects npm stack for this project', () => {
    const result = detectStack(process.cwd())
    expect(result.stack).toBe('npm')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.evidence).toContain('package.json')
  })

  it('returns high confidence when lock file exists', () => {
    const result = detectStack(process.cwd())
    expect(result.confidence).toBe(1)
  })

  it('returns auto with zero confidence for empty directory', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const tmpDir = mkdtempSync(join(tmpdir(), 'agf-test-'))
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('auto')
    expect(result.confidence).toBe(0)
    expect(result.evidence).toHaveLength(0)
  })
})
