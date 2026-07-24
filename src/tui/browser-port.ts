import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'
import { LRUCache } from 'lru-cache'
import { fnv1a32 } from '../core/cache/cache-types.js'
import { createLogger } from '../core/utils/logger.js'
import { createDestructivePolicy, type DestructiveAction } from '../core/security/destructive-actions.js'
import { safeArg } from '../core/security/stdio-sanitizer.js'
import { StdioSanitizationError } from '../core/utils/errors.js'
import { createUrlPolicy } from '../core/security/url-rules.js'

const log = createLogger({ layer: 'cli', source: 'tui/browser-port.ts' })

export const BRIDGE_ERROR_PREFIX = '[browser-harness]'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_CACHE = 128
const DEFAULT_CACHE_TTL_MS = 30_000

// node_wire_dc1f40a32929 — destructive-actions wire. Maps browser-bridge actions
// that can mutate real page state (form fill, real click, file upload) onto
// DestructivePolicy's action vocabulary. Default policy is 'deny' (safe by
// default); DESTRUCTIVE_POLICY=allow opts in for interactive/trusted sessions.
const DESTRUCTIVE_ACTION_MAP: Readonly<Record<string, DestructiveAction>> = {
  click: 'destructive_click',
  fill: 'form_submit',
  upload: 'file_upload',
}

export interface BrowserPort {
  browser(action: string, args: string): Promise<string>
  getStats(): BridgeStats
}

export interface BridgeStats {
  hits: number
  misses: number
  size: number
}

/** Stable 32-bit hash for cache keys (FNV-1a) — delegates to unified implementation. */
export function fnv1aHash(input: string): string {
  log.debug(`fnv1aHash called`)
  return fnv1a32(input)
}

interface BrowserBridgeOptions {
  timeoutMs?: number
  maxCache?: number
  cliPath?: string
  cacheTtlMs?: number
}

export class BrowserBridge implements BrowserPort {
  private cache: LRUCache<string, string>
  private hits = 0
  private misses = 0
  private timeoutMs: number
  private cliPath: string

  constructor(options: BrowserBridgeOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.cliPath = options.cliPath ?? 'browser-harness'
    const ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.cache = new LRUCache<string, string>({ max: options.maxCache ?? DEFAULT_MAX_CACHE, ttl })
  }

  /** Clear cache on page navigation — stale results should not be served */
  didNavigate(): void {
    this.cache.clear()
  }

  isAvailable(): boolean {
    try {
      const home = homedir()
      const apple = platform() === 'darwin'
      const chromeDataDir = apple
        ? join(home, 'Library/Application Support/Google/Chrome')
        : join(home, '.config/google-chrome')
      const activePortPath = resolve(chromeDataDir, 'DevToolsActivePort')
      const content = readFileSync(activePortPath, 'utf-8')
      const lines = content.trim().split('\n')
      const port = parseInt(lines[0], 10)
      return !isNaN(port) && port > 0
    } catch {
      return false
    }
  }

