/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

// ── Issue Types ──────────────────────────────────

export const HealingIssueTypeSchema = z.enum([
  'stuck_task', // in_progress beyond threshold
  'broken_dependency', // depends_on edge points to non-existent node
  'orphan_node', // task with no parent and no edges
  'stale_in_progress', // in_progress with no recent update
  'cycle_detected', // circular dependency chain
  'missing_ac', // task near done without acceptance criteria
  'oversized_undecomposed', // L/XL task without subtasks
  'blocked_no_blocker', // status=blocked but no blocking edge or flag
  'done_with_pending_deps', // done but has unresolved depends_on
  'container_epic_blocking', // epic with no own AC blocking child tasks in backlog
  'stale_resolved_risk', // risk/blocker description reads resolved but status is still open
])
export type HealingIssueType = z.infer<typeof HealingIssueTypeSchema>

export const HealingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low'])
export type HealingSeverity = z.infer<typeof HealingSeveritySchema>

export const HealingIssueSchema = z.object({
  id: z.string(),
  type: HealingIssueTypeSchema,
  severity: HealingSeveritySchema,
  nodeId: z.string(),
  title: z.string(),
  message: z.string(),
  suggestion: z.string().optional(),
  detectedAt: z.string(),
})
export type HealingIssue = z.infer<typeof HealingIssueSchema>

// ── Action Types ──────────────────────────────────

export const HealingActionTypeSchema = z.enum([
  'update_status',
  'remove_edge',
  'add_flag',
  'clear_blocked',
  'flag_for_review',
])
export type HealingActionType = z.infer<typeof HealingActionTypeSchema>

export const HealingActionSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  type: HealingActionTypeSchema,
  nodeId: z.string(),
  description: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
})
export type HealingAction = z.infer<typeof HealingActionSchema>

// ── Result Types ──────────────────────────────────

export const HealingResultSchema = z.object({
  actionId: z.string(),
  issueId: z.string(),
  success: z.boolean(),
  message: z.string(),
  appliedAt: z.string(),
})
export type HealingResult = z.infer<typeof HealingResultSchema>

// ── Report & Metrics ──────────────────────────────

export const HealingMetricsSchema = z.object({
  totalIssuesDetected: z.number().int().min(0),
  totalHealed: z.number().int().min(0),
  totalFailed: z.number().int().min(0),
  successRate: z.number().min(0).max(1),
  avgResolutionMs: z.number().min(0),
  bySeverity: z.record(HealingSeveritySchema, z.number().int().min(0)),
  byIssueType: z.record(HealingIssueTypeSchema, z.number().int().min(0)),
})
export type HealingMetrics = z.infer<typeof HealingMetricsSchema>

export const HealingReportSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  issues: z.array(HealingIssueSchema),
  actions: z.array(HealingActionSchema),
  results: z.array(HealingResultSchema),
  metrics: HealingMetricsSchema,
})
export type HealingReport = z.infer<typeof HealingReportSchema>

// ── Configuration ──────────────────────────────────

export const HealingConfigSchema = z.object({
  staleHours: z.number().min(1).default(48),
  maxCycleDepth: z.number().int().min(2).default(10),
  autoHeal: z.boolean().default(false),
  dryRun: z.boolean().default(true),
})
export type HealingConfig = z.infer<typeof HealingConfigSchema>
