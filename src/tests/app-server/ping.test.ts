import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketServer } from 'ws'
import { pingAppServer } from '../../core/app-server/ping.js'

async function freePort(): Promise<number> {
  const { createServer } = await import('node:net')
  return new Promise((resolve) => {
    const srv = createServer()
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
  })
}

describe('pingAppServer', () => {
  let port: number
  let wss: WebSocketServer

  beforeEach(async () => {
    port = await freePort()
    wss = new WebSocketServer({ port })
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.method === 'ping' && msg.id) {
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: 'pong' }))
        }
      })
    })
  })

  afterEach(() => {
    wss?.close()
  })

  it('connects, round-trips a ping, and reports elapsed latency', async () => {
    const result = await pingAppServer(`ws://localhost:${port}`)

    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('rejects with a timeout error when the server never answers the ping', async () => {
    wss.removeAllListeners('connection')
    wss.on('connection', () => {
      // Accept the socket but never reply — simulates a stuck peer.
    })

    await expect(pingAppServer(`ws://localhost:${port}`, 100)).rejects.toThrow(/timed out/i)
  })

  it('rejects when there is nothing listening at the url', async () => {
    const deadPort = port + 1
    await expect(pingAppServer(`ws://localhost:${deadPort}`, 500)).rejects.toThrow()
  })
})
