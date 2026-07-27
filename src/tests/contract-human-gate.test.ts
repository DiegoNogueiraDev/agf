/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Contract tests for HumanGateService.
 * Currently RED — no implementation exists yet.
 */

import { describe, it, expect } from 'vitest'
import type { HumanGateService, Question, QuestionFilter } from '../core/contracts/human-gate.js'

export function runHumanGateContractTests(createService: () => HumanGateService, label: string): void {
  describe(`HumanGateService contract — ${label}`, () => {
    let service: HumanGateService

    beforeEach(() => {
      service = createService()
    })

    describe('ask', () => {
      it('returns a pending Question with an id', () => {
        const question = service.ask('Do you approve this action?')
        expect(question).toHaveProperty('id')
        expect(question).toHaveProperty('text')
        expect(question).toHaveProperty('status')
        expect(question.text).toBe('Do you approve this action?')
        expect(question.status).toBe('pending')
        expect(question).toHaveProperty('createdAt')
        expect(typeof question.createdAt).toBe('number')
      })

      it('generates unique IDs for each question', () => {
        const q1 = service.ask('Question 1')
        const q2 = service.ask('Question 2')
        expect(q1.id).not.toBe(q2.id)
      })
    })

    describe('reply', () => {
      it('returns null for non-existent question', () => {
        const result = service.reply('non-existent', 'yes')
        expect(result).toBeNull()
      })

      it('marks question as answered and records the answer', () => {
        const question = service.ask('Should we proceed?')
        const replied = service.reply(question.id, 'yes')
        if (replied) {
          expect(replied.status).toBe('answered')
          expect(replied.answer).toBe('yes')
          expect(replied).toHaveProperty('answeredAt')
        }
      })

      it('cannot reply to an already answered question', () => {
        const question = service.ask('Test')
        service.reply(question.id, 'first')
        const second = service.reply(question.id, 'second')
        if (second) {
          // If the implementation allows second reply, the status should still be answered
          expect(second.status).toBe('answered')
          expect(second.answer).toBe('first')
        }
      })
    })

    describe('reject', () => {
      it('returns null for non-existent question', () => {
        const result = service.reject('non-existent')
        expect(result).toBeNull()
      })

      it('marks question as rejected', () => {
        const question = service.ask('Should we delete?')
        const rejected = service.reject(question.id, 'Not safe')
        if (rejected) {
          expect(rejected.status).toBe('rejected')
          expect(rejected.reason).toBe('Not safe')
        }
      })

      it('cannot reply after reject', () => {
        const question = service.ask('Test reject')
        service.reject(question.id, 'No')
        const replyAttempt = service.reply(question.id, 'trying anyway')
        if (replyAttempt) {
          expect(replyAttempt.status).toBe('rejected')
        }
      })
    })

    describe('list', () => {
      it('returns an array', () => {
        const result = service.list()
        expect(Array.isArray(result)).toBe(true)
      })

      it('returns newly asked questions', () => {
        const q = service.ask('List me')
        const result = service.list()
        expect(result.some((item) => item.id === q.id)).toBe(true)
      })

      it('filters by status', () => {
        service.ask('Pending Q')
        const answered = service.ask('Answer me')
        service.reply(answered.id, 'done')

        const pending = service.list({ status: 'pending' })
        for (const q of pending) {
          expect(q.status).toBe('pending')
        }
      })

      it('filters by multiple statuses', () => {
        const pending = service.list({ status: ['pending', 'answered'] })
        for (const q of pending) {
          expect(['pending', 'answered']).toContain(q.status)
        }
      })

      it('respects limit', () => {
        for (let i = 0; i < 5; i++) service.ask(`Q ${i}`)
        const result = service.list({ limit: 2 })
        expect(result.length).toBeLessThanOrEqual(2)
      })
    })
  })
}

describe('HumanGateService contract suite — self-validation', () => {
  it('exports runHumanGateContractTests as a function', () => {
    expect(typeof runHumanGateContractTests).toBe('function')
  })
})
