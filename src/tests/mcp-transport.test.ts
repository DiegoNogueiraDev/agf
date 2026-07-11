/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http, { type Server } from 'node:http'
import {
  StdioTransport,
  HttpTransport,
  SSETransport,
  createTransport,
  createTransportWithFallback,
} from '../core/mcp/mcp-transport.js'
import { McpGraphError } from '../core/utils/errors.js'

describe('MCP Transport', () => {
  it('StdioTransport throws McpGraphError when sending without connection', async () => {
    const transport = new StdioTransport({ command: 'echo', type: 'stdio' })
    await expect(transport.send('hello')).rejects.toThrow(McpGraphError)
  })

  it('StdioTransport has correct type', () => {
    const transport = new StdioTransport({ command: 'echo', type: 'stdio' })
    expect(transport.type).toBe('stdio')
  })

  it('HttpTransport has correct type', () => {
    const transport = new HttpTransport({ url: 'http://localhost', type: 'streamable-http' })
    expect(transport.type).toBe('streamable-http')
  })
})

describe('SSETransport — node_46f85746f030 (crash when url is undefined)', () => {
  it('AC1: connect() throws a typed McpGraphError instead of crashing when config.url is undefined', async () => {
    const transport = new SSETransport({ type: 'sse' })
    await expect(transport.connect()).rejects.toThrow(McpGraphError)
    await expect(transport.connect()).rejects.toThrow(/url/i)
  })
})

describe('createTransport — AC2 (never builds a doomed SSETransport without a url)', () => {
  it('throws a typed McpGraphError when neither command nor url is provided', () => {
    expect(() => createTransport({ type: 'sse' })).toThrow(McpGraphError)
  })

  it('still builds StdioTransport when command is provided', () => {
    const transport = createTransport({ command: 'echo', type: 'stdio' })
    expect(transport.type).toBe('stdio')
  })

  it('still builds HttpTransport when url is provided', () => {
    const transport = createTransport({ url: 'http://localhost', type: 'streamable-http' })
    expect(transport.type).toBe('streamable-http')
  })
})

describe('createTransportWithFallback — AC3 (typed error, not a crash)', () => {
  it('rejects with a typed McpGraphError when neither command nor url is provided', async () => {
    await expect(createTransportWithFallback({ type: 'sse' })).rejects.toThrow(McpGraphError)
  })
})

describe('StdioTransport — node_0462b670a892 (no exit listener, sends to a dead process)', () => {
  it('AC1+AC2: send() throws a typed McpGraphError after the child process exits — not an unchecked write', async () => {
    const transport = new StdioTransport({ command: 'node', args: ['-e', 'process.exit(1)'], type: 'stdio' })
    await transport.connect()

    // Wait for the real child process to actually exit before sending.
    await new Promise<void>((resolveWait) => {
      const check = setInterval(() => {
        if (transport.hasExited()) {
          clearInterval(check)
          resolveWait()
        }
      }, 10)
    })

    await expect(transport.send('hello')).rejects.toThrow(McpGraphError)
    await expect(transport.send('hello')).rejects.toThrow(/exited/i)
  })

  it('AC3: close() escalates to SIGKILL when the process does not respond to SIGTERM within the timeout', async () => {
    // A process that ignores SIGTERM (Node re-registers a no-op handler).
    const transport = new StdioTransport({
      command: 'node',
      args: ['-e', "process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000)"],
      type: 'stdio',
    })
    await transport.connect()

    await transport.close(50) // short kill-timeout for the test

    await new Promise<void>((resolveWait) => {
      const check = setInterval(() => {
        if (transport.hasExited()) {
          clearInterval(check)
          resolveWait()
        }
      }, 10)
    })
    expect(transport.hasExited()).toBe(true)
  }, 10_000)
})

describe('HttpTransport — node_4fbea811a3f3 (close() is a no-op, connections never destroyed)', () => {
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ echo: body }))
      })
    })
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
    const address = server.address()
    if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  })

  it('AC2: send() after close() rejects with "transport closed" — not a live request to a closed transport', async () => {
    const transport = new HttpTransport({ url: baseUrl, type: 'streamable-http' })
    await transport.send('hello') // works before close
    await transport.close()

    await expect(transport.send('hello')).rejects.toThrow(McpGraphError)
    await expect(transport.send('hello')).rejects.toThrow(/transport closed/i)
  })

  it('AC1: close() aborts an in-flight request instead of leaving it to resolve after the transport is gone', async () => {
    // Server holds the response open past the client's own close() timing so we
    // can assert the request itself was aborted, not merely ignored.
    const slowServer = http.createServer((_req, res) => {
      setTimeout(() => res.end('{}'), 200)
    })
    await new Promise<void>((resolveListen) => slowServer.listen(0, '127.0.0.1', resolveListen))
    const address = slowServer.address()
    const slowUrl = address && typeof address === 'object' ? `http://127.0.0.1:${address.port}` : ''

    try {
      const transport = new HttpTransport({ url: slowUrl, type: 'streamable-http' })
      const inFlight = transport.send('hello')
      await transport.close()
      await expect(inFlight).rejects.toThrow()
    } finally {
      await new Promise<void>((resolveClose) => slowServer.close(() => resolveClose()))
    }
  })

  it('close() is idempotent — calling it twice does not throw', async () => {
    const transport = new HttpTransport({ url: baseUrl, type: 'streamable-http' })
    await transport.close()
    await expect(transport.close()).resolves.not.toThrow()
  })
})
