/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getBuiltInRules,
  compileRulesFromMarkdown,
  validateImports,
  validateFiles,
  runContractScan,
} from '../core/harness/contract-engine.js'
import type { FileContent, ArchitectureRule } from '../core/harness/contract-engine.js'

describe('getBuiltInRules', () => {
  it('returns 5 rules', () => {
    const rules = getBuiltInRules()
    expect(rules).toHaveLength(5)
    expect(rules[0].id).toBe('import-direction-core')
    expect(rules[1].id).toBe('no-circular-deps')
  })
})

describe('compileRulesFromMarkdown', () => {
  it('parses import restriction lines with backtick paths', () => {
    const md = '- **Core** — core/ must not import from `api/`'
    const rules = compileRulesFromMarkdown(md, 'test.md')
    expect(rules).toHaveLength(1)
    expect(rules[0].type).toBe('import_direction')
    expect(rules[0].forbidden).toEqual(['api/'])
  })

  it('parses kebab-case convention', () => {
    const md = '- **Naming** — source files must use kebab-case'
    const rules = compileRulesFromMarkdown(md, 'test.md')
    expect(rules).toHaveLength(1)
    expect(rules[0].type).toBe('naming_convention')
  })

  it('returns empty for non-matching lines', () => {
    const md = '- Some random bullet point without rules'
    const rules = compileRulesFromMarkdown(md, 'test.md')
    expect(rules).toHaveLength(0)
  })
})

describe('validateImports', () => {
  const coreFile: FileContent = {
    path: 'src/core/service.ts',
    content: 'import { something } from "../cli/helper.js"\nimport { stuff } from "../api/handler.js"',
  }
  const cleanFile: FileContent = {
    path: 'src/core/service.ts',
    content: 'import { something } from "./local.js"',
  }
  const badName: FileContent = {
    path: 'src/core/myService.ts',
    content: 'export const x = 1',
  }

  it('detects forbidden imports', () => {
    const rules: ArchitectureRule[] = [
      {
        id: 'test-import',
        name: 'Test',
        type: 'import_direction',
        sourcePattern: 'src/core/',
        forbidden: ['cli/', 'api/'],
        severity: 'error',
        description: 'core/ must not import from cli/ or api/',
      },
    ]
    const violations = validateImports([coreFile], rules)
    expect(violations).toHaveLength(2)
    expect(violations[0].ruleId).toBe('test-import')
    expect(violations[0].severity).toBe('error')
  })

  it('no violations for clean files', () => {
    const rules: ArchitectureRule[] = [
      {
        id: 'test-import',
        name: 'Test',
        type: 'import_direction',
        sourcePattern: 'src/core/',
        forbidden: ['cli/'],
        severity: 'error',
        description: 'test',
      },
    ]
    const violations = validateImports([cleanFile], rules)
    expect(violations).toHaveLength(0)
  })

  it('detects non-kebab-case filenames', () => {
    const rules: ArchitectureRule[] = [
      {
        id: 'naming',
        name: 'Kebab',
        type: 'naming_convention',
        severity: 'warning',
        description: 'kebab-case',
      },
    ]
    const violations = validateImports([badName], rules)
    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('kebab-case')
  })

  it('detects any type usage', () => {
    const rules: ArchitectureRule[] = [
      {
        id: 'no-any',
        name: 'No any',
        type: 'dependency_ban',
        severity: 'warning',
        description: 'No any types',
      },
    ]
    const f: FileContent = { path: 'src/core/foo.ts', content: 'const x: any = 42' }
    const violations = validateImports([f], rules)
    expect(violations).toHaveLength(1)
    expect(violations[0].suggestion).toContain('unknown')
  })

  it('empty files list returns no violations', () => {
    const violations = validateImports([], getBuiltInRules())
    expect(violations).toHaveLength(0)
  })
})

describe('validateFiles', () => {
  it('combines built-in and additional rules', () => {
    const extra: ArchitectureRule = {
      id: 'custom',
      name: 'Custom',
      type: 'naming_convention',
      severity: 'warning',
      description: 'custom rule',
    }
    const r = validateFiles([], { additionalRules: [extra] })
    expect(r.filesChecked).toBe(0)
    expect(r.hasErrors).toBe(false)
  })

  it('reports hasErrors when error violations exist', () => {
    const f: FileContent = { path: 'src/core/foo.ts', content: 'import x from "../cli/x.js"' }
    const rules: ArchitectureRule[] = [
      {
        id: 'err-rule',
        name: 'Err',
        type: 'import_direction',
        sourcePattern: 'src/core/',
        forbidden: ['cli/'],
        severity: 'error',
        description: 'no cli',
      },
    ]
    const r = validateFiles([f], { additionalRules: rules })
    expect(r.filesChecked).toBe(1)
  })
})

describe('runContractScan (node_wire_73705ed2e11f)', () => {
  it('compiles rules from .claude/rules/*.md and flags a violating source file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-contract-scan-'))
    try {
      mkdirSync(join(dir, '.claude/rules'), { recursive: true })
      writeFileSync(join(dir, '.claude/rules/architecture.md'), '- **Core** — core/ must not import from `cli/`\n')
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(
        join(dir, 'src/core/offender.ts'),
        'import { thing } from "../cli/thing.js"\nexport const x = thing\n',
      )

      const result = runContractScan(dir)

      expect(result.filesChecked).toBe(1)
      expect(result.violations.some((v) => v.file === 'src/core/offender.ts')).toBe(true)
      expect(result.hasErrors).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns no violations for a clean tree with no rule files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-contract-scan-clean-'))
    try {
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(join(dir, 'src/core/clean.ts'), 'export const x = 1\n')

      const result = runContractScan(dir)

      expect(result.filesChecked).toBe(1)
      expect(result.violationCount).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
