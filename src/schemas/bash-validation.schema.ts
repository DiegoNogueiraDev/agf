/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-claw-bash-validation — E8-T1: Zod v4 schemas for bash command validation.
 */

import { z } from 'zod/v4'

export const CommandRiskSchema = z.enum(['safe', 'warn', 'destructive', 'forbidden'])

export type CommandRisk = z.infer<typeof CommandRiskSchema>

export const ValidationResultSchema = z.object({
  risk: CommandRiskSchema,
  reasons: z.array(z.string()),
  sanitizedCommand: z.string().optional(),
})

export type ValidationResult = z.infer<typeof ValidationResultSchema>
