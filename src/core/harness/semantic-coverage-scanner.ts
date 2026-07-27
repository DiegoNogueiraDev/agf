/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Semantic Coverage Scanner — real import verification.
 *
 * Biology analogy (Burnet 1959): An antibody that does not bind to its antigen
 * confers no protection — presence in the serum ≠ immunity. A foo.test.ts that
 * does not import foo.ts does not exercise foo.ts — presence in the tests/
 * directory ≠ coverage.
 *
 * This scanner produces TWO independent metrics for the same module set:
 *   1. stemCoveredModules — test file with matching name exists (classic stem match)
 *   2. importCoveredModules — test file actually contains an import/require of the module
 *
 * The delta (stem − import) reveals the "phantom coverage" gap: modules that
 * appear tested because a matching test file exists, but are never actually exercised.
 *
 * Deterministic, zero-token, no filesystem I/O (callers pass content).
 */

export interface SemanticModuleInfo {
  /** Canonical module name without extension, used for stem matching */
  name: string
  /** Relative or absolute path to the source file */
  path: string
}

export interface SemanticTestFileInfo {
  /** Test file name without directory, used for stem matching */
  name: string
  /** Path to the test file (used for import path reconstruction) */
  path: string
  /** Full text content of the test file */
  content: string
}

export interface SemanticCoverageInput {
  modules: SemanticModuleInfo[]
  testFiles: SemanticTestFileInfo[]
}

export interface SemanticCoverageResult {
  totalModules: number
  /** Modules with a test file whose name stem matches the module name */
  stemCoveredModules: number
  /** Modules actually imported (import/require) in at least one test file */
  importCoveredModules: number
  /** stemCovered / total × 100, rounded */
  stemCoverageRate: number
  /** importCovered / total × 100, rounded */
  importCoverageRate: number
  /** Phantom gap: stemCovered − importCovered (non-negative by invariant) */
  phantomGap: number
  /** Modules with a stem-match test but no actual import in that test */
  phantomCovered: string[]
  /** Modules with neither a stem match nor an import */
  uncoveredByImport: string[]
}

// Matches: import ... from '...foo...'  OR  require('...foo...')
// Handles .ts, .js, no-extension, and partial paths like '../core/foo'
const IMPORT_RE = /(?:import\s[^;'"]*from\s['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g

function buildImportSet(content: string): Set<string> {
  const imports = new Set<string>()
  let m: RegExpExecArray | null
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const raw = m[1] ?? m[2]
    if (raw) {
      // Normalise: strip leading ./, ../, extension
      const stripped = raw
        .replace(/^(?:\.\.?\/)+/, '') // remove leading ../ or ./
        .replace(/\.(ts|js|tsx|jsx|mjs|cjs)$/, '') // remove extension
        .replace(/\/index$/, '') // collapse /index
      imports.add(stripped)
      // Also keep the raw basename for simpler matching
      const parts = stripped.split('/')
      imports.add(parts[parts.length - 1])
    }
  }
  return imports
}

function normalizeStem(name: string): string {
  return name
    .replace(/\.test\.(tsx?|jsx?)$/, '') // foo.test.ts → foo
    .replace(/\.spec\.(tsx?|jsx?)$/, '') // foo.spec.ts → foo
    .replace(/\.bench\.(tsx?|jsx?)$/, '') // foo.bench.ts → foo
    .replace(/\.(tsx?|jsx?)$/, '') // foo.ts → foo
    .replace(/\.test$/, '') // foo.test → foo (no final extension)
    .replace(/\.spec$/, '') // foo.spec → foo (no final extension)
    .replace(/\.bench$/, '') // foo.bench → foo (no final extension)
}

function moduleStemFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return normalizeStem(base)
}

/**
 * Scan coverage using both stem matching and real import verification.
 * Pure function — no filesystem I/O.
 */
export function scanSemanticCoverage(input: SemanticCoverageInput): SemanticCoverageResult {
  const { modules, testFiles } = input

  if (modules.length === 0) {
    return {
      totalModules: 0,
      stemCoveredModules: 0,
      importCoveredModules: 0,
      stemCoverageRate: 100,
      importCoverageRate: 100,
      phantomGap: 0,
      phantomCovered: [],
      uncoveredByImport: [],
    }
  }

  // Pre-build import sets for all test files (amortises regex work)
  const testImportSets = testFiles.map((tf) => buildImportSet(tf.content))

  // Pre-build stem sets for stem matching
  const testStems = new Set(testFiles.map((tf) => normalizeStem(tf.name)))

  let stemCovered = 0
  let importCovered = 0
  const phantomCovered: string[] = []
  const uncoveredByImport: string[] = []

  for (const mod of modules) {
    const modStem = mod.name // caller already provides the stem

    // Stem match: test file with matching name exists
    const hasStemMatch =
      testStems.has(modStem) || testStems.has(modStem.replace(/_/g, '-')) || testStems.has(modStem.replace(/-/g, '_'))

    if (hasStemMatch) stemCovered++

    // Import match: at least one test file actually imports this module
    // Match against: module name, path basename, or any path fragment
    const modBasename = moduleStemFromPath(mod.path)
    let hasImport = false
    for (const importSet of testImportSets) {
      if (
        importSet.has(modStem) ||
        importSet.has(modBasename) ||
        importSet.has(modStem.replace(/_/g, '-')) ||
        importSet.has(modStem.replace(/-/g, '_'))
      ) {
        hasImport = true
        break
      }
    }

    if (hasImport) {
      importCovered++
    } else {
      uncoveredByImport.push(mod.path)
      if (hasStemMatch) {
        phantomCovered.push(mod.path)
      }
    }
  }

  const total = modules.length

  return {
    totalModules: total,
    stemCoveredModules: stemCovered,
    importCoveredModules: importCovered,
    stemCoverageRate: Math.round((stemCovered / total) * 100),
    importCoverageRate: Math.round((importCovered / total) * 100),
    phantomGap: stemCovered - importCovered,
    phantomCovered,
    uncoveredByImport,
  }
}
