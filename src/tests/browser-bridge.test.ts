import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockImplementation(() => {
    throw new Error('ENOENT')
  }),
}))

const { spawn } = await import('node:child_process')
const mockSpawn = vi.mocked(spawn)

async function importBridge() {
  return await import('../tui/browser-port.js')
}

const SAMPLE_PAGE_INFO = JSON.stringify({
  url: 'https://example.com',
  title: 'Example',
  w: 1920,
  h: 1080,
  sx: 0,
  sy: 0,
  pw: 1920,
  ph: 1080,
})

function makeMockChildProcess() {
  const stdout = new EventEmitter() as EventEmitter & { on: (e: string, cb: (chunk: Buffer) => void) => void }
  const stderr = new EventEmitter() as EventEmitter & { on: (e: string, cb: (chunk: Buffer) => void) => void }
  const stdin = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  stdin.write = vi.fn()
  stdin.end = vi.fn()
  const child = {
    stdout,
    stderr,
    stdin,
    on: vi.fn(),
    kill: vi.fn(),
  }
  child.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'close') child._closeCb = cb
    if (event === 'error') child._errorCb = cb
    return child
  })
  return child as typeof child & { _closeCb?: (...args: unknown[]) => void; _errorCb?: (...args: unknown[]) => void }
}

function makeSpawnOk(stdoutText: string) {
  mockSpawn.mockImplementation(() => {
    const child = makeMockChildProcess()
    setTimeout(() => {
      child.stdout.emit('data', Buffer.from(stdoutText))
      if (child._closeCb) child._closeCb(0)
    }, 10)
    return child as ReturnType<typeof spawn>
  })
}

function makeSpawnErr(stderrText: string, code: number) {
  mockSpawn.mockImplementation(() => {
    const child = makeMockChildProcess()
    setTimeout(() => {
      child.stderr.emit('data', Buffer.from(stderrText))
      if (child._closeCb) child._closeCb(code)
    }, 10)
    return child as ReturnType<typeof spawn>
  })
}

function makeSpawnTimeout() {
  mockSpawn.mockImplementation(() => {
    const child = makeMockChildProcess()
    // Never emit close => timeout
    return child as ReturnType<typeof spawn>
  })
}

