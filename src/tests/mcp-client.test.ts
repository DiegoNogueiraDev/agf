import { describe, it, expect, vi } from 'vitest'
import { McpClient, type McpAuthToken, openBrowserSafe } from '../core/mcp/mcp-client.js'
import { createTransport, type Transport } from '../core/mcp/mcp-transport.js'
import { McpToolRegistry } from '../core/mcp/mcp-tool-sync.js'

describe('McpClient — OAuth', () => {
  it('inicia com estado disconnected', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    expect(client.getState()).toBe('disconnected')
  })

  it('auth token storage e recovery', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    client.setToken({ accessToken: 'abc123', tokenType: 'bearer', expiresAt: Date.now() + 3600000 })
    expect(client.getToken()?.accessToken).toBe('abc123')
  })

  it('needsAuth quando nao ha token', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    expect(client.needsAuth()).toBe(true)
  })

  it('needsAuth false quando token valido existe', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    client.setToken({ accessToken: 'valid', tokenType: 'bearer', expiresAt: Date.now() + 3600000 })
    expect(client.needsAuth()).toBe(false)
  })

  it('generateAuthUrl produz URL com state e client_id', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp', clientId: 'my-client' })
    const url = client.generateAuthUrl()
    expect(url).toContain('my-client')
    expect(url).toContain('state=')
    expect(url).toContain('response_type=code')
  })

  it('verifyState valida CSRF state', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    client.generateAuthUrl()
    const state = client.getStateForAuth()
    expect(client.verifyState(state)).toBe(true)
    expect(client.verifyState('wrong')).toBe(false)
  })
})

describe('McpTransport — fallback de transporte', () => {
  it('stdio transport usa comando e args do config', () => {
    const t = createTransport({ name: 't', command: 'node', args: ['server.js'] })
    expect(t.type).toBe('stdio')
  })

  it('http transport usa url do config', () => {
    const t = createTransport({ name: 't', url: 'http://localhost:8080/mcp' })
    expect(t.type).toBe('streamable-http')
  })
})

// ── Security: CWE-78 openBrowserSafe URL validation ───────────────────────────

describe('openBrowserSafe — CWE-78 injection prevention', () => {
  it('does not invoke spawner for url with shell metacharacter (AC1)', () => {
    const spawner = vi.fn()
    openBrowserSafe('http://localhost/"$(whoami)', { spawn: spawner })
    // url contains quote — rejected or passed as-is to execFileSync (no shell)
    // The spawner MUST NOT be called with extra args resulting from shell expansion
    // Since execFileSync is used, any attempt would be literal — validate it rejects
    expect(spawner).not.toHaveBeenCalled()
  })

  it('accepts http URL and calls spawner with [url] as arg array (AC2)', () => {
    const spawner = vi.fn()
    openBrowserSafe('http://localhost:3000/dashboard', { spawn: spawner })
    expect(spawner).toHaveBeenCalledOnce()
    expect(spawner).toHaveBeenCalledWith(expect.stringMatching(/^(open|xdg-open|start)$/), [
      'http://localhost:3000/dashboard',
    ])
  })

  it('accepts https URL and calls spawner (AC2)', () => {
    const spawner = vi.fn()
    openBrowserSafe('https://example.com/auth', { spawn: spawner })
    expect(spawner).toHaveBeenCalledOnce()
  })

  it('rejects non-http protocol and does not call spawner (AC3)', () => {
    const spawner = vi.fn()
    openBrowserSafe('file:///etc/passwd', { spawn: spawner })
    expect(spawner).not.toHaveBeenCalled()
  })

  it('rejects javascript: protocol (AC3)', () => {
    const spawner = vi.fn()
    openBrowserSafe('javascript:alert(1)', { spawn: spawner })
    expect(spawner).not.toHaveBeenCalled()
  })
})

describe('McpToolRegistry — sync de ferramentas MCP', () => {
  it('compoe tools a partir de definicoes', () => {
    const reg = new McpToolRegistry()
    reg.setFromServer([
      { name: 'read', description: 'Read a file', inputSchema: { type: 'object' } },
      { name: 'write', description: 'Write a file' },
    ])
    expect(reg.count).toBe(2)
    expect(reg.all[0].name).toBe('read')
  })

  it('schema invalido e degradado graciosamente', () => {
    const reg = new McpToolRegistry()
    const circular: Record<string, unknown> = { type: 'object' }
    circular.self = circular
    reg.setFromServer([{ name: 'bad', inputSchema: circular }])
    expect(reg.all[0].inputSchema).toBeDefined()
    expect(reg.all[0].inputSchema!['description']).toBe('schema unavailable')
  })

  it('onChanged notifica listeners', () => {
    const reg = new McpToolRegistry()
    let notified: unknown[] = []
    reg.onChanged((tools) => {
      notified = tools
    })
    reg.setFromServer([{ name: 'test' }])
    expect(notified).toHaveLength(1)
  })
})
