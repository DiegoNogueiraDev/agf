/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * analyzer-report — composes the analyzer/ quality-checkers into one compact,
 * report-only block for surface consumers (currently `agf quality --analyzers`).
 *
 * WHY: ~16 quality checkers (coverage, integrity, security, observability, …)
 * were built and re-exported by analyzer/index.ts, but NO surface consumed the
 * barrel — dormant capability (golden rule 9). This is the wiring point that
 * makes them reachable from a single CLI surface. It is REPORT-ONLY by contract:
 * callers must NOT let these findings fail a gate. Promoting any checker to
 * blocking is a separate, explicit decision.
 *
 * Two input shapes are aggregated:
 *   - graph-based checkers take a GraphDocument (the project graph)
 *   - code-based checkers take a projectPath and scan the filesystem
 *
 * Consumed by: src/cli/commands/quality-cmd.ts (via the analyzer/index.ts barrel).
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { analyzeContractCoverage } from './contract-coverage.js'
import { analyzeConfigCoverage } from './config-coverage.js'
import { analyzeDataIntegrity } from './data-integrity.js'
import { analyzeMetricCoverage } from './metric-coverage.js'
import { analyzeConcurrencyRisk } from './concurrency-risk.js'
import { analyzeScenarioCoverage } from './scenario-coverage.js'
import { analyzeStateCompleteness } from './state-completeness.js'
import { checkDefinitionOfReady } from './definition-of-ready.js'
import { analyzeFormulaConsistency } from './formula-consistency.js'
import { analyzeAssetBlockers } from './asset-blockers.js'
import { analyzePerformanceBudgets } from './performance-budget-check.js'
import { analyzePrdQuality } from './prd-quality.js'
import { checkCodeQuality } from './code-quality-checker.js'
import { checkObservability } from './observability-checker.js'
import { checkSecurityScan } from './security-scanner.js'
import { checkTestCoverage } from './test-coverage-checker.js'

/** Graph-based checker sections (input: GraphDocument). */
interface GraphSections {
  contractCoverage: ReturnType<typeof analyzeContractCoverage>
  configCoverage: ReturnType<typeof analyzeConfigCoverage>
  dataIntegrity: ReturnType<typeof analyzeDataIntegrity>
  metricCoverage: ReturnType<typeof analyzeMetricCoverage>
  concurrencyRisk: ReturnType<typeof analyzeConcurrencyRisk>
  scenarioCoverage: ReturnType<typeof analyzeScenarioCoverage>
  stateCompleteness: ReturnType<typeof analyzeStateCompleteness>
  definitionOfReady: ReturnType<typeof checkDefinitionOfReady>
  formulaConsistency: ReturnType<typeof analyzeFormulaConsistency>
  assetBlockers: ReturnType<typeof analyzeAssetBlockers>
  performanceBudgets: ReturnType<typeof analyzePerformanceBudgets>
  prdQuality: ReturnType<typeof analyzePrdQuality>
}

/** Code-based checker sections (input: projectPath, scan filesystem). */
interface CodeSections {
  codeQuality: ReturnType<typeof checkCodeQuality>
  observability: ReturnType<typeof checkObservability>
  securityScan: ReturnType<typeof checkSecurityScan>
  testCoverage: ReturnType<typeof checkTestCoverage>
}

/** Compact, report-only aggregation of the analyzer quality-checkers. */
export interface AnalyzerReport {
  graph: GraphSections
  code: CodeSections
  summary: {
    /** Number of graph-based sections run. */
    graphSections: number
    /** Number of code-based sections run. */
    codeSections: number
    /** Mean of the four code-based checker scores (0–100). Diagnostic only. */
    codeAvgScore: number
  }
}

/** Run every analyzer quality-checker and fold the results into one report block. */
export function buildAnalyzerReport(doc: GraphDocument, projectPath: string): AnalyzerReport {
  const graph: GraphSections = {
    contractCoverage: analyzeContractCoverage(doc),
    configCoverage: analyzeConfigCoverage(doc),
    dataIntegrity: analyzeDataIntegrity(doc),
    metricCoverage: analyzeMetricCoverage(doc),
    concurrencyRisk: analyzeConcurrencyRisk(doc),
    scenarioCoverage: analyzeScenarioCoverage(doc),
    stateCompleteness: analyzeStateCompleteness(doc),
    definitionOfReady: checkDefinitionOfReady(doc),
    formulaConsistency: analyzeFormulaConsistency(doc),
    assetBlockers: analyzeAssetBlockers(doc),
    performanceBudgets: analyzePerformanceBudgets(doc),
    prdQuality: analyzePrdQuality(doc),
  }

  const code: CodeSections = {
    codeQuality: checkCodeQuality(projectPath),
    observability: checkObservability(projectPath),
    securityScan: checkSecurityScan(projectPath),
    testCoverage: checkTestCoverage(projectPath),
  }

  const codeScores = [
    code.codeQuality.score,
    code.observability.score,
    code.securityScan.score,
    code.testCoverage.score,
  ]
  const codeAvgScore = codeScores.reduce((sum, s) => sum + s, 0) / codeScores.length

  return {
    graph,
    code,
    summary: {
      graphSections: Object.keys(graph).length,
      codeSections: Object.keys(code).length,
      codeAvgScore,
    },
  }
}
