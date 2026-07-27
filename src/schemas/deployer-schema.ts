/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { AdrGradeSchema, ReadinessSeveritySchema } from './designer-schema.js'

// ── Deploy Readiness ──

export const DeployReadinessCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  details: z.string(),
  severity: ReadinessSeveritySchema,
})

export const DeployReadinessReportSchema = z.object({
  checks: z.array(DeployReadinessCheckSchema),
  ready: z.boolean(),
  score: z.number().min(0).max(100),
  grade: AdrGradeSchema,
  summary: z.string(),
})

export type DeployReadinessCheck = z.infer<typeof DeployReadinessCheckSchema>
export type DeployReadinessReport = z.infer<typeof DeployReadinessReportSchema>
