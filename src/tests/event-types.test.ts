import { describe, it, expect } from 'vitest'
import type {
  GraphEvent,
  NodeCreatedEvent,
  NodeUpdatedEvent,
  NodeDeletedEvent,
  GraphEventType,
} from '../core/events/event-types.js'

describe('event-types interfaces', () => {
  it('GraphEvent has required base fields', () => {
    const event: GraphEvent = {
      type: 'node.created' as GraphEventType,
      timestamp: '2026-01-01T00:00:00Z',
      projectDir: '/projects/my-app',
    }
    expect(event.type).toBe('node.created')
    expect(event.timestamp).toBeDefined()
    expect(event.projectDir).toBeDefined()
  })

  it('NodeCreatedEvent extends GraphEvent with nodeId and title', () => {
    const event: NodeCreatedEvent = {
      type: 'node.created' as GraphEventType,
      timestamp: '2026-01-01T00:00:00Z',
      projectDir: '/projects/my-app',
      nodeId: 'n-001',
      title: 'Implement login',
    }
    expect(event.nodeId).toBe('n-001')
    expect(event.title).toBe('Implement login')
  })

  it('NodeUpdatedEvent extends GraphEvent with nodeId and changes', () => {
    const event: NodeUpdatedEvent = {
      type: 'node.updated' as GraphEventType,
      timestamp: '2026-01-01T00:00:00Z',
      projectDir: '/projects/my-app',
      nodeId: 'n-002',
      changes: { status: 'done' },
    }
    expect(event.nodeId).toBe('n-002')
    expect(event.changes).toHaveProperty('status')
  })

  it('NodeDeletedEvent extends GraphEvent with nodeId', () => {
    const event: NodeDeletedEvent = {
      type: 'node.deleted' as GraphEventType,
      timestamp: '2026-01-01T00:00:00Z',
      projectDir: '/projects/my-app',
      nodeId: 'n-003',
    }
    expect(event.nodeId).toBe('n-003')
  })
})
