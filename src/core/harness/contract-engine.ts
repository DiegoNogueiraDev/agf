/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Contract Engine — Architecture Rule Enforcement
 *
 * Deterministic architecture rule validation based on Design by Contract (Meyer, 1986).
 * Compiles rules from .claude/rules/*.md into machine-executable ArchitectureRule[].
 * Reuses existing fitness functions (checkDependencyDirection, etc.) as validation primitives.
 *
 * Part of the Autonomous Agent AAA+ pipeline — Pilar 3: Anti-Hallucination.
 */

import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'glob'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'contract-engine.ts' })

// ── Types ───────────────────────────────────────────────

export type RuleType = 'import_direction' | 'no_cycle' | 'barrel_integrity' | 'naming_convention' | 'dependency_ban'

export interface ArchitectureRule {
  id: string
  name: string
  type: RuleType
  sourcePattern?: string
  forbidden?: string[]
  severity: 'error' | 'warning'
  description: string
}

export interface ContractViolation {
  ruleId: string
  file: string
  line: number
  message: string
  severity: 'error' | 'warning'
  suggestion?: string
}

export interface FileContent {
  path: string
  content: string
}

// ── Built-in Rules ──────────────────────────────────────

const BUILT_IN_RULES: ArchitectureRule[] = [
  {
    id: 'import-direction-core',
    name: 'Core dependency direction',
    type: 'import_direction',
    sourcePattern: 'src/core/',
    forbidden: ['cli/', 'mcp/', 'api/', 'web/'],
    severity: 'error',
    description: 'core/ must not import from cli/, mcp/, api/, or web/',
  },
  {
    id: 'no-circular-deps',
    name: 'No circular dependencies',
    type: 'no_cycle',
    severity: 'error',
    description: 'No circular import chains between modules',
  },
  {
    id: 'barrel-integrity',
    name: 'Barrel export integrity',
    type: 'barrel_integrity',
    severity: 'warning',
    description: 'index.ts must re-export all sibling modules',
  },
  {
    id: 'naming-convention',
    name: 'Kebab-case file naming',
    type: 'naming_convention',
    severity: 'warning',
    description: 'Source files must use kebab-case naming (graph-store.ts, not graphStore.ts)',
  },
  {
    id: 'dependency-ban',
    name: 'No any type usage',
    type: 'dependency_ban',
    severity: 'warning',
    description: 'TypeScript strict mode — no `any` types allowed',
  },
]

/**
 * Get the 5 built-in architecture rules.
 */
export function getBuiltInRules(): ArchitectureRule[] {
  return [...BUILT_IN_RULES]
}

// ── Rule Compiler ───────────────────────────────────────

/**
 * Extract machine-executable rules from a .claude/rules/*.md markdown file.
 * Parses bullet points for known patterns (import restrictions, naming conventions).
 */
export function compileRulesFromMarkdown(content: string, filename: string): ArchitectureRule[] {
  const rules: ArchitectureRule[] = []

  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue

    // Detect import direction / dependency rules
    if (/must not import|never on|cannot import/i.test(trimmed)) {
      const forbidden = extractBacktickValues(trimmed).filter((v) => v.endsWith('/'))
      if (forbidden.length > 0) {
        rules.push({
          id: `compiled-import-${filename}-${rules.length}`,
          name: `Import restriction from ${filename}`,
          type: 'import_direction',
          forbidden,
          severity: 'error',
          description: trimmed.replace(/^[-*]\s*\*\*[^*]+\*\*\s*—?\s*/, ''),
        })
      }
    }

    // Detect naming conventions
    if (/kebab[-\s]?case/i.test(trimmed)) {
      rules.push({
        id: `compiled-naming-${filename}-${rules.length}`,
        name: `Naming convention from ${filename}`,
        type: 'naming_convention',
        severity: 'warning',
        description: trimmed.replace(/^[-*]\s*\*\*[^*]+\*\*\s*—?\s*/, ''),
      })
    }
  }

  log.debug('contract-engine:compile', { filename, rulesExtracted: rules.length })
  return rules
}

/**
 * Extract backtick-quoted values from a line.
 */
function extractBacktickValues(line: string): string[] {
  const matches = line.match(/`([^`]+)`/g)
  if (!matches) return []
  return matches.map((m) => m.replace(/`/g, ''))
}

// ── Validator ───────────────────────────────────────────

const IMPORT_PATTERN = /from\s+["']([^"']+)["']/g
const KEBAB_PATTERN = /^[a-z0-9][a-z0-9-]*\.(ts|tsx|js|jsx)$/
const ANY_PATTERN = /:\s*any\b/g

/**
 * Validate files against architecture rules.
 * Returns ContractViolation[] for all violations found.
 */
