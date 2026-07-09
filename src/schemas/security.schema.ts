/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const SanitizationReportSchema = z.object({
  sanitized: z.string(),
  injectionDetected: z.boolean(),
  injectionPatterns: z.array(z.string()),
  invisibleCharsRemoved: z.number().int().nonnegative(),
})

export type SanitizationReport = z.infer<typeof SanitizationReportSchema>

export const ExfiltrationReportSchema = z.object({
  detected: z.boolean(),
  suspiciousUrls: z.array(z.string()),
  base64Blocks: z.array(z.string()),
  suspiciousCommands: z.array(z.string()),
})

export type ExfiltrationReport = z.infer<typeof ExfiltrationReportSchema>

export const ToolArgsSanitizationResultSchema = z.object({
  sanitized: z.record(z.string(), z.unknown()),
  injectionDetected: z.boolean(),
  invisibleCharsRemoved: z.number().int().nonnegative(),
})

export type ToolArgsSanitizationResult = z.infer<typeof ToolArgsSanitizationResultSchema>

export const SecurityEventSchema = z.object({
  id: z.string(),
  eventType: z.enum(['injection_detected', 'exfiltration_detected']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  inputHash: z.string(),
  details: z.string(),
  createdAt: z.string(),
})

export type SecurityEvent = z.infer<typeof SecurityEventSchema>
