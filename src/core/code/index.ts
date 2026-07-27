/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'code/index.ts' })

export { createAnalyzers } from './analyzer-factory.js'
export { TEST_OR_DECL_PATTERN, CodeIndexer } from './code-indexer.js'
export { searchCodeSymbols } from './code-search.js'
export type { CodeSearchOptions } from './code-search.js'
export { CodeStore } from './code-store.js'
export {
  SymbolKindSchema,
  RelationTypeSchema,
  RiskLevelSchema,
  CodeSymbolSchema,
  CodeRelationSchema,
  CodeGraphDataSchema,
  AffectedSymbolSchema,
  ImpactResultSchema,
  CodeIndexMetaSchema,
  CodeSearchResultSchema,
  calculateRiskLevel,
} from './code-types.js'
export type {
  SymbolKind,
  CodeRelationType,
  RiskLevel,
  CodeSymbol,
  CodeRelation,
  CodeGraphData,
  AffectedSymbol,
  ImpactResult,
  CodeIndexMeta,
  CodeSearchResult,
  AnalyzedFile,
  DetectedChange,
  ChangeDetectionResult,
  DetectedProcess,
  CodeAnalyzer,
  IndexResult,
} from './code-types.js'
export { syncGraphFromCode } from './graph-sync.js'
export type { SyncReport } from './graph-sync.js'
export { getSymbolContext, analyzeImpact, getFullGraph, getSymbolContextSemantic } from './graph-traversal.js'
export { detectProcesses } from './process-detector.js'
export { findReferencingSymbols } from './code-referencing.js'
export type { SymbolReference } from './code-referencing.js'
export { resetTypeScriptLoader, isTypeScriptAvailable, analyzeFile, TsAnalyzer } from './ts-analyzer.js'
