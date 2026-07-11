/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Contract: HumanGateService
 *
 * Core service interface for human-in-the-loop interactions (permissions,
 * questions, approvals). Neutral contract with zero vendor imports.
 * The TUI is the primary UI; the Claude bridge translates these calls
 * to MCP tool surface — both consume the same service.
 */

export type QuestionStatus = 'pending' | 'answered' | 'rejected' | 'expired'

export interface Question {
  id: string
  text: string
  status: QuestionStatus
  answer?: string
  reason?: string
  createdAt: number
  answeredAt?: number
}

export interface QuestionFilter {
  status?: QuestionStatus | QuestionStatus[]
  since?: number
  limit?: number
}

/**
 * Contract for human-in-the-loop interactions.
 *
 * All methods use neutral types — no Claude/MCP/SDK types are permitted.
 * The TUI renders questions; the Claude bridge translates them to MCP
 * tool calls. Both interfaces share the same service instance.
 */
export interface HumanGateService {
  /**
   * Present a question to the user and return the pending question record.
   * The question is stored in-memory (or persisted) until answered or
   * rejected. The TUI displays it immediately; the bridge returns it as
   * a tool response for Claude to relay.
   *
   * @param text - The question text.
   * @returns The pending question.
   */
  ask(text: string): Question

  /**
   * Register a user's answer to a pending question.
   *
   * @param questionId - The question to answer.
   * @param answer - The user's answer text.
   * @returns The updated question, or `null` if not found or already closed.
   */
  reply(questionId: string, answer: string): Question | null

  /**
   * Reject a pending question without answering it.
   *
   * @param questionId - The question to reject.
   * @param reason - Optional reason for rejection.
   * @returns The updated question, or `null` if not found or already closed.
   */
  reject(questionId: string, reason?: string): Question | null

  /**
   * List questions, optionally filtered by status, recency, or limit.
   *
   * @param filter - Optional filter criteria.
   * @returns Matching questions ordered by creation time descending.
   */
  list(filter?: QuestionFilter): Question[]
}
