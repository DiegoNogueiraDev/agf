/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_ea077c90a039 — import-prd infers MoSCoW tags + priority (no more
 * blank slate). import-prd/generate-prd left all tasks with priority:3 and
 * tags:[] when the PRD had no explicit Priority/Tags markdown markers —
 * silently breaking WSJF ordering and costing a full cycle of manual
 * `agf node update --tags/--priority` per leaf. Fallback inference (only
 * when no explicit marker is present): a task's own title prefix
 * (IMPLEMENT:/WIRE: -> must/1, FIX:/DOCS: -> should/2, anything else ->
 * should/2) plus epic inheritance (a parent epic with a measurable Key
 * Result in its description promotes all its direct children to must/1).
 */

import { describe, it, expect } from 'vitest'
import { extractEntities } from '../core/parser/extract.js'
import { convertToGraph } from '../core/importer/prd-to-graph.js'

describe('import-prd MoSCoW inference — no blank slate', () => {
  it('AC1: an epic with a measurable Key Result promotes all direct children to must/priority-1', () => {
    const prd = `
# PRD: Latency

## Epic: Reduce Latency

Key Result: reduce latency by 50%

### Task 1.1: Cache warm-up

Some description with no MoSCoW hints.

### Task 1.2: Query batching

Some description with no MoSCoW hints.

### Task 1.3: Connection pooling

Some description with no MoSCoW hints.
`
    const extraction = extractEntities(prd)
    const result = convertToGraph(extraction, 'test.md')
    const tasks = result.nodes.filter((n) => n.type === 'task')
    expect(tasks.length).toBeGreaterThanOrEqual(3)
    for (const t of tasks) {
      expect(t.tags).toContain('must')
      expect(t.priority).toBe(1)
    }
  })

  it('AC2: a task titled "IMPLEMENT: ..." gets tags including must and priority 1', () => {
    const prd = `
# PRD: Parser

## Epic: Parsing

### IMPLEMENT: add parser

No explicit priority/tags markers here.
`
    const extraction = extractEntities(prd)
    const result = convertToGraph(extraction, 'test.md')
    const task = result.nodes.find((n) => n.type === 'task' && n.title.startsWith('IMPLEMENT:'))
    expect(task).toBeDefined()
    expect(task?.tags).toContain('must')
    expect(task?.priority).toBe(1)
  })

  it('AC3: a task titled "DOCS: ..." gets tags=[should] and priority 2 (not blank, not priority 3)', () => {
    const prd = `
# PRD: Docs

## Epic: Documentation

### DOCS: update README

No explicit priority/tags markers here.
`
    const extraction = extractEntities(prd)
    const result = convertToGraph(extraction, 'test.md')
    const task = result.nodes.find((n) => n.type === 'task' && n.title.startsWith('DOCS:'))
    expect(task).toBeDefined()
    expect(task?.tags).toEqual(['should'])
    expect(task?.priority).toBe(2)
  })

  it('AC4: 10 tasks with zero MoSCoW hints all get at least tags=[should] and priority 2', () => {
    const taskBlocks = Array.from(
      { length: 10 },
      (_, i) => `### Generic task ${i}\n\nNo MoSCoW hints at all here.\n`,
    ).join('\n')
    const prd = `
# PRD: Generic

## Epic: Generic Work

${taskBlocks}
`
    const extraction = extractEntities(prd)
    const result = convertToGraph(extraction, 'test.md')
    const tasks = result.nodes.filter((n) => n.type === 'task' && n.title.startsWith('Generic task'))
    expect(tasks.length).toBe(10)
    for (const t of tasks) {
      expect(t.tags).toBeDefined()
      expect(t.tags!.length).toBeGreaterThan(0)
      expect(t.priority).toBe(2)
    }
  })

  it('an explicit **Tags:**/**Priority:** marker still wins over inference', () => {
    const prd = `
# PRD: Explicit

## Epic: Explicit Markers

### IMPLEMENT: something

**Prioridade:** 5
**Tags:** custom
`
    const extraction = extractEntities(prd)
    const result = convertToGraph(extraction, 'test.md')
    const task = result.nodes.find((n) => n.type === 'task' && n.title.startsWith('IMPLEMENT:'))
    expect(task).toBeDefined()
    expect(task?.priority).toBe(5)
    expect(task?.tags).toEqual(['custom'])
  })
})
