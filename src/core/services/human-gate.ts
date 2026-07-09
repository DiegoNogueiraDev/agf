/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * RealHumanGateService — in-memory human-in-the-loop service.
 * Manages questions/permissions/approvals with neutral contracts.
 *
 * NOT YET WIRED to any production surface (verified 2026-07-04): the TUI's
 * confirmation flow (confirm-dialog.tsx) is a synchronous, same-render-cycle
 * y/N prompt driven by local React state — a different pattern from this
 * service's async ask()/reply() (a question can outlive the render that
 * created it). No PermissionBroker/QuestionBroker production implementation
 * exists either — only fakes (src/tests/helpers/). Tested via
 * contract-human-gate.test.ts and FakeHostAdapter, awaiting a real
 * cross-process consumer before this docblock can honestly claim adoption.
 */

import type { HumanGateService, Question, QuestionFilter } from '../contracts/human-gate.js'
import { generateId } from '../utils/id.js'

export class RealHumanGateService implements HumanGateService {
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
