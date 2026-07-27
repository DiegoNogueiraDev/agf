import { describe, it, expect } from 'vitest'
import { enforce } from '../core/permissions/enforcer.js'

describe('enforce', () => {
  it('danger-full-access allows all capabilities', () => {
    expect(enforce('danger-full-access', { capability: 'read' }).verdict).toBe('allow')
    expect(enforce('danger-full-access', { capability: 'write' }).verdict).toBe('allow')
    expect(enforce('danger-full-access', { capability: 'shell' }).verdict).toBe('allow')
    expect(enforce('danger-full-access', { capability: 'network' }).verdict).toBe('allow')
  })

  it('read-only allows read', () => {
    expect(enforce('read-only', { capability: 'read' }).verdict).toBe('allow')
  })

  it('read-only denies write', () => {
    expect(enforce('read-only', { capability: 'write' }).verdict).toBe('deny')
  })

  it('read-only denies shell', () => {
    expect(enforce('read-only', { capability: 'shell' }).verdict).toBe('deny')
  })

  it('workspace-write allows read', () => {
    expect(enforce('workspace-write', { capability: 'read' }).verdict).toBe('allow')
  })

  it('workspace-write allows shell', () => {
    expect(enforce('workspace-write', { capability: 'shell' }).verdict).toBe('allow')
  })

  it('allowedTools overrides deny in read-only', () => {
    const ctx = { capability: 'write' as const, toolName: 'MyTool', allowedTools: ['MyTool'] }
    expect(enforce('read-only', ctx).verdict).toBe('allow')
  })
})
