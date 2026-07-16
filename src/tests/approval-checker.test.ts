import { describe, it, expect } from 'vitest'
import { checkApproval } from '../core/approval/approval-checker.js'

describe('checkApproval', () => {
  it('returns no approval for unknown tool', () => {
    const result = checkApproval({ tool: 'unknown-tool' })
    expect(result.requires_approval).toBe(false)
  })

  it('returns no approval for safe bash command', () => {
    const result = checkApproval({ tool: 'bash', input: { command: 'echo hello' } })
    expect(result.requires_approval).toBe(false)
  })

  it('requires approval for dangerous bash command', () => {
    const result = checkApproval({ tool: 'bash', input: { command: 'rm -rf /' } })
    expect(result.requires_approval).toBe(true)
    expect(result.severity).not.toBe('low')
  })

  it('returns no approval for bash with no command', () => {
    const result = checkApproval({ tool: 'bash', input: {} })
    expect(result.requires_approval).toBe(false)
  })

  it('checks file path for mutating file tools', () => {
    const result = checkApproval({ tool: 'write', input: { file_path: 'src/core/foo.ts' } })
    expect(typeof result.requires_approval).toBe('boolean')
    expect(Array.isArray(result.matchedPatterns)).toBe(true)
  })

  it('returns result with required fields', () => {
    const result = checkApproval({ tool: 'bash', input: { command: 'ls' } })
    expect(typeof result.requires_approval).toBe('boolean')
    expect(typeof result.severity).toBe('string')
    expect(typeof result.reason).toBe('string')
    expect(Array.isArray(result.matchedPatterns)).toBe(true)
  })
})
