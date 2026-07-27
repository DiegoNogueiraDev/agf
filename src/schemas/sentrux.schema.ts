/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-sentrux-adoption — Task 1.3: Zod v4 schemas for Sentrux MCP tools.
 */

import { z } from 'zod/v4'

export const SentruxScanResultSchema = z.object({
  runId: z.string(),
  issuesFound: z.number().int().nonnegative(),
  severity: z.enum(['ok', 'warn', 'error']),
  timestamp: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
})

export type SentruxScanResult = z.infer<typeof SentruxScanResultSchema>

export const SentruxSessionStartResultSchema = z.object({
  sessionId: z.string(),
  startedAt: z.string(),
  baseline: z.record(z.string(), z.unknown()).optional(),
})

export type SentruxSessionStartResult = z.infer<typeof SentruxSessionStartResultSchema>

export const SentruxSessionEndResultSchema = z.object({
  sessionId: z.string(),
  endedAt: z.string(),
  delta: z.record(z.string(), z.unknown()),
  issuesDelta: z.number().int(),
})

export type SentruxSessionEndResult = z.infer<typeof SentruxSessionEndResultSchema>

export const SentruxViolationSchema = z.object({
  path: z.string(),
  rule: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string().optional(),
})

export type SentruxViolation = z.infer<typeof SentruxViolationSchema>

export const SentruxCheckRulesResultSchema = z.object({
  violations: z.array(SentruxViolationSchema),
  totalCount: z.number().int().nonnegative(),
})

export type SentruxCheckRulesResult = z.infer<typeof SentruxCheckRulesResultSchema>

// ---------------------------------------------------------------------------
// §EPIC-sentrux-adoption — E1-T1: 5 additional Sentrux tools
// ---------------------------------------------------------------------------

const SentruxHealthCheckSchema = z.object({
  name: z.string(),
  status: z.enum(['ok', 'warn', 'error']),
  message: z.string().optional(),
})

export const SentruxHealthResultSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  checks: z.array(SentruxHealthCheckSchema),
  latency_ms: z.number().nonnegative(),
})

export type SentruxHealthResult = z.infer<typeof SentruxHealthResultSchema>

export const SentruxRescanResultSchema = z.object({
  runId: z.string(),
  issuesDelta: z.number().int(),
  newIssues: z.array(SentruxViolationSchema),
})

export type SentruxRescanResult = z.infer<typeof SentruxRescanResultSchema>

const SentruxSnapshotSchema = z.object({
  timestamp: z.string(),
  score: z.number().nonnegative(),
  issueCount: z.number().int().nonnegative(),
})

export const SentruxEvolutionResultSchema = z.object({
  snapshots: z.array(SentruxSnapshotSchema),
  trend: z.enum(['improving', 'stable', 'degrading']),
  recommendation: z.string().optional(),
})

export type SentruxEvolutionResult = z.infer<typeof SentruxEvolutionResultSchema>

export const SentruxDsmResultSchema = z.object({
  matrix: z.array(z.array(z.number())),
  hotspots: z.array(z.string()),
  coupling_score: z.number().nonnegative(),
})

export type SentruxDsmResult = z.infer<typeof SentruxDsmResultSchema>

const SentruxTestGapSchema = z.object({
  file: z.string(),
  reason: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
})

export const SentruxTestGapsResultSchema = z.object({
  gaps: z.array(SentruxTestGapSchema),
  coverage_estimate: z.number().min(0).max(1),
  priority_files: z.array(z.string()),
})

export type SentruxTestGapsResult = z.infer<typeof SentruxTestGapsResultSchema>
