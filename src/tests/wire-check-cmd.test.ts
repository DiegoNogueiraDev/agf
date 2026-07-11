/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/wire-check-cmd.ts — wireCheckCommand factory wiring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { wireCheckCommand } from '../cli/commands/wire-check-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('wireCheckCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-wire-check-cmd-'))
    mkdirSync(join(dir, 'src/core'), { recursive: true })
    mkdirSync(join(dir, 'src/tests'), { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('builds the "wire-check" command with a description', () => {
    const cmd = wireCheckCommand()
    expect(cmd.name()).toBe('wire-check')
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('signals an unwired branch when only a test file activates it', async () => {
    writeFileSync(
      join(dir, 'src/core/adapter.ts'),
      'export function run(useMock: boolean) {\n  if (useMock === false) {\n    x()\n  }\n}\n',
    )
    writeFileSync(join(dir, 'src/tests/adapter.test.ts'), 'run(false)\n')

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await wireCheckCommand().parseAsync(['src/core/adapter.ts', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { unwiredBranches: unknown[] }
    expect(data.unwiredBranches).toHaveLength(1)
  })

  it("GIVEN a nonexistent file THEN out.err('NOT_FOUND') is returned", async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await wireCheckCommand().parseAsync(['src/core/missing.ts', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(false)
  })
})