  private pythonScript(action: string, args: string): string {
    switch (action) {
      case 'info':
        return `import json; print(json.dumps(page_info()))`
      case 'screenshot':
        return `capture_screenshot(${JSON.stringify(args || undefined)})`
      case 'goto':
        return `goto_url(${JSON.stringify(args)}); print(page_info()['url'])`
      case 'click': {
        const [x, y] = args.split(' ')
        return `click_at_xy(${Number(x)}, ${Number(y)})`
      }
      case 'type':
        return `type_text(${JSON.stringify(args)})`
      case 'eval':
        return `print(js(${JSON.stringify(args)}))`
      case 'tabs':
        return `import json; print(json.dumps(list_tabs()))`
      case 'tab':
        return `switch_tab(${JSON.stringify(args)})`
      case 'new-tab':
        return `new_tab(${JSON.stringify(args || 'about:blank')})`
      case 'close':
        return `close_tab(${JSON.stringify(args || undefined)})`
      case 'status':
        return `import json; d=current_tab(); print(json.dumps(d))`
      case 'fill': {
        const parts = args.match(/(?:"([^"]*)"|(\S+))/g)?.map((s) => s.replace(/^"|"$/g, '')) || []
        const selector = parts[0] || ''
        const text = parts.slice(1).join(' ') || ''
        return `fill_input(${JSON.stringify(selector)}, ${JSON.stringify(text)})`
      }
      case 'key':
        return `press_key(${JSON.stringify(args)})`
      case 'scroll': {
        const trimmed = args.trim().toLowerCase()
        if (trimmed === 'down') return `scroll(0, 0, -300, 0)`
        if (trimmed === 'up') return `scroll(0, 0, 300, 0)`
        const dy = Number(trimmed) || -300
        return `scroll(0, 0, ${dy}, 0)`
      }
      case 'wait':
        if (!args.trim())
          return `import time; deadline=time.time()+15; ok=False; exec('import json'); print(json.dumps({"loaded":True}))`
        return `import json; e=wait_for_element(${JSON.stringify(args)}, visible=False); print(json.dumps({"found": e}))`
      case 'upload': {
        const parts = args.match(/(?:"([^"]*)"|(\S+))/g)?.map((s) => s.replace(/^"|"$/g, '')) || []
        const selector = parts[0] || ''
        const path = parts[1] || ''
        return `upload_file(${JSON.stringify(selector)}, ${JSON.stringify(path)})`
      }
      case 'fetch':
        return `print(http_get(${JSON.stringify(args)}))`
      case 'remote': {
        const trimmed = args.trim()
        if (trimmed.startsWith('start')) {
          const profileArg = trimmed.slice(5).trim()
          if (profileArg)
            return `import json; b=start_remote_daemon(${JSON.stringify(profileArg)}); print(json.dumps(b))`
          return `import json; b=start_remote_daemon(); print(json.dumps(b))`
        }
        if (trimmed.startsWith('stop')) {
          return `stop_remote_daemon(); print('stopped')`
        }
        return `print(${JSON.stringify(`${BRIDGE_ERROR_PREFIX} remote: use start [profile] ou stop`)})`
      }
      case 'profiles':
        return `import json; cl=list_cloud_profiles(); ll=list_local_profiles(); print(json.dumps({"cloud": cl, "local": ll}))`
      case 'doctor': {
        return `import sys, json; from io import StringIO; buf=StringIO(); sys.stdout=buf; rc=run_doctor(); sys.stdout=sys.__stdout__; out=buf.getvalue(); print(json.dumps({"exit": rc, "output": out}))`
      }
      default:
        return `print(${JSON.stringify(`${BRIDGE_ERROR_PREFIX} unknown action: ${action}`)})`
    }
  }

  async browser(action: string, args: string): Promise<string> {
    const destructiveAction = DESTRUCTIVE_ACTION_MAP[action]
    if (destructiveAction && !createDestructivePolicy().isAllowed(destructiveAction)) {
      return `${BRIDGE_ERROR_PREFIX} destructive action "${action}" blocked (set DESTRUCTIVE_POLICY=allow to enable)`
    }

    // node_wire_212f2688c53d — stdio-sanitizer wire. `goto` navigates a real
    // browser session to whatever URL it's given; reject non-http(s)/ws(s)
    // schemes (javascript:, file:, data:, vbscript:) before it ever reaches
    // the browser harness.
    if (action === 'goto') {
      try {
        safeArg(args, 'url')
      } catch (err) {
        const reason = err instanceof StdioSanitizationError ? err.message : 'invalid URL'
        return `${BRIDGE_ERROR_PREFIX} ${reason}`
      }
      // node_wire_5b2c8bcde75f — url-rules wire. Opt-in domain allow/deny via
      // URL_ALLOW/URL_DENY env vars; with neither set, every URL passes
      // (byte-identical default behavior).
      if (!createUrlPolicy().isAllowed(args)) {
        return `${BRIDGE_ERROR_PREFIX} denied by URL policy`
      }
    }

    const key = fnv1aHash(`${action}|${args}`)
    const cached = this.cache.get(key)
    if (cached !== undefined) {
      this.hits++
      return cached
    }
    this.misses++
    const script = this.pythonScript(action, args)
    try {
      const result = await this.execHarness(script)
      this.cache.set(key, result)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return `${BRIDGE_ERROR_PREFIX} ${msg}`
    }
  }

  private execHarness(script: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.cliPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeoutMs,
      })
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`timeout after ${this.timeoutMs}ms`))
      }, this.timeoutMs)
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          resolve(stdout.trim())
        } else {
          reject(new Error(stderr.trim() || `exit code ${code}`))
        }
      })
      child.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
      child.stdin.write(script)
      child.stdin.end()
    })
  }

  getStats(): BridgeStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    }
  }
}
