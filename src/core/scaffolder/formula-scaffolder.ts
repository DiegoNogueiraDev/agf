/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Formula Scaffolder — generates a pure TypeScript function + fast-check property tests.
 *
 * Given a formula node (expression + domain), produces:
 *   - A pure function file implementing the expression
 *   - A property-based test file (fast-check) that verifies commutativity & associativity
 *     when the domain allows it
 *
 * Rules:
 *   - Domain must declare ALL variables referenced in the expression (validated on entry)
 *   - USER-CODE-START / USER-CODE-END blocks in existing files are preserved on re-scaffold
 *   - Only the formula body block is replaced on re-scaffold; custom tests are kept
 */

import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'formula-scaffolder.ts' })

// ── Types ──────────────────────────────────────────────────────────────────

export type DomainConstraint = string // e.g. "Z>=0", "R", "N"

export interface FormulaSpec {
  readonly id: string
  /** camelCase function name */
  readonly name: string
  /** The mathematical expression, e.g. "a + b" */
  readonly expression: string
  /** Variable name → domain constraint */
  readonly domain: Record<string, DomainConstraint>
}

export interface ScaffoldFormulaOptions {
  /** Existing function file content — FORMULA-BODY block replaced, USER-CODE preserved */
  readonly existingFunctionContent?: string
  /** Existing test file content — USER-CODE blocks preserved, formula tests regenerated */
  readonly existingTestContent?: string
  /** Output directory for the function file */
  readonly functionDir?: string
  /** Output directory for the test file */
  readonly testDir?: string
}

export interface ScaffoldedFormulaFile {
  readonly path: string
  readonly content: string
  readonly preservedBlocks: readonly string[]
}

export interface ScaffoldedFormulaTestFile {
  readonly path: string
  readonly content: string
  readonly created: boolean
  readonly preservedBlocks: readonly string[]
}

export interface ScaffoldFormulaResult {
  readonly functionFile: ScaffoldedFormulaFile
  readonly testFile: ScaffoldedFormulaTestFile
}

// ── Typed error ────────────────────────────────────────────────────────────

