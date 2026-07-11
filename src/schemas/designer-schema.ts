/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { GradeSchema } from './grade-schema.js'
import {
  ReadinessSeveritySchema as _ReadinessSeveritySchema,
  BaseReadinessCheckSchema,
  BaseReadinessReportSchema,
} from './readiness-schema.js'

// ── ADR Validation ──

/** @deprecated Use GradeSchema from grade-schema.ts */
export const AdrGradeSchema = GradeSchema

export const AdrValidationResultSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  grade: AdrGradeSchema,
  hasStatus: z.boolean(),
  hasContext: z.boolean(),
  hasDecision: z.boolean(),
  hasConsequences: z.boolean(),
  missingFields: z.array(z.string()),
})

export const AdrReportSchema = z.object({
  decisions: z.array(AdrValidationResultSchema),
  overallGrade: AdrGradeSchema,
  summary: z.string(),
})

export type AdrGrade = z.infer<typeof AdrGradeSchema>
export type AdrValidationResult = z.infer<typeof AdrValidationResultSchema>
export type AdrReport = z.infer<typeof AdrReportSchema>

// ── Traceability Matrix ──

export const TraceabilityCoverageSchema = z.enum(['full', 'partial', 'none'])

export const TraceabilityEntrySchema = z.object({
  requirementId: z.string(),
  linkedDecisions: z.array(z.string()),
  linkedConstraints: z.array(z.string()),
  coverage: TraceabilityCoverageSchema,
})

export const TraceabilityReportSchema = z.object({
  matrix: z.array(TraceabilityEntrySchema),
  coverageRate: z.number().min(0).max(100),
  /**
   * §BUG-06 — Canonical: requirements with no linked decision/constraint
   * (coverage='none'). Distinct from analyze(scope) `orphanRequirements`
   * which counts structural orphans (no parent edge).
   */
  uncoveredRequirements: z.array(z.string()),
  /** §BUG-06-A — canonical name (deprecated alias `orphanRequirements` removed). */
  untracedRequirements: z.array(z.string()),
  /** §BUG-06-A — count of uncovered requirements (== uncoveredRequirements.length). */
  traceabilityWarning: z.number(),
  orphanDecisions: z.array(z.string()),
  /** Bug #009: warning when no requirement nodes exist */
  warning: z.string().optional(),
})

export type TraceabilityCoverage = z.infer<typeof TraceabilityCoverageSchema>
export type TraceabilityEntry = z.infer<typeof TraceabilityEntrySchema>
export type TraceabilityReport = z.infer<typeof TraceabilityReportSchema>

// ── Coupling Analysis ──

export const NodeCouplingMetricsSchema = z.object({
  nodeId: z.string(),
  fanIn: z.number().min(0),
  fanOut: z.number().min(0),
  depth: z.number().min(0),
  instability: z.number().min(0).max(1),
})

export const CouplingReportSchema = z.object({
  nodes: z.array(NodeCouplingMetricsSchema),
  highCouplingNodes: z.array(z.string()),
  isolatedNodes: z.array(z.string()),
  avgFanIn: z.number(),
  avgFanOut: z.number(),
  avgInstability: z.number(),
})

export type NodeCouplingMetrics = z.infer<typeof NodeCouplingMetricsSchema>
export type CouplingReport = z.infer<typeof CouplingReportSchema>

// ── Interface Check ──

export const InterfaceCheckResultSchema = z.object({
  nodeId: z.string(),
  hasDescription: z.boolean(),
  hasAC: z.boolean(),
  hasEdges: z.boolean(),
  hasConstraintLink: z.boolean(),
  score: z.number().min(0).max(100),
})

export const InterfaceReportSchema = z.object({
  results: z.array(InterfaceCheckResultSchema),
  overallScore: z.number().min(0).max(100),
  nodesWithoutContracts: z.array(z.string()),
})

export type InterfaceCheckResult = z.infer<typeof InterfaceCheckResultSchema>
export type InterfaceReport = z.infer<typeof InterfaceReportSchema>

// ── Tech Risk Assessment ──

export const TechRiskCategorySchema = z.enum([
  'integration',
  'performance',
  'security',
  'maturity',
  'complexity',
  'dependency',
])

export const TechRiskProbabilitySchema = z.enum(['low', 'medium', 'high'])

export const MitigationLevelSchema = z.enum(['unmitigated', 'partially_mitigated', 'mitigated'])

export const TechRiskEntrySchema = z.object({
  nodeId: z.string(),
  category: TechRiskCategorySchema,
  probability: TechRiskProbabilitySchema,
  impact: TechRiskProbabilitySchema,
  score: z.number().min(1).max(9),
  mitigated: z.boolean(),
  mitigationLevel: MitigationLevelSchema.optional(),
})

export const TechRiskReportSchema = z.object({
  risks: z.array(TechRiskEntrySchema),
  inferredRisks: z.array(TechRiskEntrySchema),
  riskScore: z.number().min(0),
  highRisks: z.array(z.string()),
})

export type TechRiskCategory = z.infer<typeof TechRiskCategorySchema>
export type TechRiskProbability = z.infer<typeof TechRiskProbabilitySchema>
export type MitigationLevel = z.infer<typeof MitigationLevelSchema>
export type TechRiskEntry = z.infer<typeof TechRiskEntrySchema>
export type TechRiskReport = z.infer<typeof TechRiskReportSchema>

// ── Design Readiness (Definition of Ready for DESIGN→PLAN) ──

/** @deprecated Use ReadinessSeveritySchema from readiness-schema.ts */
export const ReadinessSeveritySchema = _ReadinessSeveritySchema

export const DesignReadinessCheckSchema = BaseReadinessCheckSchema

export const DesignReadinessReportSchema = BaseReadinessReportSchema

export type ReadinessSeverity = z.infer<typeof ReadinessSeveritySchema>
export type DesignReadinessCheck = z.infer<typeof DesignReadinessCheckSchema>
export type DesignReadinessReport = z.infer<typeof DesignReadinessReportSchema>
