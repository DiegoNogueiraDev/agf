import { describe, it, expect } from 'vitest'
import {
  NodeTypeSchema,
  NodeStatusSchema,
  XpSizeSchema,
  PrioritySchema,
  GraphNodeSchema,
} from '../schemas/node.schema.js'

describe('NodeTypeSchema', () => {
  it('accepts standard node types', () => {
    for (const t of ['epic', 'task', 'subtask', 'requirement', 'risk', 'decision', 'milestone']) {
      expect(NodeTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown type', () => {
    expect(NodeTypeSchema.safeParse('bug_report').success).toBe(false)
  })
})

describe('NodeStatusSchema', () => {
  it('accepts all statuses', () => {
    for (const s of ['backlog', 'ready', 'in_progress', 'blocked', 'done']) {
      expect(NodeStatusSchema.safeParse(s).success).toBe(true)
    }
  })
})

describe('XpSizeSchema', () => {
  it('accepts all t-shirt sizes', () => {
    for (const s of ['XS', 'S', 'M', 'L', 'XL']) {
      expect(XpSizeSchema.safeParse(s).success).toBe(true)
    }
  })
})

describe('PrioritySchema', () => {
  it('accepts priorities 1-5', () => {
    for (const p of [1, 2, 3, 4, 5]) {
      expect(PrioritySchema.safeParse(p).success).toBe(true)
    }
  })

  it('rejects priority 0 or 6', () => {
    expect(PrioritySchema.safeParse(0).success).toBe(false)
    expect(PrioritySchema.safeParse(6).success).toBe(false)
  })
})

describe('GraphNodeSchema', () => {
  it('accepts a minimal valid node', () => {
    const result = GraphNodeSchema.safeParse({
      id: 'node_abc',
      type: 'task',
      title: 'Implement feature X',
      status: 'backlog',
      priority: 2,
      blocked: false,
      createdAt: '2026-06-22T00:00:00Z',
      updatedAt: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })
})

describe('NodeTypeSchema includes bug (node_cb0cd7818f38)', () => {
  it("parses 'bug' as a valid node type (AC1)", () => {
    const result = NodeTypeSchema.safeParse('bug')
    expect(result.success).toBe(true)
  })
})
