/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const LogLevelSchema = z.enum(['info', 'warn', 'error', 'success', 'debug'])

export const LogLayerSchema = z.enum(['core', 'api', 'mcp', 'rag', 'web', 'cli'])

export const LogEntrySchema = z.object({
  id: z.number().int(),
  level: LogLevelSchema,
  message: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string(),
  layer: LogLayerSchema.optional(),
})

export type LogLevel = z.infer<typeof LogLevelSchema>
export type LogLayer = z.infer<typeof LogLayerSchema>
export type LogEntry = z.infer<typeof LogEntrySchema>
