/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../../../core/utils/logger.js'
import { CdpDaemon, type CdpDaemonConfig, type CdpDaemonSendResult } from '../cdp-daemon.js'
import type { CdpEvent } from '../cdp-connection.js'
import { checkDomainAllowed } from '../credential-guard.js'

const log = createLogger({ layer: 'core', source: 'plugins/browser/actions' })

/**
 * Falha de INFRA (o daemon não respondeu), emitida com o código canônico do
 * schema browser-pilot em vez de prosa livre. O consumidor precisa separar
 * "o driver não chegou" de "o controle quebrou"; uma mensagem em prosa força
 * quem lê a casar substring, o que apodrece na primeira reescrita do texto.
 */
const CDP_UNREACHABLE = 'cdp_ws_unreachable: Cannot connect to CDP daemon'

/** Poll cadence + ceiling for the post-navigate "wait for load" loop. */
const LOAD_POLL_INTERVAL_MS = 100
const LOAD_POLL_TIMEOUT_MS = 10_000
/** Cap for the network/console event ring buffers (oldest evicted first). */
const MAX_EVENT_BUFFER = 500

/**
 * Read the value of a `Runtime.evaluate({ returnByValue: true })` reply.
 * The daemon hands back the CDP command result `{ result: <RemoteObject> }`, so the
 * actual value lives at `.result.value`. Reading `.result.result` (the RemoteObject
 * itself) yields `{ type, value }` — i.e. garbage — for title/jsEval/pageInfo.
 */
function readEvalValue(res: CdpDaemonSendResult): unknown {
  if (!res.ok) return undefined
  const cdp = res.result as Record<string, unknown> | undefined
  const remote = cdp?.result as Record<string, unknown> | undefined
  return remote?.value
}

/**
 * Wait for the page to finish loading by polling `document.readyState` until it
 * reaches `complete` (bounded). The previous code `send()`-ed `Page.loadEventFired`
 * — an *event* name, not a command — which returned immediately and never waited.
 */
async function waitForPageLoad(daemon: CdpDaemon): Promise<void> {
  const deadline = Date.now() + LOAD_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const res = await daemon.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })
    if (readEvalValue(res) === 'complete') return
    await new Promise((r) => setTimeout(r, LOAD_POLL_INTERVAL_MS))
  }
}

export interface NavigateParams {
  url: string
  new_tab?: boolean
  wait_for_load?: boolean
}
export interface ClickParams {
  x: number
  y: number
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
}
export interface TypeParams {
  text: string
}
export interface PressKeyParams {
  key: string
  modifiers?: number
}
export interface ScreenshotParams {
  full?: boolean
}
export interface JsEvalParams {
  expression: string
}
export interface PageInfoParams {
  _?: never
}
export interface GetCookiesParams {
  urls?: string[]
}
export interface SetCookieParams {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expires?: number
}
export interface ClearCookiesParams {
  _?: never
}
export interface AuthStateParams {
  action: 'get' | 'set'
  state?: string
}
export interface NetworkLogParams {
  limit?: number
}
export interface ConsoleMessagesParams {
  limit?: number
}

export type ActionResult<T = Record<string, unknown>> = (T & { ok: boolean }) | { ok: false; error: string }
export type NavigateResult = ActionResult<{ url: string; title: string }>
export type ClickResult = ActionResult
export type TypeResult = ActionResult
export type PressKeyResult = ActionResult
export type ScreenshotResult = ActionResult<{ data?: string }>
export type JsEvalResult = ActionResult<{ result?: unknown }>
export type PageInfoResult = ActionResult<{ url?: string; title?: string }>
export type GetCookiesResult = ActionResult<{ cookies?: Array<{ name: string; value: string; domain: string }> }>
export type SetCookieResult = ActionResult
export type ClearCookiesResult = ActionResult
export type GetAuthStateResult = ActionResult<{ cookies?: unknown[]; localStorage?: Record<string, string> }>
export type NetworkLogResult = ActionResult<{ events?: unknown[] }>
export type ConsoleMessagesResult = ActionResult<{ events?: unknown[] }>

/** Async browser control surface — each method maps to a CDP command via the daemon. */
export interface BrowserActions {
  navigate(params: NavigateParams): Promise<NavigateResult>
  click(params: ClickParams): Promise<ClickResult>
  type(params: TypeParams): Promise<TypeResult>
  pressKey(params: PressKeyParams): Promise<PressKeyResult>
  screenshot(params: ScreenshotParams): Promise<ScreenshotResult>
  jsEval(params: JsEvalParams): Promise<JsEvalResult>
  pageInfo(params: PageInfoParams): Promise<PageInfoResult>
  getCookies(params: GetCookiesParams): Promise<GetCookiesResult>
  setCookie(params: SetCookieParams): Promise<SetCookieResult>
  clearCookies(params: ClearCookiesParams): Promise<ClearCookiesResult>
  getAuthState(params: AuthStateParams): Promise<GetAuthStateResult>
  networkLog(params: NetworkLogParams): Promise<NetworkLogResult>
  consoleMessages(params: ConsoleMessagesParams): Promise<ConsoleMessagesResult>
}

