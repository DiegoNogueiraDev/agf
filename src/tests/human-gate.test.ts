/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/services/human-gate.ts — RealHumanGateService.
 */

import { describe, it, expect } from 'vitest'
import { RealHumanGateService } from '../core/services/human-gate.js'

describe('RealHumanGateService', () => {
  it('ask() creates a pending question', () => {
    const svc = new RealHumanGateService()
    const q = svc.ask('Deploy to prod?')
    expect(q.text).toBe('Deploy to prod?')
    expect(q.status).toBe('pending')
    expect(q.id).toMatch(/^q_/)
  })

  it('reply() moves a pending question to answered', () => {
    const svc = new RealHumanGateService()
    const q = svc.ask('Proceed?')
    const answered = svc.reply(q.id, 'yes')
    expect(answered?.status).toBe('answered')
    expect(answered?.answer).toBe('yes')
  })

  it('reject() moves a pending question to rejected with a reason', () => {
    const svc = new RealHumanGateService()
    const q = svc.ask('Proceed?')
    const rejected = svc.reject(q.id, 'unsafe')
    expect(rejected?.status).toBe('rejected')
    expect(rejected?.reason).toBe('unsafe')
  })

  it('list() filters by status and respects limit', () => {
    const svc = new RealHumanGateService()
    const a = svc.ask('a')
    svc.ask('b')
    svc.reply(a.id, 'ok')

    expect(svc.list({ status: 'pending' }).map((q) => q.text)).toEqual(['b'])
    expect(svc.list({ limit: 1 })).toHaveLength(1)
  })
})
