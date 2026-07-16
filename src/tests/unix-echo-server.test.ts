/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/app-server/unix-echo-server.ts (node_wire_34643f17259f —
 * wires the dormant UnixSocketTransport into the app-server surface).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, unlinkSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createConnection } from 'node:net'
import { startUnixEchoServer, type UnixEchoServerHandle } from '../core/app-server/unix-echo-server.js'

function socketPath(): string {
  return join(tmpdir(), `unix-echo-server-test-${randomBytes(4).toString('hex')}.sock`)
}

describe('startUnixEchoServer', () => {
  let path: string
  let handle: UnixEchoServerHandle | undefined

  afterEach(() => {
    handle?.close()
    if (path && existsSync(path)) {
      try {
        unlinkSync(path)
      } catch {
        /* already deleted */
      }
    }
  })

  it('replies to an inbound message with { echo: <message> }', async () => {
    path = socketPath()
    handle = startUnixEchoServer(path)
    await new Promise((r) => setTimeout(r, 200))

    const client = createConnection(path)
    let received = ''
    const reply = new Promise<void>((resolve, reject) => {
      client.on('data', (data) => {
        received += data.toString()
        resolve()
      })
      client.on('error', reject)
    })

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        client.write(JSON.stringify({ method: 'hello' }) + '\n')
        resolve()
      })
      client.on('error', reject)
    })

    await reply
    expect(JSON.parse(received)).toEqual({ echo: { method: 'hello' } })
    client.end()
  })
})
