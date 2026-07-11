/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/app-server/ws-echo-server.ts (node_wire_ff61b525fb6e —
 * wires the dormant WebSocketTransport into the app-server surface).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { startWsEchoServer, type WsEchoServerHandle } from '../core/app-server/ws-echo-server.js'

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

describe('startWsEchoServer', () => {
  let handle: WsEchoServerHandle | undefined

  afterEach(() => {
    handle?.close()
  })

  it('replies to an inbound message with { echo: <message> }', async () => {
    const port = await freePort()
    handle = startWsEchoServer(port)
    await new Promise((r) => setTimeout(r, 100))

    const client = new WebSocket(`ws://localhost:${port}`)
    const reply = new Promise<Record<string, unknown>>((resolve, reject) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())))
      client.on('error', reject)
    })

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => {
        client.send(JSON.stringify({ method: 'hello' }))
        resolve()
      })
      client.on('error', reject)
    })

    const msg = await reply
    expect(msg).toEqual({ echo: { method: 'hello' } })
    client.close()
  })
})
