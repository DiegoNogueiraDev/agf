/**
 * AUDIT-006 — level-0 blocks (markdown tables, untitled preamble) were never
 * popped by a following level>=1 heading, so they wrongly became its parent.
 * Level-0 blocks must be skipped when building the heading hierarchy stack.
 */
import { describe, it, expect } from 'vitest'
import { convertToGraph } from '../core/importer/prd-to-graph.js'
import type { ExtractionResult } from '../core/parser/extract.js'
import type { ClassifiedBlock } from '../core/parser/classify.js'

function makeExtraction(blocks: ClassifiedBlock[]): ExtractionResult {
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

describe('AUDIT-006: level-0 blocks do not become bogus parents', () => {
  it('a level-1 task is not parented to a preceding level-0 table block', () => {
    const tableReq: ClassifiedBlock = {
      type: 'requirement',
      title: 'Tabela de requisitos',
      description: '',
      items: [],
      startLine: 1,
      endLine: 1,
      confidence: 0.8,
      level: 0,
    }
    const task: ClassifiedBlock = {
      type: 'task',
      title: 'Implementar feature X',
      description: '',
      items: [],
      startLine: 2,
      endLine: 2,
      confidence: 0.8,
      level: 1,
    }

    const result = convertToGraph(makeExtraction([tableReq, task]), 'test.md')
    const reqNode = result.nodes.find((n) => n.type === 'requirement')
    const taskNode = result.nodes.find((n) => n.type === 'task')

    expect(reqNode).toBeDefined()
    expect(taskNode).toBeDefined()
    expect(taskNode?.parentId).not.toBe(reqNode?.id)
  })
})
