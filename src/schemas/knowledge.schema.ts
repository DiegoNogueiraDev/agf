/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

const ID_MAX = 200
const TITLE_MAX = 500
const CONTENT_MAX = 1_000_000
const QUERY_MAX = 10_000

export const KnowledgeSourceTypeSchema = z.enum([
  'upload',
  'serena',
  'memory',
  'code_context',
  'docs',
  'web_capture',
  'prd',
  'design',
  'sprint_plan',
  'phase_summary',
  'skill',
  'journey',
  'siebel_sif',
  'siebel_sif_raw',
  'siebel_composer',
  'siebel_generated',
  'siebel_docs',
  'swagger',
  'siebel_wsdl',
  'siebel_escript',
  'ai_decision',
  'validation_result',
  'test_outcome',
  'synthesis',
  'translation_evidence',
  'benchmark',
  'graph_node',
  'lsp_result',
  // Spec-driven development types
  'constitution',
  'spec_template',
  // Harness engineering types (v3)
  'harness_scan',
  // Challenge engine types (v7)
  'challenge_report',
  // Agent indexing (E1.T04)
  'agent',
  // Vendor scan / Sentrux integration
  'architectural_signal',
])

export const KnowledgeDocumentSchema = z.object({
  id: z.string().max(ID_MAX),
  sourceType: KnowledgeSourceTypeSchema,
  sourceId: z.string().max(ID_MAX),
  title: z.string().max(TITLE_MAX),
  content: z.string().max(CONTENT_MAX),
  contentHash: z.string().max(ID_MAX),
  chunkIndex: z.number().int().min(0),
  metadata: z.record(z.string().max(ID_MAX), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  qualityScore: z.number().min(0).max(1).optional(),
  usageCount: z.number().int().min(0).optional(),
  lastAccessedAt: z.string().optional(),
  stalenessDays: z.number().int().min(0).optional(),
})

export const KnowledgeRelationTypeSchema = z.enum(['related_to', 'derived_from', 'supersedes', 'contradicts'])

export const KnowledgeRelationSchema = z.object({
  id: z.string().max(ID_MAX),
  fromDocId: z.string().max(ID_MAX),
  toDocId: z.string().max(ID_MAX),
  relation: KnowledgeRelationTypeSchema,
  score: z.number().min(0).max(1).default(1.0),
  createdAt: z.string(),
})

export const KnowledgeUsageActionSchema = z.enum(['retrieved', 'helpful', 'unhelpful', 'outdated'])

export const KnowledgeUsageLogSchema = z.object({
  id: z.number().int(),
  docId: z.string().max(ID_MAX),
  query: z.string().max(QUERY_MAX),
  action: KnowledgeUsageActionSchema,
  context: z.record(z.string().max(ID_MAX), z.unknown()).optional(),
  createdAt: z.string(),
})

export type KnowledgeSourceType = z.infer<typeof KnowledgeSourceTypeSchema>
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>
export type KnowledgeRelationType = z.infer<typeof KnowledgeRelationTypeSchema>
export type KnowledgeRelation = z.infer<typeof KnowledgeRelationSchema>
export type KnowledgeUsageAction = z.infer<typeof KnowledgeUsageActionSchema>
export type KnowledgeUsageLog = z.infer<typeof KnowledgeUsageLogSchema>
