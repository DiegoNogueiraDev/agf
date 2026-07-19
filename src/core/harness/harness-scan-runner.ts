/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { execSync } from 'child_process'
import type Database from 'better-sqlite3'
import { globSync } from 'glob'
import { scanTypeCoverage } from './type-coverage-scanner.js'
import { scanTestCoverage } from './test-coverage-scanner.js'
import { scanDocsCoverage } from './docs-coverage-scanner.js'
import { scanNamingClarity } from './naming-clarity-scanner.js'
import { scanErrorHandling } from './error-handling-scanner.js'
import { scanContextDensity } from './context-density-scanner.js'
import { scanProvenance } from './provenance-scanner.js'
import { scanConnectivity } from './connectivity-scanner.js'
import { distributeViolationsFairly } from './violation-distribution.js'
import { computeHarnessabilityScore, type HarnessabilityResult } from './harnessability-score.js'
import {
  checkDependencyDirection,
  checkCircularDependencies,
  checkBarrelIntegrity,
  checkFileSizeCompliance,
} from './fitness-functions.js'
import { IssuePatternTracker, type RuleSuggestion } from './issue-pattern-tracker.js'
import { detectDimensionSaturation, type SaturationSignal, type HistoryEntry } from './dimension-saturation.js'
import { saveHarnessMemory, getHarnessMemory, type HarnessMemoryState } from './cross-session-memory.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'harness-scan-runner' })
import type { ViolationDetail } from './violation-detail.js'

export interface HarnessScanResult extends HarnessabilityResult {
  details: string[]
  timestamp: string
  ruleSuggestions: RuleSuggestion[]
  regression?: true
  regressionDelta?: number
  /** File-level violations — only present when options.collectViolations=true */
  violations?: ViolationDetail[]
  /**
   * Dimension-saturation signal — only present when options.includeSaturation=true
   * AND a db with ≥1 prior harness_history row exists. Deterministic: compares the
   * current per-dimension breakdown against the previous scan's breakdown.
   */
  saturation?: SaturationSignal
  /**
   * Prior-session harness state (score/grade/violation-patterns), read before this
   * scan overwrites it — only present when options.includeMemory=true AND a db is
   * given. `null` on a project's first memory-enabled scan (nothing saved yet).
   */
  crossSessionMemory?: HarnessMemoryState | null
}

export interface HarnessScanOptions {
  /** When true, collect file-level violations from all scanners. Default: false */
  collectViolations?: boolean
  /** Maximum violations to return (default: 500) */
  maxViolations?: number
  /**
   * Project ID under which to persist + look up history rows. Default
   * "proj_local" preserved for back-compat; the analyze MCP wrapper
   * passes the active project's actual id so trends survive
   * project-scoped lookups.
   */
  projectId?: string
  /**
   * When true (and a db with a prior harness_history row is available), compute
   * the deterministic dimension-saturation signal and attach it as `saturation`.
   * Default false → output is byte-identical to before.
   */
  includeSaturation?: boolean
  /**
   * When true (and a db is given), read the previous run's persisted state
   * (score/grade/violation-patterns) as `crossSessionMemory`, then persist the
   * current one for the next session. Default false → byte-identical output.
   */
  includeMemory?: boolean
}

