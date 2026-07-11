/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Schema validation tests — batch 6: fuzzy-search, grade-schema, graph.schema,
 * guardian-hooks, guardian-policies
 */

import { describe, it, expect } from 'vitest'
import { fuzzySearch, scoreFile } from '../schemas/fuzzy-search.schema.js'
import { GradeSchema } from '../schemas/grade-schema.js'
import {
  GraphDocumentSchema,
  GraphProjectSchema,
  GraphIndexesSchema,
  GraphMetaSchema,
} from '../schemas/graph.schema.js'
import { wrapWithGuardian } from '../schemas/guardian-hooks.schema.js'
import {
  DEFAULT_POLICIES,
  matchPolicy,
  type GuardianPolicy,
  type GuardianPolicyConfig,
} from '../schemas/guardian-policies.schema.js'

// ── fuzzy-search ──

describe('fuzzySearch', () => {
  const files = [
    'src/core/agent-driver/driver.ts',
    'src/core/llm/gateway.ts',
    'src/core/hooks/hook-bus.ts',
    'src/tests/fuzzy-search.test.ts',
  ]

  it('should return ranked results for matching query', () => {
    const results = fuzzySearch('driver', files)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.score).toBeGreaterThan(0)
  })

  it('should return empty for no match', () => {
    expect(fuzzySearch('zzzzzz', files)).toEqual([])
  })

  it('should handle empty query', () => {
    expect(fuzzySearch('', files)).toEqual([])
    expect(fuzzySearch('   ', files)).toEqual([])
  })

  it('should rank exact filename match highest', () => {
    const r = fuzzySearch('driver.ts', files)
    expect(r[0]!.file).toBe('src/core/agent-driver/driver.ts')
  })

  it('should return matches array in results', () => {
    const r = fuzzySearch('gateway', files)
    expect(r[0]!.matches).toEqual([])
  })
})

describe('scoreFile', () => {
  it('should give high score for exact match', () => {
    const s = scoreFile('driver.ts', 'src/core/agent-driver/driver.ts')
    expect(s).toBeGreaterThanOrEqual(900)
  })

  it('should give 1000 for exact path match', () => {
    expect(scoreFile('src/core/agent-driver/driver.ts', 'src/core/agent-driver/driver.ts')).toBe(1000)
  })

  it('should return >0 for substring match', () => {
    expect(scoreFile('driver', 'src/core/agent-driver/driver.ts')).toBeGreaterThan(0)
  })

  it('should return 0 for no match', () => {
    expect(scoreFile('xyz', 'src/core/agent-driver/driver.ts')).toBe(0)
  })

  it('should prefer consecutive character matches', () => {
    const consecutive = scoreFile('hook', 'src/core/hooks/hook-bus.ts')
    const nonConsecutive = scoreFile('hk', 'src/core/hooks/hook-bus.ts')
    expect(consecutive).toBeGreaterThanOrEqual(nonConsecutive)
  })

  it('should be case-insensitive', () => {
    const upper = scoreFile('DRIVER', 'src/core/agent-driver/driver.ts')
    const lower = scoreFile('driver', 'src/core/agent-driver/driver.ts')
    expect(upper).toBeGreaterThan(0)
    expect(upper).toBe(lower)
  })
})

// ── grade-schema ──

describe('GradeSchema', () => {
  it('should accept valid grades', () => {
    expect(GradeSchema.parse('A')).toBe('A')
    expect(GradeSchema.parse('B')).toBe('B')
    expect(GradeSchema.parse('C')).toBe('C')
    expect(GradeSchema.parse('D')).toBe('D')
    expect(GradeSchema.parse('F')).toBe('F')
  })

  it('should reject invalid grades', () => {
    expect(() => GradeSchema.parse('')).toThrow()
    expect(() => GradeSchema.parse('a')).toThrow()
    expect(() => GradeSchema.parse('E')).toThrow()
    expect(() => GradeSchema.parse(1)).toThrow()
    expect(() => GradeSchema.parse(null)).toThrow()
    expect(() => GradeSchema.parse(undefined)).toThrow()
  })

  it('should reject non-string values', () => {
    expect(() => GradeSchema.parse(0)).toThrow()
    expect(() => GradeSchema.parse(true)).toThrow()
    expect(() => GradeSchema.parse([])).toThrow()
  })
})

// ── graph.schema ──

