/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

const LIFECYCLE_PHASES = [
  'ANALYZE',
  'DESIGN',
  'PLAN',
  'IMPLEMENT',
  'VALIDATE',
  'REVIEW',
  'HANDOFF',
  'DEPLOY',
  'LISTENING',
] as const

export const AgentDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tools: z.array(z.string()),
  model: z.string().optional(),
  systemPrompt: z.string().min(1),
  phase: z.enum(LIFECYCLE_PHASES),
})

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>
