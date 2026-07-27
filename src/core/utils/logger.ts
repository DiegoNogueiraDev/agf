/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { LogEntry, LogLayer, LogLevel } from '../../schemas/log.schema.js'
import { extractErrorContext } from './ecs-formatter.js'
import { getTraceContext } from './trace-store.js'
import { writeNdjsonLog } from '../output/ndjson-logger.js'
import type { NdjsonLevel } from '../output/ndjson-logger.js'

export interface BusinessEvent {
  action: string
  category: string
  outcome: 'success' | 'failure' | 'unknown'
}

const MAX_BUFFER_SIZE = 1000

const logBuffer: LogEntry[] = []
let nextId = 1
let logListener: ((entry: LogEntry) => void) | null = null
let quietMode = false

/** Suppress all stderr log output. Ring buffer and listener still work. */
export function setQuiet(v: boolean): void {
  quietMode = v
}

export function isQuiet(): boolean {
  return quietMode
}

function appendToBuffer(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const trace = getTraceContext()
  const traceFields: Record<string, unknown> = trace ? { 'trace.id': trace.traceId, 'span.id': trace.spanId } : {}
  const merged = { ...traceFields, ...(context ?? {}) }
  const entry: LogEntry = {
    id: nextId++,
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(Object.keys(merged).length > 0 ? { context: merged } : {}),
  }

  logBuffer.push(entry)

  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.splice(0, logBuffer.length - MAX_BUFFER_SIZE)
  }

  if (logListener) {
    logListener(entry)
  }
}

/** Return a shallow copy of the in-memory log buffer. */
export function getLogBuffer(): LogEntry[] {
  return [...logBuffer]
}

/** Clear all entries from the in-memory log buffer. */
export function clearLogBuffer(): void {
  logBuffer.length = 0
}

/** Register (or unregister) a callback that receives every new log entry in real time. */
export function setLogListener(listener: ((entry: LogEntry) => void) | null): void {
  logListener = listener
}

function emitNdjson(lvl: NdjsonLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (quietMode) return
  writeNdjsonLog({
    ts: new Date().toISOString(),
    lvl,
    msg,
    ...(ctx ?? {}),
  })
}

export interface ContextualLogger {
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
  success(msg: string, ctx?: Record<string, unknown>): void
  debug(msg: string, ctx?: Record<string, unknown>): void
  event(event: BusinessEvent, msg: string, ctx?: Record<string, unknown>): void
}

/**
 * Build a logger pre-tagged with `layer` + `source`. The factory's tags always
 * win over caller-supplied context (treat `layer`/`source` as authoritative
 * server-side metadata).
 */
export function createLogger(opts: { layer: LogLayer; source: string }): ContextualLogger {
  const tag = (ctx?: Record<string, unknown>): Record<string, unknown> => ({
    ...(ctx ?? {}),
    layer: opts.layer,
    source: opts.source,
  })
  return {
    info: (msg, ctx) => logger.info(msg, tag(ctx)),
    warn: (msg, ctx) => logger.warn(msg, tag(ctx)),
    error: (msg, ctx) => logger.error(msg, tag(ctx)),
    success: (msg, ctx) => logger.success(msg, tag(ctx)),
    debug: (msg, ctx) => logger.debug(msg, tag(ctx)),
    event: (evt, msg, ctx) => logger.event(evt, msg, tag(ctx)),
  }
}

export const logger = {
  info(msg: string, ctx?: Record<string, unknown>): void {
    appendToBuffer('info', msg, ctx)
    emitNdjson('info', msg, ctx)
  },
  warn(msg: string, ctx?: Record<string, unknown>): void {
    const normalized = extractErrorContext(ctx)
    appendToBuffer('warn', msg, normalized)
    emitNdjson('warn', msg, normalized)
  },
  error(msg: string, ctx?: Record<string, unknown>): void {
    const normalized = extractErrorContext(ctx)
    appendToBuffer('error', msg, normalized)
    emitNdjson('error', msg, normalized)
  },
  success(msg: string, ctx?: Record<string, unknown>): void {
    appendToBuffer('success', msg, ctx)
    emitNdjson('info', msg, ctx)
  },
  debug(msg: string, ctx?: Record<string, unknown>): void {
    if (process.env.MCP_GRAPH_DEBUG) {
      appendToBuffer('debug', msg, ctx)
      emitNdjson('debug', msg, ctx)
    }
  },
  event(event: BusinessEvent, msg: string, ctx?: Record<string, unknown>): void {
    const normalized = extractErrorContext(ctx) ?? {}
    const merged: Record<string, unknown> = {
      ...normalized,
      eventAction: event.action,
      eventCategory: event.category,
      eventOutcome: event.outcome,
    }
    appendToBuffer('info', msg, merged)
    emitNdjson('info', msg, merged)
  },
}