describe('GraphProjectSchema', () => {
  it('should accept valid project', () => {
    const project = GraphProjectSchema.parse({
      id: 'proj-1',
      name: 'Test Project',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    })
    expect(project.id).toBe('proj-1')
  })

  it('should accept project with fsPath', () => {
    const project = GraphProjectSchema.parse({
      id: 'proj-2',
      name: 'Another',
      fsPath: '/tmp/test',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    })
    expect(project.fsPath).toBe('/tmp/test')
  })

  it('should reject missing required fields', () => {
    expect(() => GraphProjectSchema.parse({ id: 'x' })).toThrow()
    expect(() => GraphProjectSchema.parse({})).toThrow()
  })

  it('should reject undefined name', () => {
    expect(() => GraphProjectSchema.parse({ id: 'x', createdAt: 't', updatedAt: 't' })).toThrow()
  })
})

describe('GraphIndexesSchema', () => {
  it('should accept valid indexes', () => {
    const indexes = GraphIndexesSchema.parse({
      byId: { node1: 0 },
      childrenByParent: { root: ['child1'] },
      incomingByNode: { child1: ['root'] },
      outgoingByNode: { root: ['child1'] },
    })
    expect(indexes.byId.node1).toBe(0)
  })

  it('should accept empty records', () => {
    const indexes = GraphIndexesSchema.parse({
      byId: {},
      childrenByParent: {},
      incomingByNode: {},
      outgoingByNode: {},
    })
    expect(indexes.byId).toEqual({})
  })

  it('should reject non-object values', () => {
    expect(() => GraphIndexesSchema.parse(null)).toThrow()
  })
})

describe('GraphMetaSchema', () => {
  it('should accept valid meta', () => {
    const meta = GraphMetaSchema.parse({ sourceFiles: ['/tmp/a.md'], lastImport: null })
    expect(meta.sourceFiles).toHaveLength(1)
  })

  it('should accept lastImport as string', () => {
    const meta = GraphMetaSchema.parse({ sourceFiles: [], lastImport: '2024-01-01' })
    expect(meta.lastImport).toBe('2024-01-01')
  })

  it('should reject non-array sourceFiles', () => {
    expect(() => GraphMetaSchema.parse({ sourceFiles: 'not-array', lastImport: null })).toThrow()
  })
})

describe('GraphDocumentSchema', () => {
  const validDoc = {
    version: '1.0',
    project: {
      id: 'p1',
      name: 'Project',
      createdAt: 't1',
      updatedAt: 't2',
    },
    nodes: [],
    edges: [],
    indexes: {
      byId: {},
      childrenByParent: {},
      incomingByNode: {},
      outgoingByNode: {},
    },
    meta: { sourceFiles: [], lastImport: null },
  }

  it('should accept valid document', () => {
    const doc = GraphDocumentSchema.parse(validDoc)
    expect(doc.version).toBe('1.0')
  })

  it('should reject missing version', () => {
    expect(() => GraphDocumentSchema.parse({ ...validDoc, version: undefined })).toThrow()
  })

  it('should reject non-array nodes', () => {
    expect(() => GraphDocumentSchema.parse({ ...validDoc, nodes: 'bad' })).toThrow()
  })
})

// ── guardian-hooks ──

describe('wrapWithGuardian', () => {
  it('should return a function', () => {
    const handler = async () => 'ok'
    const guardian = {
      review: async () => ({ verdict: 'allow' as const, reason: '', risk: 'low' as const }),
      clearCache: () => {},
    }
    const wrapped = wrapWithGuardian(handler, guardian, DEFAULT_POLICIES)
    expect(typeof wrapped).toBe('function')
  })

  it('should deny when policy blocks', async () => {
    const handler = async () => 'ok'
    const guardian = {
      review: async () => ({ verdict: 'allow' as const, reason: '', risk: 'low' as const }),
      clearCache: () => {},
    }
    const policies: GuardianPolicy[] = [{ toolPattern: 'bash', action: 'deny', riskLevel: 'high' }]
    const wrapped = wrapWithGuardian(handler, guardian, policies)
    const result = await wrapped({ command: 'rm -rf /' })
    expect(result).toContain('GUARDIAN_DENIED')
  })

  it('should ask_user when policy requires approval', async () => {
    const handler = async () => 'ok'
    const guardian = {
      review: async () => ({ verdict: 'allow' as const, reason: '', risk: 'low' as const }),
      clearCache: () => {},
    }
    const policies: GuardianPolicy[] = [
      { toolPattern: 'write', conditions: { pathsContain: '/etc' }, action: 'ask_user', riskLevel: 'medium' },
    ]
    const wrapped = wrapWithGuardian(handler, guardian, policies)
    const result = await wrapped({ filePath: '/etc/config.json' })
    expect(result).toContain('GUARDIAN_APPROVAL_REQUIRED')
  })

  it('should allow when matched by policy and guardian', async () => {
    const handler = async () => 'executed'
    const guardian = {
      review: async () => ({ verdict: 'allow' as const, reason: '', risk: 'low' as const }),
      clearCache: () => {},
    }
    const policies: GuardianPolicy[] = [{ toolPattern: 'read', action: 'allow', riskLevel: 'low' }]
    const wrapped = wrapWithGuardian(handler, guardian, policies)
    const result = await wrapped({ pattern: '*.ts' })
    expect(result).toBe('executed')
  })

  it('should fall through on guardian error', async () => {
    const handler = async () => 'fallback-ok'
    const guardian = {
      review: async () => {
        throw new Error('LLM down')
      },
      clearCache: () => {},
    }
    const wrapped = wrapWithGuardian(handler, guardian, DEFAULT_POLICIES)
    const result = await wrapped({ command: 'echo hi' })
    expect(result).toBe('fallback-ok')
  })
})

