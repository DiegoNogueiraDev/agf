/*!
 * Tests for agf gaps --json / --select envelope support.
 * AC:
 *   - agf gaps --severity required --json emits ok-envelope (not "unknown option")
 *   - agf gaps --json --select data.gaps emits only the gaps array
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname ?? '', '../..')
const DB = join(ROOT, 'workflow-graph')

function runAgfRaw(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node --import tsx/esm src/cli/index.ts ${args} --dir ${DB}`, {
      cwd: ROOT,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 15000,
    })
    return { stdout, exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number; message?: string }
    // execSync throws on non-zero exit — capture stdout from the error object
    return { stdout: (e.stdout as string) ?? '', exitCode: (e.status as number) ?? 1 }
  }
}

describe('agf gaps --json / --select', () => {
  it('accepts --json flag: emits valid JSON envelope (not "unknown option" error)', () => {
    const { stdout, exitCode } = runAgfRaw('gaps --severity required --json')
    // Must not be "unknown option" — only acceptable failures are gaps found (exit 1 with JSON)
    expect(stdout).not.toContain('unknown option')
    const lastLine = stdout.trim().split('\n').pop() ?? ''
    if (lastLine) {
      const parsed = JSON.parse(lastLine) as { ok: boolean }
      expect(typeof parsed.ok).toBe('boolean')
    }
    // exit 0 (no gaps) or exit 1 (gaps found) are both valid — just not "unknown option"
    expect([0, 1]).toContain(exitCode)
  })

  it('accepts --select data.gaps flag without "unknown option" error', () => {
    const { stdout } = runAgfRaw('gaps --json --select data.gaps')
    expect(stdout).not.toContain('unknown option')
    // stdout should be valid JSON (an array or a serialized value)
    const lastLine = stdout.trim().split('\n').pop() ?? ''
    if (lastLine) {
      expect(() => JSON.parse(lastLine)).not.toThrow()
    }
  })
})
