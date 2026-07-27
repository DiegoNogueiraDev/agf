/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { AdrGradeSchema, ReadinessSeveritySchema } from './designer-schema.js'

// ── Doc Completeness ──

export const DocCompletenessNodeSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
})

export const DocCompletenessReportSchema = z.object({
  descriptionsPresent: z.number().min(0),
  totalNodes: z.number().min(0),
  coverageRate: z.number().min(0).max(100),
  nodesWithoutDescription: z.array(DocCompletenessNodeSchema),
})

// ── Handoff Readiness ──

export const HandoffReadinessCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  details: z.string(),
  severity: ReadinessSeveritySchema,
})

export const HandoffReadinessReportSchema = z.object({
  checks: z.array(HandoffReadinessCheckSchema),
  ready: z.boolean(),
  score: z.number().min(0).max(100),
  grade: AdrGradeSchema,
  summary: z.string(),
})

export type DocCompletenessNode = z.infer<typeof DocCompletenessNodeSchema>
export type DocCompletenessReport = z.infer<typeof DocCompletenessReportSchema>
export type HandoffReadinessCheck = z.infer<typeof HandoffReadinessCheckSchema>
export type HandoffReadinessReport = z.infer<typeof HandoffReadinessReportSchema>