// ── guardian-policies ──

describe('DEFAULT_POLICIES', () => {
  it('should have 3 policies', () => {
    expect(DEFAULT_POLICIES).toHaveLength(3)
  })

  it('should include deny for destructive bash', () => {
    expect(DEFAULT_POLICIES[0]!.action).toBe('deny')
  })

  it('should include ask_user for sensitive paths', () => {
    const askUser = DEFAULT_POLICIES.filter((p) => p.action === 'ask_user')
    expect(askUser.length).toBeGreaterThan(0)
  })

  it('should include catch-all allow', () => {
    const allow = DEFAULT_POLICIES.filter((p) => p.action === 'allow')
    expect(allow.length).toBeGreaterThan(0)
  })
})

describe('GuardianPolicyConfig type', () => {
  it('should accept valid config', () => {
    const config: GuardianPolicyConfig = {
      guardian: {
        model: 'haiku',
        policies: [
          { toolPattern: 'bash', action: 'deny', riskLevel: 'high' },
          { toolPattern: '*', action: 'allow', riskLevel: 'low' },
        ],
      },
    }
    expect(config.guardian.policies).toHaveLength(2)
  })
})

describe('matchPolicy', () => {
  const policies: GuardianPolicy[] = [
    { toolPattern: 'bash', conditions: { commandContains: 'rm -rf' }, action: 'deny', riskLevel: 'high' },
    { toolPattern: 'write', conditions: { pathsContain: '/etc' }, action: 'ask_user', riskLevel: 'medium' },
    { toolPattern: '*', action: 'allow', riskLevel: 'low' },
  ]

  it('should deny destructive bash', () => {
    expect(matchPolicy('bash', { command: 'rm -rf /' }, policies)?.action).toBe('deny')
  })

  it('should allow harmless bash', () => {
    expect(matchPolicy('bash', { command: 'ls -la' }, policies)?.action).toBe('allow')
  })

  it('should ask_user for sensitive paths', () => {
    expect(matchPolicy('write', { path: '/etc/passwd' }, policies)?.action).toBe('ask_user')
  })

  it('should allow reads by default', () => {
    expect(matchPolicy('read', { path: '/tmp/file.txt' }, policies)?.action).toBe('allow')
  })

  it('should cascade deny > ask_user > allow', () => {
    const cascade: GuardianPolicy[] = [
      { toolPattern: 'bash', action: 'deny', riskLevel: 'high' },
      { toolPattern: 'bash', action: 'ask_user', riskLevel: 'medium' },
    ]
    expect(matchPolicy('bash', {}, cascade)?.action).toBe('deny')
  })

  it('should return null for unmatched tool with empty policies', () => {
    expect(matchPolicy('bash', {}, [])).toBeNull()
  })

  it('should match wildcard pattern', () => {
    expect(matchPolicy('anytool', {}, policies)?.action).toBe('allow')
  })

  it('should match argContains condition', () => {
    const p: GuardianPolicy[] = [
      { toolPattern: 'write', conditions: { argContains: 'dangerous' }, action: 'deny', riskLevel: 'high' },
      { toolPattern: '*', action: 'allow', riskLevel: 'low' },
    ]
    expect(matchPolicy('write', { content: 'dangerous stuff' }, p)?.action).toBe('deny')
  })
})
