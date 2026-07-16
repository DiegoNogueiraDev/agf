/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { GradeSchema } from './grade-schema.js'
import { ReadinessSeveritySchema } from './readiness-schema.js'

// ── Shared ──

/** @deprecated Use GradeSchema from grade-schema.ts */
export const ImplementGradeSchema = GradeSchema
/** @deprecated Use ReadinessSeveritySchema from readiness-schema.ts */
export const DodSeveritySchema = ReadinessSeveritySchema

// ── Definition of Done ──

export const DodCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  details: z.string(),
  severity: DodSeveritySchema,
  /** Quick-fix suggestion for failed checks. Always present on failed checks. */
  fix: z.string().optional(),
})

export const ImplementDoneReportSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  checks: z.array(DodCheckSchema),
  ready: z.boolean(),
  score: z.number().min(0).max(100),
  grade: ImplementGradeSchema,
  summary: z.string(),
})

export type DodSeverity = z.infer<typeof DodSeveritySchema>
export type DodCheck = z.infer<typeof DodCheckSchema>
export type ImplementDoneReport = z.infer<typeof ImplementDoneReportSchema>

// ── TDD Check ──

export const SuggestedTestTypeSchema = z.enum(['unit', 'integration', 'e2e'])

export const SuggestedTestSpecSchema = z.object({
  testName: z.string(),
  fromAc: z.string(),
  type: SuggestedTestTypeSchema,
})

export const TddTaskReportSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  totalAcs: z.number().min(0),
  testableAcs: z.number().min(0),
  measurableAcs: z.number().min(0),
  testabilityScore: z.number().min(0).max(100),
  suggestedTests: z.array(SuggestedTestSpecSchema),
})

export const TddCheckReportSchema = z.object({
  tasks: z.array(TddTaskReportSchema),
  overallTestability: z.number().min(0).max(100),
  tasksAtRisk: z.number().min(0),
  suggestedTestSpecs: z.array(SuggestedTestSpecSchema),
  summary: z.string(),
})

export type SuggestedTestType = z.infer<typeof SuggestedTestTypeSchema>
export type SuggestedTestSpec = z.infer<typeof SuggestedTestSpecSchema>
export type TddTaskReport = z.infer<typeof TddTaskReportSchema>
export type TddCheckReport = z.infer<typeof TddCheckReportSchema>

// ── Sprint Progress ──

export const BurndownSchema = z.object({
  total: z.number().min(0),
  done: z.number().min(0),
  inProgress: z.number().min(0),
  blocked: z.number().min(0),
  backlog: z.number().min(0),
  ready: z.number().min(0),
  donePercent: z.number().min(0).max(100),
})

export const VelocityTrendDirectionSchema = z.enum(['up', 'down', 'stable'])

export const VelocityTrendSchema = z.object({
  currentSprintVelocity: z.number().min(0),
  averageVelocity: z.number().min(0),
  trend: VelocityTrendDirectionSchema,
})

export const BlockerDetailSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  blockedBy: z.array(z.string()),
})

export const SprintProgressReportSchema = z.object({
  sprint: z.string().nullable(),
  burndown: BurndownSchema,
  velocityTrend: VelocityTrendSchema,
  blockers: z.array(BlockerDetailSchema),
  criticalPathTotal: z.number().min(0).optional(),
  criticalPathRemaining: z.number().min(0),
  estimatedCompletionDays: z.number().nullable(),
  summary: z.string(),
})

export type Burndown = z.infer<typeof BurndownSchema>
export type VelocityTrendDirection = z.infer<typeof VelocityTrendDirectionSchema>
export type VelocityTrend = z.infer<typeof VelocityTrendSchema>
export type BlockerDetail = z.infer<typeof BlockerDetailSchema>
export type SprintProgressReport = z.infer<typeof SprintProgressReportSchema>

// ── TDD Hints (for next tool enrichment) ──

export const TddHintSchema = z.object({
  testName: z.string(),
  fromAc: z.string(),
  type: SuggestedTestTypeSchema,
})

export type TddHint = z.infer<typeof TddHintSchema>
