/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Schema validation tests — batch 8: implementer-schema, journey-run,
 * jsonrpc.schema, knowledge-package, knowledge.schema
 */

import { describe, it, expect } from 'vitest'
import {
  DodCheckSchema,
  ImplementDoneReportSchema,
  SuggestedTestTypeSchema,
  SuggestedTestSpecSchema,
  TddTaskReportSchema,
  TddCheckReportSchema,
  BurndownSchema,
  VelocityTrendSchema,
  BlockerDetailSchema,
  SprintProgressReportSchema,
} from '../schemas/implementer-schema.js'
import {
  JourneyRunSchema,
  JourneyStepResultSchema,
  JourneyPlannedStepSchema,
  JourneyRunVerdictSchema,
  JourneyRunEventSchema,
} from '../schemas/journey-run.schema.js'
import {
  RequestSchema,
  NotificationSchema,
  ResponseSchema,
  ErrorSchema,
  JSONRPCMessageSchema,
} from '../schemas/jsonrpc.schema.js'
import {
  KnowledgePackageSchema,
  KnowledgeDocumentExportSchema,
  KnowledgeRelationExportSchema,
  MemoryExportSchema,
  TranslationMemoryExportSchema,
  KnowledgePackageManifestSchema,
} from '../schemas/knowledge-package.schema.js'
import {
  KnowledgeDocumentSchema,
  KnowledgeRelationSchema,
  KnowledgeUsageLogSchema,
  KnowledgeSourceTypeSchema,
  KnowledgeRelationTypeSchema,
  KnowledgeUsageActionSchema,
} from '../schemas/knowledge.schema.js'

// ── implementer-schema ──

describe('DodCheckSchema', () => {
  it('should accept valid check', () => {
    const c = DodCheckSchema.parse({
      name: 'has_tests',
      passed: true,
      details: 'all tests pass',
      severity: 'required',
    })
    expect(c.passed).toBe(true)
  })

  it('should accept recommended severity', () => {
    const c = DodCheckSchema.parse({
      name: 'nice',
      passed: false,
      details: '',
      severity: 'recommended',
    })
    expect(c.severity).toBe('recommended')
  })

  it('should reject invalid severity', () => {
    expect(() => DodCheckSchema.parse({ name: 'x', passed: true, details: '', severity: 'invalid' })).toThrow()
  })
})

describe('ImplementDoneReportSchema', () => {
  it('should accept valid report', () => {
    const r = ImplementDoneReportSchema.parse({
      nodeId: 'n1',
      title: 'Task',
      checks: [],
      ready: true,
      score: 90,
      grade: 'A',
      summary: 'done',
    })
    expect(r.grade).toBe('A')
  })

  it('should reject score > 100', () => {
    expect(() =>
      ImplementDoneReportSchema.parse({
        nodeId: 'n1',
        title: 'T',
        checks: [],
        ready: true,
        score: 200,
        grade: 'A',
        summary: '',
      }),
    ).toThrow()
  })
})

describe('SuggestedTestTypeSchema', () => {
  it('should accept valid types', () => {
    expect(SuggestedTestTypeSchema.parse('unit')).toBe('unit')
    expect(SuggestedTestTypeSchema.parse('integration')).toBe('integration')
    expect(SuggestedTestTypeSchema.parse('e2e')).toBe('e2e')
  })

  it('should reject invalid type', () => {
    expect(() => SuggestedTestTypeSchema.parse('acceptance')).toThrow()
  })
})

describe('SuggestedTestSpecSchema', () => {
  it('should accept valid spec', () => {
    const s = SuggestedTestSpecSchema.parse({
      testName: 'should do X',
      fromAc: 'AC-1',
      type: 'unit',
    })
    expect(s.testName).toBe('should do X')
  })
})

describe('TddTaskReportSchema', () => {
  it('should accept valid report', () => {
    const r = TddTaskReportSchema.parse({
      nodeId: 'n1',
      title: 'T',
      totalAcs: 3,
      testableAcs: 2,
      measurableAcs: 1,
      testabilityScore: 66,
      suggestedTests: [],
    })
    expect(r.testabilityScore).toBe(66)
  })
})

describe('TddCheckReportSchema', () => {
  it('should accept valid report', () => {
    const r = TddCheckReportSchema.parse({
      tasks: [],
      overallTestability: 75,
      tasksAtRisk: 0,
      suggestedTestSpecs: [],
      summary: 'good',
    })
    expect(r.overallTestability).toBe(75)
  })
})

