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

  it('returns brownfield for the project root (has src/ files)', () => {
    const mode = detectProjectMode('/Users/diegonogueira/projects/agent-graph-flow')
    expect(mode).toBe('brownfield')
  })
})
