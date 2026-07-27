/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Zod schemas and types for the native Code Intelligence engine.
 * Replaces GitNexus types with Zod-validated, SQLite-backed structures.
 */

import { z } from 'zod/v4'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'code/code-types.ts' })

// ── Symbol Kinds ──────────────────────────────────────

export const SymbolKindSchema = z.enum([
  'function',
  'class',
  'method',
  'interface',
  'type_alias',
  'enum',
  'variable',
  'struct',
  'trait',
  'module',
  'package',
  'annotation',
  'macro',
  'constant',
  'property',
])

export type SymbolKind = z.infer<typeof SymbolKindSchema>

// ── Relation Types ────────────────────────────────────

export const RelationTypeSchema = z.enum([
  'calls',
  'imports',
  'extends',
  'implements',
  'belongs_to',
  'exports',
  'uses',
  'overrides',
  'decorates',
])

export type CodeRelationType = z.infer<typeof RelationTypeSchema>

// ── Risk Levels ───────────────────────────────────────

export const RiskLevelSchema = z.enum(['low', 'medium', 'high'])

export type RiskLevel = z.infer<typeof RiskLevelSchema>

// ── Code Symbol ───────────────────────────────────────

export const CodeSymbolSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  kind: SymbolKindSchema,
  file: z.string(),
  startLine: z.int().min(1),
  endLine: z.int().min(1),
  exported: z.boolean(),
  modulePath: z.string().nullable().optional(),
  signature: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  language: z.string().optional(),
  docstring: z.string().nullable().optional(),
  sourceSnippet: z.string().nullable().optional(),
  visibility: z.string().optional(),
  indexedAt: z.string(),
})

export type CodeSymbol = z.infer<typeof CodeSymbolSchema>

// ── Code Relation ─────────────────────────────────────

export const CodeRelationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  fromSymbol: z.string(),
  toSymbol: z.string(),
  type: RelationTypeSchema,
  file: z.string().nullable().optional(),
  line: z.int().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  indexedAt: z.string(),
})

export type CodeRelation = z.infer<typeof CodeRelationSchema>

// ── Code Graph Data (API response shape) ──────────────

export const CodeGraphDataSchema = z.object({
  symbols: z.array(CodeSymbolSchema),
  relations: z.array(CodeRelationSchema),
})

export type CodeGraphData = z.infer<typeof CodeGraphDataSchema>

// ── Affected Symbol (impact analysis) ─────────────────

export const AffectedSymbolSchema = z.object({
  name: z.string(),
  file: z.string(),
  confidence: z.number().min(0).max(1),
  depth: z.int().min(1).optional(),
})

export type AffectedSymbol = z.infer<typeof AffectedSymbolSchema>

// ── Impact Result ─────────────────────────────────────

export const ImpactResultSchema = z.object({
  symbol: z.string(),
  affectedSymbols: z.array(AffectedSymbolSchema),
  riskLevel: RiskLevelSchema,
})

export type ImpactResult = z.infer<typeof ImpactResultSchema>

// ── Index Meta ────────────────────────────────────────

export const CodeIndexMetaSchema = z.object({
  projectId: z.string(),
  lastIndexed: z.string(),
  fileCount: z.int().min(0),
  symbolCount: z.int().min(0),
  relationCount: z.int().min(0),
  gitHash: z.string().nullable().optional(),
})

export type CodeIndexMeta = z.infer<typeof CodeIndexMetaSchema>

// ── Search Result ─────────────────────────────────────

export const CodeSearchResultSchema = z.object({
  symbol: CodeSymbolSchema,
  score: z.number(),
  modulePath: z.string().nullable().optional(),
})

export type CodeSearchResult = z.infer<typeof CodeSearchResultSchema>

// ── Analyzer Output (per file) ────────────────────────

export interface AnalyzedFile {
  file: string
  symbols: Omit<CodeSymbol, 'id' | 'projectId' | 'indexedAt'>[]
  relations: Omit<CodeRelation, 'id' | 'projectId' | 'indexedAt'>[]
}

// ── Change Detection ──────────────────────────────────

export interface DetectedChange {
  file: string
  changeType: 'added' | 'modified' | 'deleted'
  affectedSymbols: string[]
}

export interface ChangeDetectionResult {
  changes: DetectedChange[]
  impactSummary: {
    totalFiles: number
    totalSymbols: number
    riskLevel: RiskLevel
  }
}

// ── Process Detection ─────────────────────────────────

export interface DetectedProcess {
  entryPoint: string
  entryFile: string
  chain: Array<{ name: string; file: string }>
}

// ── CodeAnalyzer Interface ────────────────────────────
// Extensibility point for multi-language support.
// Current: TsAnalyzer (TypeScript Compiler API, createSourceFile)
// Future: TreeSitterAnalyzer (web-tree-sitter WASM, any language)

export interface CodeAnalyzer {
  /** Languages supported by this analyzer (e.g., ["typescript", "javascript"]) */
  readonly languages: string[]
  /** File extensions handled by this analyzer (e.g., [".ts", ".tsx", ".js"]) */
  readonly extensions: string[]
  /** Analyze a single file and return symbols + relations */
  analyzeFile(filePath: string, basePath: string): Promise<AnalyzedFile>
}

// ── Index Result ──────────────────────────────────────

export interface IndexResult {
  fileCount: number
  filesWithSymbols: number
  symbolCount: number
  relationCount: number
  typescriptAvailable: boolean
  languageStatus?: Record<
    string,
    {
      available: boolean
      serverName?: string
      fileCount: number
      symbolCount: number
    }
  >
}

// ── Helpers ───────────────────────────────────────────

/** Determine risk level based on number of affected symbols. */
export function calculateRiskLevel(affectedCount: number): RiskLevel {
  if (affectedCount > 15) return 'high'
  if (affectedCount >= 5) return 'medium'
  return 'low'
}
