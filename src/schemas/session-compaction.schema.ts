/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-claw-code — E5-T1: Session compaction schemas (Zod v4).
 * Ported approach from vendor/claw-code-main/rust/crates/runtime/src/compact.rs
 */

import { z } from 'zod/v4'

export const CompactionConfigSchema = z.object({
  /** Number of most-recent messages to preserve verbatim (default 4). */
  preserveRecentMessages: z.number().int().positive().default(4),
  /** Rough token threshold above which compaction is recommended (default 10_000). */
  maxEstimatedTokens: z.number().int().positive().default(10_000),
})

export type CompactionConfig = z.infer<typeof CompactionConfigSchema>

export const CompactionResultSchema = z.object({
  originalMessageCount: z.number().int().nonnegative(),
  preservedMessageCount: z.number().int().nonnegative(),
  removedMessageCount: z.number().int().nonnegative(),
  estimatedTokensSaved: z.number().int().nonnegative(),
  /** The compacted message list — system summary + preserved tail. */
  compactedMessages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      contentType: z.enum(['text', 'tool_use', 'tool_result']).optional(),
    }),
  ),
  summarizedContent: z.string(),
})

export type CompactionResult = z.infer<typeof CompactionResultSchema>

export const SessionForkSchema = z.object({
  id: z.string(),
  parentSessionId: z.string(),
  branchName: z.string(),
  createdAt: z.string(),
})

export type SessionFork = z.infer<typeof SessionForkSchema>
