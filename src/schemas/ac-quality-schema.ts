/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

// ── Parsed AC ──

export const AcFormatSchema = z.enum(['gwt', 'free_text', 'checklist'])

export const GwtStepSchema = z.object({
  keyword: z.string(),
  text: z.string(),
})

export const ParsedAcSchema = z.object({
  raw: z.string(),
  format: AcFormatSchema,
  steps: z.array(GwtStepSchema).optional(),
  isTestable: z.boolean(),
  isMeasurable: z.boolean(),
})

export type ParsedAc = z.infer<typeof ParsedAcSchema>
export type GwtStep = z.infer<typeof GwtStepSchema>
export type AcFormat = z.infer<typeof AcFormatSchema>

// ── AC Quality Report ──

export const InvestCheckSchema = z.object({
  criterion: z.string(),
  passed: z.boolean(),
  details: z.string(),
})

export const AcNodeReportSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  score: z.number().min(0).max(100),
  parsedAcs: z.array(ParsedAcSchema),
  investChecks: z.array(InvestCheckSchema),
  vagueTerms: z.array(z.string()),
  suggestions: z.array(z.string()).optional(),
})

export const AcQualityReportSchema = z.object({
  nodes: z.array(AcNodeReportSchema),
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
})

export type AcQualityReport = z.infer<typeof AcQualityReportSchema>
export type AcNodeReport = z.infer<typeof AcNodeReportSchema>
export type InvestCheck = z.infer<typeof InvestCheckSchema>
