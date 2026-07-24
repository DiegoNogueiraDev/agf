/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { OpenFolderBodySchema } from '../schemas/folder.schema.js'
import { fuzzySearch, scoreFile } from '../schemas/fuzzy-search.schema.js'
import { GradeSchema } from '../schemas/grade-schema.js'
import {
  GraphDocumentSchema,
  GraphIndexesSchema,
  GraphProjectSchema,
  GraphMetaSchema,
} from '../schemas/graph.schema.js'
import type { ToolHandler } from '../schemas/guardian-hooks.schema.js'
import { wrapWithGuardian } from '../schemas/guardian-hooks.schema.js'
import { type GuardianReviewerInterface } from '../schemas/guardian-reviewer.schema.js'
import { matchPolicy, DEFAULT_POLICIES } from '../schemas/guardian-policies.schema.js'

// ── folder.schema ──────────────────────────────────────────────────────────

describe('OpenFolderBodySchema', () => {
  it('accepts valid path', () => {
    expect(OpenFolderBodySchema.parse({ path: '/home/user/project' }).path).toBe('/home/user/project')
  })

  it('rejects empty path', () => {
    expect(OpenFolderBodySchema.safeParse({ path: '' }).success).toBe(false)
  })

  it('rejects path exceeding 2000 chars', () => {
    expect(OpenFolderBodySchema.safeParse({ path: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(OpenFolderBodySchema.safeParse(null).success).toBe(false)
  })

  it('rejects undefined', () => {
    expect(OpenFolderBodySchema.safeParse(undefined).success).toBe(false)
  })
})

// ── fuzzy-search.schema (functions) ─────────────────────────────────────────

describe('fuzzySearch', () => {
  const files = ['src/index.ts', 'src/utils/helper.ts', 'README.md']

  it('returns results sorted by score desc', () => {
    const results = fuzzySearch('index', files)
    expect(results).toHaveLength(1)
    expect(results[0].file).toBe('src/index.ts')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('returns empty array for empty query', () => {
    expect(fuzzySearch('', files)).toEqual([])
    expect(fuzzySearch('   ', files)).toEqual([])
  })

  it('returns empty when no match', () => {
    expect(fuzzySearch('zzzzzzzz', files)).toEqual([])
  })

  it('finds files by substring', () => {
    const results = fuzzySearch('helper', files)
    expect(results.length).toBeGreaterThan(0)
  })
})

describe('scoreFile', () => {
  it('returns 1000 for exact path match', () => {
    expect(scoreFile('src/index.ts', 'src/index.ts')).toBe(1000)
  })

  it('returns 0 for no match', () => {
    expect(scoreFile('xyz', 'src/index.ts')).toBe(0)
  })

  it('scores partial match', () => {
    expect(scoreFile('ind', 'src/index.ts')).toBeGreaterThan(0)
  })
})

// ── grade-schema ────────────────────────────────────────────────────────────

describe('GradeSchema', () => {
  it('accepts valid grades', () => {
    for (const g of ['A', 'B', 'C', 'D', 'F'] as const) {
      expect(GradeSchema.parse(g)).toBe(g)
    }
  })

  it('rejects invalid grade', () => {
    expect(GradeSchema.safeParse('E').success).toBe(false)
  })

  it('rejects lowercase', () => {
    expect(GradeSchema.safeParse('a').success).toBe(false)
  })

  it('rejects null', () => {
    expect(GradeSchema.safeParse(null).success).toBe(false)
  })
})

// ── graph.schema ────────────────────────────────────────────────────────────

describe('GraphProjectSchema', () => {
  const valid = { id: 'p1', name: 'test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }

  it('accepts valid project', () => {
    expect(GraphProjectSchema.parse(valid).name).toBe('test')
  })

  it('rejects missing createdAt', () => {
    const { createdAt: _, ...rest } = valid
    expect(GraphProjectSchema.safeParse(rest).success).toBe(false)
  })
})

describe('GraphIndexesSchema', () => {
  it('accepts valid indexes', () => {
    const data = { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} }
    expect(GraphIndexesSchema.parse(data).byId).toEqual({})
  })
})

describe('GraphMetaSchema', () => {
  it('accepts valid meta', () => {
    const data = { sourceFiles: [], lastImport: null }
    expect(GraphMetaSchema.parse(data).lastImport).toBeNull()
  })

  it('accepts non-null lastImport', () => {
    const data = { sourceFiles: ['a.json'], lastImport: '2026-01-01T00:00:00Z' }
    expect(GraphMetaSchema.parse(data).lastImport).toBe('2026-01-01T00:00:00Z')
  })
})

describe('GraphDocumentSchema', () => {
  const valid = {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    nodes: [
      {
        id: 'n1',
        type: 'task' as const,
        title: 'Test task',
        status: 'backlog' as const,
        priority: 3 as const,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    edges: [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        relationType: 'depends_on' as const,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    indexes: { byId: { n1: 0 }, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }

  it('accepts valid document', () => {
    expect(GraphDocumentSchema.parse(valid).version).toBe('1.0')
  })

  it('rejects missing version', () => {
    const { version: _, ...rest } = valid
    expect(GraphDocumentSchema.safeParse(rest).success).toBe(false)
  })
})

// ── guardian-hooks.schema (wrapWithGuardian) ────────────────────────────────

describe('wrapWithGuardian', () => {
  function makeMockGuardian(verdict: string, reason = ''): GuardianReviewerInterface {
    return {
      review: async () => ({ verdict, reason, riskLevel: 'low' as const, timestamp: Date.now() }),
      getModel: () => 'haiku',
    }
  }

  it('calls handler when policy allows and LLM allows', async () => {
    const handler: ToolHandler = async (args) => `handled: ${args.command}`
    const guardian = makeMockGuardian('allow')
    const wrapped = wrapWithGuardian(handler, guardian, [])
    const result = await wrapped({ command: 'ls' })
    expect(result).toBe('handled: ls')
  })

  it('blocks when LLM denies', async () => {
    const handler: ToolHandler = async () => 'should not run'
    const guardian = makeMockGuardian('deny', 'unsafe command')
    const wrapped = wrapWithGuardian(handler, guardian, [])
    const result = await wrapped({ command: 'rm -rf /' })
    expect(result).toContain('GUARDIAN_DENIED')
  })

  it('asks user when LLM asks', async () => {
    const handler: ToolHandler = async () => 'should not run'
    const guardian = makeMockGuardian('ask_user', 'needs approval')
    const wrapped = wrapWithGuardian(handler, guardian, [])
    const result = await wrapped({ command: 'dangerous' })
    expect(result).toContain('GUARDIAN_APPROVAL_REQUIRED')
  })
})
