/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * CdpBrowserPort — implements BrowserPort via CdpDaemon (Chrome DevTools Protocol).
 * Replaces the Python CLI bridge with in-process CDP calls.
 * Cache LRU funcional, fallback graceful quando CDP ausente.
 */

import { CdpDaemon } from '../plugins/browser/cdp-daemon.js'
import { discoverCdpUrl } from '../plugins/browser/discovery.js'
import type { BrowserPort } from './browser-port.js'
import { fnv1aHash } from './browser-port.js'
import { LRUCache } from 'lru-cache'
import { createLogger } from '../core/utils/logger.js'
import { McpGraphError, StdioSanitizationError } from '../core/utils/errors.js'
import { createDestructivePolicy, type DestructiveAction } from '../core/security/destructive-actions.js'
import { safeArg } from '../core/security/stdio-sanitizer.js'
import { createUrlPolicy } from '../core/security/url-rules.js'

const _log = createLogger({ layer: 'cli', source: 'tui/cdp-browser-port.ts' })

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_CACHE = 128
const ERROR_PREFIX = '[cdp-browser-port]'

// node_wire_dc1f40a32929 — same gate as tui/browser-port.ts's BrowserBridge.
const DESTRUCTIVE_ACTION_MAP: Readonly<Record<string, DestructiveAction>> = {
  click: 'destructive_click',
  fill: 'form_submit',
  upload: 'file_upload',
}

export interface CdpBrowserPortOptions {
  timeoutMs?: number
  maxCache?: number
  cdpUrl?: string
}

/** Probes whether a Chrome DevTools Protocol endpoint is reachable via WebSocket (2-second timeout). */
export function isChromeCdpReachable(cdpUrl: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new WebSocket(cdpUrl)
    const timer = setTimeout(() => {
      socket.close()
      resolve(false)
    }, 2000)
    socket.onopen = () => {
      clearTimeout(timer)
      socket.close()
      resolve(true)
    }
    socket.onerror = () => {
      clearTimeout(timer)
      resolve(false)
    }
  })
}

export class CdpBrowserPort implements BrowserPort {
  private cache: LRUCache<string, string>
  private hits = 0
  private misses = 0
  private timeoutMs: number
  private daemon: CdpDaemon | null = null
  private cdpUrl: string

  constructor(options: CdpBrowserPortOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.cache = new LRUCache<string, string>({ max: options.maxCache ?? DEFAULT_MAX_CACHE })
    this.cdpUrl = options.cdpUrl ?? discoverCdpUrl()
  }

