import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'

/**
 * In-memory characterization tests for LspClient.
 *
 * No real LSP server is spawned — `node:child_process.spawn` is mocked with a
 * fake child whose stdin captures the Content-Length framed bytes the client
 * writes, and whose stdout we feed framed JSON-RPC responses into. This pins the
 * existing framing/handshake/notification behavior as a safety net.
 */

// --- Fake child process (in-memory transport) ---------------------------------

class FakeStdin extends EventEmitter {
  writable = true
  chunks: Buffer[] = []
  write(buf: Buffer | string): boolean {
    this.chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    return true
  }
}

class FakeChild extends EventEmitter {
  stdin = new FakeStdin()
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  pid = 4242
  killed = false
  kill(_signal?: string): boolean {
    this.killed = true
    // mimic a real process emitting exit after kill
    queueMicrotask(() => this.emit('exit', null, 'SIGKILL'))
    return true
  }
}

let lastChild: FakeChild

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    lastChild = new FakeChild()
    return lastChild
  }),
}))

// Import AFTER the mock is registered.
const { LspClient } = await import('../core/lsp/lsp-client.js')
const { McpGraphError } = await import('../core/utils/errors.js')

// --- Helpers ------------------------------------------------------------------

const HEADER = /Content-Length:\s*(\d+)\r\n\r\n/

/** Decode the most recently written frame from stdin into its JSON object. */
function decodeLastFrame(child: FakeChild): { contentLength: number; msg: Record<string, unknown> } {
  const buf = Buffer.concat(child.stdin.chunks)
  const headerStr = buf.toString('ascii', 0, Math.min(buf.byteLength, 256))
  const match = HEADER.exec(headerStr)
  if (!match) throw new Error('no Content-Length header in written bytes')
  const contentLength = parseInt(match[1], 10)
  const headerEnd = match.index + match[0].length
  const body = buf.subarray(headerEnd, headerEnd + contentLength)
  return { contentLength, msg: JSON.parse(body.toString('utf8')) }
}

/** Encode a JSON-RPC message as a Content-Length framed Buffer and push to stdout. */
function pushResponse(child: FakeChild, obj: unknown): void {
  const json = Buffer.from(JSON.stringify(obj), 'utf8')
  const header = `Content-Length: ${json.byteLength}\r\n\r\n`
  child.stdout.emit('data', Buffer.concat([Buffer.from(header, 'ascii'), json]))
}

// --- Tests --------------------------------------------------------------------

describe('LspClient (in-memory transport)', () => {
  let client: InstanceType<typeof LspClient>

  beforeEach(async () => {
    vi.clearAllMocks()
    client = new LspClient('fake-lsp', ['--stdio'], 1000)
    await client.start()
  })

  it('start() marks client ready and exposes the pid', () => {
    expect(client.ready).toBe(true)
    expect(client.pid).toBe(4242)
  })

  it('sendRequest frames JSON-RPC with correct Content-Length and resolves on matching id', async () => {
    const params = { processId: null, rootUri: null, capabilities: {} }
    const promise = client.sendRequest('initialize', params)

    const { contentLength, msg } = decodeLastFrame(lastChild)
    expect(msg.jsonrpc).toBe('2.0')
    expect(msg.method).toBe('initialize')
    expect(msg.id).toBe(1)
    expect(msg.params).toEqual(params)
    // Content-Length matches the actual UTF-8 byte length of the body.
    expect(contentLength).toBe(Buffer.byteLength(JSON.stringify(msg), 'utf8'))

    pushResponse(lastChild, { jsonrpc: '2.0', id: 1, result: { capabilities: { hoverProvider: true } } })
    await expect(promise).resolves.toEqual({ capabilities: { hoverProvider: true } })
  })

  it('sendRequest rejects with a typed error when the server returns a JSON-RPC error', async () => {
    const promise = client.sendRequest('definition')
    const { msg } = decodeLastFrame(lastChild)
    pushResponse(lastChild, {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: 'Method not found' },
    })
    await expect(promise).rejects.toThrow(/-32601: Method not found/)
  })

  it('sendNotification writes a frame with no id and never awaits a response', () => {
    client.sendNotification('initialized', {})
    const { msg } = decodeLastFrame(lastChild)
    expect(msg.method).toBe('initialized')
    expect('id' in msg).toBe(false)
    expect(msg.jsonrpc).toBe('2.0')
  })

  it('omits params from the frame when none are given', () => {
    void client.sendRequest('shutdown')
    const { msg } = decodeLastFrame(lastChild)
    expect('params' in msg).toBe(false)
  })

  it('increments request ids monotonically', async () => {
    void client.sendRequest('a')
    const first = decodeLastFrame(lastChild).msg.id
    lastChild.stdin.chunks = []
    void client.sendRequest('b')
    const second = decodeLastFrame(lastChild).msg.id
    expect(second).toBe((first as number) + 1)
  })

  it('emits "notification" for server-pushed messages without an id', async () => {
    const received: Array<{ method: string; params: unknown }> = []
    client.on('notification', (n) => received.push(n))
    pushResponse(lastChild, { jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3, message: 'hi' } })
    await Promise.resolve()
    expect(received).toEqual([{ method: 'window/logMessage', params: { type: 3, message: 'hi' } }])
  })
})

describe('LspClient graceful degradation', () => {
  it('sendRequest throws McpGraphError when the process is not running', async () => {
    const client = new LspClient('fake-lsp', [])
    await expect(client.sendRequest('initialize')).rejects.toBeInstanceOf(McpGraphError)
  })

  it('sendNotification is a no-op (no throw) when the process is not running', () => {
    const client = new LspClient('fake-lsp', [])
    expect(() => client.sendNotification('exit')).not.toThrow()
  })
})
