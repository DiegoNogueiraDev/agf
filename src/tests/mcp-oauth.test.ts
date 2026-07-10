import { describe, it, expect } from 'vitest'
import { McpClient } from '../core/mcp/mcp-client.js'

describe('McpClient OAuth — refinements', () => {
  it('discoverAuthMetadata faz fetch do .well-known', async () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:1/mcp' })
    await expect(client.discoverAuthMetadata()).rejects.toThrow()
  })

  it('generateAuthUrl produz URL com todos parametros', () => {
    const client = new McpClient({
      name: 'test',
      url: 'http://localhost:3000/mcp',
      clientId: 'my-app',
      scopes: ['read', 'write'],
    })
    const url = client.generateAuthUrl()
    expect(url).toContain('response_type=code')
    expect(url).toContain('client_id=my-app')
    expect(url).toContain('scope=read+write')
    expect(url).toContain('state=')
  })

  it('verifyState rejeita state invalido', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    client.generateAuthUrl()
    const state = client.getStateForAuth()
    expect(client.verifyState(state)).toBe(true)
    expect(client.verifyState('')).toBe(false)
    expect(client.verifyState('evil')).toBe(false)
  })

  it('auth flow muda estado para connected apos token', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    expect(client.getState()).toBe('disconnected')
    client.setToken({ accessToken: 'tok', tokenType: 'bearer', expiresAt: Date.now() + 3600000 })
    expect(client.getState()).toBe('connected')
  })

  it('needsAuth retorna true sem token', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    expect(client.needsAuth()).toBe(true)
  })

  it('needsAuth retorna false com token valido', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    client.setToken({ accessToken: 'v', tokenType: 'bearer', expiresAt: Date.now() + 3600000 })
    expect(client.needsAuth()).toBe(false)
  })

  it('needsAuth retorna true com token expirado', () => {
    const client = new McpClient({ name: 'test', url: 'http://localhost:3000/mcp' })
    client.setToken({ accessToken: 'v', tokenType: 'bearer', expiresAt: Date.now() - 1000 })
    expect(client.needsAuth()).toBe(true)
  })
})
