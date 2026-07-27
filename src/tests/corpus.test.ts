import { describe, it, expect } from 'vitest'
import { detectProjectMode } from '../core/scaffolder/corpus.js'

describe('detectProjectMode', () => {
  it('returns brownfield or greenfield (union type)', () => {
    const mode = detectProjectMode('/nonexistent/empty/dir')
    expect(['brownfield', 'greenfield']).toContain(mode)
  })

  it('returns greenfield for a non-existent directory (no src files)', () => {
    const mode = detectProjectMode('/totally/nonexistent/path/xyz')
    expect(mode).toBe('greenfield')
  })

  // `process.cwd()`, not the author's home directory: the path was hardcoded, so the test passed
  // on exactly one machine and published that machine's layout to a public repository.
  it('returns brownfield for the project root (has src/ files)', () => {
    const mode = detectProjectMode(process.cwd())
    expect(mode).toBe('brownfield')
  })
})