export interface BrowserActionsConfig {
  daemonUrl: string
  daemonMaxRetries?: number
  /** Navigation is refused (domain_blocked) for any host outside this set. Empty/unset = unrestricted. */
  allowedDomains?: string[]
}

/**
 * A `BrowserActions` whose owner can release the CDP socket it opened.
 *
 * The port itself stays 13 methods — an in-memory or stubbed implementation has
 * nothing to release and should not be forced to pretend. Only the factory that
 * actually opens a socket widens its return type, so callers that hold the
 * concrete handle can (and must) close it.
 */
export type DisposableBrowserActions = BrowserActions & {
  /** Release the CDP connection. Safe to call twice, and before ever connecting. */
  close(): void
}

/**
 * Build a `BrowserActions` instance backed by a `CdpDaemon` pointed at `config.daemonUrl`.
 * All methods auto-connect on first call and wrap errors as `{ ok: false, error }`.
 *
 * The returned handle MUST be closed by its owner: the open WebSocket keeps the
 * event loop alive, so a CLI that forgets never exits — a run that already did its
 * work and wrote its result simply never returns, which in a script is
 * indistinguishable from a hang.
 */
export function createBrowserActions(config: BrowserActionsConfig): DisposableBrowserActions {
  log.info('Creating browser actions', { daemonUrl: config.daemonUrl })
  const daemonConfig: CdpDaemonConfig = {
    connection: { url: config.daemonUrl, maxRetries: config.daemonMaxRetries ?? 1 },
  }
  const daemon = new CdpDaemon(daemonConfig)

  async function ensureConnected(): Promise<boolean> {
    if (daemon.status() !== 'connected') {
      const result = await daemon.start()
      return result.ok
    }
    return true
  }

  async function wrap<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
    try {
      return await fn()
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Shared ring buffers for CDP events. A single subscription (installed once)
  // fans events into these — replacing the previous per-call `onEvent` handler
  // (which leaked listeners) and the synchronous slice of an always-empty local
  // array (which returned nothing before any event could arrive).
  const networkBuffer: CdpEvent[] = []
  const consoleBuffer: CdpEvent[] = []
  let eventsSubscribed = false

  function pushCapped(buffer: CdpEvent[], event: CdpEvent): void {
    buffer.push(event)
    if (buffer.length > MAX_EVENT_BUFFER) buffer.shift()
  }

  function ensureEventSubscription(): void {
    if (eventsSubscribed) return
    daemon.onEvent((event: CdpEvent) => {
      if (event.method.startsWith('Network.')) pushCapped(networkBuffer, event)
      else if (event.method === 'Runtime.consoleAPICalled') pushCapped(consoleBuffer, event)
    })
    eventsSubscribed = true
  }

  const KEY_MAP: Record<string, { keyCode: number; key: string }> = {
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

  return {
    close() {
      daemon.close()
    },
    async navigate(params) {
      return wrap(async () => {
        const domainCheck = checkDomainAllowed(params.url, config.allowedDomains ?? [])
        if (!domainCheck.allowed) {
          return { ok: false as const, error: `domain_blocked: ${domainCheck.host ?? params.url}` }
        }
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const result = await daemon.send('Page.navigate', { url: params.url })
        if (!result.ok) return { ok: false as const, error: result.error ?? 'Navigation failed' }
        if (params.wait_for_load !== false) {
          await waitForPageLoad(daemon)
        }
        const titleRes = await daemon.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
        const titleValue = readEvalValue(titleRes)
        const title = typeof titleValue === 'string' ? titleValue : ''
        return { ok: true, url: params.url, title }
      })
    },

    async click(params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const btn = params.button ?? 'left'
        const count = params.clickCount ?? 1
        await daemon.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: params.x,
          y: params.y,
          button: btn,
          clickCount: count,
        })
        await daemon.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: params.x,
          y: params.y,
          button: btn,
          clickCount: count,
        })
        return { ok: true }
      })
    },

    async type(params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const result = await daemon.send('Input.insertText', { text: params.text })
        if (!result.ok) return { ok: false, error: result.error }
        return { ok: true }
      })
    },

    async pressKey(params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const mapped = KEY_MAP[params.key] ?? { keyCode: params.key.charCodeAt(0) || 0, key: params.key }
        await daemon.send('Input.dispatchKeyEvent', { type: 'keyDown', ...mapped })
        await daemon.send('Input.dispatchKeyEvent', { type: 'keyUp', ...mapped })
        return { ok: true }
      })
    },

    async screenshot(_params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const result = await daemon.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
        if (!result.ok) return { ok: false, error: result.error }
        const data = (result.result as Record<string, unknown>)?.data as string | undefined
        return { ok: true, data: data ?? '' }
      })
    },

    async jsEval(params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const result = await daemon.send('Runtime.evaluate', { expression: params.expression, returnByValue: true })
        if (!result.ok) return { ok: false, error: result.error }
        return { ok: true, result: readEvalValue(result) }
      })
    },

    async pageInfo() {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const result = await daemon.send('Runtime.evaluate', {
          expression: '({url: location.href, title: document.title})',
          returnByValue: true,
        })
        if (!result.ok) return { ok: false, error: result.error }
        const info = readEvalValue(result) as Record<string, unknown> | undefined
        return { ok: true, url: info?.url as string | undefined, title: info?.title as string | undefined }
      })
    },

    async getCookies(_params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const result = await daemon.send('Network.getAllCookies')
        // A CDP failure must surface as an honest failure — never an `ok:true`
        // empty cookie list, which a result-oracle would read as false success.
        if (!result.ok) return { ok: false as const, error: result.error ?? 'getCookies failed' }
        const r = result.result as Record<string, unknown> | undefined
        const raw = r?.cookies as Array<Record<string, unknown>> | undefined
        const cookies = (raw ?? []).map((c: Record<string, unknown>) => ({
          name: String(c.name ?? ''),
          value: String(c.value ?? ''),
          domain: String(c.domain ?? ''),
        }))
        return { ok: true, cookies }
      })
    },

    async setCookie(params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const result = await daemon.send('Network.setCookie', {
          name: params.name,
          value: params.value,
          domain: params.domain,
          path: params.path ?? '/',
          secure: params.secure,
          httpOnly: params.httpOnly,
          expires: params.expires,
        })
        if (!result.ok) return { ok: false, error: result.error }
        return { ok: true }
      })
    },

    async clearCookies() {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        const result = await daemon.send('Network.clearBrowserCookies')
        if (!result.ok) return { ok: false, error: result.error }
        return { ok: true }
      })
    },

    async getAuthState(params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        if (params.action === 'set') {
          if (!params.state) return { ok: false, error: 'state required for set action' }
          const parsed = (() => {
            try {
              return JSON.parse(params.state) as Record<string, string>
            } catch {
              return null
            }
          })()
          if (!parsed) return { ok: false, error: 'state must be valid JSON' }
          for (const [k, v] of Object.entries(parsed)) {
            await daemon.send('Network.setCookie', { name: k, value: v, path: '/' })
          }
          return { ok: true, cookies: [], localStorage: {} }
        }
        const cookieResult = await daemon.send('Network.getAllCookies')
        // Honest failure on CDP error instead of reporting an empty auth state.
        if (!cookieResult.ok) return { ok: false as const, error: cookieResult.error ?? 'getAuthState failed' }
        const cookies =
          ((cookieResult.result as Record<string, unknown>)?.cookies as Array<Record<string, unknown>>) ?? []
        const lsResult = await daemon.send('Runtime.evaluate', {
          expression: 'JSON.stringify(Object.entries(localStorage).reduce((a,[k,v]) => (a[k]=v,a), {}))',
          returnByValue: true,
        })
        let localStorage: Record<string, string> = {}
        if (lsResult.ok) {
          const raw = (lsResult.result as Record<string, unknown>)?.result as string | undefined
          if (raw) {
            try {
              localStorage = JSON.parse(raw)
            } catch {
              /* ignore */
            }
          }
        }
        return { ok: true, cookies, localStorage }
      })
    },

    async networkLog(params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        ensureEventSubscription()
        const enable = await daemon.send('Network.enable')
        if (!enable.ok) return { ok: false as const, error: enable.error ?? 'Network.enable failed' }
        const limit = params.limit ?? 50
        return { ok: true, events: networkBuffer.slice(-limit) }
      })
    },

    async consoleMessages(params) {
      return wrap(async () => {
        const connected = await ensureConnected()
        if (!connected) return { ok: false, error: CDP_UNREACHABLE }
        ensureEventSubscription()
        const enable = await daemon.send('Runtime.enable')
        if (!enable.ok) return { ok: false as const, error: enable.error ?? 'Runtime.enable failed' }
        const limit = params.limit ?? 50
        return { ok: true, events: consoleBuffer.slice(-limit) }
      })
    },
  }
}
