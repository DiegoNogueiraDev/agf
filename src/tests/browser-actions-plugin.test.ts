/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Browser Actions Plugin — MCP tools via CDP daemon
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'

import { registerBrowserTools, type BrowserToolHandlers } from '../plugins/browser/plugin.js'
import { createBrowserActions, type BrowserActions } from '../plugins/browser/actions/index.js'

describe('BrowserActions — essential actions', () => {
  let actions: BrowserActions

  beforeEach(() => {
    actions = createBrowserActions({ daemonUrl: 'ws://127.0.0.1:9222' })
  })

  it('navigates to a URL and returns page info', async () => {
    const result = await actions.navigate({ url: 'about:blank' })
    expect(result).toHaveProperty('ok')
  })

  it('node_64577bb5c73a: blocks navigation to a domain outside the allowlist, never reaching the daemon', async () => {
    const guarded = createBrowserActions({
      daemonUrl: 'ws://127.0.0.1:9222',
      allowedDomains: ['example.com'],
    })
    const result = await guarded.navigate({ url: 'https://evil.test/phish' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('domain_blocked')
  })

  it('node_64577bb5c73a: allows navigation to a domain inside the allowlist', async () => {
    const guarded = createBrowserActions({
      daemonUrl: 'ws://127.0.0.1:9222',
      allowedDomains: ['example.com'],
    })
    const result = await guarded.navigate({ url: 'https://example.com/page' })
    // No daemon is actually running in this test env, so the connection itself
    // fails — but it must fail with a CONNECTION error, never domain_blocked.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).not.toContain('domain_blocked')
  })

  it('node_64577bb5c73a: an empty/unset allowlist means unrestricted (no behavior change for existing callers)', async () => {
    const unrestricted = createBrowserActions({ daemonUrl: 'ws://127.0.0.1:9222' })
    const result = await unrestricted.navigate({ url: 'https://anything.test' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).not.toContain('domain_blocked')
  })

  it('clicks at coordinates', async () => {
    const result = await actions.click({ x: 100, y: 200 })
    expect(result).toHaveProperty('ok')
  })

  it('types text into focused element', async () => {
    const result = await actions.type({ text: 'hello world' })
    expect(result).toHaveProperty('ok')
  })

  it('captures screenshot', async () => {
    const result = await actions.screenshot({ full: false })
    expect(result).toHaveProperty('ok')
  })

  it('evaluates JavaScript', async () => {
    const result = await actions.jsEval({ expression: '1 + 1' })
    expect(result).toHaveProperty('ok')
  })

  it('gets page info', async () => {
    const result = await actions.pageInfo({})
    expect(result).toHaveProperty('ok')
  })

  it('presses a keyboard key', async () => {
    const result = await actions.pressKey({ key: 'Enter' })
    expect(result).toHaveProperty('ok')
  })
})

describe('BrowserActions — state actions', () => {
  let actions: BrowserActions

  beforeEach(() => {
    actions = createBrowserActions({ daemonUrl: 'ws://127.0.0.1:9222' })
  })

  it('gets cookies', async () => {
    const result = await actions.getCookies({})
    expect(result).toHaveProperty('ok')
  })

  it('sets a cookie', async () => {
    const result = await actions.setCookie({ name: 'test', value: 'val' })
    expect(result).toHaveProperty('ok')
  })

  it('clears cookies', async () => {
    const result = await actions.clearCookies({})
    expect(result).toHaveProperty('ok')
  })

  it('gets auth state', async () => {
    const result = await actions.getAuthState({})
    expect(result).toHaveProperty('ok')
  })
})

describe('BrowserActions — network actions', () => {
  let actions: BrowserActions

  beforeEach(() => {
    actions = createBrowserActions({ daemonUrl: 'ws://127.0.0.1:9222' })
  })

  it('gets network log', async () => {
    const result = await actions.networkLog({ limit: 10 })
    expect(result).toHaveProperty('ok')
  })

  it('gets console messages', async () => {
    const result = await actions.consoleMessages({ limit: 10 })
    expect(result).toHaveProperty('ok')
  })
})

describe('BrowserActions — tool schemas (Zod validation)', () => {
  const actions = createBrowserActions({ daemonUrl: 'ws://127.0.0.1:9222' })

  it('navigate schema validates URL', () => {
    expect(() => z.object({ url: z.string().url() }).parse({ url: 'not-a-url' })).toThrow()
    expect(() => z.object({ url: z.string() }).parse({ url: 'https://example.com' })).not.toThrow()
  })
})

describe('registerBrowserTools', () => {
  it('registers the expected set of tools', () => {
    const handlers: BrowserToolHandlers = {}
    registerBrowserTools(handlers)

    const expected = [
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_press_key',
      'browser_screenshot',
      'browser_js_eval',
      'browser_page_info',
      'browser_get_cookies',
      'browser_set_cookie',
      'browser_clear_cookies',
      'browser_auth_state',
      'browser_network_log',
      'browser_console_messages',
    ]
    for (const tool of expected) {
      expect(handlers[tool]).toBeDefined()
    }
  })
})

// ── Shutdown (node_51161077f3df) ──────────────────────────────────────
//
// The factory opens a CDP WebSocket. Nothing ever closed it, so the socket kept
// the event loop alive and the CLI never exited — a run that had already done its
// work, written its verdict, and simply never returned. In a script or CI that is
// indistinguishable from a hang, so the resource has to be releasable by whoever
// opened it.
describe('createBrowserActions — releasable', () => {
  it('hands back a handle that can be closed', () => {
    const actions = createBrowserActions({ daemonUrl: 'ws://127.0.0.1:9999' })
    expect(typeof actions.close).toBe('function')
  })

  it('closing twice is safe — teardown runs in finally, which can be reached twice', () => {
    const actions = createBrowserActions({ daemonUrl: 'ws://127.0.0.1:9999' })
    expect(() => {
      actions.close()
      actions.close()
    }).not.toThrow()
  })

  it('closing without ever connecting does not throw', () => {
    // The failure path closes too: a command that refused its target still opened
    // the factory, and teardown must not turn a clean refusal into a crash.
    expect(() => createBrowserActions({ daemonUrl: 'ws://127.0.0.1:9999' }).close()).not.toThrow()
  })
})
