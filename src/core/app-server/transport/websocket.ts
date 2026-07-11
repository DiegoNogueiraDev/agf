import { WebSocketServer, WebSocket } from 'ws'
import type { Transport } from './index.js'

export class WebSocketTransport implements Transport {
  private wss: WebSocketServer
  private clients = new Set<WebSocket>()
  private handler: ((msg: Record<string, unknown>) => void) | null = null

  constructor(port: number, host?: string) {
    this.wss = new WebSocketServer({ port, host })
    this.wss.on('connection', (ws) => {
      this.clients.add(ws)
      ws.on('message', (data) => {
        if (!this.handler) return
        try {
          const parsed = JSON.parse(data.toString()) as Record<string, unknown>
          this.handler(parsed)
        } catch {
          // Skip invalid JSON
        }
      })
      ws.on('close', () => this.clients.delete(ws))
    })
  }

  send(message: Record<string, unknown>): void {
    const data = JSON.stringify(message)
    for (const client of this.clients) {
      client.send(data)
    }
  }

  onMessage(handler: (msg: Record<string, unknown>) => void): void {
    this.handler = handler
  }

  close(): void {
    for (const client of this.clients) {
      client.close()
    }
    this.clients.clear()
    this.wss.close()
  }
}
