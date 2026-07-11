/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/browser-agent-bridge.ts — callBrowserAgent + isBrowserAgentAvailable + mapSpawnError.
 * Runner injetável: testa todos os caminhos sem o binário do browser agent instalado.
 */

import { describe, it, expect } from 'vitest'
import {
  callBrowserAgent,
  isBrowserAgentAvailable,
  mapSpawnError,
  type BrowserAgentRunner,
} from '../plugins/browser/browser-agent-bridge.js'

const okRunner =
  (stdout: string): BrowserAgentRunner =>
  () => ({ ok: true, stdout, stderr: '' })
const failRunner =
  (spawnError: string, stderr = ''): BrowserAgentRunner =>
  () => ({ ok: false, stdout: '', stderr, spawnError })

describe('callBrowserAgent', () => {
  it('AC1: tool ok → parseia o envelope e devolve data', () => {
    const runner = okRunner(JSON.stringify({ ok: true, data: { url: 'https://x' } }))
    const r = callBrowserAgent<{ url: string }>('browser_navigate', { url: 'https://x' }, { runner })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.url).toBe('https://x')
  })

  it('AC2: binário ausente (ENOENT) → bridge_unreachable, sem lançar', () => {
    const runner = failRunner('ENOENT', 'spawn browser agent ENOENT')
    let r: ReturnType<typeof callBrowserAgent>
    expect(() => {
      r = callBrowserAgent('browser_navigate', {}, { runner })
    }).not.toThrow()
    expect(r!.ok).toBe(false)
    if (!r!.ok) expect(r!.code).toBe('bridge_unreachable')
  })

  it('AC3: erro CDP do browser agent → cdp_ws_unreachable', () => {
    const runner = failRunner('1', 'CDP websocket ws://127.0.0.1:9222 unreachable')
    const r = callBrowserAgent('browser_click', {}, { runner })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('cdp_ws_unreachable')
  })

  it('timeout de spawn → timeout', () => {
    const r = callBrowserAgent('browser_wait', {}, { runner: failRunner('ETIMEDOUT') })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('timeout')
  })

  it('envelope de erro do browser agent com code conhecido é preservado', () => {
    const runner = okRunner(JSON.stringify({ ok: false, code: 'domain_blocked', error: 'evil.com bloqueado' }))
    const r = callBrowserAgent('browser_navigate', { url: 'https://evil.com' }, { runner })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('domain_blocked')
      expect(r.error).toContain('evil.com')
    }
  })

  it('stdout não-parseável → browser_use_crash', () => {
    const r = callBrowserAgent('browser_eval', {}, { runner: okRunner('not json at all') })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('browser_use_crash')
  })

  it('bug #3: data:null válido é preservado (não devolve o envelope inteiro)', () => {
    // browser_js_eval pode retornar legitimamente null como resultado.
    const runner = okRunner(JSON.stringify({ ok: true, data: null }))
    const r = callBrowserAgent<unknown>('browser_js_eval', { expression: 'void 0' }, { runner })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toBeNull()
  })

  it('bug #3: data:false/0/"" preservados como dados válidos', () => {
    const rFalse = callBrowserAgent<boolean>('t', {}, { runner: okRunner(JSON.stringify({ ok: true, data: false })) })
    if (rFalse.ok) expect(rFalse.data).toBe(false)
    const rZero = callBrowserAgent<number>('t', {}, { runner: okRunner(JSON.stringify({ ok: true, data: 0 })) })
    if (rZero.ok) expect(rZero.data).toBe(0)
  })

  it('envelope cru (sem campo data) → devolve o próprio envelope', () => {
    // o browser agent pode retornar um objeto plano sem wrapper {data}.
    const runner = okRunner(JSON.stringify({ ok: true, url: 'https://x', title: 'X' }))
    const r = callBrowserAgent<{ url: string }>('browser_page_info', {}, { runner })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.url).toBe('https://x')
  })
})

describe('isBrowserAgentAvailable', () => {
  it('runner --version ok → true', () => {
    expect(isBrowserAgentAvailable(okRunner('browser agent 0.1.0'))).toBe(true)
  })
  it('runner falho → false (degradação graciosa)', () => {
    expect(isBrowserAgentAvailable(failRunner('ENOENT'))).toBe(false)
  })
})

describe('mapSpawnError', () => {
  it('mapeia padrões conhecidos para os códigos estáveis', () => {
    expect(mapSpawnError('ENOENT', '')).toBe('bridge_unreachable')
    expect(mapSpawnError('ETIMEDOUT', '')).toBe('timeout')
    expect(mapSpawnError('1', 'quota exceeded')).toBe('quota_exceeded')
    expect(mapSpawnError('1', 'unexpected boom')).toBe('browser_use_crash')
  })
})
