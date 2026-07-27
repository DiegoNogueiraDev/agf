/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-self-healing — Task 2.3: HealingProposal Zod v4 schema.
 *
 * Mirrors RecoveryProposal from browser-harness but targets the host-side
 * pattern classifier. confidence ∈ {observed, heuristic} — never "inferred".
 */

import { z } from 'zod/v4'
import { FailureSignalSchema } from './failure-signal.schema.js'

export const SuggestedActionKindSchema = z.enum([
  'review_gate_config',
  'review_tool_input',
  'open_issue',
  'add_pattern_rule',
  'notify_operator',
  'decompose_task',
  'check_dependency',
])
export type SuggestedActionKind = z.infer<typeof SuggestedActionKindSchema>

export const SuggestedActionSchema = z.object({
  kind: SuggestedActionKindSchema,
  description: z.string().min(1),
  autoApplyable: z.literal(false),
})
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>

export const HealingProposalSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  signalCount: z.number().int().min(0),
  windowSeconds: z.number().min(0),
  evidence: z.array(FailureSignalSchema),
  suggestedActions: z.array(SuggestedActionSchema).min(1),
  confidence: z.enum(['observed', 'heuristic']),
  createdAt: z.string(),
})
export type HealingProposal = z.infer<typeof HealingProposalSchema>
