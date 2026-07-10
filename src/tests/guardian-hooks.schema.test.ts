/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/schemas/guardian-hooks.schema.ts — wrapWithGuardian.
 */

import { describe, it, expect } from 'vitest'
import { wrapWithGuardian } from '../schemas/guardian-hooks.schema.js'

type Verdict = { verdict: 'allow' | 'deny' | 'ask_user'; reason: string }

function guardianReturning(v: Verdict): { review: () => Promise<Verdict> } {
  return { review: () => Promise.resolve(v) }
}

const handler = async (): Promise<string> => 'HANDLER_RAN'

describe('wrapWithGuardian', () => {
  it('runs the wrapped handler when the guardian allows', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapWithGuardian(handler, guardianReturning({ verdict: 'allow', reason: 'ok' }) as any, [])
    expect(await wrapped({ command: 'ls' })).toBe('HANDLER_RAN')
  })

  it('blocks with GUARDIAN_DENIED when the guardian denies', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapWithGuardian(handler, guardianReturning({ verdict: 'deny', reason: 'too risky' }) as any, [])
    const out = await wrapped({ command: 'rm -rf /' })
    expect(out).toContain('[GUARDIAN_DENIED]')
    expect(out).toContain('too risky')
  })

  it('falls back to running the handler when the guardian review throws', async () => {
    const throwingGuardian = {
      review: () => {
        throw new Error('guardian offline')
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const wrapped = wrapWithGuardian(handler, throwingGuardian, [])
    expect(await wrapped({ command: 'ls' })).toBe('HANDLER_RAN')
  })
})
