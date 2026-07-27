/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for analyzer-report — the aggregator that wires the dormant analyzer/
 * quality-checkers (code-based + graph-based) into one report-only block.
 * AC: buildAnalyzerReport runs all sections and folds them into a typed report.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAnalyzerReport } from '../core/analyzer/analyzer-report.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = [], edges: GraphDocument['edges'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('buildAnalyzerReport', () => {
  let fixtureDir: string

  beforeAll(() => {
    // Minimal project fixture for the code-based checkers (they scan projectPath).
    fixtureDir = mkdtempSync(join(tmpdir(), 'agf-analyzer-report-'))
    mkdirSync(join(fixtureDir, 'src'), { recursive: true })
    writeFileSync(join(fixtureDir, 'src', 'sample.ts'), 'export const x = 1\n', 'utf8')
  })

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
  })

  it('runs all 12 graph-based checker sections', () => {
    const report = buildAnalyzerReport(makeDoc(), fixtureDir)
    expect(Object.keys(report.graph)).toHaveLength(12)
    expect(report.graph.contractCoverage).toBeDefined()
    expect(report.graph.prdQuality).toBeDefined()
    expect(report.summary.graphSections).toBe(12)
  })

  it('runs all 4 code-based checker sections', () => {
    const report = buildAnalyzerReport(makeDoc(), fixtureDir)
    expect(Object.keys(report.code)).toHaveLength(4)
    expect(report.code.securityScan.mode).toBe('security_scan')
    expect(report.code.codeQuality.mode).toBe('code_quality')
    expect(report.summary.codeSections).toBe(4)
  })

  it('derives codeAvgScore as the mean of the 4 code-based scores', () => {
    const report = buildAnalyzerReport(makeDoc(), fixtureDir)
    const expected =
      (report.code.codeQuality.score +
        report.code.observability.score +
        report.code.securityScan.score +
        report.code.testCoverage.score) /
      4
    expect(report.summary.codeAvgScore).toBeCloseTo(expected, 5)
  })

  it('empty graph → coverage checkers report zero totals without throwing', () => {
    const report = buildAnalyzerReport(makeDoc(), fixtureDir)
    expect(report.graph.contractCoverage.totalContracts).toBe(0)
    expect(report.graph.scenarioCoverage.totalScenarios).toBe(0)
  })
})
