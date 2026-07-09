import { describe, it, expect } from 'vitest'
import { convertToGraph } from '../core/importer/prd-to-graph.js'
import type { ExtractionResult } from '../core/parser/extract.js'
import type { ClassifiedBlock } from '../core/parser/classify.js'
import { GraphNodeSchema } from '../schemas/node.schema.js'

/**
 * Regression for: convertToGraph dropped block.acceptanceCriteria — task/subtask
 * GraphNodes were emitted without their hoisted AC. Pins that AC now flows onto
 * task/subtask nodes and is NOT forced onto requirement/epic nodes.
 */

function block(over: Partial<ClassifiedBlock> & Pick<ClassifiedBlock, 'type' | 'title'>): ClassifiedBlock {
  return {
    description: '',
    items: [],
    startLine: 1,
    endLine: 2,
    confidence: 0.9,
    level: 1,
    ...over,
  }
}

function extraction(blocks: ClassifiedBlock[]): ExtractionResult {
  return {
    blocks,
    summary: {
      totalSections: blocks.length,
      epics: 0,
      tasks: 0,
      subtasks: 0,
      requirements: 0,
      constraints: 0,
      acceptanceCriteria: 0,
      risks: 0,
      unknown: 0,
    },
  }
}

describe('convertToGraph acceptanceCriteria propagation', () => {
  it('populates acceptanceCriteria on a task node from the block', () => {
    const { nodes } = convertToGraph(
      extraction([block({ type: 'task', title: 'Do X', acceptanceCriteria: ['a', 'b'] })]),
      'prd.md',
    )
    const task = nodes.find((n) => n.type === 'task' && n.title === 'Do X')
    expect(task?.acceptanceCriteria).toEqual(['a', 'b'])
  })

  it('does not force acceptanceCriteria on a requirement node', () => {
    const { nodes } = convertToGraph(
      extraction([block({ type: 'requirement', title: 'Must be fast', acceptanceCriteria: ['a', 'b'] })]),
      'prd.md',
    )
    const req = nodes.find((n) => n.type === 'requirement')
    expect(req).toBeDefined()
    expect(req?.acceptanceCriteria).toBeUndefined()
  })

  it('emits nodes that pass GraphNodeSchema.safeParse', () => {
    const { nodes } = convertToGraph(
      extraction([block({ type: 'task', title: 'Do X', acceptanceCriteria: ['a', 'b'] })]),
      'prd.md',
    )
    for (const node of nodes) {
      expect(GraphNodeSchema.safeParse(node).success).toBe(true)
    }
  })

  it('synthesizes acceptanceCriteria on a task with no block AC (fallback)', () => {
    const { nodes } = convertToGraph(extraction([block({ type: 'task', title: 'No AC task' })]), 'prd.md')
    const task = nodes.find((n) => n.type === 'task')
    expect(task?.acceptanceCriteria).toBeDefined()
    expect(task!.acceptanceCriteria!.length).toBeGreaterThanOrEqual(1)
    expect(task!.acceptanceCriteria![0]).toContain('Given')
    expect(task!.acceptanceCriteria![0]).toContain('When')
    expect(task!.acceptanceCriteria![0]).toContain('Then')
  })
})
