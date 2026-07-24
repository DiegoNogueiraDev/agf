/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-self-healing — Task 1.1: FailureSignal Zod v4 schema.
 *
 * Multi-source failure signal for the production self-healing collector.
 * Serializes cleanly to JSON for SQLite storage.
 */

import { z } from 'zod/v4'

export const FailureSignalContextSchema = z.object({
  toolName: z.string().optional(),
  phase: z.string().optional(),
  nodeId: z.string().optional(),
})

export type FailureSignalContext = z.infer<typeof FailureSignalContextSchema>

export const FailureSignalSchema = z.object({
  source: z.enum(['tool_invocation', 'lifecycle_gate', 'dod_check', 'mcp_server', 'sqlite']),
  signalKind: z.string(),
  context: FailureSignalContextSchema,
  severity: z.enum(['warn', 'error', 'critical']),
  timestamp: z.string(),
  rawError: z.string().optional(),
})

export type FailureSignal = z.infer<typeof FailureSignalSchema>
