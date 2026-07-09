/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LspClient — Generic JSON-RPC 2.0 client over stdio.
 *
 * Communicates with ANY Language Server Protocol server by spawning
 * it as a child process and exchanging JSON-RPC 2.0 messages via
 * Content-Length framed stdio.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'lsp-client.ts' })

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 message types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: JsonRpcError
}

interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// ---------------------------------------------------------------------------
// Content-Length header pattern
// ---------------------------------------------------------------------------

const HEADER_REGEX = /Content-Length:\s*(\d+)\r\n\r\n/

// ---------------------------------------------------------------------------
// LspClient
// ---------------------------------------------------------------------------

export class LspClient extends EventEmitter {
  private process: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffer = Buffer.alloc(0)
  private _ready = false

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly requestTimeoutMs: number = 30_000,
  ) {
    super()
  }

  /** Whether the child process is running and ready for messages. */
  get ready(): boolean {
    return this._ready
  }

  /** PID of the child process (if running). */
  get pid(): number | undefined {
    return this.process?.pid
  }

  /** Spawn the child process. Does NOT send `initialize`. */
  async start(): Promise<void> {
    if (this.process) {
      log.warn('LspClient.start called but process already running', {
        command: this.command,
      })
      return
    }

    log.info('LspClient spawning server', {
      command: this.command,
      args: this.args.join(' '),
    })

    const child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process = child

    child.stdout?.on('data', (data: Buffer) => {
      this.handleData(data)
    })

    child.stderr?.on('data', (data: Buffer) => {
      log.debug('LSP stderr', {
        command: this.command,
        data: data.toString('utf8').trim(),
      })
    })

    child.on('error', (err: Error) => {
      log.error('LSP process error', {
        command: this.command,
        error: err.message,
      })
      this._ready = false
      this.rejectAll(err)
      // Only emit if there are listeners — prevents unhandled error crashes
      if (this.listenerCount('error') > 0) {
        this.emit('error', err)
      }
    })

    child.on('exit', (code: number | null, signal: string | null) => {
      log.info('LSP process exited', {
        command: this.command,
        code: String(code ?? 'null'),
        signal: String(signal ?? 'null'),
      })
      this._ready = false
      this.rejectAll(new Error(`LSP process exited (code=${code}, signal=${signal})`))
      this.process = null
      this.emit('exit', code, signal)
    })

    this._ready = true
  }

  /** Send `shutdown` request + `exit` notification, then wait for exit. */
  async stop(): Promise<void> {
    if (!this.process) {
      return
    }

    try {
      await this.sendRequest('shutdown')
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: "server may already be gone — that's fine" })
    }

    this.sendNotification('exit')

    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        log.warn('LSP process did not exit gracefully, killing', {
          command: this.command,
        })
        this.kill()
        resolve()
      }, 5_000)

      if (this.process) {
        this.process.once('exit', () => {
          clearTimeout(killTimer)
          resolve()
        })
      } else {
        clearTimeout(killTimer)
        resolve()
      }
    })

    this._ready = false
  }

  /** Send a JSON-RPC request and wait for the corresponding response. */
  async sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.process?.stdin?.writable) {
      throw new McpGraphError('LSP process is not running or stdin is not writable')
    }

    const id = this.nextId++
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP request timed out after ${this.requestTimeoutMs}ms: ${method}`))
      }, this.requestTimeoutMs)

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })

      const encoded = this.encode(request)
      ;(this.process as ChildProcess).stdin?.write(encoded)
    })
  }

  /** Send a JSON-RPC notification (fire-and-forget, no response expected). */
  sendNotification(method: string, params?: unknown): void {
    if (!this.process?.stdin?.writable) {
      log.warn('LspClient.sendNotification: stdin not writable', { method })
      return
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    }

    const encoded = this.encode(notification)
    this.process.stdin.write(encoded)
  }

  /** Kill the child process immediately (SIGKILL). */
  kill(): void {
    if (this.process) {
      this.process.kill('SIGKILL')
      this.process = null
      this._ready = false
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Encode a JSON-RPC message with Content-Length header. */
  private encode(msg: JsonRpcRequest | JsonRpcNotification): Buffer {
    const json = JSON.stringify(msg)
    const body = Buffer.from(json, 'utf8')
    const header = `Content-Length: ${body.byteLength}\r\n\r\n`
    return Buffer.concat([Buffer.from(header, 'ascii'), body])
  }

  /**
   * Parse incoming data from stdout, extracting complete JSON-RPC messages.
   *
   * Handles chunked delivery: data is accumulated in an internal buffer
   * and complete messages are extracted as they become available.
   */
  private static readonly MAX_BUFFER_SIZE = 8 * 1024 * 1024 // 8MB — JSON-RPC LSP messages rarely exceed 1MB in practice

  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data])

    // Guard: kill LSP if buffer exceeds max size (DoS prevention)
    if (this.buffer.byteLength > LspClient.MAX_BUFFER_SIZE) {
      log.error('LSP buffer overflow — killing process', {
        bufferSize: this.buffer.byteLength,
        maxSize: LspClient.MAX_BUFFER_SIZE,
        command: this.command,
      })
      this.buffer = Buffer.alloc(0)
      this.kill()
      return
    }

    while (true) {
      const headerStr = this.buffer.toString('ascii', 0, Math.min(this.buffer.byteLength, 256))
      const match = HEADER_REGEX.exec(headerStr)

      if (!match) {
        break
      }

      const contentLength = parseInt(match[1], 10)

      // Guard: reject oversized Content-Length
      if (contentLength > LspClient.MAX_BUFFER_SIZE) {
        log.error('LSP Content-Length exceeds max buffer size — discarding', {
          contentLength,
          maxSize: LspClient.MAX_BUFFER_SIZE,
        })
        this.buffer = Buffer.alloc(0)
        break
      }
      const headerEnd = match.index + match[0].length
      const totalLength = headerEnd + contentLength

      if (this.buffer.byteLength < totalLength) {
        // Not enough data yet — wait for more.
        break
      }

      const bodyBytes = this.buffer.subarray(headerEnd, totalLength)
      this.buffer = this.buffer.subarray(totalLength)

      try {
        const parsed: unknown = JSON.parse(bodyBytes.toString('utf8'))
        this.handleMessage(parsed as JsonRpcResponse | JsonRpcNotification)
      } catch (err) {
        log.error('Failed to parse LSP JSON-RPC message', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  /** Process a single parsed JSON-RPC message (response or notification). */
  private handleMessage(msg: JsonRpcResponse | JsonRpcNotification): void {
    // Response — has "id"
    if ('id' in msg && typeof msg.id === 'number') {
      const pending = this.pending.get(msg.id)
      if (!pending) {
        log.warn('Received response for unknown request id', { id: msg.id })
        return
      }

      this.pending.delete(msg.id)
      clearTimeout(pending.timer)

      const response = msg as JsonRpcResponse
      if (response.error) {
        pending.reject(new Error(`LSP error ${response.error.code}: ${response.error.message}`))
      } else {
        pending.resolve(response.result)
      }
      return
    }

    // Notification — has "method" but no "id"
    if ('method' in msg && typeof msg.method === 'string') {
      this.emit('notification', {
        method: msg.method,
        params: msg.params,
      })
      return
    }

    log.warn('Received unrecognized JSON-RPC message', {
      keys: Object.keys(msg as unknown as Record<string, unknown>).join(','),
    })
  }

  /** Reject all pending requests with the given error. */
  private rejectAll(error: Error): void {
    const entries = Array.from(this.pending.entries())
    this.pending.clear()
    for (const [, pending] of entries) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
  }
}