  async ensureConnected(): Promise<CdpDaemon> {
    if (this.daemon?.status() === 'connected') return this.daemon
    this.daemon = new CdpDaemon({ connection: { url: this.cdpUrl, maxRetries: 1 } })
    const result = await this.daemon.start()
    if (!result.ok) {
      throw new McpGraphError(`${ERROR_PREFIX} Failed to connect to CDP: ${result.error ?? 'unknown error'}`)
    }
    return this.daemon
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await isChromeCdpReachable(this.cdpUrl)
    } catch {
      return false
    }
  }

  async browser(action: string, args: string): Promise<string> {
    const destructiveAction = DESTRUCTIVE_ACTION_MAP[action]
    if (destructiveAction && !createDestructivePolicy().isAllowed(destructiveAction)) {
      return `${ERROR_PREFIX} destructive action "${action}" blocked (set DESTRUCTIVE_POLICY=allow to enable)`
    }

    const key = fnv1aHash(`${action}|${args}`)
    const cached = this.cache.get(key)
    if (cached !== undefined) {
      this.hits++
      return cached
    }
    this.misses++

    try {
      const result = await this.executeAction(action, args)
      this.cache.set(key, result)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return `${ERROR_PREFIX} ${msg}`
    }
  }

  private async executeAction(action: string, args: string): Promise<string> {
    switch (action) {
      case 'info':
        return this.cmdInfo()
      case 'goto':
        return this.cmdGoto(args)
      case 'click':
        return this.cmdClick(args)
      case 'type':
        return this.cmdType(args)
      case 'screenshot':
        return this.cmdScreenshot()
      case 'eval':
        return this.cmdEval(args)
      case 'tabs':
        return this.cmdTabs()
      case 'tab':
        return this.cmdTab(args)
      case 'new-tab':
        return this.cmdNewTab(args)
      case 'close':
        return this.cmdClose(args)
      case 'status':
        return this.cmdStatus()
      case 'fill':
        return this.cmdFill(args)
      case 'key':
        return this.cmdKey(args)
      case 'scroll':
        return this.cmdScroll(args)
      case 'wait':
        return this.cmdWait(args)
      case 'upload':
        return this.cmdUpload(args)
      case 'fetch':
        return this.cmdFetch(args)
      case 'remote':
      case 'profiles':
      case 'doctor':
        return `${ERROR_PREFIX} ${action} requires browser-harness cloud CLI — not available via CDP`
      default:
        return `${ERROR_PREFIX} unknown action: ${action}`
    }
  }

  private async cmdGoto(url: string): Promise<string> {
    // node_wire_212f2688c53d — stdio-sanitizer wire. Same rationale as
    // tui/browser-port.ts's BrowserBridge: reject non-http(s)/ws(s) schemes
    // before ever reaching Page.navigate.
    try {
      safeArg(url, 'url')
    } catch (err) {
      const reason = err instanceof StdioSanitizationError ? err.message : 'invalid URL'
      return `${ERROR_PREFIX} ${reason}`
    }
    // node_wire_5b2c8bcde75f — url-rules wire. Same rationale as
    // tui/browser-port.ts's BrowserBridge.
    if (!createUrlPolicy().isAllowed(url)) {
      return `${ERROR_PREFIX} denied by URL policy`
    }

    const daemon = await this.ensureConnected()
    const nav = await daemon.send('Page.navigate', { url })
    if (!nav.ok) return JSON.stringify({ ok: false, error: nav.error ?? 'Navigation failed' })
    await this.waitForLoad(daemon)
    const info = await this.pageInfoJson(daemon)
    return info
  }

  /**
   * Wait for the page to finish loading by polling `document.readyState` until it
   * reaches `complete` (bounded). Replaces the no-op `send('Page.loadEventFired')`
   * — an event name dispatched as a command, which never waited for anything.
   */
  private async waitForLoad(daemon: CdpDaemon): Promise<void> {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const res = await daemon.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })
      if (res.ok) {
        const cdp = res.result as Record<string, unknown> | undefined
        const value = (cdp?.result as Record<string, unknown> | undefined)?.value
        if (value === 'complete') return
      }
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  private async cmdInfo(): Promise<string> {
    const daemon = await this.ensureConnected()
    return this.pageInfoJson(daemon)
  }

  private async cmdClick(args: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const [x, y] = args.split(' ').map(Number)
    if (isNaN(x) || isNaN(y)) return JSON.stringify({ ok: false, error: 'click requires x y coordinates' })
    const result = await daemon.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    await daemon.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
    return JSON.stringify({ ok: true })
  }

  private async cmdType(text: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const result = await daemon.send('Input.insertText', { text })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify({ ok: true })
  }

  private async cmdScreenshot(): Promise<string> {
    const daemon = await this.ensureConnected()
    const result = await daemon.send('Page.captureScreenshot', { format: 'png' })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify({ ok: true, data: ((result.result as Record<string, unknown>)?.data as string) ?? '' })
  }

  private async cmdEval(expression: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const result = await daemon.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    const r = result.result as Record<string, unknown> | undefined
    return JSON.stringify({ ok: true, result: r?.result })
  }

  private async cmdTabs(): Promise<string> {
    const daemon = await this.ensureConnected()
    const result = await daemon.send('Target.getTargets')
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    const targets = ((result.result as Record<string, unknown>)?.targetInfos as Array<Record<string, unknown>>) ?? []
    const tabs = targets.map((t: Record<string, unknown>) => ({
      id: t.targetId,
      title: t.title,
      url: t.url,
      type: t.type,
    }))
    return JSON.stringify({ ok: true, tabs })
  }

  private async cmdTab(targetId: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const result = await daemon.send('Target.activateTarget', { targetId })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify({ ok: true })
  }

  private async cmdNewTab(url: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const targetUrl = url || 'about:blank'
    const result = await daemon.send('Target.createTarget', { url: targetUrl })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify({ ok: true, targetId: (result.result as Record<string, unknown>)?.targetId })
  }

  private async cmdClose(targetId: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const result = await daemon.send('Target.closeTarget', { targetId })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify({ ok: true })
  }

  private async cmdStatus(): Promise<string> {
    const daemon = await this.ensureConnected()
    const targets = await daemon.send('Target.getTargets')
    const info = await this.pageInfoJson(daemon)
    const raw = info ? JSON.parse(info) : {}
    return JSON.stringify({
      ok: true,
      daemon: daemon.status(),
      url: raw.url,
      title: raw.title,
      targets: (targets.result as Record<string, unknown>)?.targetInfos,
    })
  }

  private async cmdFill(raw: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const parts = raw.match(/(?:"([^"]*)"|(\S+))/g)?.map((s) => s.replace(/^"|"$/g, '')) || []
    const selector = parts[0] || ''
    const text = parts.slice(1).join(' ') || ''
    const expr = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'element not found' };
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') {
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true };
        }
        el.textContent = ${JSON.stringify(text)};
        return { ok: true };
      })()
    `
    const result = await daemon.send('Runtime.evaluate', { expression: expr, returnByValue: true })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify((result.result as Record<string, unknown>)?.result ?? { ok: false, error: 'eval failed' })
  }

  private async cmdKey(key: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const keyMap: Record<string, { keyCode: number; key: string }> = {
      Enter: { keyCode: 13, key: 'Enter' },
      Tab: { keyCode: 9, key: 'Tab' },
      Escape: { keyCode: 27, key: 'Escape' },
      ArrowUp: { keyCode: 38, key: 'ArrowUp' },
      ArrowDown: { keyCode: 40, key: 'ArrowDown' },
      ArrowLeft: { keyCode: 37, key: 'ArrowLeft' },
      ArrowRight: { keyCode: 39, key: 'ArrowRight' },
      Backspace: { keyCode: 8, key: 'Backspace' },
      Delete: { keyCode: 46, key: 'Delete' },
      Space: { keyCode: 32, key: ' ' },
    }
    const mapped = keyMap[key] ?? { keyCode: key.charCodeAt(0) || 0, key }
    const result = await daemon.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      ...mapped,
    })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    await daemon.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      ...mapped,
    })
    return JSON.stringify({ ok: true })
  }

  private async cmdScroll(direction: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const trimmed = direction.trim().toLowerCase()
    let dy = -300
    if (trimmed === 'up') dy = 300
    else if (trimmed === 'down') dy = -300
    else {
      const n = Number(trimmed)
      if (!isNaN(n)) dy = -n
    }
    const expr = `window.scrollBy(0, ${dy}); JSON.stringify({ ok: true, scrollY: window.scrollY })`
    const result = await daemon.send('Runtime.evaluate', { expression: expr, returnByValue: true })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify((result.result as Record<string, unknown>)?.result ?? { ok: true })
  }

  private async cmdWait(selector: string): Promise<string> {
    const daemon = await this.ensureConnected()
    if (!selector) {
      const expr = `JSON.stringify({ loaded: document.readyState === 'complete' })`
      const result = await daemon.send('Runtime.evaluate', { expression: expr, returnByValue: true })
      if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
      return JSON.stringify((result.result as Record<string, unknown>)?.result ?? { loaded: true })
    }
    const pollExpr = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        return JSON.stringify({ found: el !== null })
      })()
    `
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const result = await daemon.send('Runtime.evaluate', { expression: pollExpr, returnByValue: true })
      if (result.ok) {
        const r = (result.result as Record<string, unknown>)?.result as string | undefined
        if (r) {
          const parsed = JSON.parse(r)
          if (parsed.found) return JSON.stringify({ found: true })
        }
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    return JSON.stringify({ found: false, error: 'timeout waiting for element' })
  }

  private async cmdUpload(raw: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const parts = raw.match(/(?:"([^"]*)"|(\S+))/g)?.map((s) => s.replace(/^"|"$/g, '')) || []
    const selector = parts[0] || ''
    const filePath = parts[1] || ''
    const expr = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return JSON.stringify({ ok: false, error: 'element not found' });
        const dt = new DataTransfer();
        dt.items.add(new File([], ${JSON.stringify(filePath)}));
        el.files = dt.files;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({ ok: true });
      })()
    `
    const result = await daemon.send('Runtime.evaluate', { expression: expr, returnByValue: true })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify((result.result as Record<string, unknown>)?.result ?? { ok: false, error: 'eval failed' })
  }

  private async cmdFetch(url: string): Promise<string> {
    const daemon = await this.ensureConnected()
    const expr = `fetch(${JSON.stringify(url)}).then(r => r.text()).then(t => JSON.stringify({ ok: true, body: t.substring(0, 10000) })).catch(e => JSON.stringify({ ok: false, error: e.message }))`
    const result = await daemon.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (!result.ok) return JSON.stringify({ ok: false, error: result.error })
    return JSON.stringify((result.result as Record<string, unknown>)?.result ?? { ok: false, error: 'fetch failed' })
  }

  private async pageInfoJson(daemon: CdpDaemon): Promise<string> {
    const result = await daemon.send('Runtime.evaluate', {
      expression: `JSON.stringify({ url: location.href, title: document.title, w: window.innerWidth, h: window.innerHeight })`,
      returnByValue: true,
    })
    if (!result.ok) return JSON.stringify({ url: '', title: '', w: 0, h: 0 })
    const r = result.result as Record<string, unknown> | undefined
    const raw = r?.result as string | undefined
    if (!raw) return JSON.stringify({ url: '', title: '', w: 0, h: 0 })
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return JSON.stringify({
        url: typeof parsed.url === 'string' ? parsed.url : '',
        title: typeof parsed.title === 'string' ? parsed.title : '',
        w: typeof parsed.w === 'number' ? parsed.w : 0,
        h: typeof parsed.h === 'number' ? parsed.h : 0,
      })
    } catch {
      return JSON.stringify({ url: '', title: '', w: 0, h: 0 })
    }
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    }
  }
}