export class InconsistentDomainError extends McpGraphError {
  constructor(nodeId: string, undeclaredVars: string[]) {
    super(
      `Inconsistent domain in formula node '${nodeId}': ` +
        `variable(s) [${undeclaredVars.join(', ')}] used in expression but not declared in domain`,
    )
    this.name = 'InconsistentDomainError'
  }
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_FUNCTION_DIR = 'src/core/generated'
const DEFAULT_TEST_DIR = 'src/tests/scaffolder'
const FORMULA_BODY_START = '// FORMULA-BODY-START'
const FORMULA_BODY_END = '// FORMULA-BODY-END'
const USER_CODE_START = '// USER-CODE-START'
const USER_CODE_END = '// USER-CODE-END'

// ── Public API ─────────────────────────────────────────────────────────────

/** scaffoldFormula —  */
export function scaffoldFormula(spec: FormulaSpec, options: ScaffoldFormulaOptions = {}): ScaffoldFormulaResult {
  validateDomain(spec)

  const functionDir = options.functionDir ?? DEFAULT_FUNCTION_DIR
  const testDir = options.testDir ?? DEFAULT_TEST_DIR

  const functionPreserved = options.existingFunctionContent
    ? extractUserCodeBlocks(options.existingFunctionContent)
    : new Map<string, string>()

  const testPreserved = options.existingTestContent
    ? extractUserCodeBlocks(options.existingTestContent)
    : new Map<string, string>()

  const functionContent = renderFunctionFile(spec, functionPreserved)
  const testContent = renderTestFile(spec, testPreserved, functionDir)

  log.info('formula-scaffolder', {
    nodeId: spec.id,
    name: spec.name,
    variables: Object.keys(spec.domain).join(','),
    preservedBlocks: String(functionPreserved.size + testPreserved.size),
  })

  return {
    functionFile: {
      path: joinPath(functionDir, `${spec.name}.ts`),
      content: functionContent,
      preservedBlocks: [...functionPreserved.keys()],
    },
    testFile: {
      path: joinPath(testDir, `${spec.name}.formula.test.ts`),
      content: testContent,
      created: options.existingTestContent === undefined,
      preservedBlocks: [...testPreserved.keys()],
    },
  }
}

// ── Validation ────────────────────────────────────────────────────────────

function validateDomain(spec: FormulaSpec): void {
  const declared = new Set(Object.keys(spec.domain))
  // Extract single-letter or word identifiers used in the expression
  const used = extractVariables(spec.expression)
  const undeclared = used.filter((v) => !declared.has(v))
  if (undeclared.length > 0) {
    throw new InconsistentDomainError(spec.id, undeclared)
  }
}

/** Extract variable identifiers from an expression string (single-letter or word tokens). */
function extractVariables(expression: string): string[] {
  // Match word tokens that aren't numbers or operators
  const tokens = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? []
  return [...new Set(tokens)]
}

// ── Rendering ────────────────────────────────────────────────────────────

function renderFunctionFile(spec: FormulaSpec, preserved: ReadonlyMap<string, string>): string {
  const params = Object.keys(spec.domain)
    .map((v) => `${v}: number`)
    .join(', ')

  const lines: string[] = []
  lines.push('// AUTO-GENERATED by formula-scaffolder — edit only inside USER-CODE blocks.')
  lines.push(`// Formula: ${spec.expression}`)
  lines.push(`// Domain: ${JSON.stringify(spec.domain)}`)
  lines.push('')
  lines.push(FORMULA_BODY_START)
  lines.push(`export function ${spec.name}(${params}): number {`)
  lines.push(`  return ${spec.expression};`)
  lines.push('}')
  lines.push(FORMULA_BODY_END)

  // Append any preserved USER-CODE blocks
  for (const [blockName, blockContent] of preserved) {
    lines.push('')
    lines.push(`${USER_CODE_START} ${blockName}`)
    lines.push(blockContent)
    lines.push(`${USER_CODE_END} ${blockName}`)
  }

  return lines.join('\n') + '\n'
}

function renderTestFile(spec: FormulaSpec, preserved: ReadonlyMap<string, string>, functionDir: string): string {
  const vars = Object.keys(spec.domain)
  const params = vars.join(', ')
  const arbitraries = vars.map((v) => `${arbitraryFor(spec.domain[v])} /* ${v}: ${spec.domain[v]} */`).join(', ')

  const lines: string[] = []
  lines.push('// AUTO-GENERATED by formula-scaffolder — edit only inside USER-CODE blocks.')
  lines.push(`import { describe, it, expect } from 'vitest';`)
  lines.push(`import * as fc from 'fast-check';`)
  lines.push(`import { ${spec.name} } from '${functionDir}/${spec.name}.js';`)
  lines.push('')
  lines.push(`// FORMULA-TESTS-START`)
  lines.push(`describe('${spec.name} — property-based tests (fast-check)', () => {`)

  if (vars.length >= 2) {
    const [a, b] = vars
    lines.push(`  it('should satisfy commutativity: f(${a},${b}) === f(${b},${a})', () => {`)
    lines.push(`    fc.assert(fc.property(${arbitraries}, (${params}) => {`)
    lines.push(`      expect(${spec.name}(${params})).toBe(${spec.name}(${[...vars].reverse().join(', ')}));`)
    lines.push(`    }));`)
    lines.push(`  });`)
    lines.push('')
    const [c] = vars.length >= 3 ? [vars[2]] : [a]
    lines.push(`  it('should satisfy associativity: f(f(${a},${b}),${c}) === f(${a},f(${b},${c}))', () => {`)
    lines.push(`    fc.assert(fc.property(${arbitraries}, (${params}) => {`)
    lines.push(`      const lhs = ${spec.name}(${spec.name}(${a}, ${b}), ${c});`)
    lines.push(`      const rhs = ${spec.name}(${a}, ${spec.name}(${b}, ${c}));`)
    lines.push(`      expect(lhs).toBe(rhs);`)
    lines.push(`    }));`)
    lines.push(`  });`)
  }

  lines.push(`});`)
  lines.push(`// FORMULA-TESTS-END`)

  // Preserved USER-CODE blocks
  for (const [blockName, blockContent] of preserved) {
    lines.push('')
    lines.push(`${USER_CODE_START} ${blockName}`)
    lines.push(blockContent)
    lines.push(`${USER_CODE_END} ${blockName}`)
  }

  return lines.join('\n') + '\n'
}

function arbitraryFor(constraint: DomainConstraint): string {
  if (constraint === 'Z>=0' || constraint === 'N') return 'fc.nat()'
  if (constraint === 'Z>0') return 'fc.nat({ min: 1 })'
  if (constraint === 'Z') return 'fc.integer()'
  if (constraint === 'R') return 'fc.double({ noNaN: true })'
  return 'fc.integer()'
}

// ── USER-CODE block utilities ─────────────────────────────────────────────

function extractUserCodeBlocks(content: string): Map<string, string> {
  const blocks = new Map<string, string>()
  const startPattern = /\/\/ USER-CODE-START (\S+)/g
  let match: RegExpExecArray | null

  while ((match = startPattern.exec(content)) !== null) {
    const blockName = match[1]
    const startIdx = match.index + match[0].length + 1
    const endMarker = `${USER_CODE_END} ${blockName}`
    const endIdx = content.indexOf(endMarker, startIdx)
    if (endIdx !== -1) {
      blocks.set(blockName, content.slice(startIdx, endIdx).trimEnd())
    }
  }

  return blocks
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}