describe('BurndownSchema', () => {
  it('should accept valid burndown', () => {
    const b = BurndownSchema.parse({
      total: 10,
      done: 4,
      inProgress: 2,
      blocked: 1,
      backlog: 2,
      ready: 1,
      donePercent: 40,
    })
    expect(b.done).toBe(4)
  })

  it('should reject negative values', () => {
    expect(() =>
      BurndownSchema.parse({
        total: -1,
        done: 0,
        inProgress: 0,
        blocked: 0,
        backlog: 0,
        ready: 0,
        donePercent: 0,
      }),
    ).toThrow()
  })
})

describe('VelocityTrendSchema', () => {
  it('should accept valid trend', () => {
    const v = VelocityTrendSchema.parse({ currentSprintVelocity: 10, averageVelocity: 8, trend: 'up' })
    expect(v.trend).toBe('up')
  })

  it('should reject invalid trend', () => {
    expect(() =>
      VelocityTrendSchema.parse({ currentSprintVelocity: 0, averageVelocity: 0, trend: 'sideways' }),
    ).toThrow()
  })
})

describe('BlockerDetailSchema', () => {
  it('should accept valid blocker', () => {
    const b = BlockerDetailSchema.parse({ nodeId: 'n1', title: 'Blocked', blockedBy: ['dep1', 'dep2'] })
    expect(b.blockedBy).toHaveLength(2)
  })
})

describe('SprintProgressReportSchema', () => {
  it('should accept valid report', () => {
    const r = SprintProgressReportSchema.parse({
      sprint: 'S1',
      burndown: { total: 10, done: 5, inProgress: 2, blocked: 1, backlog: 1, ready: 1, donePercent: 50 },
      velocityTrend: { currentSprintVelocity: 5, averageVelocity: 4, trend: 'up' },
      blockers: [],
      criticalPathRemaining: 3,
      estimatedCompletionDays: null,
      summary: 'on track',
    })
    expect(r.sprint).toBe('S1')
  })

  it('should handle nullable sprint', () => {
    const r = SprintProgressReportSchema.parse({
      sprint: null,
      burndown: { total: 0, done: 0, inProgress: 0, blocked: 0, backlog: 0, ready: 0, donePercent: 0 },
      velocityTrend: { currentSprintVelocity: 0, averageVelocity: 0, trend: 'stable' },
      blockers: [],
      criticalPathRemaining: 0,
      estimatedCompletionDays: 5,
      summary: '',
    })
    expect(r.estimatedCompletionDays).toBe(5)
  })
})

// ── journey-run ──

describe('JourneyRunVerdictSchema', () => {
  it('should accept valid verdicts', () => {
    expect(JourneyRunVerdictSchema.parse('pass')).toBe('pass')
    expect(JourneyRunVerdictSchema.parse('fail')).toBe('fail')
    expect(JourneyRunVerdictSchema.parse('error')).toBe('error')
    expect(JourneyRunVerdictSchema.parse('running')).toBe('running')
  })

  it('should reject invalid verdict', () => {
    expect(() => JourneyRunVerdictSchema.parse('unknown')).toThrow()
  })
})

describe('JourneyStepResultSchema', () => {
  it('should accept valid result', () => {
    const r = JourneyStepResultSchema.parse({
      index: 0,
      screenId: null,
      helper: 'click',
      ok: true,
      durationMs: 100,
      screenshotPath: null,
      ocrText: null,
      domText: null,
      error: null,
    })
    expect(r.ok).toBe(true)
  })

  it('should accept with values', () => {
    const r = JourneyStepResultSchema.parse({
      index: 1,
      screenId: 's1',
      helper: 'type',
      args: { selector: '#name' },
      ok: true,
      durationMs: 200,
      screenshotPath: '/tmp/s1.png',
      ocrText: 'hello',
      domText: '<div>hello</div>',
      error: null,
    })
    expect(r.helper).toBe('type')
  })

  it('should reject negative index', () => {
    expect(() =>
      JourneyStepResultSchema.parse({
        index: -1,
        screenId: null,
        helper: 'click',
        ok: true,
        durationMs: 0,
        screenshotPath: null,
        ocrText: null,
        domText: null,
        error: null,
      }),
    ).toThrow()
  })
})

describe('JourneyPlannedStepSchema', () => {
  it('should accept valid step', () => {
    const s = JourneyPlannedStepSchema.parse({ index: 0, screenId: 's1', helper: 'click' })
    expect(s.helper).toBe('click')
  })

  it('should default args to {}', () => {
    const s = JourneyPlannedStepSchema.parse({ index: 0, screenId: null, helper: 'navigate' })
    expect(s.args).toEqual({})
  })
})

