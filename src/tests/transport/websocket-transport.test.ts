import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketTransport } from '../../core/app-server/transport/websocket.js'
import { parseListenUrl } from '../../core/app-server/transport/index.js'
import { WebSocket } from 'ws'

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

describe('WebSocketTransport', () => {
  let port: number
  let transport: WebSocketTransport

  beforeEach(async () => {
    port = await freePort()
  })

  afterEach(() => {
    transport?.close()
  })

  it('cria servidor ws e aceita conexoes', async () => {
    transport = new WebSocketTransport(port)
    // Wait for server to be ready
    await new Promise((r) => setTimeout(r, 100))

    const ws = new WebSocket(`ws://localhost:${port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', reject)
    })

    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('envia mensagem para clientes conectados', async () => {
    transport = new WebSocketTransport(port)
    await new Promise((r) => setTimeout(r, 100))

    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`)
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()))
      })
      // Send only once THIS listener is connected AND registered server-side
      // (small settle), so the broadcast can't race ahead of registration —
      // the previous two-socket version could send before the listener was
      // registered, losing the message and timing out.
      ws.on('open', () => {
        setTimeout(() => transport.send({ type: 'ping', value: 42 }), 50)
      })
      ws.on('error', reject)
    })

    const msg = await received
    expect(msg).toEqual({ type: 'ping', value: 42 })
  })

  it('recebe mensagem do cliente via onMessage handler', async () => {
    transport = new WebSocketTransport(port)
    await new Promise((r) => setTimeout(r, 100))

    const msgPromise = new Promise<Record<string, unknown>>((resolve) => {
      transport.onMessage((msg) => resolve(msg))
    })

    const ws = new WebSocket(`ws://localhost:${port}`)
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ method: 'hello', params: {} }))
        setTimeout(resolve, 200)
      })
      ws.on('error', () => {})
    })

    const msg = await msgPromise
    expect(msg).toEqual({ method: 'hello', params: {} })
    ws.close()
  })

  it('close encerra servidor e desconecta clientes', async () => {
    transport = new WebSocketTransport(port)
    await new Promise((r) => setTimeout(r, 100))

    const ws = new WebSocket(`ws://localhost:${port}`)
    const closed = new Promise<void>((resolve) => ws.on('close', () => resolve()))
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', reject)
    })

    transport.close()
    await closed

    expect(ws.readyState).toBe(WebSocket.CLOSED)
  })
})

describe('parseListenUrl', () => {
  it.each([
    ['ws://localhost:8080', 'ws'],
    ['wss://secure.example.com', 'ws'],
    ['stdio://', 'stdio'],
    ['unix:///tmp/mcp.sock', 'unix'],
    ['http://invalid', null],
    ['', null],
  ])('parseListenUrl(%s) → %s', (url, expected) => {
    expect(parseListenUrl(url)).toBe(expected)
  })
})
