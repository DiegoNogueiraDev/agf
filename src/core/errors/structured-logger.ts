/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-typed-errors — StructuredLogger with service, nodeId, timestamp, context.
 *
 * Wraps the existing createLogger infrastructure, adding the required
 * `service` and `nodeId` fields to every log entry.
 */
import { createLogger, type ContextualLogger } from '../utils/logger.js'
import type { LogLayer } from '../../schemas/log.schema.js'

export class StructuredLogger {
  private inner: ContextualLogger
  private serviceName: string

  constructor(service: string, layer: LogLayer = 'core') {
    this.serviceName = service
    this.inner = createLogger({ layer, source: service })
  }

  private enrich<T extends Record<string, unknown> | undefined>(ctx?: T): Record<string, unknown> {
    return { service: this.serviceName, ...(ctx ?? {}) }
  }

  info(msg: string, ctx?: Record<string, unknown>): void {
    this.inner.info(msg, this.enrich(ctx))
  }

  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.inner.warn(msg, this.enrich(ctx))
  }

  error(msg: string, ctx?: Record<string, unknown>): void {
    const envelope = this.extractEnvelope(ctx)
    this.inner.error(msg, this.enrich(envelope ?? ctx))
  }

  private extractEnvelope(ctx?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!ctx) return undefined
    if (ctx.kind && ctx.operation) return ctx
    return undefined
  }

  success(msg: string, ctx?: Record<string, unknown>): void {
    this.inner.success(msg, this.enrich(ctx))
  }

  debug(msg: string, ctx?: Record<string, unknown>): void {
    this.inner.debug(msg, this.enrich(ctx))
  }
}

export { getLogBuffer, clearLogBuffer } from '../utils/logger.js'
