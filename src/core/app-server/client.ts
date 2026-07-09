import WebSocket from 'ws'
import { McpGraphError } from '../utils/errors.js'

export class RemoteAppServerClient {
  private ws: WebSocket | null = null
  private closed = false
  private requestId = 0
  private pending = new Map<string | number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)
      this.ws.on('open', () => {
        this.ws!.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {},
          }),
        )
        resolve()
      })
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>
          this.handleMessage(msg)
        } catch {
          // Skip invalid JSON
        }
      })
      this.ws.on('error', (err) => reject(err))
      this.ws.on('close', () => {
        this.closed = true
        this.rejectAll(new Error('Connection closed'))
      })
    })
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed || !this.ws) throw new McpGraphError('Client is closed')
    const id = ++this.requestId
    const msg: Record<string, unknown> = {
      jsonrpc: '2.0',
      id,
      method,
    }
    if (params !== undefined) msg.params = params

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.ws!.send(JSON.stringify(msg))
    }) as Promise<T>
  }

  async requestTyped<T>(method: string, params?: unknown): Promise<T> {
    return this.request<T>(method, params)
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (this.closed || !this.ws) throw new McpGraphError('Client is closed')
    const msg: Record<string, unknown> = {
      jsonrpc: '2.0',
      method,
    }
    if (params !== undefined) msg.params = params
    this.ws.send(JSON.stringify(msg))
  }

  shutdown(): void {
    this.closed = true
    this.rejectAll(new Error('Client shutting down'))
    this.ws?.close()
    this.ws = null
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const rawId = msg.id
    if (rawId !== undefined && rawId !== null && (typeof rawId === 'string' || typeof rawId === 'number')) {
      const id = rawId as string | number
      if (this.pending.has(id)) {
        const { resolve, reject } = this.pending.get(id)!
        this.pending.delete(id)
        if ('error' in msg) {
          reject(new Error(String((msg as { error: { message: string } }).error?.message ?? 'Request error')))
        } else {
          resolve(msg.result)
        }
      }
    }
  }

  private rejectAll(err: Error): void {
    for (const [, { reject }] of this.pending) {
      reject(err)
    }
    this.pending.clear()
  }
}
