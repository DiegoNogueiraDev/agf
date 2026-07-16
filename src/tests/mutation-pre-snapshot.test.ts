import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runMutationGate, type MutationGateDeps } from '../core/quality/mutation-gate-runner.js'

describe('mutation gate — pre-snapshot', () => {
  let files: Record<string, string>

  beforeEach(() => {
    files = {}
  })

  const deps: MutationGateDeps = {
    readSource: (file) => files[file] ?? '',
    writeSource: (file, content) => {
      files[file] = content
    },
    runTest: () => true, // all tests pass (mutant survives)
  }

  it('restores original source after mutation pass', () => {
    files['src/foo.ts'] = 'const x = 1\n'
    const original = files['src/foo.ts']

    runMutationGate(
      {
        sourceFile: 'src/foo.ts',
        testFile: 'src/foo.test.ts',
        specs: [{ name: 'remove-const', pattern: /const /g, replacement: '' }],
      },
      deps,
    )

    expect(files['src/foo.ts']).toBe(original)
  })

  it('restores original even when test crashes', () => {
    files['src/bar.ts'] = 'export function add(a: number, b: number) { return a + b }\n'
    const original = files['src/bar.ts']

    const crashDeps: MutationGateDeps = {
      ...deps,
      runTest: () => {
        throw new Error('crash')
      },
    }

    runMutationGate(
      {
        sourceFile: 'src/bar.ts',
        testFile: 'src/bar.test.ts',
        specs: [{ name: 'return-null', pattern: /return /g, replacement: 'return null; // ' }],
      },
      crashDeps,
    )

    expect(files['src/bar.ts']).toBe(original)
  })
})
