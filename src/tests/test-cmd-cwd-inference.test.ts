/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_a49c06cacc7a — infer test-cmd cwd from testFile path (monorepo
 * sub-package). --test-cmd ran from monorepo root, but a sub-package with
 * its own package.json (e.g. frontend/) needs the test command to run FROM
 * that subdirectory — an agent discovered this by trial and error. Extends
 * resolve-test-command.ts to also resolve the cwd, inferred from the first
 * testFile's path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveTestCommandForFiles } from '../core/runner/resolve-test-command.js'

describe('resolveTestCommandForFiles — monorepo sub-package cwd inference', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-cwd-inference-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("GIVEN testFiles=['frontend/src/components/Button.test.tsx'] and frontend/package.json exists THEN cwd='frontend'", () => {
    mkdirSync(join(dir, 'frontend/src/components'), { recursive: true })
    writeFileSync(join(dir, 'frontend/package.json'), JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }))
    writeFileSync(join(dir, 'frontend/src/components/Button.test.tsx'), '// test\n')

    const result = resolveTestCommandForFiles(dir, ['frontend/src/components/Button.test.tsx'])
    expect(result).not.toBeNull()
    expect(result!.cwd).toBe(join(dir, 'frontend'))
    expect(result!.testFiles).toEqual(['src/components/Button.test.tsx'])
  })

  it("GIVEN testFiles=['src/tests/foo.test.ts'] (root-level, no sub-package) THEN cwd remains the repo root (no regression)", () => {
    mkdirSync(join(dir, 'src/tests'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }))
    writeFileSync(join(dir, 'src/tests/foo.test.ts'), '// test\n')

    const result = resolveTestCommandForFiles(dir, ['src/tests/foo.test.ts'])
    expect(result).not.toBeNull()
    expect(result!.cwd).toBe(dir)
    expect(result!.testFiles).toEqual(['src/tests/foo.test.ts'])
  })

  it("GIVEN testFiles=['packages/api/test/handler.test.ts'] and packages/api/package.json exists THEN cwd='packages/api' and the test path is relative to it", () => {
    mkdirSync(join(dir, 'packages/api/test'), { recursive: true })
    writeFileSync(join(dir, 'packages/api/package.json'), JSON.stringify({ devDependencies: { jest: '^29.0.0' } }))
    writeFileSync(join(dir, 'packages/api/test/handler.test.ts'), '// test\n')

    const result = resolveTestCommandForFiles(dir, ['packages/api/test/handler.test.ts'])
    expect(result).not.toBeNull()
    expect(result!.cwd).toBe(join(dir, 'packages/api'))
    expect(result!.testFiles).toEqual(['test/handler.test.ts'])
    expect(result!.resolved.runner).toBe('jest')
  })

  it('GIVEN an explicit --test-cmd override THEN cwd inference is skipped (explicit always wins, root cwd)', () => {
    mkdirSync(join(dir, 'frontend/src'), { recursive: true })
    writeFileSync(join(dir, 'frontend/package.json'), JSON.stringify({}))
    writeFileSync(join(dir, 'frontend/src/x.test.ts'), '// test\n')

    const result = resolveTestCommandForFiles(dir, ['frontend/src/x.test.ts'], { explicit: 'true' })
    expect(result).not.toBeNull()
    expect(result!.cwd).toBe(dir)
    expect(result!.resolved.runner).toBe('custom')
  })
})
