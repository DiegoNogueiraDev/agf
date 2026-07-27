/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Contract Schema — Inter-agent contract for implementor/validator coordination
 *
 * ADR-V4-03: Graph as shared memory, contract as decision node with Zod schema.
 */
import { z } from 'zod/v4'

const ID_MAX = 100
const LONG_TEXT_MAX = 10_000
const ARRAY_MAX = 100

export const ContractResultSchema = z.object({
  claim: z.string().min(1).max(LONG_TEXT_MAX),
  validated: z.boolean(),
  evidence: z.string().max(LONG_TEXT_MAX).optional(),
})

export const ContractSchema = z.object({
  taskId: z.string().min(1).max(ID_MAX),
  implementorClaims: z.array(z.string().min(1).max(LONG_TEXT_MAX)).min(1).max(ARRAY_MAX),
  validationCriteria: z.array(z.string().min(1).max(LONG_TEXT_MAX)).min(1).max(ARRAY_MAX),
  results: z.array(ContractResultSchema).max(ARRAY_MAX),
})

export type Contract = z.infer<typeof ContractSchema>
export type ContractResult = z.infer<typeof ContractResultSchema>
