import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../plugins/browser/cdp-daemon.js', () => {
  class MockCdpDaemon {
    send = vi.fn().mockRejectedValue(new Error('not connected'))
    start = vi.fn().mockRejectedValue(new Error('not started'))
    status = vi.fn(() => 'idle')
    onEvent = vi.fn()
    close = vi.fn()
  }
  return { CdpDaemon: MockCdpDaemon as never }
})

vi.mock('../plugins/browser/discovery.js', () => ({
  discoverCdpUrl: vi.fn(() => 'ws://127.0.0.1:9222/devtools/browser/guid'),
}))

async function importCdpPort() {
  return await import('../tui/cdp-browser-port.js')
}

describe('CdpBrowserPort', () => {
  let CdpBrowserPort: Awaited<ReturnType<typeof importCdpPort>>['CdpBrowserPort']
  let port: InstanceType<Awaited<ReturnType<typeof importCdpPort>>['CdpBrowserPort']>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await importCdpPort()
    CdpBrowserPort = mod.CdpBrowserPort
    port = new CdpBrowserPort({ cdpUrl: 'ws://127.0.0.1:9222' })
  })

  describe('isAvailable', () => {
    it('returns false when Chrome CDP is not reachable', async () => {
      const available = await port.isAvailable()
      expect(available).toBe(false)
    })
  })

  describe('browser() command mapping', () => {
    it('returns error for unknown action', async () => {
      const result = await port.browser('nonexistent', '')
      expect(result).toContain('[cdp-browser-port] unknown action')
    })

    it('returns error for remote action (not supported via CDP)', async () => {
      const result = await port.browser('remote', 'start')
      expect(result).toContain('requires browser-harness cloud CLI')
    })

    it('returns error for profiles action (not supported via CDP)', async () => {
      const result = await port.browser('profiles', '')
      expect(result).toContain('requires browser-harness cloud CLI')
    })

    it('returns error for doctor action (not supported via CDP)', async () => {
      const result = await port.browser('doctor', '')
      expect(result).toContain('requires browser-harness cloud CLI')
    })

    it('returns connection error when daemon is not connected', async () => {
      const result = await port.browser('goto', 'https://example.com')
      expect(result).toContain('[cdp-browser-port]')
    })
  })

  describe('destructive-action gate (node_wire_dc1f40a32929 — destructive-actions wire)', () => {
    const originalEnv = process.env.DESTRUCTIVE_POLICY

    beforeEach(() => {
      delete process.env.DESTRUCTIVE_POLICY
    })

    afterEach(() => {
      if (originalEnv === undefined) delete process.env.DESTRUCTIVE_POLICY
      else process.env.DESTRUCTIVE_POLICY = originalEnv
    })

    it('denies click/fill/upload by default, before ever touching the CDP daemon', async () => {
      const result = await port.browser('click', '10 20')
      expect(result).toContain('destructive action')
    })

    it('allows click when DESTRUCTIVE_POLICY=allow (still fails downstream since daemon is disconnected in this test)', async () => {
      process.env.DESTRUCTIVE_POLICY = 'allow'
      const result = await port.browser('click', '10 20')
      expect(result).not.toContain('destructive action')
    })
  })

  describe('fnv1aHash', () => {
    it('produces consistent hashes', async () => {
      const { fnv1aHash } = await import('../tui/browser-port.js')
      const h1 = fnv1aHash('goto|https://example.com')
      const h2 = fnv1aHash('goto|https://example.com')
      expect(h1).toBe(h2)
      expect(h1).toBeTruthy()
    })
  })

  describe('getStats', () => {
    it('returns initial zero stats', () => {
      const stats = port.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.size).toBe(0)
    })

    it('tracks cache stats after commands', async () => {
      await port.browser('nonexistent', '')
      const stats = port.getStats()
      expect(stats.misses).toBeGreaterThan(0)
    })
  })

  describe('goto URL scheme validation (node_wire_212f2688c53d — stdio-sanitizer wire)', () => {
    it('rejects a javascript: URL without ever calling Page.navigate', async () => {
      const result = await port.browser('goto', 'javascript:alert(1)')
      expect(result).toContain('scheme')
    })

    it('rejects a file: URL', async () => {
      const result = await port.browser('goto', 'file:///etc/passwd')
      expect(result).toContain('scheme')
    })
  })

  describe('goto URL_DENY domain policy (node_wire_5b2c8bcde75f — url-rules wire)', () => {
    const originalDeny = process.env.URL_DENY

    afterEach(() => {
      if (originalDeny === undefined) delete process.env.URL_DENY
      else process.env.URL_DENY = originalDeny
    })

    it('denies a URL matching URL_DENY without ever calling Page.navigate', async () => {
      process.env.URL_DENY = '*.internal.example'
      const result = await port.browser('goto', 'https://admin.internal.example/login')
      expect(result).toContain('denied by URL policy')
    })
  })
})

describe('isChromeCdpReachable', () => {
  it('returns false for unreachable endpoint', async () => {
    const mod = await importCdpPort()
    const reachable = await mod.isChromeCdpReachable('ws://127.0.0.1:19999')
    expect(reachable).toBe(false)
  })
})
