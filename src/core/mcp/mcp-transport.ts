import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import { McpGraphError } from '../utils/errors.js'
import type { McpClientConfig, TransportType } from './mcp-client.js'

export type MessageHandler = (message: string) => void

export interface Transport {
  type: TransportType
  connect(): Promise<void>
  send(message: string): Promise<void>
  close(): Promise<void>
  onmessage?: MessageHandler
  /** PID of the spawned child process, when the transport owns one (stdio only). */
  readonly pid?: number
}

const DEFAULT_CLOSE_KILL_TIMEOUT_MS = 3000

export class StdioTransport implements Transport {
  readonly type = 'stdio' as const
  private proc?: ChildProcess
  private exited = false

  constructor(private config: McpClientConfig) {}

  /** True once the child process has exited (crash or normal exit) — send() must refuse after this. */
  hasExited(): boolean {
    return this.exited
  }

  get pid(): number | undefined {
    return this.proc?.pid
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.proc = spawn(this.config.command!, this.config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.proc.on('error', reject)
      this.proc.on('spawn', resolve)
      // Without this, send() kept writing to a dead process's stdin pipe
      // (silent EPIPE, never surfaced as a typed disconnect).
      this.proc.on('exit', () => {
        this.exited = true
      })
    })
  }

  async send(message: string): Promise<void> {
    if (this.exited) throw new McpGraphError('StdioTransport: child process has exited, cannot send')
    if (!this.proc?.stdin) throw new McpGraphError('not connected')
    return new Promise((resolve, reject) => {
      this.proc!.stdin!.write(message + '\n', (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /** Sends SIGTERM, then escalates to SIGKILL if the process has not exited within `killTimeoutMs`. */
  async close(killTimeoutMs: number = DEFAULT_CLOSE_KILL_TIMEOUT_MS): Promise<void> {
    const proc = this.proc
    if (!proc) return
    this.proc = undefined

    if (this.exited) return

    proc.kill('SIGTERM')
    await new Promise<void>((resolveClose) => {
      const timer = setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL')
        resolveClose()
      }, killTimeoutMs)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolveClose()
      })
    })
  }
}

export class HttpTransport implements Transport {
  readonly type = 'streamable-http' as const
  private closed = false
  private readonly inFlight = new Set<AbortController>()

  constructor(private config: McpClientConfig) {}

  async connect(): Promise<void> {
    const resp = await fetch(`${this.config.url}/ping`)
    if (!resp.ok) throw new McpGraphError(`MCP server unreachable: ${resp.status}`)
  }

  async send(message: string): Promise<void> {
    if (this.closed) throw new McpGraphError('HttpTransport: transport closed, cannot send')
    const controller = new AbortController()
    this.inFlight.add(controller)
    try {
      const resp = await fetch(this.config.url!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: message,
        signal: controller.signal,
      })
      if (!resp.ok) throw new McpGraphError(`MCP request failed: ${resp.status}`)
    } finally {
      this.inFlight.delete(controller)
    }
  }

  /** Aborts any in-flight request and refuses further sends — previously a no-op. */
  async close(): Promise<void> {
    this.closed = true
    for (const controller of this.inFlight) controller.abort()
    this.inFlight.clear()
  }
}

export class SSETransport implements Transport {
  readonly type = 'sse' as const
  private req?: http.ClientRequest
  private postUrl = ''
  onmessage?: MessageHandler

  constructor(private config: McpClientConfig) {}

  async connect(): Promise<void> {
    if (!this.config.url) {
      throw new McpGraphError('SSETransport requires a url — config.url is undefined')
    }
    const base = this.config.url.replace(/\/$/, '')
    const sseUrl = `${base}/sse`
    const isSecure = sseUrl.startsWith('https')
    this.postUrl = `${base}/message`

    return new Promise((resolve, reject) => {
      const mod = isSecure ? https : http
      this.req = mod.get(sseUrl, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new McpGraphError(`SSE connection failed: ${res.statusCode}`))
          return
        }
        let buffer = ''
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const dataLine = part.split('\n').find((l) => l.startsWith('data: '))
            if (dataLine) {
              this.onmessage?.(dataLine.slice(6))
            }
          }
        })
        res.on('end', () => {
          resolve()
        })
        res.on('error', (err) => {
          reject(new McpGraphError(`SSE stream error: ${err.message}`))
        })
        resolve()
      })
      this.req.on('error', reject)
    })
  }

  async send(message: string): Promise<void> {
    const resp = await fetch(this.postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: message,
    })
    if (!resp.ok) throw new McpGraphError(`MCP SSE POST failed: ${resp.status}`)
  }

  async close(): Promise<void> {
    this.req?.destroy()
    this.req = undefined
  }
}

export function createTransport(config: McpClientConfig): Transport {
  if (config.command) return new StdioTransport(config)
  if (config.url) return new HttpTransport(config)
  throw new McpGraphError('createTransport requires either config.command or config.url')
}

export async function createTransportWithFallback(config: McpClientConfig): Promise<Transport> {
  if (config.command) return new StdioTransport(config)
  if (!config.url) {
    throw new McpGraphError('createTransportWithFallback requires either config.command or config.url')
  }

  const httpTransport = new HttpTransport(config)
  try {
    await httpTransport.connect()
    await httpTransport.close()
    return httpTransport
  } catch {
    const sse = new SSETransport(config)
    await sse.connect()
    return sse
  }
}
