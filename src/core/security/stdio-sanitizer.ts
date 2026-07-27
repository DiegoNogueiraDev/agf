/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { StdioSanitizationError, type StdioSanitizationKind } from '../utils/errors.js'

const SHELL_METACHARS = /[;|&`$<>\\\n\r\t]|\$\(|\$\{/
const PATH_TRAVERSAL = /(^|[/\\])\.\.([/\\]|$)/
// eslint-disable-next-line no-control-regex
const NUL = /\x00/
const URI_SMUGGLE = /^(file|data|javascript|vbscript):/i
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/

function reject(kind: StdioSanitizationKind, reason: string, value: string): never {
  throw new StdioSanitizationError(kind, reason, value)
}

/** safeArg —  */
export function safeArg(value: string, kind: StdioSanitizationKind): string {
  if (typeof value !== 'string') reject(kind, 'not a string', String(value))
  if (value.length > 4096) reject(kind, 'too long (>4096 bytes)', value.slice(0, 64))
  if (NUL.test(value)) reject(kind, 'contains NUL byte', value)

  switch (kind) {
    case 'path':
      if (URI_SMUGGLE.test(value)) reject(kind, 'URI scheme not allowed in path', value)
      if (PATH_TRAVERSAL.test(value)) reject(kind, 'path traversal (..)', value)
      return value

    case 'url': {
      let parsed: URL
      try {
        parsed = new URL(value)
      } catch {
        reject(kind, 'malformed URL', value)
      }
      const scheme = parsed.protocol.replace(/:$/, '').toLowerCase()
      if (!['http', 'https', 'ws', 'wss'].includes(scheme)) {
        reject(kind, `scheme "${scheme}" not allowed`, value)
      }
      return value
    }

    case 'identifier':
      if (!IDENTIFIER.test(value)) reject(kind, 'not a safe identifier', value)
      return value

    case 'command-arg':
      if (SHELL_METACHARS.test(value)) reject(kind, 'contains shell metacharacter', value)
      return value

    case 'cdp-method':
      assertCdpMethod(value)
      return value
  }
}

/** safeArgv —  */
export function safeArgv(values: readonly string[], kind: StdioSanitizationKind): string[] {
  return values.map((v) => safeArg(v, kind))
}

const CDP_ALLOWED_DOMAINS = new Set([
  'Page',
  'DOM',
  'DOMSnapshot',
  'Runtime',
  'Network',
  'Input',
  'Emulation',
  'Target',
  'Log',
  'Performance',
  'Accessibility',
  'CSS',
])

const CDP_DENIED_METHODS = new Set<string>([
  'Browser.close',
  'Browser.crash',
  'Browser.grantPermissions',
  'Security.setIgnoreCertificateErrors',
  'Network.setCookies',
  'Network.setCookie',
  'Network.clearBrowserCookies',
  'Network.setExtraHTTPHeaders',
  'Runtime.enable',
  'Target.closeTarget',
  'Target.disposeBrowserContext',
])

/** assertCdpMethod —  */
export function assertCdpMethod(method: string): void {
  if (typeof method !== 'string' || method.length === 0) {
    reject('cdp-method', 'empty or non-string method', String(method))
  }
  const parts = method.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    reject('cdp-method', 'method must be Domain.method', method)
  }
  if (CDP_DENIED_METHODS.has(method)) {
    reject('cdp-method', 'method is on the deny list', method)
  }
  if (!CDP_ALLOWED_DOMAINS.has(parts[0])) {
    reject('cdp-method', `domain "${parts[0]}" not allowlisted`, method)
  }
}
