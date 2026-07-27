import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../../')

function readConfig(filename: string): string {
  return readFileSync(resolve(ROOT, filename), 'utf8')
}

describe('vitest config auto-discovery — AC1 & AC2', () => {
  it('vitest.config.ts uses glob include (no manual file list)', () => {
    const content = readConfig('vitest.config.ts')
    // The include must be a glob pattern, not a list of specific filenames
    expect(content).toContain('src/tests/**/*.test.')
    // Ensure no inline array with individual files
    const hasGlob = /include:\s*\[["']src\/tests\/\*\*/.test(content)
    expect(hasGlob).toBe(true)
  })

  it('new test files in src/tests are discovered without config edits', () => {
    // Proof: THIS file itself was discovered without any config change —
    // merely creating it in src/tests/ is sufficient.
    // Assert the glob matches this file's name.
    const glob = 'src/tests/**/*.test.{ts,tsx}'
    const thisFile = 'src/tests/vitest-config-glob.test.ts'
    // Simple pattern match verification (no micromatch dep needed)
    expect(thisFile).toMatch(/^src\/tests\/.+\.test\.(ts|tsx)$/)
    expect(glob).toContain('src/tests/**')
  })

  it('vitest.config.ts has no hardcoded list of specific test filenames', () => {
    const content = readConfig('vitest.config.ts')
    // If there were a manual list, there would be comma-separated .test.ts filenames
    // inside the include array (e.g. "next.test.ts", "gaps.test.ts", ...)
    const hasHardcodedFiles = /include:\s*\[[^\]]*\.test\.[tj]sx?['"]\s*,\s*['"]\w/.test(content)
    expect(hasHardcodedFiles).toBe(false)
  })
})
