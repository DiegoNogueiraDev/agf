/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Guard: the session/runtime layer must NEVER collide with the agent-readiness
 * quality-scoring feature (`agf harness` / src/core/harness/).
 */

import { describe, it, expect } from 'vitest'
import { sessionCommand } from '../cli/commands/session-cmd.js'
import { harnessCommand } from '../cli/commands/harness-cmd.js'
import * as harnessModule from '../core/harness/index.js'

describe('session ⟂ harness collision guard', () => {
  it('exposes a command named exactly "session" (not "harness")', () => {
    expect(sessionCommand().name()).toBe('session')
  })

  it('keeps the harness quality-scoring command intact and distinct', () => {
    expect(harnessCommand().name()).toBe('harness')
    expect(harnessCommand().name()).not.toBe(sessionCommand().name())
  })

  it('imports the harness module cleanly (session work did not break it)', () => {
    expect(typeof harnessModule.getBuiltInRules).toBe('function')
  })
})
