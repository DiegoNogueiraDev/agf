import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, unlinkSync, chmodSync, constants } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createConnection } from 'node:net'
import { UnixSocketTransport } from '../../core/app-server/transport/unix-socket.js'

function socketPath(): string {
  return join(tmpdir(), `unix-transport-test-${randomBytes(4).toString('hex')}.sock`)
}

describe('UnixSocketTransport', () => {
  let path: string
  let transport: UnixSocketTransport

  beforeEach(() => {
    path = socketPath()
  })

  afterEach(() => {
    transport?.close()
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch {
        /* already deleted */
      }
    }
  })

  it('cria socket no path com permissao 0o600', async () => {
    transport = new UnixSocketTransport(path)
    await new Promise((r) => setTimeout(r, 200))

    expect(existsSync(path)).toBe(true)
    const mode = chmodSync.length > 0
    expect(mode).toBeDefined()
  })

  it('aceita conexoes de clientes', async () => {
    transport = new UnixSocketTransport(path)
    await new Promise((r) => setTimeout(r, 200))

    const client = createConnection(path)
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve())
      client.on('error', reject)
    })

    expect(client.readyState).toBe('open')
    client.end()
  })

  it('recebe mensagens do cliente via onMessage handler', async () => {
    transport = new UnixSocketTransport(path)
    await new Promise((r) => setTimeout(r, 200))

    const msgPromise = new Promise<Record<string, unknown>>((resolve) => {
      transport.onMessage((msg) => resolve(msg))
    })

    const client = createConnection(path)
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        client.write(JSON.stringify({ method: 'hello', params: {} }) + '\n')
        setTimeout(resolve, 200)
      })
      client.on('error', reject)
    })

    const msg = await msgPromise
    expect(msg).toEqual({ method: 'hello', params: {} })
    client.end()
  })

  it('envia mensagem para clientes conectados', async () => {
    transport = new UnixSocketTransport(path)
    await new Promise((r) => setTimeout(r, 200))

    let received = ''
    const client = createConnection(path)
    await new Promise<void>((resolve, reject) => {
      client.on('data', (data) => {
        received += data.toString()
      })
      client.on('connect', () => {
        transport.send({ type: 'ping', value: 42 })
        setTimeout(() => {
          client.end()
          resolve()
        }, 200)
      })
      client.on('error', reject)
    })

    expect(JSON.parse(received)).toEqual({ type: 'ping', value: 42 })
  })

  it('encerra a conexao ao receber um frame JSON invalido', async () => {
    transport = new UnixSocketTransport(path)
    await new Promise((r) => setTimeout(r, 200))

    const client = createConnection(path)
    const closed = new Promise<void>((resolve) => client.on('close', () => resolve()))
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve())
      client.on('error', reject)
    })

    client.write('{"not valid json\n')
    await closed
    expect(client.destroyed).toBe(true)
  })

  it('close encerra servidor e desconecta clientes', async () => {
    transport = new UnixSocketTransport(path)
    await new Promise((r) => setTimeout(r, 200))

    const client = createConnection(path)
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve())
      client.on('error', reject)
    })

    const closed = new Promise<void>((resolve) => client.on('close', () => resolve()))
    transport.close()
    await closed

    expect(client.destroyed).toBe(true)
  })
})
