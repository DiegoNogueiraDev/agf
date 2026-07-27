import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrowserPort, BridgeStats } from '../tui/browser-port.js'

interface MockBridge extends BrowserPort {
  getStats(): BridgeStats
}

async function importHandler() {
  return await import('../skills/cross-cutting/graph-browser.js')
}

const SAMPLE_TABS_JSON = JSON.stringify([
  { targetId: 'tab-001', title: 'Example', url: 'https://example.com' },
  { targetId: 'tab-002', title: 'GitHub', url: 'https://github.com' },
])

const SAMPLE_STATUS_JSON = JSON.stringify({
  targetId: 'tab-001',
  url: 'https://example.com',
  title: 'Example',
})

function makeMockBridge(): MockBridge {
  return {
    browser: vi.fn(),
    getStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, size: 0 }),
  }
}

describe('BrowserHandler — tabs + sessao', () => {
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

  it('/browser tabs lista abas com targetId, title, url via bridge', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue(SAMPLE_TABS_JSON)

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('tabs', ctx as any)

    expect(bridge.browser).toHaveBeenCalledWith('tabs', '')
    expect(result).toContain('tab-001')
    expect(result).toContain('https://example.com')
    expect(result).toContain('GitHub')
  })

  it('/browser tab <id> troca para aba especifica', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('switched')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('tab tab-001', ctx as any)

    expect(bridge.browser).toHaveBeenCalledWith('tab', 'tab-001')
    expect(result).toContain('switched')
  })

  it('/browser new-tab abre nova aba com URL', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('new-tab-id')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('new-tab https://example.com', ctx as any)

    expect(bridge.browser).toHaveBeenCalledWith('new-tab', 'https://example.com')
    expect(result).toContain('new-tab-id')
  })

  it('/browser close [id] fecha aba', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('closed')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('close tab-001', ctx as any)

    expect(bridge.browser).toHaveBeenCalledWith('close', 'tab-001')
    expect(result).toContain('closed')
  })

  it('/browser status mostra daemon vivo', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue(SAMPLE_STATUS_JSON)

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('status', ctx as any)

    expect(bridge.browser).toHaveBeenCalledWith('status', '')
    expect(result).toContain('tab-001')
    expect(result).toContain('https://example.com')
    expect(result).toContain('targetId')
  })

  it('tabs JSON array é formatado como pretty-print', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue(SAMPLE_TABS_JSON)

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('tabs', ctx as any)

    expect(result).toContain('tab-001')
    expect(result).toContain('targetId')
    expect(result).toContain('title')
  })

  it('tabs vazio (array vazio) formatado corretamente', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('[]')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('tabs', ctx as any)

    expect(result).toContain('[]')
  })

  it('close sem argumento funciona (fecha aba atual)', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('closed')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('close', ctx as any)

    expect(bridge.browser).toHaveBeenCalledWith('close', '')
    expect(result).toContain('closed')
  })

  it('new-tab alias "newtab" funciona', async () => {
    const bridge = makeMockBridge()
    bridge.browser = vi.fn().mockResolvedValue('new-tab-id')

    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('newtab https://test.com', ctx as any)

    expect(bridge.browser).toHaveBeenCalledWith('new-tab', 'https://test.com')
    expect(result).toContain('new-tab-id')
  })
})