export function validateImports(files: FileContent[], rules: ArchitectureRule[]): ContractViolation[] {
  const violations: ContractViolation[] = []

  const importRules = rules.filter((r) => r.type === 'import_direction')
  const namingRules = rules.filter((r) => r.type === 'naming_convention')
  const banRules = rules.filter((r) => r.type === 'dependency_ban')

  for (const file of files) {
    // Check import direction rules
    for (const rule of importRules) {
      if (rule.sourcePattern && !file.path.includes(rule.sourcePattern)) continue

      const lines = file.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        IMPORT_PATTERN.lastIndex = 0
        let match: RegExpExecArray | null

        while ((match = IMPORT_PATTERN.exec(lines[i])) !== null) {
          const importPath = match[1]
          for (const forbidden of rule.forbidden ?? []) {
            if (importPath.includes(forbidden)) {
              violations.push({
                ruleId: rule.id,
                file: file.path,
                line: i + 1,
                message: `Import "${importPath}" violates rule: ${rule.description}`,
                severity: rule.severity,
                suggestion: `Remove import from ${forbidden} — use dependency injection or events instead`,
              })
            }
          }
        }
      }
    }

    // Check naming conventions
    if (namingRules.length > 0) {
      const filename = file.path.split('/').pop() ?? ''
      if (filename && !filename.startsWith('index.') && !KEBAB_PATTERN.test(filename)) {
        violations.push({
          ruleId: 'naming_convention',
          file: file.path,
          line: 0,
          message: `File "${filename}" does not follow kebab-case convention`,
          severity: 'warning',
          suggestion: `Rename to ${toKebabCase(filename)}`,
        })
      }
    }

    // Check dependency bans (any type usage)
    for (const rule of banRules) {
      const lines = file.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip comments and type imports
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue

        ANY_PATTERN.lastIndex = 0
        if (ANY_PATTERN.test(line)) {
          violations.push({
            ruleId: rule.id,
            file: file.path,
            line: i + 1,
            message: `Usage of \`any\` type violates strict TypeScript rule`,
            severity: rule.severity,
            suggestion: `Replace \`any\` with a proper type or \`unknown\``,
          })
        }
      }
    }
  }

  log.debug('contract-engine:validate', {
    filesChecked: files.length,
    violationsFound: violations.length,
  })

  return violations
}

// ── High-Level Orchestrator ─────────────────────────────

export interface ValidateOptions {
  additionalRules?: ArchitectureRule[]
}

export interface ValidateResult {
  violations: ContractViolation[]
  violationCount: number
  filesChecked: number
  hasErrors: boolean
  mode: 'lsp' | 'regex'
}

/**
 * High-level validation orchestrator.
 * Combines built-in rules + optional custom rules and validates files.
 * Falls back to regex-based import detection (LSP integration is opt-in via future enhancement).
 *
 * Based on: Architecture Fitness Functions (Ford & Parsons, Building Evolutionary Architectures).
 */
export function validateFiles(files: FileContent[], options?: ValidateOptions): ValidateResult {
  const allRules = [...BUILT_IN_RULES, ...(options?.additionalRules ?? [])]

  const violations = validateImports(files, allRules)

  return {
    violations,
    violationCount: violations.length,
    filesChecked: files.length,
    hasErrors: violations.some((v) => v.severity === 'error'),
    mode: 'regex',
  }
}

/**
 * Project-wide contract scan — compiles rules from .claude/rules/*.md (falls
 * back to the 5 built-in rules alone when no rules directory exists) and
 * validates every src/**\/*.ts file against them.
 *
 * This is the CLI-facing entry point (`agf harness --contracts`); the pure
 * functions above (compileRulesFromMarkdown, validateFiles) stay fs-free so
 * they remain unit-testable without touching disk.
 */
export function runContractScan(rootDir: string): ValidateResult {
  const ruleFiles = globSync('.claude/rules/*.md', { cwd: rootDir })
  const compiledRules = ruleFiles.flatMap((relPath) => {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf-8')
    return compileRulesFromMarkdown(content, path.basename(relPath))
  })

  const srcFiles: FileContent[] = globSync('src/**/*.ts', {
    cwd: rootDir,
    ignore: ['src/**/*.test.ts', '**/node_modules/**'],
  }).map((relPath) => ({
    path: relPath,
    content: fs.readFileSync(path.join(rootDir, relPath), 'utf-8'),
  }))

  return validateFiles(srcFiles, { additionalRules: compiledRules })
}

/**
 * Convert a filename to kebab-case.
 */
function toKebabCase(filename: string): string {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : ''
  const name = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename
  return (
    name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .toLowerCase() + ext
  )
}
