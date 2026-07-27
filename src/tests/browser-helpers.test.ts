import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrowserPort, BridgeStats } from '../tui/browser-port.js'
import { addBrowserHelper, listBrowserHelpers } from '../tui/browser-workbench.js'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'

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

const WORKBENCH_DIR = join(cwd(), '.agents/workbench/browser')

function cleanWorkbench() {
  try {
    rmSync(WORKBENCH_DIR, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

function ensureWorkbench() {
  mkdirSync(WORKBENCH_DIR, { recursive: true })
}

describe('BrowserWorkbench', () => {
  beforeEach(() => {
    cleanWorkbench()
  })
  afterEach(() => {
    cleanWorkbench()
  })

  it('lista helpers vazia quando nao ha arquivos', () => {
    const helpers = listBrowserHelpers()
    expect(helpers).toHaveLength(0)
  })

  it('adiciona helper valido', () => {
    const result = addBrowserHelper('click_login', 'click_at_xy(100, 200)')
    expect(result.ok).toBe(true)
    const helpers = listBrowserHelpers()
    expect(helpers).toHaveLength(1)
    expect(helpers[0].name).toBe('click_login')
    expect(helpers[0].source).toContain('click_at_xy')
  })

  it('rejeita helper com nome invalido', () => {
    const result = addBrowserHelper('Click Login', 'click_at_xy(100, 200)')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Invalid helper name')
  })

  it('rejeita helper com codigo muito grande', () => {
    const result = addBrowserHelper('big', 'x'.repeat(5000))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('4096')
  })

  it('bloqueia helper com API proibida fs', () => {
    const result = addBrowserHelper('bad', 'import fs; fs.readFileSync("/etc/passwd")')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('forbidden')
  })

  it('bloqueia helper com child_process', () => {
    const result = addBrowserHelper('bad2', 'child_process.execSync("rm -rf /")')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('forbidden')
  })

  it('bloqueia helper com process.exit', () => {
    const result = addBrowserHelper('bad3', 'process.exit(1)')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('forbidden')
  })

  it('bloqueia helper com require', () => {
    const result = addBrowserHelper('bad4', 'require("child_process")')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('forbidden')
  })
})

describe('BrowserHandler — helpers', () => {
  const ctx = {
    store: {} as any,
    dir: '/tmp',
    testCmd: 'npm test',
    ledger: {} as any,
    onProgress: vi.fn(),
  }

  beforeEach(() => {
    cleanWorkbench()
  })
  afterEach(() => {
    cleanWorkbench()
  })

  it('/browser helpers list exibe lista', async () => {
    ensureWorkbench()
    writeFileSync(join(WORKBENCH_DIR, 'click_login.py'), 'click_at_xy(100, 200)')

    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('helpers list', ctx as any)

    expect(result).toContain('click_login')
  })

  it('/browser helpers list sem helpers exibe msg', async () => {
    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('helpers list', ctx as any)

    expect(result).toContain('Nenhum helper')
  })

  it('/browser helpers show <name> exibe source code', async () => {
    ensureWorkbench()
    writeFileSync(join(WORKBENCH_DIR, 'my_helper.py'), 'goto_url("https://example.com")')

    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('helpers show my_helper', ctx as any)

    expect(result).toContain('my_helper')
    expect(result).toContain('goto_url')
  })

  it('/browser helpers show nome inexistente retorna erro', async () => {
    const bridge = makeMockBridge()
    const { BrowserHandler } = await importHandler()
    const handler = new BrowserHandler(bridge)
    const result = await handler.execute('helpers show nonexistent', ctx as any)

    expect(result).toContain('nao encontrado')
  })
})
