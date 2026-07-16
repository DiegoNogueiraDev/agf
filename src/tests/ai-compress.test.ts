/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for AI compress — ultra-compact envelope transformer.
 */

import { describe, it, expect } from 'vitest'
import { aiCompress } from '../core/output/ai-compress.js'
import type { OutputEnvelope } from '../core/output/envelope.js'

function ok<T>(data: T, command = 'test'): OutputEnvelope<T> {
  return { ok: true, data, meta: { command, ms: 10 } }
}

function fail<T>(code: string, error: string, data: T, command = 'test'): OutputEnvelope<T> {
  return { ok: false, status: 'fail', code, error, data, meta: { command, ms: 10 } }
}

describe('aiCompress', () => {
  describe('envelope structure', () => {
    it('converts ok:true to status:"ok"', () => {
      const result = aiCompress(ok({ x: 1 }))
      expect(result.ok).toBe(true)
      expect((result as Record<string, unknown>).ok).toBe(true)
    })

    it('converts ok:false to status:"fail"', () => {
      const result = aiCompress(fail('ERR', 'msg', {}))
      expect(result.ok).toBe(false)
    })

    it('preserves code and error on failure', () => {
      const result = aiCompress(fail('NOT_FOUND', 'missing', {}))
      expect(result.code).toBe('NOT_FOUND')
      expect(result.error).toBe('missing')
    })

    it('retains meta', () => {
      const result = aiCompress(ok({}, 'gate'))
      expect(result.meta.command).toBe('gate')
    })

    it('preserves meta.dir (node_bda3a53ee317 — must survive AI-mode compression, not just raw mode)', () => {
      const env: OutputEnvelope<{ id: string }> = {
        ok: true,
        data: { id: 'node_1' },
        meta: { command: 'node.status', ms: 10, dir: '/abs/path/to/project' },
      }
      const result = aiCompress(env)
      expect(result.meta.dir).toBe('/abs/path/to/project')
    })

    it('omits meta.dir entirely when the source envelope has none (no undefined noise)', () => {
      const result = aiCompress(ok({}, 'gate'))
      expect(result.meta).not.toHaveProperty('dir')
    })
  })

  describe('gate compression', () => {
    it('flattens checks array to {name: "details ✓/✗"} object', () => {
      const result = aiCompress(
        ok(
          {
            phases: [
              {
                phase: 'review',
                report: {
                  ready: false,
                  score: 64,
                  grade: 'C',
                  checks: [
                    { name: 'completion_rate', passed: true, details: '97% done', severity: 'required' },
                    { name: 'risks', passed: false, details: '8 critical', severity: 'required' },
                  ],
                  summary: 'Not ready',
                },
              },
            ],
            anyFail: true,
          },
          'gate',
        ),
      )

      const phases = (result.data as Record<string, unknown>).phases as Array<Record<string, unknown>>
      expect(phases[0].phase).toBe('review')
      expect(phases[0].ready).toBe(false)
      expect(phases[0].score).toBe(64)
      expect(phases[0].grade).toBe('C')

      const checks = phases[0].checks as Record<string, string>
      expect(checks.completion_rate).toBe('97% done ✓')
      expect(checks.risks).toBe('8 critical ✗')
    })

    it('flattens an out-of-phase-advisory-wrapped design report (data-nested ready/score/checks)', () => {
      const result = aiCompress(
        ok(
          {
            phases: [
              {
                phase: 'design',
                report: {
                  ok: true,
                  mode: 'design_ready',
                  advisory: true,
                  phaseWarning: 'Results from design_ready are non-binding in phase IMPLEMENT',
                  data: {
                    ready: false,
                    score: 50,
                    grade: 'D',
                    checks: [{ name: 'has_adrs', passed: false, details: 'no ADRs', severity: 'required' }],
                    summary: 'Not ready',
                  },
                },
              },
            ],
          },
          'gate',
        ),
      )

      const phases = (result.data as Record<string, unknown>).phases as Array<Record<string, unknown>>
      expect(phases[0].phase).toBe('design')
      expect(phases[0].advisory).toBe(true)
      expect(phases[0].phaseWarning).toContain('non-binding')
      expect(phases[0].ready).toBe(false)
      expect(phases[0].score).toBe(50)
      const checks = phases[0].checks as Record<string, string>
      expect(checks.has_adrs).toBe('no ADRs ✗')
    })

    it('strips severity and summary from gate checks', () => {
      const result = aiCompress(
        ok(
          {
            phases: [
              {
                phase: 'review',
                report: {
                  ready: true,
                  score: 90,
                  grade: 'A',
                  checks: [{ name: 'ok_check', passed: true, details: 'fine', severity: 'required' }],
                  summary: 'Ready',
                },
              },
            ],
          },
          'gate',
        ),
      )

      const report = (result.data as Record<string, unknown>).phases as Array<Record<string, unknown>>
      const checkStr = (report[0].checks as Record<string, string>).ok_check
      expect(checkStr).not.toContain('severity')
      expect(checkStr).toContain('✓')
    })
  })

  describe('check compression', () => {
    it('flattens dod.checks to compact object', () => {
      const result = aiCompress(
        ok(
          {
            dod: {
              ready: true,
              score: 85,
              grade: 'A',
              checks: [
                { name: 'has_tests', passed: true, details: '3 test files', severity: 'required' },
                { name: 'no_todos', passed: false, details: '2 TODOs found', severity: 'recommended' },
              ],
            },
            tdd: { hasTestFirst: true },
          },
          'check',
        ),
      )

      const dod = (result.data as Record<string, unknown>).dod as Record<string, unknown>
      expect(dod.ready).toBe(true)
      expect(dod.score).toBe(85)

      const checks = dod.checks as Record<string, string>
      expect(checks.has_tests).toBe('3 test files ✓')
      expect(checks.no_todos).toBe('2 TODOs found ✗')
    })
  })

  describe('done compression', () => {
    it('compresses savings to summary object', () => {
      const result = aiCompress(
        ok(
          {
            taskId: 'n1',
            dodScore: 90,
            dodGrade: 'A',
            savings: {
              totals: { tokensIn: 1000, tokensOut: 500, cost: 0.5, saved: 200 },
              totalSaved: 200,
              savingsRate: 40,
              tasks: [{ id: 'n1', tokens: 100 }],
            },
            next: { id: 'n2', title: 'Next task' },
          },
          'done',
        ),
      )

      const data = result.data as Record<string, unknown>
      expect(data.taskId).toBe('n1')
      expect(data.dodScore).toBe(90)

      const savings = data.savings as Record<string, unknown>
      expect(savings.tok).toBe(1500)
      expect(savings.cost).toBe(0.5)
      expect(savings.saved).toBe(200)
      expect(savings.rate).toBe('40%')
    })

    it('strips noise fields from done', () => {
      const result = aiCompress(
        ok(
          {
            taskId: 'n1',
            dodScore: 80,
            pheromoneDeposited: 5,
            programCheckpoint: { cycle: 10 },
          },
          'done',
        ),
      )

      const data = result.data as Record<string, unknown>
      expect(data.pheromoneDeposited).toBeUndefined()
      expect(data.programCheckpoint).toBeUndefined()
    })
  })

  describe('noise stripping', () => {
    it('removes known noise keys at any depth', () => {
      const result = aiCompress(
        ok({
          id: 'n1',
          caste: 'TRAIL',
          timestamp: '2026-01-01',
          details: ['line1', 'line2'],
          nested: {
            color: '#fff',
            summary: 'text',
            alertMessage: 'alert',
          },
        }),
      )

      const data = result.data as Record<string, unknown>
      expect(data.id).toBe('n1')
      expect(data.caste).toBeUndefined()
      expect(data.timestamp).toBeUndefined()
      expect(data.details).toBeUndefined()
      expect((data.nested as Record<string, unknown>).color).toBeUndefined()
      expect((data.nested as Record<string, unknown>).summary).toBeUndefined()
      expect((data.nested as Record<string, unknown>).alertMessage).toBeUndefined()
    })

    it('preserves essential fields', () => {
      const result = aiCompress(
        ok({
          id: 'n1',
          title: 'Task',
          status: 'done',
          score: 85,
          ready: true,
        }),
      )

      const data = result.data as Record<string, unknown>
      expect(data.id).toBe('n1')
      expect(data.title).toBe('Task')
      expect(data.status).toBe('done')
      expect(data.score).toBe(85)
      expect(data.ready).toBe(true)
    })
  })

  describe('command-owned key exemption', () => {
    it('preserves data.levers payload for the economy command', () => {
      const result = aiCompress(ok({ levers: [{ name: 'heat_kernel', enabled: true, saved: 0 }] }, 'economy'))
      const data = result.data as Record<string, unknown>
      expect(Array.isArray(data.levers)).toBe(true)
      expect((data.levers as unknown[]).length).toBe(1)
      const first = (data.levers as Record<string, unknown>[])[0]
      expect(first.name).toBe('heat_kernel')
    })

    it('still strips levers as noise for non-owning commands (savings)', () => {
      const result = aiCompress(ok({ totalSaved: 100, levers: [{ name: 'x' }] }, 'savings'))
      const data = result.data as Record<string, unknown>
      expect(data.levers).toBeUndefined()
      expect(data.totalSaved).toBe(100)
    })
  })

  describe('harness compression', () => {
    it('simplifies breakdown to {dimension: score}', () => {
      const result = aiCompress(
        ok(
          {
            score: 85,
            grade: 'A',
            breakdown: {
              types: { score: 90, weight: 0.2 },
              tests: { score: 80, weight: 0.3 },
              docs: { score: 70, weight: 0.1 },
            },
            details: ['line1', 'line2'],
            timestamp: '2026-01-01',
          },
          'harness',
        ),
      )

      const data = result.data as Record<string, unknown>
      expect(data.score).toBe(85)
      expect(data.grade).toBe('A')

      const bd = data.breakdown as Record<string, number>
      expect(bd.types).toBe(90)
      expect(bd.tests).toBe(80)
      expect(bd.docs).toBe(70)

      expect(data.details).toBeUndefined()
      expect(data.timestamp).toBeUndefined()
    })
  })

  describe('metrics compression', () => {
    it('simplifies totals to {calls, tokens, cost}', () => {
      const result = aiCompress(
        ok(
          {
            totals: {
              calls: 50,
              tokensIn: 10000,
              tokensOut: 5000,
              cachedTokensIn: 2000,
              reasoningTokens: 1000,
              total: 15000,
              costUsd: 2.5,
            },
            avgTokensPerTask: 300,
            byTask: [{ nodeId: 'n1', costUsd: 0.5 }],
          },
          'metrics',
        ),
      )

      const data = result.data as Record<string, unknown>
      const totals = data.totals as Record<string, unknown>
      expect(totals.calls).toBe(50)
      expect(totals.tokens).toBe(15000)
      expect(totals.cost).toBe(2.5)
      expect(data.byTask).toBeUndefined()
    })
  })

  describe('insights.bottlenecks compression', () => {
    it('compresses blockedTasks to {id, title, blockedBy}', () => {
      const result = aiCompress(
        ok(
          {
            blockedTasks: [
              {
                id: 'n1',
                title: 'Blocked task',
                status: 'blocked',
                blockerIds: ['n2', 'n3'],
                blockerTitles: ['Blocker 1', 'Blocker 2'],
              },
            ],
            criticalPath: { path: ['n1', 'n2'] },
          },
          'insights.bottlenecks',
        ),
      )

      const data = result.data as Record<string, unknown>
      const blocked = (data.blockedTasks as Array<Record<string, unknown>>)[0]
      expect(blocked.id).toBe('n1')
      expect(blocked.title).toBe('Blocked task')
      expect(blocked.blockedBy).toEqual(['n2', 'n3'])
      expect(blocked.blockerTitles).toBeUndefined()
      expect(blocked.status).toBeUndefined()
    })
  })

  describe('start compression', () => {
    it('extracts model from colony_signals', () => {
      const result = aiCompress(
        ok(
          {
            taskId: 'n1',
            title: 'Task',
            context: '...long...',
            colony_signals: {
              caste: 'TRAIL',
              colony_health_grade: 'A',
              active_pheromones: 5,
              suggested_model: 'cheap',
            },
          },
          'start',
        ),
      )

      const data = result.data as Record<string, unknown>
      expect(data.model).toBe('cheap')
      expect(data.colony_signals).toBeUndefined()
    })
  })
})

/**
 * `bySession` sits in NOISE_KEYS as financial drill-down, and for most envelopes it is. For
 * `agf savings` it is the answer to "how much did this sitting save?" — the question the whole
 * session-id work exists to answer. The stripper is command-blind by design; the exemption list is
 * how a command says "this one is mine". It had exactly one entry, added the last time this same
 * bug hid `levers` from `agf economy list`.
 */
describe('savings owns its payload keys', () => {
  it('keeps bySession, which the stripper would take for drill-down', () => {
    const envelope = {
      ok: true,
      data: { totalSaved: 616, bySession: [{ sessionId: 'sess_a', events: 2, saved: 616 }] },
      meta: { command: 'savings' },
    }
    const out = aiCompress(envelope as never) as { data: Record<string, unknown> }
    expect(out.data.bySession).toEqual([{ sessionId: 'sess_a', events: 2, saved: 616 }])
  })

  it('still strips it from a command that does not own it', () => {
    const envelope = { ok: true, data: { bySession: [{ sessionId: 'x' }] }, meta: { command: 'stats' } }
    const out = aiCompress(envelope as never) as { data: Record<string, unknown> }
    expect(out.data.bySession).toBeUndefined()
  })
})
