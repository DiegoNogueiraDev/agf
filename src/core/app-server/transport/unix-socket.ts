import { createServer, type Server, type Socket } from 'node:net'
import { unlinkSync, existsSync, chmodSync } from 'node:fs'
import type { Transport } from './index.js'
import { FrameBuffer, encodeFrame } from '../../daemon/daemon-protocol.js'

export class UnixSocketTransport implements Transport {
  private server: Server
  private clients = new Set<Socket>()
  private handler: ((msg: Record<string, unknown>) => void) | null = null
  private buffers = new Map<Socket, FrameBuffer>()

  constructor(socketPath: string) {
    if (existsSync(socketPath)) {
      unlinkSync(socketPath)
    }

    this.server = createServer((socket) => {
      this.clients.add(socket)
      this.buffers.set(socket, new FrameBuffer())

      socket.on('data', (data) => {
        const frameBuffer = this.buffers.get(socket)
        if (!frameBuffer) return

        let frames: unknown[]
        try {
          frames = frameBuffer.feed(data.toString())
        } catch {
          // Malformed frame: the stream is now unrecoverable, terminate per
          // FrameBuffer's contract (reset() would leave the client unaware
          // its message was dropped).
          socket.destroy()
          return
        }

        for (const frame of frames) {
          this.handler?.(frame as Record<string, unknown>)
        }
      })

      socket.on('close', () => {
        this.clients.delete(socket)
        this.buffers.delete(socket)
      })
    })

    this.server.listen(socketPath, () => {
      try {
        chmodSync(socketPath, 0o600)
      } catch {
        // Permission change is best-effort
      }
    })
  }

  send(message: Record<string, unknown>): void {
    const data = encodeFrame(message)
    for (const client of this.clients) {
      try {
        client.write(data)
      } catch {
        this.clients.delete(client)
      }
    }
  }

  onMessage(handler: (msg: Record<string, unknown>) => void): void {
    this.handler = handler
  }

  close(): void {
    for (const client of this.clients) {
      client.destroy()
    }
    this.clients.clear()
    this.server.close()
  }
}
