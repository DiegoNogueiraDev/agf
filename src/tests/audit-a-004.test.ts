/**
 * AUDIT-004 — bullets that don't map to a node type ("unknown") were silently
 * dropped (`if (!itemType) continue`), unlike top-level blocks which are logged.
 * They must fall back to the parent section's type so the content survives.
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

describe('AUDIT-004: unknown bullets fall back to the parent section type', () => {
  it('keeps an unknown item under a constraint section as a constraint child', () => {
    const block: ClassifiedBlock = {
      type: 'constraint',
      title: 'Restrições do projeto',
      description: '',
      items: [{ type: 'unknown', text: 'Item genérico sem palavra-chave', line: 2, confidence: 0.3 }],
      startLine: 1,
      endLine: 2,
      confidence: 0.85,
      level: 2,
    }

    const result = convertToGraph(makeExtraction([block]), 'test.md')
    const constraintNodes = result.nodes.filter((n) => n.type === 'constraint')

    // parent constraint + the recovered child constraint (was dropped before the fix)
    expect(constraintNodes).toHaveLength(2)
    expect(constraintNodes.some((n) => n.title === 'Item genérico sem palavra-chave')).toBe(true)
  })
})
