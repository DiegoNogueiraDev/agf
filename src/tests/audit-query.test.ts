import { describe, it, expect } from 'vitest'
import { queryAuditLog, formatAuditEntry } from '../core/observability/audit-query.js'
import type { AuditEntry, AuditFilter } from '../core/observability/audit-query.js'

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: '2026-01-15T10:00:00Z',
    nodeId: 'node-1',
    tool: 'ReadTool',
    status: 'success',
    message: 'File read successfully',
    ...overrides,
  } as AuditEntry
}

describe('queryAuditLog', () => {
  it('returns all entries with empty filter', () => {
    const entries = [makeEntry({ nodeId: 'a' }), makeEntry({ nodeId: 'b' })]
    const result = queryAuditLog(entries, {})
    expect(result).toHaveLength(2)
  })

  it('returns empty for empty entries', () => {
    expect(queryAuditLog([], {})).toHaveLength(0)
  })

  it('filters by tool', () => {
    const entries = [makeEntry({ tool: 'ReadTool' }), makeEntry({ tool: 'WriteTool' })]
    const result = queryAuditLog(entries, { tool: 'ReadTool' } as AuditFilter)
    expect(result).toHaveLength(1)
    expect(result[0]!.tool).toBe('ReadTool')
  })

  it('filters by nodeId', () => {
    const entries = [makeEntry({ nodeId: 'node-a' }), makeEntry({ nodeId: 'node-b' })]
    const result = queryAuditLog(entries, { nodeId: 'node-a' } as AuditFilter)
    expect(result).toHaveLength(1)
    expect(result[0]!.nodeId).toBe('node-a')
  })

  it('filters by status', () => {
    const entries = [makeEntry({ status: 'success' }), makeEntry({ status: 'denied' })]
    const result = queryAuditLog(entries, { status: 'denied' } as AuditFilter)
    expect(result).toHaveLength(1)
    expect(result[0]!.status).toBe('denied')
  })

  it('filters by since timestamp', () => {
    const entries = [makeEntry({ timestamp: '2026-01-10T00:00:00Z' }), makeEntry({ timestamp: '2026-01-20T00:00:00Z' })]
    const result = queryAuditLog(entries, { since: '2026-01-15T00:00:00Z' } as AuditFilter)
    expect(result).toHaveLength(1)
    expect(result[0]!.timestamp).toBe('2026-01-20T00:00:00Z')
  })
})

describe('formatAuditEntry', () => {
  it('returns a string', () => {
    const entry = makeEntry()
    const formatted = formatAuditEntry(entry)
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('includes time, nodeId, tool, and status', () => {
    const entry = makeEntry({ nodeId: 'my-node', tool: 'BashTool', status: 'error' })
    const formatted = formatAuditEntry(entry)
    expect(formatted).toContain('my-node')
    expect(formatted).toContain('BashTool')
    expect(formatted).toContain('error')
  })
})
