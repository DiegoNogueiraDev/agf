/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_1384c06302e3 — Qualidade do projeto: combina cobertura de testes
 * (scanTestCoverage) + logging (scoreLoggingCoverage) e aplica o gate 95/95.
 * Pura sobre uma lista de arquivos — o comando `quality` apenas a alimenta com
 * o conteúdo de `src/`.
 */
import { basename } from 'node:path'
import { scanTestCoverage } from './test-coverage-scanner.js'
import { scoreLoggingCoverage, type SourceFile } from './logging-coverage-scanner.js'
import { evaluateQualityGate, type QualityThresholds, type QualityGateResult } from './quality-gate.js'
import { scanSemanticCoverage } from './semantic-coverage-scanner.js'

export interface ProjectQualityResult {
  testScore: number
  logScore: number
  totalModules: number
  darkModules: string[]
  gate: QualityGateResult
  /** Percentage (0–100) of modules actually imported by at least one test file. */
  importCoverageRatio: number
  /** Percentage (0–100) of modules with a stem-matched test file. */
  stemCoverageRatio: number
  /** Count of modules with a stem-matched test but no actual import in that test. */
  phantomCoverageCount: number
  /**
   * Combined quality score (0–100) that penalises phantom coverage.
   * Derived from testScore minus a proportional phantom gap penalty (≤20 pts).
   */
  semanticScore: number
  /** Number of `.skip()` / `.skip(` / `describe.skip` annotations across all test files. */
  skippedTestCount: number
  /** Non-fatal warnings emitted by the harness (e.g. 'phantomCoverage'). */
  advisories: string[]
}

function isTest(path: string): boolean {
  return /\.(test|spec|bench)\.[tj]sx?$/.test(path)
}

function hasAssertions(content: string): boolean {
  return /\bexpect\(|\bassert\b|\.toBe\(|\.toEqual\(/.test(content)
}

/** Avalia a qualidade (testes + logs) de um conjunto de arquivos. */
export function evaluateProjectQuality(files: SourceFile[], thresholds?: QualityThresholds): ProjectQualityResult {
  const sourceFiles = files.filter((f) => !isTest(f.path))
  const testFilesFull = files.filter((f) => isTest(f.path))

  const moduleNames = sourceFiles.map((f) => basename(f.path).replace(/\.[tj]sx?$/, ''))
  const testFilesForCoverage = testFilesFull.map((f) => ({
    name: basename(f.path),
    hasAssertions: hasAssertions(f.content),
  }))

  const test = scanTestCoverage(moduleNames, testFilesForCoverage)
  const logging = scoreLoggingCoverage(files)

  // Semantic coverage: verify test files actually import their modules
  const semantic = scanSemanticCoverage({
    modules: sourceFiles.map((f) => ({
      name: basename(f.path).replace(/\.[tj]sx?$/, ''),
      path: f.path,
    })),
    testFiles: testFilesFull.map((f) => ({
      name: basename(f.path),
      path: f.path,
      content: f.content,
    })),
  })

  // Count .skip( / .skip( / describe.skip annotations across all test files
  const SKIP_RE = /\.skip\s*\(/g
  let skippedTestCount = 0
  for (const tf of testFilesFull) {
    let m: RegExpExecArray | null
    SKIP_RE.lastIndex = 0
    while ((m = SKIP_RE.exec(tf.content)) !== null) {
      skippedTestCount++
      void m
    }
  }

  const advisories: string[] = []
  if (semantic.importCoverageRate < semantic.stemCoverageRate) {
    advisories.push('phantomCoverage')
  }
  if (skippedTestCount > 0) {
    advisories.push(`${skippedTestCount} skipped tests detected — may represent unvalidated regression risk`)
  }

  // semanticScore = testScore minus a proportional phantom gap penalty (max 20 pts).
  // Does NOT modify testScore — gate uses the unpenalised testScore for backward compat.
  const phantomPenalty =
    semantic.totalModules > 0 ? Math.min(20, Math.round((semantic.phantomGap / semantic.totalModules) * 20)) : 0
  const semanticScore = Math.max(0, test.testScore - phantomPenalty)

  const gate = evaluateQualityGate({ testScore: test.testScore, logScore: logging.logScore }, thresholds)

  return {
    testScore: test.testScore,
    logScore: logging.logScore,
    totalModules: test.totalModules,
    darkModules: logging.dark,
    gate,
    importCoverageRatio: semantic.importCoverageRate,
    stemCoverageRatio: semantic.stemCoverageRate,
    phantomCoverageCount: semantic.phantomCovered.length,
    semanticScore,
    skippedTestCount,
    advisories,
  }
}