describe('JourneyRunSchema', () => {
  const validRun = {
    id: 'run-1',
    mapId: 'map-1',
    variantId: null,
    nodeId: null,
    prompt: null,
    plan: [],
    results: [],
    verdict: 'running' as const,
    durationMs: 0,
    createdAt: 1000,
    finishedAt: null,
  }

  it('should accept valid run', () => {
    const r = JourneyRunSchema.parse(validRun)
    expect(r.id).toBe('run-1')
  })

  it('should accept finished run', () => {
    const r = JourneyRunSchema.parse({
      ...validRun,
      verdict: 'pass',
      durationMs: 5000,
      finishedAt: 6000,
    })
    expect(r.finishedAt).toBe(6000)
  })

  it('should reject missing mapId', () => {
    expect(() => JourneyRunSchema.parse({ ...validRun, mapId: undefined })).toThrow()
  })
})

describe('JourneyRunEventSchema', () => {
  it('should accept plan event', () => {
    const e = JourneyRunEventSchema.parse({ type: 'plan', steps: [] })
    expect(e.type).toBe('plan')
  })

  it('should accept step event', () => {
    const e = JourneyRunEventSchema.parse({
      type: 'step',
      index: 0,
      screenId: null,
      helper: 'click',
      ok: true,
      durationMs: 100,
      error: null,
    })
    expect(e.type).toBe('step')
  })

  it('should accept ocr event', () => {
    const e = JourneyRunEventSchema.parse({
      type: 'ocr',
      index: 0,
      text: 'hello',
      confidence: 95,
    })
    expect(e.type).toBe('ocr')
  })

  it('should accept verdict event', () => {
    const e = JourneyRunEventSchema.parse({
      type: 'verdict',
      verdict: 'pass',
      ok: true,
      runId: 'r1',
      durationMs: 1000,
    })
    expect(e.type).toBe('verdict')
  })

  it('should accept done event', () => {
    const e = JourneyRunEventSchema.parse({ type: 'done', runId: 'r1' })
    expect(e.type).toBe('done')
  })

  it('should accept error event', () => {
    const e = JourneyRunEventSchema.parse({ type: 'error', error: 'something broke' })
    expect(e.type).toBe('error')
  })

  it('should reject unknown event type', () => {
    expect(() => JourneyRunEventSchema.parse({ type: 'unknown' })).toThrow()
  })

  it('should reject ocr with out-of-range confidence', () => {
    expect(() =>
      JourneyRunEventSchema.parse({
        type: 'ocr',
        index: 0,
        text: 'hi',
        confidence: 101,
      }),
    ).toThrow()
  })
})

// ── jsonrpc.schema ──

describe('RequestSchema', () => {
  it('should accept valid request', () => {
    const r = RequestSchema.parse({ jsonrpc: '2.0', id: 1, method: 'ping' })
    expect(r.method).toBe('ping')
  })

  it('should accept string id', () => {
    const r = RequestSchema.parse({ jsonrpc: '2.0', id: 'abc', method: 'echo', params: { msg: 'hi' } })
    expect(r.id).toBe('abc')
  })

  it('should reject non-2.0 jsonrpc', () => {
    expect(() => RequestSchema.parse({ jsonrpc: '1.0', id: 1, method: 'x' })).toThrow()
  })
})

describe('NotificationSchema', () => {
  it('should accept valid notification', () => {
    const n = NotificationSchema.parse({ jsonrpc: '2.0', method: 'update' })
    expect(n.method).toBe('update')
  })

  it('should reject notification with id', () => {
    expect(() => NotificationSchema.parse({ jsonrpc: '2.0', id: 1, method: 'x' })).toThrow()
  })
})

describe('ResponseSchema', () => {
  it('should accept valid response', () => {
    const r = ResponseSchema.parse({ jsonrpc: '2.0', id: 1, result: 'ok' })
    expect(r.result).toBe('ok')
  })

  it('should accept null result', () => {
    const r = ResponseSchema.parse({ jsonrpc: '2.0', id: 1, result: null })
    expect(r.result).toBeNull()
  })
})

