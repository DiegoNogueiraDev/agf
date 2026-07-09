/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

const ID_MAX = 200
const TITLE_MAX = 500
const CONTENT_MAX = 1_000_000
const ARRAY_MAX = 10_000

export const KnowledgeDocumentExportSchema = z.object({
  sourceType: z.string().max(ID_MAX),
  sourceId: z.string().max(ID_MAX),
  title: z.string().max(TITLE_MAX),
  content: z.string().max(CONTENT_MAX),
  contentHash: z.string().max(ID_MAX),
  metadata: z.record(z.string().max(ID_MAX), z.unknown()).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  createdAt: z.string(),
})

export const KnowledgeRelationExportSchema = z.object({
  fromDocSourceId: z.string().max(ID_MAX),
  toDocSourceId: z.string().max(ID_MAX),
  relation: z.string().max(ID_MAX),
  score: z.number().min(0).max(1),
})

export const MemoryExportSchema = z.object({
  name: z.string().max(ID_MAX),
  content: z.string().max(CONTENT_MAX),
})

export const TranslationMemoryExportSchema = z.object({
  constructId: z.string().max(ID_MAX),
  sourceLanguage: z.string().max(ID_MAX),
  targetLanguage: z.string().max(ID_MAX),
  confidenceBoost: z.number(),
  acceptanceCount: z.number(),
  correctionCount: z.number(),
})

export const KnowledgePackageManifestSchema = z.object({
  projectName: z.string().max(TITLE_MAX),
  exportedAt: z.string(),
  exportedBy: z.string().max(ID_MAX).optional(),
  documentCount: z.number(),
  memoryCount: z.number(),
  sourceTypes: z.array(z.string().max(ID_MAX)).max(ARRAY_MAX),
  qualityThreshold: z.number().min(0).max(1),
  mcpGraphVersion: z.string().max(ID_MAX).optional(),
})

export const KnowledgePackageSchema = z.object({
  version: z.literal('1.0'),
  manifest: KnowledgePackageManifestSchema,
  documents: z.array(KnowledgeDocumentExportSchema).max(ARRAY_MAX),
  relations: z.array(KnowledgeRelationExportSchema).max(ARRAY_MAX).optional(),
  memories: z.array(MemoryExportSchema).max(ARRAY_MAX).optional(),
  translationMemory: z.array(TranslationMemoryExportSchema).max(ARRAY_MAX).optional(),
})

export type KnowledgePackage = z.infer<typeof KnowledgePackageSchema>
export type KnowledgeDocumentExport = z.infer<typeof KnowledgeDocumentExportSchema>
export type KnowledgeRelationExport = z.infer<typeof KnowledgeRelationExportSchema>
export type MemoryExport = z.infer<typeof MemoryExportSchema>
export type TranslationMemoryExport = z.infer<typeof TranslationMemoryExportSchema>
export type KnowledgePackageManifest = z.infer<typeof KnowledgePackageManifestSchema>
