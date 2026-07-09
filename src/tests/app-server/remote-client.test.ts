import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketServer } from 'ws'
import { RemoteAppServerClient } from '../../core/app-server/client.js'

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

describe('RemoteAppServerClient', () => {
  let port: number
  let wss: WebSocketServer
  let received: Record<string, unknown>[]
  let serverClosed = false

  beforeEach(async () => {
    port = await freePort()
    serverClosed = false
    received = []
    wss = new WebSocketServer({ port })
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        received.push(msg)
        if (msg.id) {
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { echoed: true } }))
        }
      })
    })
  })

  afterEach(() => {
    if (!serverClosed) {
      serverClosed = true
      wss?.close()
    }
  })

  it('conecta via WebSocket e faz handshake', async () => {
    const client = new RemoteAppServerClient(`ws://localhost:${port}`)
    await client.connect()

    // Wait for handshake to arrive at server
    await new Promise((r) => setTimeout(r, 100))

    expect(received.length).toBe(1)
    expect(received[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'initialize',
    })
    client.shutdown()
  })

  it('faz request e recebe resposta', async () => {
    const client = new RemoteAppServerClient(`ws://localhost:${port}`)
    await client.connect()

    const result = await client.request('ping', { value: 42 })

    expect(result).toEqual({ echoed: true })
    client.shutdown()
  })

  it('faz notify sem resposta', async () => {
    const client = new RemoteAppServerClient(`ws://localhost:${port}`)
    await client.connect()

    await client.notify('update', { status: 'ok' })
    await new Promise((r) => setTimeout(r, 100))

    expect(received.some((m) => m.method === 'update')).toBe(true)
    client.shutdown()
  })

  it('shutdown encerra conexao e rejeita pendentes', async () => {
    const client = new RemoteAppServerClient(`ws://localhost:${port}`)
    await client.connect()

    client.shutdown()

    await expect(client.request('ping')).rejects.toThrow(/closed|shutdown/)
  })
})
