/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/shared/cli-output.ts — createCliOutput envelope emission.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCliOutput } from '../cli/shared/cli-output.js'

let captured: string[]
const realWrite = process.stdout.write.bind(process.stdout)

beforeEach(() => {
  captured = []
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    captured.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  process.exitCode = 0
})

afterEach(() => {
  process.stdout.write = realWrite
  process.exitCode = 0
})

function lastEnvelope(): Record<string, unknown> {
  return JSON.parse(captured[captured.length - 1].trim())
}

describe('createCliOutput', () => {
  it('ok() writes a success envelope with command + data', () => {
    const out = createCliOutput('mycmd')
    out.ok({ value: 42 })

    const env = lastEnvelope()
    expect(env.ok).toBe(true)
    expect(env.data).toEqual({ value: 42 })
    expect((env.meta as { command: string }).command).toBe('mycmd')
    expect(typeof (env.meta as { ms: number }).ms).toBe('number')
  })

  it('err() writes a failure envelope and sets a non-zero exit code', () => {
    const out = createCliOutput('mycmd')
    out.err('NOT_FOUND', 'node missing')

    const env = lastEnvelope()
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NOT_FOUND')
    expect(env.error).toBe('node missing')
    expect(process.exitCode).toBe(1)
  })

  it('ok() forwards extra meta fields such as count', () => {
    const out = createCliOutput('listing')
    out.ok([1, 2, 3], { count: 3 })

    const env = lastEnvelope()
    expect((env.meta as { count: number }).count).toBe(3)
  })

  it('advisory() writes an advisory envelope that is still ok', () => {
    const out = createCliOutput('cmd')
    out.advisory('SOFT', 'heads up', { note: 1 })

    const env = lastEnvelope()
    expect(env.ok).toBe(true)
    expect(env.status).toBe('advisory')
    expect(env.message).toBe('heads up')
  })
})
