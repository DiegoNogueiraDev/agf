/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LogEntry } from '../../schemas/log.schema.js'

function loadPackageMeta(): { name: string; version: string } {
  const fallback = { name: '@diegonogueiradev/graph-flow', version: '0.0.0' }
  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, 'package.json')
      if (existsSync(candidate)) {
        const raw = readFileSync(candidate, 'utf-8')
        const parsed = JSON.parse(raw) as { name?: string; version?: string }
        return {
          name: parsed.name ?? fallback.name,
          version: parsed.version ?? fallback.version,
        }
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch (_err) {
    void _err // fall through
  }
  return fallback
}

const pkg = loadPackageMeta()

export const SERVICE_NAME = pkg.name
export const SERVICE_VERSION = pkg.version

const RESERVED_CONTEXT_KEYS = new Set([
  'layer',
  'source',
  'traceId',
  'spanId',
  'eventAction',
  'eventCategory',
  'eventOutcome',
  'error',
  'errorMessage',
  'errorType',
  'errorStackTrace',
])

/**
 * Convert a {@link LogEntry} into an ECS (Elastic Common Schema)-shaped record.
 * Reserved context keys map to canonical ECS fields; everything else is
 * preserved under `labels.*` so dashboards can still surface custom data.
 */
export function toEcs(entry: LogEntry): Record<string, unknown> {
  const ecs: Record<string, unknown> = {
    '@timestamp': entry.timestamp,
    'log.level': entry.level,
    message: entry.message,
    'service.name': SERVICE_NAME,
    'service.version': SERVICE_VERSION,
  }

  const ctx = extractErrorContext(entry.context)
  if (!ctx) return ecs

  if (typeof ctx.layer === 'string') ecs['labels.layer'] = ctx.layer
  if (typeof ctx.source === 'string') ecs['labels.source'] = ctx.source
  if (typeof ctx.traceId === 'string') ecs['trace.id'] = ctx.traceId
  if (typeof ctx.spanId === 'string') ecs['span.id'] = ctx.spanId
  if (typeof ctx.eventAction === 'string') ecs['event.action'] = ctx.eventAction
  if (typeof ctx.eventCategory === 'string') ecs['event.category'] = ctx.eventCategory
  if (typeof ctx.eventOutcome === 'string') ecs['event.outcome'] = ctx.eventOutcome

  if (typeof ctx.errorMessage === 'string') ecs['error.message'] = ctx.errorMessage
  if (typeof ctx.errorType === 'string') ecs['error.type'] = ctx.errorType
  if (typeof ctx.errorStackTrace === 'string') ecs['error.stack_trace'] = ctx.errorStackTrace

  for (const [k, v] of Object.entries(ctx)) {
    if (RESERVED_CONTEXT_KEYS.has(k)) continue
    ecs[`labels.${k}`] = v
  }

  return ecs
}

/**
 * Extract ECS error fields (`errorMessage`, `errorType`, `errorStackTrace`) from
 * a context object containing a raw `Error` instance. Returns a new context
 * without the unserializable `error` key. No-op if `error` is not an `Error`.
 */
export function extractErrorContext(ctx: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!ctx || !(ctx.error instanceof Error)) return ctx
  const { error, ...rest } = ctx
  const err = error as Error
  return {
    ...rest,
    errorMessage: err.message,
    errorType: err.constructor.name,
    errorStackTrace: err.stack ?? '',
  }
}
