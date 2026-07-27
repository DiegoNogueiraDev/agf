/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { AdrGradeSchema, ReadinessSeveritySchema } from './designer-schema.js'

// ── Backlog Health ──

export const StaleTaskSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  daysInBacklog: z.number().min(0),
})

export const TechDebtIndicatorSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  keywords: z.array(z.string()),
})

export const BacklogAgingSchema = z.object({
  avgDays: z.number().min(0),
  maxDays: z.number().min(0),
})

export const BacklogHealthReportSchema = z.object({
  backlogCount: z.number().min(0),
  readyCount: z.number().min(0),
  staleTasks: z.array(StaleTaskSchema),
  techDebtIndicators: z.array(TechDebtIndicatorSchema),
  cleanForNewCycle: z.boolean(),
  typeDistribution: z.record(z.string(), z.number()),
  priorityDistribution: z.record(z.string(), z.number()),
  aging: BacklogAgingSchema,
})

// ── Listener Readiness ──

export const ListenerReadinessCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  details: z.string(),
  severity: ReadinessSeveritySchema,
})

export const ListenerReadinessReportSchema = z.object({
  checks: z.array(ListenerReadinessCheckSchema),
  ready: z.boolean(),
  score: z.number().min(0).max(100),
  grade: AdrGradeSchema,
  summary: z.string(),
})

export type StaleTask = z.infer<typeof StaleTaskSchema>
export type TechDebtIndicator = z.infer<typeof TechDebtIndicatorSchema>
export type BacklogAging = z.infer<typeof BacklogAgingSchema>
export type BacklogHealthReport = z.infer<typeof BacklogHealthReportSchema>
export type ListenerReadinessCheck = z.infer<typeof ListenerReadinessCheckSchema>
export type ListenerReadinessReport = z.infer<typeof ListenerReadinessReportSchema>