describe('BrowserBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cria BrowserBridge com CLI detectado', async () => {
    makeSpawnOk('0.1.0\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    expect(bridge).toBeDefined()
    expect(bridge.isAvailable()).toBe(false)
  })

  it('detecta ausencia do CLI e retorna erro amigavel', async () => {
    makeSpawnErr('command not found', 127)
    const { BrowserBridge, BRIDGE_ERROR_PREFIX } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('info', '')
    expect(result).toContain(BRIDGE_ERROR_PREFIX)
    expect(result).toContain('browser-harness')
  })

  it('timeout 30s por chamada retorna erro', async () => {
    makeSpawnTimeout()
    const { BrowserBridge, BRIDGE_ERROR_PREFIX } = await importBridge()
    const bridge = new BrowserBridge({ timeoutMs: 50 })
    const result = await bridge.browser('info', '')
    expect(result).toContain(BRIDGE_ERROR_PREFIX)
  })

  it('executa comando info e retorna stdout', async () => {
    makeSpawnOk(SAMPLE_PAGE_INFO + '\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('info', '')
    expect(result).toBe(SAMPLE_PAGE_INFO)
  })

  it('executa comando screenshot e retorna path da imagem', async () => {
    makeSpawnOk('/tmp/shot.png\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('screenshot', '/tmp/test.png')
    expect(result).toContain('/tmp')
  })

  it('retorna resultado cacheado na segunda chamada com mesma action+args', async () => {
    makeSpawnOk(SAMPLE_PAGE_INFO + '\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const r1 = await bridge.browser('info', '')
    const callCountAfter1 = mockSpawn.mock.calls.length
    const r2 = await bridge.browser('info', '')
    const callCountAfter2 = mockSpawn.mock.calls.length
    expect(r1).toBe(r2)
    expect(callCountAfter2 - callCountAfter1).toBe(0)
  })

  it('retorna resultado diferente para action+args diferentes (cache miss)', async () => {
    mockSpawn
      .mockImplementationOnce(() => {
        const child = makeMockChildProcess()
        setTimeout(() => {
          child.stdout.emit('data', Buffer.from(SAMPLE_PAGE_INFO + '\n'))
          if (child._closeCb) child._closeCb(0)
        }, 10)
        return child as ReturnType<typeof spawn>
      })
      .mockImplementationOnce(() => {
        const child = makeMockChildProcess()
        setTimeout(() => {
          child.stdout.emit('data', Buffer.from('/tmp/shot.png\n'))
          if (child._closeCb) child._closeCb(0)
        }, 10)
        return child as ReturnType<typeof spawn>
      })
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    await bridge.browser('info', '')
    await bridge.browser('screenshot', '/tmp/test.png')
    expect(mockSpawn.mock.calls.length).toBe(2)
  })

  it('cache LRU evicta entrada mais antiga quando atinge limite', async () => {
    makeSpawnOk(SAMPLE_PAGE_INFO + '\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge({ maxCache: 3 })
    await bridge.browser('goto', 'https://a.com')
    await bridge.browser('goto', 'https://b.com')
    await bridge.browser('goto', 'https://c.com')
    await bridge.browser('goto', 'https://d.com')
    const callCount = mockSpawn.mock.calls.length
    await bridge.browser('goto', 'https://a.com')
    expect(mockSpawn.mock.calls.length).toBe(callCount + 1)
  })

  it('getStats retorna estatisticas do cache', async () => {
    makeSpawnOk(SAMPLE_PAGE_INFO + '\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    await bridge.browser('info', '')
    await bridge.browser('info', '')
    const stats = bridge.getStats()
    expect(stats.hits).toBeGreaterThanOrEqual(1)
    expect(stats.misses).toBeGreaterThanOrEqual(1)
    expect(stats.size).toBeGreaterThanOrEqual(1)
  })

  it('envia script via stdin do processo', async () => {
    let writtenScript = ''
    mockSpawn.mockImplementation(() => {
      const child = makeMockChildProcess()
      child.stdin.write = vi.fn((data: string) => {
        writtenScript = data
      })
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from(SAMPLE_PAGE_INFO + '\n'))
        if (child._closeCb) child._closeCb(0)
      }, 10)
      return child as ReturnType<typeof spawn>
    })
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    await bridge.browser('info', '')
    expect(writtenScript).toContain('page_info')
    expect(writtenScript).not.toBe('')
  })

  it('trim de output com newlines', async () => {
    makeSpawnOk('  result text  \n\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('info', '')
    expect(result).toBe('result text')
  })

  it('stderr antes de exit code non-zero retorna erro', async () => {
    mockSpawn.mockImplementation(() => {
      const child = makeMockChildProcess()
      setTimeout(() => {
        child.stderr.emit('data', Buffer.from('Python error: module not found'))
        if (child._closeCb) child._closeCb(1)
      }, 10)
      return child as ReturnType<typeof spawn>
    })
    const { BrowserBridge, BRIDGE_ERROR_PREFIX } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('eval', 'nonexistent()')
    expect(result).toContain(BRIDGE_ERROR_PREFIX)
    expect(result).toContain('module not found')
  })

  it('spawn error event retorna erro amigavel', async () => {
    mockSpawn.mockImplementation(() => {
      const child = makeMockChildProcess()
      setTimeout(() => {
        if (child._errorCb) child._errorCb(new Error(' spawn ENOENT'))
      }, 10)
      return child as ReturnType<typeof spawn>
    })
    const { BrowserBridge, BRIDGE_ERROR_PREFIX } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('info', '')
    expect(result).toContain(BRIDGE_ERROR_PREFIX)
  })

  it('unknown action retorna erro prefixado', async () => {
    makeSpawnOk('[browser-harness] unknown action: nonexistent_action\n')
    const { BrowserBridge, BRIDGE_ERROR_PREFIX } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('nonexistent_action', '')
    expect(result).toContain(BRIDGE_ERROR_PREFIX)
  })
})

describe('BrowserBridge — destructive-action gate (node_wire_dc1f40a32929 — destructive-actions wire)', () => {
  const originalEnv = process.env.DESTRUCTIVE_POLICY

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.DESTRUCTIVE_POLICY
  })

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.DESTRUCTIVE_POLICY
    else process.env.DESTRUCTIVE_POLICY = originalEnv
  })

  it('denies click/fill/upload by default (DESTRUCTIVE_POLICY unset) without spawning a process', async () => {
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('click', '10 20')
    expect(result).toContain('destructive action')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('denies fill and upload the same way', async () => {
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    expect(await bridge.browser('fill', '#name John')).toContain('destructive action')
    expect(await bridge.browser('upload', '#file /tmp/x.png')).toContain('destructive action')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('allows click/fill/upload when DESTRUCTIVE_POLICY=allow', async () => {
    process.env.DESTRUCTIVE_POLICY = 'allow'
    makeSpawnOk('ok\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('click', '10 20')
    expect(result).toBe('ok')
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  it('leaves non-destructive actions (info, screenshot, goto) unaffected by default deny', async () => {
    makeSpawnOk('0.1.0\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('info', '')
    expect(result).toBe('0.1.0')
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })
})

describe('BrowserBridge — goto URL scheme validation (node_wire_212f2688c53d — stdio-sanitizer wire)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a javascript: URL without ever spawning a process', async () => {
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('goto', 'javascript:alert(1)')
    expect(result).toContain('scheme')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('rejects a file: URL', async () => {
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('goto', 'file:///etc/passwd')
    expect(result).toContain('scheme')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('allows a real https URL', async () => {
    makeSpawnOk('https://example.com\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('goto', 'https://example.com')
    expect(result).toBe('https://example.com')
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })
})

describe('BrowserBridge — goto URL_DENY domain policy (node_wire_5b2c8bcde75f — url-rules wire)', () => {
  const originalDeny = process.env.URL_DENY

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalDeny === undefined) delete process.env.URL_DENY
    else process.env.URL_DENY = originalDeny
  })

  it('denies a URL matching URL_DENY without ever spawning a process', async () => {
    process.env.URL_DENY = '*.internal.example'
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('goto', 'https://admin.internal.example/login')
    expect(result).toContain('denied by URL policy')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('allows a URL not matching URL_DENY', async () => {
    process.env.URL_DENY = '*.internal.example'
    makeSpawnOk('https://example.com\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('goto', 'https://example.com')
    expect(result).toBe('https://example.com')
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  it('with no URL_DENY/URL_ALLOW set, all http(s) URLs pass through unaffected', async () => {
    delete process.env.URL_DENY
    makeSpawnOk('https://example.com\n')
    const { BrowserBridge } = await importBridge()
    const bridge = new BrowserBridge()
    const result = await bridge.browser('goto', 'https://example.com')
    expect(result).toBe('https://example.com')
  })
})

describe('fnv1aHash', () => {
  it('produz mesma hash para mesma entrada', async () => {
    const { fnv1aHash } = await importBridge()
    const h1 = fnv1aHash('info|')
    const h2 = fnv1aHash('info|')
    expect(h1).toBe(h2)
  })

  it('produz hash diferente para entradas diferentes', async () => {
    const { fnv1aHash } = await importBridge()
    const h1 = fnv1aHash('info|')
    const h2 = fnv1aHash('goto|https://example.com')
    expect(h1).not.toBe(h2)
  })
})
