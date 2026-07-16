/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakeHumanGateService — in-memory, deterministic fake for testing.
 * Implements HumanGateService contract. Never touches SQLite or MCP.
 */

import type { HumanGateService, Question, QuestionFilter, QuestionStatus } from '../../core/contracts/human-gate.js'
import { generateId } from '../../core/utils/id.js'

export class FakeHumanGateService implements HumanGateService {
  private questions: Map<string, Question> = new Map()

  ask(text: string): Question {
    const question: Question = {
      id: 'q_' + generateId('hgate'),
      text,
      status: 'pending',
      createdAt: Date.now(),
    }
    this.questions.set(question.id, question)
    return { ...question }
  }

  reply(questionId: string, answer: string): Question | null {
    const q = this.questions.get(questionId)
    if (!q || q.status !== 'pending') return q ? { ...q } : null
    const updated: Question = { ...q, status: 'answered', answer, answeredAt: Date.now() }
    this.questions.set(questionId, updated)
    return { ...updated }
  }

  reject(questionId: string, reason?: string): Question | null {
    const q = this.questions.get(questionId)
    if (!q || q.status !== 'pending') return q ? { ...q } : null
    const updated: Question = { ...q, status: 'rejected', reason, answeredAt: Date.now() }
    this.questions.set(questionId, updated)
    return { ...updated }
  }

  list(filter?: QuestionFilter): Question[] {
    let results = [...this.questions.values()]

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
      results = results.filter((q) => statuses.includes(q.status))
    }
    if (filter?.since !== undefined) {
      results = results.filter((q) => q.createdAt >= filter.since!)
    }

    results.sort((a, b) => b.createdAt - a.createdAt)

    if (filter?.limit !== undefined) {
      results = results.slice(0, filter.limit)
    }

    return results.map((q) => ({ ...q }))
  }
}
