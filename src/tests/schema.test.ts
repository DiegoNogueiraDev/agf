import { describe, it, expect } from 'vitest'
import { EventRecordSchema } from '../core/event-store/schema.js'

const VALID_EVENT = {
  id: 'evt-001',
  kind: 'task.started',
  subjectRef: { kind: 'task', id: 'node-abc' },
  timestamp: '2026-06-23T00:00:00Z',
}

describe('EventRecordSchema', () => {
  it('accepts a valid event record', () => {
    expect(EventRecordSchema.safeParse(VALID_EVENT).success).toBe(true)
  })

  it('accepts optional payload', () => {
    const with_payload = { ...VALID_EVENT, payload: { key: 'value' } }
    expect(EventRecordSchema.safeParse(with_payload).success).toBe(true)
  })

  it('accepts optional projectId and sessionId', () => {
    const with_optional = { ...VALID_EVENT, projectId: 'proj-1', sessionId: 'sess-1' }
    expect(EventRecordSchema.safeParse(with_optional).success).toBe(true)
  })

  it('rejects event with missing id', () => {
    const { id: _, ...without } = VALID_EVENT
    expect(EventRecordSchema.safeParse(without).success).toBe(false)
  })

  it('rejects event with empty id', () => {
    expect(EventRecordSchema.safeParse({ ...VALID_EVENT, id: '' }).success).toBe(false)
  })

  it('rejects event with missing kind', () => {
    const { kind: _, ...without } = VALID_EVENT
    expect(EventRecordSchema.safeParse(without).success).toBe(false)
  })

  it('rejects event with missing subjectRef', () => {
    const { subjectRef: _, ...without } = VALID_EVENT
    expect(EventRecordSchema.safeParse(without).success).toBe(false)
  })
})
