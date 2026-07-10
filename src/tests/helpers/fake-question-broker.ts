/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakeQuestionBroker — in-memory question/answer broker for testing.
 * Simulates human-in-the-loop without real user interaction.
 */

export type QuestionStatus = 'pending' | 'answered' | 'rejected'

export interface FakeQuestion {
  id: string
  text: string
  status: QuestionStatus
  answer?: string
  reason?: string
  createdAt: number
  answeredAt?: number
}

export class FakeQuestionBroker {
  private questions: Map<string, FakeQuestion> = new Map()
  private nextId = 1
  /** Auto-answer function. If set, questions are answered automatically. */
  private autoAnswer?: (text: string) => string

  setAutoAnswer(fn: (text: string) => string): void {
    this.autoAnswer = fn
  }

  ask(text: string): FakeQuestion {
    const q: FakeQuestion = {
      id: `q_${this.nextId++}`,
      text,
      status: 'pending',
      createdAt: Date.now(),
    }
    this.questions.set(q.id, q)

    if (this.autoAnswer) {
      return this.answer(q.id, this.autoAnswer(text))
    }
    return { ...q }
  }

  answer(questionId: string, answer: string): FakeQuestion {
    const q = this.questions.get(questionId)
    if (!q || q.status !== 'pending') {
      const existing = this.questions.get(questionId)
      return existing ? { ...existing } : { id: questionId, text: '', status: 'rejected', createdAt: 0 }
    }
    const updated: FakeQuestion = { ...q, status: 'answered', answer, answeredAt: Date.now() }
    this.questions.set(questionId, updated)
    return { ...updated }
  }

  reject(questionId: string, reason?: string): FakeQuestion {
    const q = this.questions.get(questionId)
    if (!q || q.status !== 'pending') {
      const existing = this.questions.get(questionId)
      return existing ? { ...existing } : { id: questionId, text: '', status: 'rejected', createdAt: 0 }
    }
    const updated: FakeQuestion = { ...q, status: 'rejected', reason, answeredAt: Date.now() }
    this.questions.set(questionId, updated)
    return { ...updated }
  }

  list(status?: QuestionStatus): FakeQuestion[] {
    const all = [...this.questions.values()]
    const filtered = status ? all.filter((q) => q.status === status) : all
    return filtered.map((q) => ({ ...q }))
  }

  pendingCount(): number {
    return [...this.questions.values()].filter((q) => q.status === 'pending').length
  }

  reset(): void {
    this.questions.clear()
    this.nextId = 1
    this.autoAnswer = undefined
  }
}
