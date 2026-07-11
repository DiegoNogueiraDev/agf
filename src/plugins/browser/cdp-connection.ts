/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import WebSocket from 'ws'
import { createLogger } from '../../core/utils/logger.js'
import { McpGraphError } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'core', source: 'plugins/browser/cdp-connection.ts' })

export interface CdpConnectionConfig {
  url: string
  maxRetries?: number
  retryDelayMs?: number
  /** Per-request timeout: rejects a send() if no reply arrives in time. Default 30s. */
  requestTimeoutMs?: number
}

export type CdpEvent = { method: string; params?: Record<string, unknown> }

interface PendingRequest {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class CdpConnection {
  private ws: WebSocket | null = null
  private readonly url: string
  private readonly maxRetries: number
  private readonly retryDelayMs: number
  private readonly requestTimeoutMs: number
  private pending = new Map<number, PendingRequest>()
  private msgId = 0
  private eventHandlers: Array<(event: CdpEvent) => void> = []
  private _connected = false

  constructor(config: CdpConnectionConfig) {
    this.url = config.url
    this.maxRetries = config.maxRetries ?? 3
    this.retryDelayMs = config.retryDelayMs ?? 1000
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000
  }

  /** Rejects and clears every in-flight request — used on unexpected close and explicit close(). */
  private failAllPending(reason: string): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
    }
    this.pending.clear()
  }

  /** Resolve/reject a single pending request, clearing its timer. */
  private settlePending(id: number, fn: (p: PendingRequest) => void): void {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    fn(p)
  }

  on(event: 'event', handler: (event: CdpEvent) => void): void {
    if (event === 'event') this.eventHandlers.push(handler)
  }

  /** Remove a previously-registered event handler — prevents listener leaks across re-subscribes. */
  off(event: 'event', handler: (event: CdpEvent) => void): void {
    if (event === 'event') this.eventHandlers = this.eventHandlers.filter((h) => h !== handler)
  }

  isConnected(): boolean {
    return this._connected
  }

  async connect(): Promise<void> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.tryConnect()
        return
      } catch (err) {
        if (attempt >= this.maxRetries) throw err
        await new Promise((r) => setTimeout(r, this.retryDelayMs))
      }
    }
  }

  private tryConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      ws.on('open', () => {
        this.ws = ws
        this._connected = true
        log.info('CDP connection established', { url: this.url })
        resolve()
      })
      ws.on('message', (data: Buffer) => {
        const raw = data.toString()
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw)
        } catch {
          return
        }
        if (parsed.id !== undefined) {
          this.settlePending(parsed.id as number, (pending) => {
            if (parsed.error) pending.reject(new Error(String(parsed.error)))
            else pending.resolve(parsed.result)
          })
        } else if (parsed.method) {
          const event: CdpEvent = {
            method: String(parsed.method),
            params: parsed.params as Record<string, unknown> | undefined,
          }
          for (const h of this.eventHandlers) h(event)
        }
      })
      ws.on('close', () => {
        this._connected = false
        this.ws = null
        // Unexpected drop (daemon/CDP crash): reject every in-flight request so
        // callers never hang. Parity with the explicit close() method.
        this.failAllPending('CDP connection closed')
      })
      ws.on('error', (err) => {
        if (!this._connected) reject(err)
        // Post-connect socket errors precede 'close'; surface them instead of swallowing.
        else log.warn('CDP socket error after connect', { url: this.url, error: err.message })
      })
    })
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new McpGraphError('CDP socket is not connected')
    }
    const id = ++this.msgId
    const msg = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settlePending(id, (p) =>
          p.reject(new Error(`CDP request '${method}' timed out after ${this.requestTimeoutMs}ms`)),
        )
      }, this.requestTimeoutMs)
      // Don't keep the event loop alive solely for this timer.
      if (typeof timer === 'object' && 'unref' in timer) timer.unref()
      this.pending.set(id, { resolve, reject, timer })
      this.ws!.send(msg, (err) => {
        if (err) this.settlePending(id, (p) => p.reject(err))
      })
    })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
    this._connected = false
    this.failAllPending('Connection closed')
  }
}
