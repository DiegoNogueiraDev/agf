/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { AdrGradeSchema, ReadinessSeveritySchema } from './designer-schema.js'

// ── Review Readiness ──

export const ReviewReadinessCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  details: z.string(),
  severity: ReadinessSeveritySchema,
})

export const ReviewReadinessReportSchema = z.object({
  checks: z.array(ReviewReadinessCheckSchema),
  ready: z.boolean(),
  score: z.number().min(0).max(100),
  grade: AdrGradeSchema,
  summary: z.string(),
})

export type ReviewReadinessCheck = z.infer<typeof ReviewReadinessCheckSchema>
export type ReviewReadinessReport = z.infer<typeof ReviewReadinessReportSchema>
