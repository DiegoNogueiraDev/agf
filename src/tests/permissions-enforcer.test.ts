import { describe, it, expect } from 'vitest'
import { enforce } from '../core/permissions/enforcer.js'
import type { EnforceContext } from '../core/permissions/enforcer.js'

const cwd = '/workspace/myproject'

describe('enforce', () => {
  it('allows reads in read-only mode', () => {
    const ctx: EnforceContext = { capability: 'read' }
    const v = enforce('read-only', ctx)
    expect(v.verdict).toBe('allow')
  })

  it('denies writes in read-only mode', () => {
    const ctx: EnforceContext = { capability: 'write' }
    const v = enforce('read-only', ctx)
    expect(v.verdict).toBe('deny')
  })

  it('allows writes inside workspace in workspace-write mode', () => {
    const ctx: EnforceContext = {
      capability: 'write',
      cwd,
      targetPath: `${cwd}/src/foo.ts`,
    }
    const v = enforce('workspace-write', ctx)
    expect(v.verdict).toBe('allow')
  })

  it('denies writes outside workspace in workspace-write mode', () => {
    const ctx: EnforceContext = {
      capability: 'write',
      cwd,
      targetPath: '/etc/passwd',
    }
    const v = enforce('workspace-write', ctx)
    expect(v.verdict).toBe('deny')
  })

  it('allows everything in danger-full-access mode', () => {
    const ctx: EnforceContext = { capability: 'shell' }
    const v = enforce('danger-full-access', ctx)
    expect(v.verdict).toBe('allow')
  })

  it('allowedTools overrides denial', () => {
    const ctx: EnforceContext = {
      capability: 'write',
      toolName: 'BashTool',
      allowedTools: ['BashTool'],
    }
    const v = enforce('read-only', ctx)
    expect(v.verdict).toBe('allow')
  })

  it('allows shell in workspace-write mode', () => {
    const ctx: EnforceContext = { capability: 'shell' }
    const v = enforce('workspace-write', ctx)
    expect(v.verdict).toBe('allow')
  })
})
