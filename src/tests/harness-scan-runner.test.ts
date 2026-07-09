/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runHarnessScan } from '../core/harness/harness-scan-runner.js'
import { getHarnessMemory } from '../core/harness/cross-session-memory.js'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => 'export const x = 1'),
  },
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => 'export const x = 1'),
}))

vi.mock('glob', () => ({
  globSync: vi.fn(() => []),
}))

vi.mock('../core/harness/type-coverage-scanner.js', () => ({
  scanTypeCoverage: vi.fn(() => ({
    typeScore: 100,
    totalFiles: 0,
    filesWithAny: 0,
  })),
}))

vi.mock('../core/harness/test-coverage-scanner.js', () => ({
  scanTestCoverage: vi.fn(() => ({
    testScore: 100,
    totalModules: 0,
    testedModules: 0,
  })),
}))

vi.mock('../core/harness/docs-coverage-scanner.js', () => ({
  scanDocsCoverage: vi.fn(() => ({
    docsScore: 100,
  })),
}))

vi.mock('../core/harness/naming-clarity-scanner.js', () => ({
  scanNamingClarity: vi.fn(() => ({
    namingScore: 100,
    flaggedSymbols: 0,
    totalSymbols: 0,
  })),
}))

vi.mock('../core/harness/error-handling-scanner.js', () => ({
  scanErrorHandling: vi.fn(() => ({
    errorHandlingScore: 100,
    rawThrows: 0,
    swallowedCatches: 0,
  })),
}))

vi.mock('../core/harness/context-density-scanner.js', () => ({
  scanContextDensity: vi.fn(() => ({
    contextDensityScore: 100,
    documentedExports: 0,
    totalExports: 0,
  })),
}))

vi.mock('../core/harness/fitness-functions.js', () => ({
  checkDependencyDirection: vi.fn(() => ({ passed: true, name: 'dependency_direction', violations: [] })),
  checkCircularDependencies: vi.fn(() => ({ passed: true, name: 'circular_dependencies', violations: [] })),
  checkBarrelIntegrity: vi.fn(() => ({ passed: true, name: 'barrel_integrity', violations: [] })),
  checkFileSizeCompliance: vi.fn(() => ({ passed: true, name: 'file_size', violations: [] })),
}))

vi.mock('../core/harness/harnessability-score.js', () => ({
  computeHarnessabilityScore: vi.fn(() => ({
    score: 85,
    grade: 'A',
    breakdown: {
      types: { score: 100, weight: 0.25 },
      tests: { score: 100, weight: 0.25 },
      fitness: { score: 100, weight: 0.15 },
      docs: { score: 100, weight: 0.1 },
      naming: { score: 100, weight: 0.1 },
      errors: { score: 100, weight: 0.05 },
      context: { score: 100, weight: 0.05 },
      provenance: { score: 100, weight: 0.05 },
    },
  })),
}))

vi.mock('../core/harness/provenance-scanner.js', () => ({
  scanProvenance: vi.fn(() => ({ provenanceScore: 100, totalNodes: 0, nodesWithReceipt: 0 })),
}))

vi.mock('../core/harness/violation-distribution.js', () => ({
  distributeViolationsFairly: vi.fn((v) => v.slice(0, 500)),
}))

vi.mock('../core/harness/issue-pattern-tracker.js', () => ({
  IssuePatternTracker: class {
    getSuggestedRules(): unknown[] {
      return []
    }
  },
}))

vi.mock('../core/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}))

describe('runHarnessScan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a HarnessScanResult with score and grade', () => {
    const result = runHarnessScan('/tmp/test-project')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result).toHaveProperty('grade')
    expect(result).toHaveProperty('details')
    expect(result).toHaveProperty('timestamp')
    expect(result).toHaveProperty('ruleSuggestions')
  })

  it('includes details array with all dimension summaries', () => {
    const result = runHarnessScan('/tmp/test-project')
    expect(result.details.length).toBeGreaterThan(0)
  })

  it('does not set regression when no db is given', () => {
    const result = runHarnessScan('/tmp/test-project')
    expect(result.regression).toBeUndefined()
  })
})

