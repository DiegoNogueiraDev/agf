/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { RateLimitExceededError } from '../utils/errors.js'

export interface AuditEntry {
  readonly tool: string
  readonly at: number
  readonly durationMs: number
  readonly ok: boolean
  readonly argsPreview: unknown
  readonly errorMessage?: string
}

export interface AuditSink {
  record(entry: AuditEntry): void | Promise<void>
}

export interface RateLimitConfig {
  readonly perMinute: number
  readonly nowMs?: () => number
}

export interface WrapOptions {
  readonly rateLimit?: RateLimitConfig
  readonly previewMaxBytes?: number
}

export type ToolHandler<A, R> = (args: A) => Promise<R>

const SECRET_PATTERNS: Array<{ re: RegExp; replace: (m: string) => string }> = [
  {
    re: /sk-ant-[A-Za-z0-9_-]{20,}/g,
    replace: (m) => `sk-ant-...${m.slice(-4)}`,
  },
  { re: /ghu_[A-Za-z0-9]{20,}/g, replace: (m) => `ghu_...${m.slice(-4)}` },
  { re: /ghp_[A-Za-z0-9]{20,}/g, replace: (m) => `ghp_...${m.slice(-4)}` },
  { re: /gho_[A-Za-z0-9]{20,}/g, replace: (m) => `gho_...${m.slice(-4)}` },
  { re: /AKIA[0-9A-Z]{16}/g, replace: () => 'AKIA***' },
  { re: /xoxb-[A-Za-z0-9-]{20,}/g, replace: (m) => `xoxb-...${m.slice(-4)}` },
]

const SECRET_FIELD_NAMES = new Set([
  'apikey',
  'api_key',
  'token',
  'accesstoken',
  'access_token',
  'password',
  'secret',
  'authorization',
])

/** redactSecrets —  */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]'
  if (value == null) return value
  if (typeof value === 'string') {
    let out = value
    for (const { re, replace } of SECRET_PATTERNS) out = out.replace(re, replace)
    return out
  }
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1))
  if (typeof value === 'object') {
    const resultValue: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_NAMES.has(k.toLowerCase())) {
        resultValue[k] = typeof v === 'string' && v.length > 0 ? '***' : v
      } else {
        resultValue[k] = redactSecrets(v, depth + 1)
      }
    }
    return resultValue
  }
  return value
}

function previewArgs(args: unknown, maxBytes: number): unknown {
  const redacted = redactSecrets(args)
  const serialized = JSON.stringify(redacted)
  if (serialized === undefined) return '[unserializable]'
  if (serialized.length <= maxBytes) return redacted
  return `${serialized.slice(0, maxBytes - 8)}…[trunc]`
}

/** wrapToolHandler —  */
export function wrapToolHandler<A, R>(
  tool: string,
  handler: ToolHandler<A, R>,
  sink: AuditSink,
  options: WrapOptions = {},
): ToolHandler<A, R> {
  const previewMax = options.previewMaxBytes ?? 1024
  const now = options.rateLimit?.nowMs ?? (() => Date.now())
  const stamps: number[] = []

  return async (args: A) => {
    if (options.rateLimit) {
      const nowMs = now()
      const windowStart = nowMs - 60_000
      while (stamps.length && stamps[0] < windowStart) stamps.shift()
      if (stamps.length >= options.rateLimit.perMinute) {
        throw new RateLimitExceededError(`tool:${tool}`, options.rateLimit.perMinute)
      }
      stamps.push(nowMs)
    }

    const started = Date.now()
    const argsPreview = previewArgs(args, previewMax)
    try {
      const resultValue = await handler(args)
      await sink.record({
        tool,
        at: started,
        durationMs: Date.now() - started,
        ok: true,
        argsPreview,
      })
      return resultValue
    } catch (err) {
      await sink.record({
        tool,
        at: started,
        durationMs: Date.now() - started,
        ok: false,
        argsPreview,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }
}