describe('ErrorSchema', () => {
  it('should accept valid error', () => {
    const e = ErrorSchema.parse({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid Request' } })
    expect(e.error.code).toBe(-32600)
  })

  it('should accept error with data', () => {
    const e = ErrorSchema.parse({ jsonrpc: '2.0', id: 'x', error: { code: 0, message: 'err', data: { detail: 'x' } } })
    expect(e.error.data).toEqual({ detail: 'x' })
  })
})

describe('JSONRPCMessageSchema', () => {
  it('should parse a request', () => {
    const m = JSONRPCMessageSchema.parse({ jsonrpc: '2.0', id: 1, method: 'ping' })
    expect(m).toHaveProperty('method')
  })

  it('should parse a response', () => {
    const m = JSONRPCMessageSchema.parse({ jsonrpc: '2.0', id: 1, result: 'ok' })
    expect(m).toHaveProperty('result')
  })

  it('should parse a notification', () => {
    const m = JSONRPCMessageSchema.parse({ jsonrpc: '2.0', method: 'update' })
    expect(m).toHaveProperty('method')
  })

  it('should parse an error', () => {
    const m = JSONRPCMessageSchema.parse({ jsonrpc: '2.0', id: 1, error: { code: 0, message: '' } })
    expect(m).toHaveProperty('error')
  })

  it('should reject invalid message', () => {
    expect(() => JSONRPCMessageSchema.parse({})).toThrow()
  })
})

// ── knowledge-package ──

describe('KnowledgeDocumentExportSchema', () => {
  it('should accept valid document', () => {
    const d = KnowledgeDocumentExportSchema.parse({
      sourceType: 'docs',
      sourceId: 's1',
      title: 'Doc',
      content: 'body',
      contentHash: 'abc123',
      createdAt: 't1',
    })
    expect(d.title).toBe('Doc')
  })

  it('should accept optional fields', () => {
    const d = KnowledgeDocumentExportSchema.parse({
      sourceType: 'memory',
      sourceId: 's2',
      title: 'Memo',
      content: 'text',
      contentHash: 'def',
      metadata: { key: 'val' },
      qualityScore: 0.8,
      createdAt: 't1',
    })
    expect(d.qualityScore).toBe(0.8)
  })

  it('should reject qualityScore > 1', () => {
    expect(() =>
      KnowledgeDocumentExportSchema.parse({
        sourceType: 'docs',
        sourceId: 's1',
        title: 'D',
        content: 'c',
        contentHash: 'h',
        createdAt: 't',
        qualityScore: 1.5,
      }),
    ).toThrow()
  })

  it('should reject null sourceId', () => {
    expect(() =>
      KnowledgeDocumentExportSchema.parse({
        sourceType: 'docs',
        title: 'D',
        content: 'c',
        contentHash: 'h',
        createdAt: 't',
      }),
    ).toThrow()
  })
})

describe('KnowledgeRelationExportSchema', () => {
  it('should accept valid relation', () => {
    const r = KnowledgeRelationExportSchema.parse({
      fromDocSourceId: 's1',
      toDocSourceId: 's2',
      relation: 'related_to',
      score: 0.5,
    })
    expect(r.relation).toBe('related_to')
  })
})

describe('MemoryExportSchema', () => {
  it('should accept valid memory', () => {
    const m = MemoryExportSchema.parse({ name: 'arch-v1', content: '# Architecture' })
    expect(m.name).toBe('arch-v1')
  })
})

describe('TranslationMemoryExportSchema', () => {
  it('should accept valid entry', () => {
    const t = TranslationMemoryExportSchema.parse({
      constructId: 'c1',
      sourceLanguage: 'ts',
      targetLanguage: 'py',
      confidenceBoost: 0,
      acceptanceCount: 5,
      correctionCount: 1,
    })
    expect(t.acceptanceCount).toBe(5)
  })
})

describe('KnowledgePackageManifestSchema', () => {
  it('should accept valid manifest', () => {
    const m = KnowledgePackageManifestSchema.parse({
      projectName: 'test',
      exportedAt: 't1',
      documentCount: 10,
      memoryCount: 2,
      sourceTypes: ['docs', 'memory'],
      qualityThreshold: 0.5,
    })
    expect(m.projectName).toBe('test')
  })
})

describe('KnowledgePackageSchema', () => {
  it('should accept valid package', () => {
    const p = KnowledgePackageSchema.parse({
      version: '1.0',
      manifest: {
        projectName: 'test',
        exportedAt: 't1',
        documentCount: 0,
        memoryCount: 0,
        sourceTypes: [],
        qualityThreshold: 0,
      },
      documents: [],
    })
    expect(p.version).toBe('1.0')
  })

  it('should accept optional fields', () => {
    const p = KnowledgePackageSchema.parse({
      version: '1.0',
      manifest: {
        projectName: 't',
        exportedAt: 't',
        documentCount: 1,
        memoryCount: 0,
        sourceTypes: ['a'],
        qualityThreshold: 0,
      },
      documents: [{ sourceType: 'docs', sourceId: 's1', title: 'D', content: 'c', contentHash: 'h', createdAt: 't' }],
      relations: [{ fromDocSourceId: 's1', toDocSourceId: 's2', relation: 'r', score: 0 }],
    })
    expect(p.relations).toHaveLength(1)
  })
})

// ── knowledge.schema ──

describe('KnowledgeSourceTypeSchema', () => {
  it('should accept valid source types', () => {
    expect(KnowledgeSourceTypeSchema.parse('docs')).toBe('docs')
    expect(KnowledgeSourceTypeSchema.parse('upload')).toBe('upload')
    expect(KnowledgeSourceTypeSchema.parse('architectural_signal')).toBe('architectural_signal')
  })

  it('should reject invalid source type', () => {
    expect(() => KnowledgeSourceTypeSchema.parse('unknown_type')).toThrow()
  })
})

describe('KnowledgeDocumentSchema', () => {
  it('should accept valid document', () => {
    const d = KnowledgeDocumentSchema.parse({
      id: 'doc-1',
      sourceType: 'docs',
      sourceId: 's1',
      title: 'Doc',
      content: 'body',
      contentHash: 'abc',
      chunkIndex: 0,
      createdAt: 't1',
      updatedAt: 't2',
    })
    expect(d.id).toBe('doc-1')
  })

  it('should accept optional fields', () => {
    const d = KnowledgeDocumentSchema.parse({
      id: 'doc-2',
      sourceType: 'memory',
      sourceId: 's2',
      title: 'Memo',
      content: 'hello',
      contentHash: 'def',
      chunkIndex: 1,
      createdAt: 't1',
      updatedAt: 't2',
      metadata: { tags: ['test'] },
      qualityScore: 0.9,
      usageCount: 5,
      lastAccessedAt: 't3',
      stalenessDays: 10,
    })
    expect(d.qualityScore).toBe(0.9)
  })

  it('should reject negative chunkIndex', () => {
    expect(() =>
      KnowledgeDocumentSchema.parse({
        id: 'd',
        sourceType: 'docs',
        sourceId: 's',
        title: 'T',
        content: 'c',
        contentHash: 'h',
        chunkIndex: -1,
        createdAt: 't',
        updatedAt: 't',
      }),
    ).toThrow()
  })
})

describe('KnowledgeRelationTypeSchema', () => {
  it('should accept valid relation types', () => {
    expect(KnowledgeRelationTypeSchema.parse('related_to')).toBe('related_to')
    expect(KnowledgeRelationTypeSchema.parse('derived_from')).toBe('derived_from')
    expect(KnowledgeRelationTypeSchema.parse('supersedes')).toBe('supersedes')
    expect(KnowledgeRelationTypeSchema.parse('contradicts')).toBe('contradicts')
  })
})

describe('KnowledgeRelationSchema', () => {
  it('should accept valid relation', () => {
    const r = KnowledgeRelationSchema.parse({
      id: 'rel-1',
      fromDocId: 'd1',
      toDocId: 'd2',
      relation: 'related_to',
      createdAt: 't1',
    })
    expect(r.score).toBe(1)
  })
})

describe('KnowledgeUsageActionSchema', () => {
  it('should accept valid actions', () => {
    expect(KnowledgeUsageActionSchema.parse('retrieved')).toBe('retrieved')
    expect(KnowledgeUsageActionSchema.parse('helpful')).toBe('helpful')
    expect(KnowledgeUsageActionSchema.parse('unhelpful')).toBe('unhelpful')
    expect(KnowledgeUsageActionSchema.parse('outdated')).toBe('outdated')
  })
})

describe('KnowledgeUsageLogSchema', () => {
  it('should accept valid log entry', () => {
    const l = KnowledgeUsageLogSchema.parse({
      id: 1,
      docId: 'd1',
      query: 'how to',
      action: 'retrieved',
      createdAt: 't1',
    })
    expect(l.action).toBe('retrieved')
  })

  it('should accept optional context', () => {
    const l = KnowledgeUsageLogSchema.parse({
      id: 2,
      docId: 'd2',
      query: 'test',
      action: 'helpful',
      context: { reason: 'good' },
      createdAt: 't1',
    })
    expect(l.context?.reason).toBe('good')
  })
})
