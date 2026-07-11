/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/daemon-lifecycle.ts — ensureDaemon + callWithDaemonRetry.
 */

import { describe, it, expect } from 'vitest'
import { ensureDaemon, stopDaemon, callWithDaemonRetry } from '../plugins/browser/daemon-lifecycle.js'
import type { RunnerResult, BrowserAgentRunner } from '../plugins/browser/browser-agent-bridge.js'

const okJson = (): RunnerResult => ({ ok: true, stdout: JSON.stringify({ ok: true, data: { url: 'x' } }), stderr: '' })
const cdpFail = (): RunnerResult => ({
  ok: false,
  stdout: '',
  stderr: 'CDP websocket ws://127.0.0.1:9222 unreachable',
  spawnError: '1',
})
const enoent = (): RunnerResult => ({
  ok: false,
  stdout: '',
  stderr: 'spawn browser agent ENOENT',
  spawnError: 'ENOENT',
})

function makeRunner(callResults: RunnerResult[], startOk = true): { runner: BrowserAgentRunner; log: string[] } {
  let i = 0
  const log: string[] = []
  const runner: BrowserAgentRunner = (args) => {
    log.push(args[0])
    if (args[0] === 'call') return callResults[Math.min(i++, callResults.length - 1)]
    return startOk
      ? { ok: true, stdout: '', stderr: '' }
      : { ok: false, stdout: '', stderr: 'start failed', spawnError: '1' }
  }
  return { runner, log }
}

describe('ensureDaemon / stopDaemon', () => {
  it('ensureDaemon sobe o daemon (start idempotente) → ok', () => {
    const { runner, log } = makeRunner([])
    expect(ensureDaemon(runner)).toEqual({ ok: true })
    expect(log).toEqual(['start'])
  })
  it('ensureDaemon reflete falha do start', () => {
    const { runner } = makeRunner([], false)
    expect(ensureDaemon(runner)).toEqual({ ok: false })
  })
  it('stopDaemon chama stop', () => {
    const { runner, log } = makeRunner([])
    expect(stopDaemon(runner)).toEqual({ ok: true })
    expect(log).toEqual(['stop'])
  })
})

describe('callWithDaemonRetry', () => {
  it('sucesso de primeira → sem restart', () => {
    const { runner, log } = makeRunner([okJson()])
    const r = callWithDaemonRetry('browser_navigate', {}, { runner })
    expect(r.ok).toBe(true)
    expect(r.restarted).toBe(false)
    expect(log).not.toContain('start')
  })

  it('AC2: CDP caiu → reinicia daemon 1x e re-tenta com sucesso', () => {
    const { runner, log } = makeRunner([cdpFail(), okJson()])
    const r = callWithDaemonRetry('browser_click', {}, { runner })
    expect(r.restarted).toBe(true)
    expect(r.ok).toBe(true)
    expect(log).toEqual(['call', 'start', 'call'])
  })

  it('binário ausente (bridge_unreachable) → NÃO reinicia (restart seria fútil)', () => {
    const { runner, log } = makeRunner([enoent()])
    const r = callWithDaemonRetry('browser_navigate', {}, { runner })
    expect(r.ok).toBe(false)
    expect(r.restarted).toBe(false)
    expect(log).not.toContain('start')
  })
})
