/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'core', source: 'plugins/browser/discovery.ts' })

/** Options for CDP URL discovery. Provide `customUrl` to bypass all auto-detection. */
export interface CdpDiscoveryOptions {
  customPort?: number
  customUrl?: string
}

const DEFAULT_CDP_PORT = 9222
const BROWSER_GUID = '00000000000000000000000000000000'

function chromeUserDataDir(): string {
  const home = homedir()
  const os = platform()
  if (os === 'darwin') return join(home, 'Library/Application Support/Google/Chrome')
  if (os === 'win32') return join(home, 'AppData/Local/Google/Chrome/User Data')
  return join(home, '.config/google-chrome')
}

function activePortPath(): string {
  return resolve(chromeUserDataDir(), 'DevToolsActivePort')
}

/**
 * Resolve the WebSocket URL for Chrome DevTools Protocol.
 * Priority: customUrl → customPort → DevToolsActivePort file → default port 9222.
 */
export function discoverCdpUrl(options: CdpDiscoveryOptions = {}): string {
  if (options.customUrl) return options.customUrl

  // Explicit customPort overrides auto-discovery
  if (options.customPort && options.customPort > 0) {
    return `ws://127.0.0.1:${options.customPort}/devtools/browser/${BROWSER_GUID}`
  }

  try {
    const content = readFileSync(activePortPath(), 'utf-8')
    const lines = content.trim().split('\n')
    const actualPort = parseInt(lines[0], 10)
    if (!isNaN(actualPort) && actualPort > 0) {
      // Line 2 carries the real browser endpoint path (`/devtools/browser/<guid>`).
      // Hardcoding the all-zeros GUID makes Chrome reject the WebSocket upgrade.
      const browserPath = lines[1]?.trim()
      const wsPath = browserPath && browserPath.startsWith('/') ? browserPath : `/devtools/browser/${BROWSER_GUID}`
      log.debug('Discovered CDP endpoint from DevToolsActivePort', { port: actualPort, path: wsPath })
      return `ws://127.0.0.1:${actualPort}${wsPath}`
    }
  } catch {
    log.debug('DevToolsActivePort not found, using default port')
  }

  return `ws://127.0.0.1:${DEFAULT_CDP_PORT}/devtools/browser/${BROWSER_GUID}`
}
