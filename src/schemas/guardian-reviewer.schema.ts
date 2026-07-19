/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §S2.1 — GuardianReviewer: revisa tool calls via modelo secundário antes da
 * execução. Inspirado no Guardian do Codex CLI.
 */

export interface GuardianVerdict {
  verdict: 'allow' | 'deny' | 'ask_user'
  reason: string
  risk: 'low' | 'medium' | 'high'
}

export interface ToolCallToReview {
  toolName: string
  args: Record<string, unknown>
}

export interface ReviewContext {
  taskTitle?: string
  phase?: string
  userIntent?: string
}

export interface GuardianConfig {
  model: string
  timeoutMs?: number
  cacheSize?: number
}

export interface GuardianReviewerInterface {
  review(toolCall: ToolCallToReview, context: ReviewContext): Promise<GuardianVerdict>
  clearCache(): void
}
