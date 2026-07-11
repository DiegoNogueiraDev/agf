import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrowserPort, BridgeStats } from '../tui/browser-port.js'

interface MockBridge extends BrowserPort {
  getStats(): BridgeStats
}

async function importHandler() {
  return await import('../skills/cross-cutting/graph-browser.js')
}

const SAMPLE_PAGE_INFO_JSON = JSON.stringify({
  url: 'https://example.com',
  title: 'Example Page',
  w: 1920,
  h: 1080,
  sx: 0,
  sy: 0,
  pw: 1920,
  ph: 1080,
})

function makeMockBridge(): MockBridge {
  return {
    browser: vi.fn(),
    getStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, size: 0 }),
  }
}

describe('BrowserHandler', () => {
  const ctx = {
    store: {} as any,
    dir: '/tmp',
    testCmd: 'npm test',
    ledger: {} as any,
    onProgress: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('execute("info", ctx) retorna URL, title, dimensoes', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue(SAMPLE_PAGE_INFO_JSON)

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('info', ctx as any)

    expect(result).toContain('https://example.com')
    expect(result).toContain('Example Page')
    expect(result).toContain('1920')
  })

  it('execute("screenshot", ctx) retorna path da imagem', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('/tmp/shot.png')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('screenshot', ctx as any)

    expect(result).toContain('/tmp/shot.png')
  })

  it('execute("goto https://example.com", ctx) navega', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('https://example.com')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('goto https://example.com', ctx as any)

    expect(result).toContain('https://example.com')
    expect(bridge.browser).toHaveBeenCalledWith('goto', 'https://example.com')
  })

  it('execute("click 100 200", ctx) clica em coordenadas', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('clicked')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('click 100 200', ctx as any)

    expect(result).toContain('clicked')
    expect(bridge.browser).toHaveBeenCalledWith('click', '100 200')
  })

  it('execute("type hello world", ctx) digita texto', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('typed')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('type hello world', ctx as any)

    expect(result).toContain('typed')
    expect(bridge.browser).toHaveBeenCalledWith('type', 'hello world')
  })

  it('execute("eval document.title", ctx) retorna valor JS', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('Example Page')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('eval document.title', ctx as any)

    expect(result).toContain('Example Page')
    expect(bridge.browser).toHaveBeenCalledWith('eval', 'document.title')
  })

  it('execute with empty args retorna subcommand list', async () => {
    const bridge = makeMockBridge()

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('', ctx as any)

    expect(result).toContain('Uso')
    expect(result).toContain('info')
    expect(result).toContain('goto')
    expect(result).toContain('click')
  })

  it('execute with unknown subcommand retorna bridge error', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('[browser-harness] unknown action: nonexistent')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('nonexistent arg1', ctx as any)

    expect(result).toContain('[browser-harness]')
  })

  it('formata JSON output pretty-printed', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue(SAMPLE_PAGE_INFO_JSON)

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('info', ctx as any)

    expect(result).toContain('url')
    expect(result).toContain('title')
    expect(result).toContain('https://example.com')
  })

  it('reporta progresso nas etapas', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('ok')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    await handler.execute('info', ctx as any)

    expect(ctx.onProgress).toHaveBeenCalledTimes(2)
    expect(ctx.onProgress).toHaveBeenCalledWith(expect.objectContaining({ step: 1, total: 2 }))
  })
})
