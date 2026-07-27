import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrowserPort, BridgeStats } from '../tui/browser-port.js'

interface MockBridge extends BrowserPort {
  getStats(): BridgeStats
}

async function importHandler() {
  return await import('../skills/cross-cutting/graph-browser.js')
}

function makeMockBridge(): MockBridge {
  return {
    browser: vi.fn(),
    getStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, size: 0 }),
  }
}

describe('BrowserHandler — help', () => {
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

  it('/browser help lista 17 skills', async () => {
    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('help', ctx as any)

    expect(result).toContain('dialogs')
    expect(result).toContain('screenshots')
    expect(result).toContain('shadow-dom')
    expect(result).toContain('iframes')
    expect(result).toContain('uploads')
    expect(result).toContain('connection')
    expect(result).toContain('dialogs')
  })

  it('/browser help dialogs exibe guia completo', async () => {
    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('help dialogs', ctx as any)

    expect(result).toContain('Dialogs')
    expect(result).toContain('alert')
    expect(result).toContain('confirm')
    expect(result).toContain('prompt')
    expect(result).toContain('beforeunload')
    expect(result).not.toBe('')
    expect(result).not.toContain('nao encontrada')
  })

  it('/browser help screenshots exibe guia', async () => {
    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('help screenshots', ctx as any)

    expect(result).toContain('Screenshots')
    expect(result).toContain('viewport')
    expect(result).toContain('max_dim')
    expect(result).not.toContain('nao encontrada')
  })

  it('skill invalida retorna erro amigavel com sugestao', async () => {
    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('help xyzinvalid', ctx as any)

    expect(result).toContain('nao encontrada')
  })

  it('skill "dialog" match prefix "dialogs" via startsWith', async () => {
    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('help dialog', ctx as any)

    expect(result).toContain('Dialogs')
    expect(result).toContain('confirm')
    expect(result).not.toContain('nao encontrada')
  })

  it('skill totalmente diferente retorna erro amigavel', async () => {
    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('help nonexistantskillxyz', ctx as any)

    expect(result).toContain('nao encontrada')
  })
})
