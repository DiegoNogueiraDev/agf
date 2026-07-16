/*!
 * Smoke tests for scripts/hooks/compress-bash-output.mjs
 * Feeds the hook a sample payload on stdin and asserts the response.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const HOOK_PATH = join(process.cwd(), 'scripts/hooks/compress-bash-output.mjs')
const MIN_COMPRESS_SIZE = 1024 // hook threshold (bytes)

function runHook(toolOutput: string): { stdout: string; exitCode: number } {
  const payload = JSON.stringify({ tool_use_id: 'test-1', tool_input: {}, tool_response: { output: toolOutput } })
  const result = spawnSync('node', [HOOK_PATH], {
    input: payload,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { stdout: result.stdout ?? '', exitCode: result.status ?? 1 }
}

describe('compress-bash-output.mjs hook', () => {
  it('hook script exists', () => {
    expect(existsSync(HOOK_PATH)).toBe(true)
  })

  it('returns updatedToolOutput for large output', () => {
    const large = 'output line result test\n'.repeat(200)
    expect(large.length).toBeGreaterThan(MIN_COMPRESS_SIZE)
    const { stdout, exitCode } = runHook(large)
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveProperty('updatedToolOutput')
    expect(typeof parsed.updatedToolOutput).toBe('string')
  })

  it('returns output unchanged when below size threshold', () => {
    const small = 'hi'
    expect(small.length).toBeLessThan(MIN_COMPRESS_SIZE)
    const { stdout, exitCode } = runHook(small)
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.updatedToolOutput).toBe(small)
  })
})
