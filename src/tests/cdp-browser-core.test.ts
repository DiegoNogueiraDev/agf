/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * CDP Browser Core — connection, discovery, IPC, daemon lifecycle
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { WebSocketServer } from 'ws'
import { createServer as createHttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { CdpConnection } from '../plugins/browser/cdp-connection.js'
import { discoverCdpUrl } from '../plugins/browser/discovery.js'
import { CdpDaemon, type CdpDaemonConfig } from '../plugins/browser/cdp-daemon.js'

const WS_SERVERS: Array<{ server: WebSocketServer; port: number }> = []

function createWsServer(): { server: WebSocketServer; port: number } {
  const httpServer = createHttpServer()
  const server = new WebSocketServer({ server: httpServer })
  httpServer.listen(0)
  const port = (httpServer.address() as AddressInfo).port
  const entry = { server, port }
  WS_SERVERS.push(entry)
  return entry
}

afterAll(() => {
  for (const { server } of WS_SERVERS) server.close()
})

describe('CdpConnection', () => {
  it('connects to a CDP endpoint and receives events', async () => {
    const { server, port } = createWsServer()
    server.on('connection', (ws) => {
      ws.send(JSON.stringify({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 't1' } } }))
    })

    const conn = new CdpConnection({ url: `ws://127.0.0.1:${port}`, maxRetries: 0 })
    const events: unknown[] = []
    conn.on('event', (e) => events.push(e))
    await conn.connect()
    await new Promise((r) => setTimeout(r, 50))

    expect(events.length).toBeGreaterThan(0)
    expect((events[0] as any).method).toBe('Target.targetCreated')
    conn.close()
  })

  it('sends CDP commands and receives responses', async () => {
    const { server, port } = createWsServer()
    server.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        ws.send(JSON.stringify({ id: msg.id, result: { targetId: 'abc' } }))
      })
    })

    const conn = new CdpConnection({ url: `ws://127.0.0.1:${port}`, maxRetries: 0 })
    await conn.connect()

    const result = await conn.send('Target.createTarget', { url: 'about:blank' })
    expect(result).toHaveProperty('targetId', 'abc')
    conn.close()
  })

  it('handles connection errors gracefully', async () => {
    const conn = new CdpConnection({ url: 'ws://127.0.0.1:1', maxRetries: 1, retryDelayMs: 10 })
    await expect(conn.connect()).rejects.toThrow()
  })

  it('tracks ready state', async () => {
    const { server, port } = createWsServer()
    server.on('connection', () => {})

    const conn = new CdpConnection({ url: `ws://127.0.0.1:${port}`, maxRetries: 0 })
    expect(conn.isConnected()).toBe(false)

    await conn.connect()
    expect(conn.isConnected()).toBe(true)

    conn.close()
    expect(conn.isConnected()).toBe(false)
  })

  // bug #1: unexpected socket close must reject in-flight send() (parity with close()).
  it('rejects in-flight send() when the socket drops unexpectedly', async () => {
    const { server, port } = createWsServer()
    let serverSock: import('ws').WebSocket | undefined
    server.on('connection', (ws) => {
      serverSock = ws // accept, never reply
    })

    const conn = new CdpConnection({ url: `ws://127.0.0.1:${port}`, maxRetries: 0 })
    await conn.connect()
    const inflight = conn.send('Page.navigate', { url: 'about:blank' })
    await new Promise((r) => setTimeout(r, 20))
    serverSock!.close() // simulate daemon/CDP crash mid-request

    await expect(inflight).rejects.toThrow()
    conn.close()
  })

  // bug #1: send() must not hang forever if CDP never replies for that id.
  it('rejects send() after a per-request timeout when no reply arrives', async () => {
    const { server, port } = createWsServer()
    server.on('connection', () => {}) // accept, never reply

    const conn = new CdpConnection({ url: `ws://127.0.0.1:${port}`, maxRetries: 0, requestTimeoutMs: 100 })
    await conn.connect()

    await expect(conn.send('Page.navigate', { url: 'about:blank' })).rejects.toThrow(/timed out/i)
    conn.close()
  })
})

describe('discoverCdpUrl', () => {
  it('returns a well-formed default CDP URL when no options given', async () => {
    const url = discoverCdpUrl({})
    // AUDIT-040: discovery now reads the REAL browser GUID from DevToolsActivePort
    // line 2 when present (the all-zeros GUID made Chrome reject the upgrade), so
    // the GUID is environment-dependent: all-zeros in CI (no file), a real UUID on
    // a dev box with Chrome running. Assert the URL contract, not a fixed GUID.
    expect(url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[0-9a-f-]+$/i)
  })

  it('uses custom port when provided', () => {
    const url = discoverCdpUrl({ customPort: 9333 })
    expect(url).toContain(':9333')
  })

  it('uses custom URL when provided over port', () => {
    const url = discoverCdpUrl({ customUrl: 'ws://127.0.0.1:9444', customPort: 9222 })
    expect(url).toBe('ws://127.0.0.1:9444')
  })
})

describe('CdpDaemon', () => {
  let daemon: CdpDaemon

  afterEach(() => {
    daemon?.close()
  })

  it('starts and provides connection status', async () => {
    const { server, port } = createWsServer()
    server.on('connection', () => {})

    const config: CdpDaemonConfig = {
      connection: { url: `ws://127.0.0.1:${port}`, maxRetries: 1, retryDelayMs: 10 },
    }

    daemon = new CdpDaemon(config)
    expect(daemon.status()).toBe('idle')

    const result = await daemon.start()
    expect(result.ok).toBe(true)
    expect(daemon.status()).toBe('connected')
  })

  it('reports failed connection status', async () => {
    const config: CdpDaemonConfig = {
      connection: { url: 'ws://127.0.0.1:1', maxRetries: 1, retryDelayMs: 5 },
    }

    daemon = new CdpDaemon(config)
    const result = await daemon.start()
    expect(result.ok).toBe(false)
    expect(daemon.status()).toBe('error')
  })

  it('is idempotent on multiple start calls', async () => {
    const { server, port } = createWsServer()
    server.on('connection', () => {})

    const config: CdpDaemonConfig = {
      connection: { url: `ws://127.0.0.1:${port}`, maxRetries: 0 },
    }

    daemon = new CdpDaemon(config)
    const r1 = await daemon.start()
    const r2 = await daemon.start()

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    expect(r2.alreadyRunning).toBe(true)
  })

  it('sends commands and returns typed results', async () => {
    const { server, port } = createWsServer()
    server.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        ws.send(JSON.stringify({ id: msg.id, result: { version: '1.3' } }))
      })
    })

    const config: CdpDaemonConfig = {
      connection: { url: `ws://127.0.0.1:${port}`, maxRetries: 0 },
    }

    daemon = new CdpDaemon(config)
    await daemon.start()
    const result = await daemon.send('Browser.getVersion', {})
    expect(result.ok).toBe(true)
    expect((result.result as any).version).toBe('1.3')
  })
})