/** Run a full 7-dimension harnessability scan on the project. */
export function runHarnessScan(
  rootDir: string,
  db?: Database.Database,
  eventBus?: import('../events/event-bus.js').GraphEventBus,
  options?: HarnessScanOptions,
): HarnessScanResult {
  // 1. Type Coverage — exclude node_modules (e.g. src/web/dashboard/node_modules)
  const tsFiles = globSync('src/**/*.ts', {
    cwd: rootDir,
    ignore: ['src/**/*.test.ts', 'src/**/*.bench.ts', 'src/types/**', '**/node_modules/**'],
  })
  const typeFiles = tsFiles.map((p) => ({
    path: p,
    content: fs.readFileSync(path.join(rootDir, p), 'utf-8'),
  }))
  const collect = options?.collectViolations === true
  const scannerOpts = collect ? { collectViolations: true } : undefined

  const typeResult = scanTypeCoverage(typeFiles, scannerOpts)

  // 2. Test Coverage — include both server (.ts) and dashboard (.tsx) sources;
  // mirror the npm-script scanner that tracks the dashboard test surface.
  const moduleFiles = globSync('src/**/*.{ts,tsx}', {
    cwd: rootDir,
    ignore: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.bench.ts',
      'src/index.ts',
      'src/web/dashboard/src/test-setup.ts',
      'src/web/dashboard/src/main.tsx',
      'src/web/dashboard/src/vite-env.d.ts',
      '**/node_modules/**',
    ],
  })
  const modules = moduleFiles.map((p) => path.basename(p).replace(/\.(ts|tsx)$/, ''))
  const testFiles = [
    ...globSync('src/tests/**/*.test.ts', { cwd: rootDir }),
    ...globSync('src/web/dashboard/src/**/*.test.{ts,tsx}', { cwd: rootDir }),
  ].map((p) => ({
    name: path.basename(p),
    hasAssertions: fs.readFileSync(path.join(rootDir, p), 'utf-8').includes('expect('),
  }))
  const testResult = scanTestCoverage(modules, testFiles, scannerOpts)

  // Projects without a `src/` directory (e.g. a freshly imported PRD graph) must
  // not crash the scan — guard every readdirSync(src) site.
  const srcDir = path.join(rootDir, 'src')
  const hasSrc = fs.existsSync(srcDir)
  const srcSubdirs = hasSrc ? fs.readdirSync(srcDir, { withFileTypes: true }).filter((d) => d.isDirectory()) : []

  // 3. Docs Coverage
  const docsInput = {
    hasClaudeMd: fs.existsSync(path.join(rootDir, 'CLAUDE.md')),
    hasReadme: fs.existsSync(path.join(rootDir, 'README.md')),
    rulesCount: globSync('.claude/rules/*.md', { cwd: rootDir }).length,
    srcDirsCount: srcSubdirs.length,
    hasDocsDir: fs.existsSync(path.join(rootDir, 'docs')),
  }
  const docsResult = scanDocsCoverage(docsInput)

  // 4. Architecture Fitness — exclude node_modules
  const allSrcFiles = globSync('src/**/*.ts', { cwd: rootDir, ignore: ['**/node_modules/**'] }).map((p) => ({
    path: p,
    content: fs.readFileSync(path.join(rootDir, p), 'utf-8'),
  }))
  const fitnessResults = [
    checkDependencyDirection(allSrcFiles),
    checkCircularDependencies(allSrcFiles),
    checkFileSizeCompliance(allSrcFiles),
    checkBarrelIntegrity(
      srcSubdirs.map((d) => ({
        path: `src/${d.name}`,
        files: fs.readdirSync(path.join(srcDir, d.name)),
        indexContent: fs.existsSync(path.join(srcDir, d.name, 'index.ts'))
          ? fs.readFileSync(path.join(srcDir, d.name, 'index.ts'), 'utf-8')
          : null,
      })),
    ),
  ]
  const passedFitness = fitnessResults.filter((r) => r.passed).length
  const fitnessScore = Math.round((passedFitness / fitnessResults.length) * 100)

  // 5. Naming Clarity
  const namingResult = scanNamingClarity(typeFiles, scannerOpts)

  // 6. Error Handling
  const errorResult = scanErrorHandling(typeFiles, scannerOpts)

  // 7. Context Density
  const contextResult = scanContextDensity(typeFiles, scannerOpts)

  // 8. Provenance Coverage (requires DB)
  const provenanceResult = db ? scanProvenance(db) : null

  // 9. Connectivity (core capabilities reachable from ≥1 surface)
  const connectivityResult = scanConnectivity({ rootDir })

  // 10. Final Score (9 dimensions)
  const finalResult = computeHarnessabilityScore({
    typeScore: typeResult.typeScore,
    testScore: testResult.testScore,
    docsScore: docsResult.docsScore,
    fitnessScore,
    namingScore: namingResult.namingScore,
    errorHandlingScore: errorResult.errorHandlingScore,
    contextDensityScore: contextResult.contextDensityScore,
    provenanceScore: provenanceResult?.provenanceScore,
    connectivityScore: connectivityResult.connectivityScore,
  })

  // 11. Build details summary
  const details: string[] = [
    `Type Coverage: ${typeResult.typeScore}% (${typeResult.totalFiles} files, ${typeResult.filesWithAny} with 'any')`,
    `Test Coverage: ${testResult.testScore}% (${testResult.totalModules} modules, ${testResult.testedModules} tested)`,
    `Docs Coverage: ${docsResult.docsScore}% (CLAUDE.md: ${docsInput.hasClaudeMd}, rules: ${docsInput.rulesCount})`,
    `Architecture Fitness: ${fitnessScore}% (${passedFitness}/${fitnessResults.length} checks passed)`,
    `Naming Clarity: ${namingResult.namingScore}% (${namingResult.flaggedSymbols} violations in ${namingResult.totalSymbols} names)`,
    `Error Handling: ${errorResult.errorHandlingScore}% (${errorResult.rawThrows} raw throws, ${errorResult.swallowedCatches} swallowed catches)`,
    `Context Density: ${contextResult.contextDensityScore}% (${contextResult.documentedExports}/${contextResult.totalExports} exports documented)`,
    provenanceResult
      ? `Provenance Coverage: ${provenanceResult.provenanceScore}% (${provenanceResult.nodesWithReceipt}/${provenanceResult.totalNodes} nodes with receipt)`
      : `Provenance Coverage: n/a (no DB)`,
    `Connectivity: ${connectivityResult.connectivityScore}% (${connectivityResult.connectedCapabilities}/${connectivityResult.totalCapabilities} core files reachable from surfaces)`,
  ]

  // Add fitness failure details
  for (const rVar of fitnessResults) {
    if (!rVar.passed) {
      details.push(
        `Fitness fail [${rVar.name}]: ${rVar.violations
          .slice(0, 3)
          .map((v) => `${v.file}:${v.line} -> ${v.rule}`)
          .join('; ')}`,
      )
    }
  }

  // 11. Merge violations from all scanners (v4)
  let mergedViolations: ViolationDetail[] | undefined
  if (collect) {
    const maxViolations = options?.maxViolations ?? 500
    const all: ViolationDetail[] = []

    // Scanners that return ViolationDetail[] directly
    if (typeResult.violations) all.push(...typeResult.violations)
    if (testResult.violations) all.push(...testResult.violations)
    if (namingResult.violations) all.push(...namingResult.violations)
    if (errorResult.violations) all.push(...errorResult.violations)
    if (contextResult.violations) all.push(...contextResult.violations)

    // Convert fitness Violation[] → ViolationDetail[]
    for (const fr of fitnessResults) {
      if (!fr.passed) {
        for (const vVar of fr.violations) {
          all.push({
            file: vVar.file,
            line: vVar.line,
            dimension: 'fitness',
            violationType:
              fr.name === 'dependency_direction'
                ? 'bad_import'
                : fr.name === 'circular_dependencies'
                  ? 'circular_dep'
                  : 'missing_barrel',
            evidence: vVar.rule,
            confidence: 1.0,
          })
        }
      }
    }

    // §autonomous-iter-1 — Fair distribution: smaller dimensions first
    // so a dominant dimension cannot push tiny ones (errors, fitness,
    // context) out of the cap entirely. Replaces naive `slice(0, max)`
    // which lost whole dimensions when earlier ones filled the budget.
    mergedViolations = distributeViolationsFairly(all, maxViolations)
  }

  // 12. Rule suggestions from steering loop
  const ruleSuggestions: RuleSuggestion[] = db ? new IssuePatternTracker(db).getSuggestedRules() : []

  const timestamp = new Date().toISOString()
  const resultValue: HarnessScanResult = {
    ...finalResult,
    details,
    timestamp,
    ruleSuggestions,
    ...(mergedViolations !== undefined ? { violations: mergedViolations } : {}),
  }

  if (db) {
    const projectId = options?.projectId ?? 'proj_local'
    const lastRow = db
      .prepare(
        'SELECT score, breakdown, timestamp FROM harness_history WHERE project_id = ? ORDER BY timestamp DESC LIMIT 1',
      )
      .get(projectId) as { score: number; breakdown: string; timestamp: string } | undefined

    if (lastRow !== undefined && finalResult.score <= lastRow.score - 5) {
      resultValue.regression = true
      resultValue.regressionDelta = +(finalResult.score - lastRow.score).toFixed(2)
    }

    // Deterministic dimension-saturation signal — reuses the prior scan's
    // persisted breakdown (no extra scan, no LLM math). Read BEFORE the insert
    // below so `lastRow` is genuinely the previous cycle, not this one.
    if (options?.includeSaturation && lastRow !== undefined) {
      const history: HistoryEntry[] = [
        { breakdown: lastRow.breakdown, timestamp: lastRow.timestamp, score: lastRow.score },
      ]
      resultValue.saturation = detectDimensionSaturation(history, finalResult.breakdown)
    }

    // Cross-session memory: read the prior state BEFORE overwriting it, so
    // `crossSessionMemory` reflects the previous cycle, not this one.
    if (options?.includeMemory) {
      resultValue.crossSessionMemory = getHarnessMemory(db)
      const patterns = mergedViolations ? Array.from(new Set(mergedViolations.map((v) => v.violationType))).sort() : []
      saveHarnessMemory(db, { lastScore: finalResult.score, lastGrade: finalResult.grade, patterns })
    }

    let gitCommit: string | null = null
    try {
      gitCommit = execSync('git rev-parse HEAD', { cwd: process.cwd(), stdio: 'pipe' }).toString().trim()
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'not a git repo or git unavailable' })
    }

    db.prepare(
      `INSERT INTO harness_history (id, project_id, score, grade, breakdown, git_commit, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      projectId,
      finalResult.score,
      finalResult.grade,
      JSON.stringify(finalResult.breakdown),
      gitCommit,
      timestamp,
    )
  }

  // Emit harness events (non-blocking, only if eventBus provided)
  if (eventBus) {
    try {
      eventBus.emit({
        type: 'harness:scan_completed',
        timestamp,
        payload: { score: finalResult.score, grade: finalResult.grade, timestamp },
      })
      if (resultValue.regression && resultValue.regressionDelta !== undefined) {
        const before = +(finalResult.score - resultValue.regressionDelta).toFixed(1)
        eventBus.emit({
          type: 'harness:regression_detected',
          timestamp,
          payload: { before, after: finalResult.score, delta: resultValue.regressionDelta },
        })
      }
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'EventBus handler crashed — non-blocking' })
    }
  }

  return resultValue
}
