import { describe, it, expect } from 'vitest'
import { EventRecordSchema } from '../core/event-store/schema.js'

describe('EventRecordSchema', () => {
  const valid = {
    id: 'evt-001',
    kind: 'node.created',
    subjectRef: { kind: 'node', id: 'n-001' },
    timestamp: '2026-01-01T00:00:00Z',
  }

  it('accepts a minimal valid event record', () => {
    expect(EventRecordSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts optional payload, projectId, sessionId fields', () => {
    const full = {
      ...valid,
      payload: { title: 'My node', status: 'done' },
      projectId: 'proj-01',
      sessionId: 'sess-abc',
    }
    expect(EventRecordSchema.safeParse(full).success).toBe(true)
  })

  it('rejects empty id', () => {
    expect(EventRecordSchema.safeParse({ ...valid, id: '' }).success).toBe(false)
  })

  it('rejects empty kind', () => {
    expect(EventRecordSchema.safeParse({ ...valid, kind: '' }).success).toBe(false)
  })

  it('rejects empty subjectRef.id', () => {
    expect(EventRecordSchema.safeParse({ ...valid, subjectRef: { kind: 'node', id: '' } }).success).toBe(false)
  })

  it('rejects missing timestamp', () => {
    const { timestamp: _, ...noTimestamp } = valid
    expect(EventRecordSchema.safeParse(noTimestamp).success).toBe(false)
  })
})