describe('runHarnessScan — dimension saturation wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeDbWithHistory(prevBreakdown?: Record<string, { score: number }>): InstanceType<typeof Database> {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE harness_history (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, score REAL NOT NULL,
        grade TEXT NOT NULL, breakdown TEXT NOT NULL, git_commit TEXT, timestamp TEXT NOT NULL
      );
    `)
    if (prevBreakdown) {
      db.prepare(
        'INSERT INTO harness_history (id, project_id, score, grade, breakdown, git_commit, timestamp) VALUES (?,?,?,?,?,?,?)',
      ).run('h1', 'proj_local', 90, 'A', JSON.stringify(prevBreakdown), null, '2026-01-01T00:00:00.000Z')
    }
    return db
  }

  // Current breakdown is mocked to all dims = 100. Seeding a prior row where every
  // dim is also > 85 with <2pt delta saturates all-but-docs (docs=80 → not saturated),
  // so the weakest non-saturated dim (docs) becomes the deterministic pivot target.
  it('attaches saturation with pivotTo when prior history exists and flag set', () => {
    const prev = {
      types: { score: 100 },
      tests: { score: 100 },
      fitness: { score: 100 },
      docs: { score: 80 },
      naming: { score: 100 },
      errors: { score: 100 },
      context: { score: 100 },
      provenance: { score: 100 },
    }
    const db = makeDbWithHistory(prev)
    const result = runHarnessScan('/tmp/test-project', db, undefined, { includeSaturation: true })
    expect(result.saturation).toBeDefined()
    expect(result.saturation?.saturated).toBe(true)
    expect(result.saturation?.pivotTo).toBe('docs')
    db.close()
  })

  it('omits saturation on the first cycle (no prior history)', () => {
    const db = makeDbWithHistory()
    const result = runHarnessScan('/tmp/test-project', db, undefined, { includeSaturation: true })
    expect(result.saturation).toBeUndefined()
    db.close()
  })

  it('omits saturation when the flag is not set even with history', () => {
    const db = makeDbWithHistory({ types: { score: 100 }, docs: { score: 80 } })
    const result = runHarnessScan('/tmp/test-project', db, undefined, {})
    expect(result.saturation).toBeUndefined()
    db.close()
  })
})

describe('runHarnessScan — cross-session memory wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeDbWithProject(): InstanceType<typeof Database> {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE harness_history (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, score REAL NOT NULL,
        grade TEXT NOT NULL, breakdown TEXT NOT NULL, git_commit TEXT, timestamp TEXT NOT NULL
      );
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE project_settings (
        project_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, key)
      );
    `)
    return db
  }

  it('omits crossSessionMemory when the flag is not set', () => {
    const db = makeDbWithProject()
    const result = runHarnessScan('/tmp/test-project', db, undefined, {})
    expect(result.crossSessionMemory).toBeUndefined()
    db.close()
  })

  it('reports null previous memory on the first scan, then persists the current one', () => {
    const db = makeDbWithProject()
    const result = runHarnessScan('/tmp/test-project', db, undefined, { includeMemory: true })
    expect(result.crossSessionMemory).toBeNull()

    const saved = getHarnessMemory(db)
    expect(saved).toEqual({ lastScore: 85, lastGrade: 'A', patterns: [] })
    db.close()
  })

  it('surfaces the prior session state before overwriting it with the current scan', () => {
    const db = makeDbWithProject()
    runHarnessScan('/tmp/test-project', db, undefined, { includeMemory: true })
    const result = runHarnessScan('/tmp/test-project', db, undefined, { includeMemory: true })
    expect(result.crossSessionMemory).toEqual({ lastScore: 85, lastGrade: 'A', patterns: [] })
    db.close()
  })
})
