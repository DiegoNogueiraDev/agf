/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  checkDependencyDirection,
  checkCircularDependencies,
  checkBarrelIntegrity,
  checkFileSizeCompliance,
} from '../core/harness/fitness-functions.js'
import type { FileContent, DirectoryInfo } from '../core/harness/fitness-functions.js'

describe('checkDependencyDirection', () => {
  it('passes when no forbidden imports', () => {
    const files: FileContent[] = [
      { path: 'src/core/foo.ts', content: 'import { x } from "./local.js"' },
      { path: 'src/schemas/bar.ts', content: 'import { y } from "../utils/helper.js"' },
    ]
    const r = checkDependencyDirection(files)
    expect(r.passed).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('fails when core imports from cli', () => {
    const files: FileContent[] = [{ path: 'src/core/foo.ts', content: 'import { x } from "../cli/helper.js"' }]
    const r = checkDependencyDirection(files)
    expect(r.passed).toBe(false)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0].rule).toContain('core/')
  })

  it('fails when schemas imports from core', () => {
    const files: FileContent[] = [{ path: 'src/schemas/foo.ts', content: 'import { x } from "../core/helper.js"' }]
    const r = checkDependencyDirection(files)
    expect(r.passed).toBe(false)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0].rule).toContain('schemas/')
  })

  it('returns passed=true for empty files', () => {
    const r = checkDependencyDirection([])
    expect(r.passed).toBe(true)
    expect(r.checkedFiles).toBe(0)
  })
})

describe('checkCircularDependencies', () => {
  it('passes with no circular deps', () => {
    const files: FileContent[] = [
      { path: 'src/core/foo.ts', content: 'import { bar } from "./bar.js"' },
      { path: 'src/core/bar.ts', content: 'import { baz } from "./baz.js"' },
      { path: 'src/core/baz.ts', content: '' },
    ]
    const r = checkCircularDependencies(files)
    expect(r.passed).toBe(true)
  })

  it('detects a simple cycle', () => {
    // Module names use first 2 path segments under src/.
    // Dep name uses last 2 import-path segments.
    // For src/a/b/deep/x.ts → module "a/b", import "../../../c/d" → dep "c/d"
    const files: FileContent[] = [
      { path: 'src/a/b/deep/x.ts', content: 'import {} from "../../../c/d"' },
      { path: 'src/c/d/deep/y.ts', content: 'import {} from "../../../a/b"' },
    ]
    const r = checkCircularDependencies(files)
    expect(r.passed).toBe(false)
    expect(r.violations.length).toBeGreaterThan(0)
  })

  it('returns passed=true for empty files', () => {
    const r = checkCircularDependencies([])
    expect(r.passed).toBe(true)
  })
})

describe('checkBarrelIntegrity', () => {
  it('passes when all siblings are re-exported', () => {
    const dirs: DirectoryInfo[] = [
      {
        path: 'src/core',
        files: ['index.ts', 'foo.ts', 'bar.ts'],
        indexContent: 'export * from "./foo.js"\nexport * from "./bar.js"',
      },
    ]
    const r = checkBarrelIntegrity(dirs)
    expect(r.passed).toBe(true)
  })

  it('detects missing re-exports', () => {
    const dirs: DirectoryInfo[] = [
      {
        path: 'src/core',
        files: ['index.ts', 'foo.ts', 'bar.ts'],
        indexContent: 'export * from "./foo.js"',
      },
    ]
    const r = checkBarrelIntegrity(dirs)
    expect(r.passed).toBe(false)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0].importPath).toBe('./bar')
  })

  it('handles null index content', () => {
    const dirs: DirectoryInfo[] = [
      {
        path: 'src/core',
        files: ['foo.ts', 'bar.ts'],
        indexContent: null,
      },
    ]
    const r = checkBarrelIntegrity(dirs)
    expect(r.passed).toBe(true)
  })

  it('node_30c368: does not treat a bin entrypoint (shebang index.ts) as a barrel', () => {
    // src/swarming/index.ts é um entrypoint executável (#!/usr/bin/env node),
    // não um barrel — re-exportar os irmãos ali rodaria o bootstrap como efeito
    // de import. Um index.ts com shebang é isento da integridade de barrel.
    const dirs: DirectoryInfo[] = [
      {
        path: 'src/swarming',
        files: ['index.ts', 'spawn.ts', 'ant-runner.ts', 'program.ts'],
        indexContent: '#!/usr/bin/env node\nimport { runSwarming } from "./program.js"\n',
      },
    ]
    const r = checkBarrelIntegrity(dirs)
    expect(r.passed).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('returns passed=true for empty dirs', () => {
    const r = checkBarrelIntegrity([])
    expect(r.passed).toBe(true)
  })
})

describe('checkFileSizeCompliance', () => {
  const bigFile = (path: string, lines: number): FileContent => ({
    path,
    content: Array.from({ length: lines }, (_, i) => `const line${i} = ${i}`).join('\n'),
  })

  it('fails when a file exceeds 800 lines, listing its path', () => {
    const files: FileContent[] = [bigFile('src/core/huge.ts', 801)]
    const r = checkFileSizeCompliance(files)
    expect(r.passed).toBe(false)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0].file).toBe('src/core/huge.ts')
  })

  it('passes when all files are <= 800 lines', () => {
    const files: FileContent[] = [bigFile('src/core/ok.ts', 800), bigFile('src/core/small.ts', 10)]
    const r = checkFileSizeCompliance(files)
    expect(r.passed).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('excludes *.generated.ts files even when oversized', () => {
    const files: FileContent[] = [bigFile('src/core/types.generated.ts', 5000)]
    const r = checkFileSizeCompliance(files)
    expect(r.passed).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('returns passed=true for empty files', () => {
    const r = checkFileSizeCompliance([])
    expect(r.passed).toBe(true)
    expect(r.checkedFiles).toBe(0)
  })

  // node_0e71a90ecdc0 (B22) — test files grow with coverage (fixtures, many cases) and
  // are not god-modules; they get a higher ceiling (2× source) so the file-size fitness
  // function measures SOURCE modularity, not test length.
  it('allows a *.test.ts file between 800 and the test ceiling', () => {
    const files: FileContent[] = [bigFile('src/tests/big.test.ts', 1200)]
    const r = checkFileSizeCompliance(files)
    expect(r.passed).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('still fails a *.test.ts file beyond the test ceiling', () => {
    const files: FileContent[] = [bigFile('src/tests/huge.test.ts', 1700)]
    const r = checkFileSizeCompliance(files)
    expect(r.passed).toBe(false)
    expect(r.violations).toHaveLength(1)
  })

  it('keeps the 800 ceiling for non-test source files', () => {
    const files: FileContent[] = [bigFile('src/core/huge.ts', 801)]
    expect(checkFileSizeCompliance(files).passed).toBe(false)
  })
})
