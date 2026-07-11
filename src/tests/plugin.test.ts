/*!
 * Tests for src/plugins/browser/plugin.ts
 */
import { describe, it, expect } from 'vitest'
import { registerBrowserTools } from '../plugins/browser/plugin.js'
import type { BrowserToolHandlers } from '../plugins/browser/plugin.js'

describe('registerBrowserTools', () => {
  it('populates handlers with all 13 browser tools', () => {
    const handlers: BrowserToolHandlers = {}
    registerBrowserTools(handlers)
    expect(Object.keys(handlers).filter((k) => k.startsWith('browser_')).length).toBe(13)
  })

  it('registers browser_navigate tool', () => {
    const handlers: BrowserToolHandlers = {}
    registerBrowserTools(handlers)
    expect(handlers['browser_navigate']).toBeDefined()
    expect(handlers['browser_navigate'].name).toBe('browser_navigate')
  })

  it('returns fallback content when backing handler is missing', async () => {
    const handlers: BrowserToolHandlers = {}
    registerBrowserTools(handlers)
    const result = await handlers['browser_navigate'].handler({ url: 'https://example.com' })
    expect(result.content[0].text).toBe('handler not registered')
  })

  it('delegates to registered backing handler', async () => {
    const handlers: BrowserToolHandlers = {
      navigate: {
        name: 'navigate',
        description: 'mock',
        inputSchema: {},
        handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      },
    }
    registerBrowserTools(handlers)
    const result = await handlers['browser_navigate'].handler({ url: 'https://example.com' })
    expect(result.content[0].text).toBe('ok')
  })
})
