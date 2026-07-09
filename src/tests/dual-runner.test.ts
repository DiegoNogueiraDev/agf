import { describe, it, expect } from 'vitest'
import { detectTestFramework, VITEST_PATTERN } from '../core/harness/dual-runner.js'
import { resolve } from 'node:path'

describe('detectTestFramework', () => {
  const actualTest = resolve(__dirname, 'dual-runner.test.ts')

  it('detects vitest in a file that imports from vitest', () => {
    const result = detectTestFramework(actualTest)
    expect(result).toBe('vitest')
  })

  it('detects node-test for a file without vitest import', async () => {
    const seedFile = resolve(__dirname, '../../evals/suite/t0-concat/seed/hello.test.js')
    const { existsSync } = await import('node:fs')
    if (existsSync(seedFile)) {
      expect(detectTestFramework(seedFile)).toBe('node-test')
    }
  })

  it('returns node-test for non-existent files', () => {
    expect(detectTestFramework('/nonexistent/path.test.ts')).toBe('node-test')
  })

  it('detects vitest with require syntax', async () => {
    const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'dual-test-'))
    const file = join(dir, 'require-test.test.ts')
    writeFileSync(file, "const { describe, it, expect } = require('vitest')\n\ndescribe('test', () => {})")
    expect(detectTestFramework(file)).toBe('vitest')
    unlinkSync(file)
  })

  it('detects vitest with dynamic import', async () => {
    const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'dual-test-'))
    const file = join(dir, 'dynamic-import.test.ts')
    writeFileSync(file, "import('vitest').then(v => v.describe('test', () => {}))")
    expect(detectTestFramework(file)).toBe('vitest')
    unlinkSync(file)
  })

  it('detects node-test for node:test require', async () => {
    const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'dual-test-'))
    const file = join(dir, 'node-test.test.js')
    writeFileSync(
      file,
      "const test = require('node:test')\nconst assert = require('node:assert')\ntest('pass', () => assert.ok(true))",
    )
    expect(detectTestFramework(file)).toBe('node-test')
    unlinkSync(file)
  })
})

describe('VITEST_PATTERN regex', () => {
  it('matches ESM import from vitest', () => {
    expect(VITEST_PATTERN.test("import { describe } from 'vitest'")).toBe(true)
    expect(VITEST_PATTERN.test("import { describe, it } from 'vitest'")).toBe(true)
    expect(VITEST_PATTERN.test("import vitest from 'vitest'")).toBe(true)
    expect(VITEST_PATTERN.test("import * as vitest from 'vitest'")).toBe(true)
    expect(VITEST_PATTERN.test("const { describe } = require('vitest')")).toBe(true)
    expect(VITEST_PATTERN.test("import('vitest')")).toBe(true)
    expect(VITEST_PATTERN.test("const x = require('other')")).toBe(false)
    expect(VITEST_PATTERN.test("import { something } from 'mocha'")).toBe(false)
  })
})
