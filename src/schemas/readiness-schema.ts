/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Canonical readiness check/report schemas — single source of truth.
 * Phase-specific schemas (Design, Validation, Review, Handoff, Listener)
 * should use these as base or re-export.
 */

import { z } from 'zod/v4'
import { GradeSchema } from './grade-schema.js'

export const ReadinessSeveritySchema = z.enum(['required', 'recommended'])
export type ReadinessSeverity = z.infer<typeof ReadinessSeveritySchema>

export const BaseReadinessCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  details: z.string(),
  severity: ReadinessSeveritySchema,
})
export type BaseReadinessCheck = z.infer<typeof BaseReadinessCheckSchema>

export const BaseReadinessReportSchema = z.object({
  checks: z.array(BaseReadinessCheckSchema),
  ready: z.boolean(),
  score: z.number().min(0).max(100),
  grade: GradeSchema,
  summary: z.string(),
})
export type BaseReadinessReport = z.infer<typeof BaseReadinessReportSchema>
