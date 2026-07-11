/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../../core/utils/logger.js'
import type { BrowserActions } from './actions/index.js'

const log = createLogger({ layer: 'core', source: 'plugins/browser/plugin.ts' })

/** Describes a single MCP browser tool: name, description, schema, and async handler. */
export interface ToolHandler {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler(input: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string }> }>
}

export type BrowserToolHandlers = Record<string, ToolHandler>

export interface BrowserPluginConfig {
  actions: BrowserActions
}

/**
 * Populate `handlers` with all 13 browser MCP tools (navigate, click, type, …).
 * Each tool delegates to the matching entry already registered in `handlers`.
 */
export function registerBrowserTools(handlers: BrowserToolHandlers): void {
  const tools: ToolHandler[] = [
    {
      name: 'browser_navigate',
      description: 'Navigate to a URL',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string' }, new_tab: { type: 'boolean' }, wait_for_load: { type: 'boolean' } },
      },
      async handler(input) {
        const result = await handlers['navigate']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_click',
      description: 'Click at viewport coordinates',
      inputSchema: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string' } },
      },
      async handler(input) {
        const result = await handlers['click']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_type',
      description: 'Type text into the focused element',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      async handler(input) {
        const result = await handlers['type']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_press_key',
      description: 'Press a keyboard key',
      inputSchema: { type: 'object', properties: { key: { type: 'string' }, modifiers: { type: 'integer' } } },
      async handler(input) {
        const result = await handlers['press_key']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_screenshot',
      description: 'Capture page screenshot as PNG',
      inputSchema: { type: 'object', properties: { full: { type: 'boolean' } } },
      async handler(input) {
        const result = await handlers['screenshot']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_js_eval',
      description: 'Evaluate JavaScript expression',
      inputSchema: { type: 'object', properties: { expression: { type: 'string' } } },
      async handler(input) {
        const result = await handlers['js_eval']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_page_info',
      description: 'Get page URL, title, viewport details',
      inputSchema: { type: 'object', properties: {} },
      async handler(input) {
        const result = await handlers['page_info']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_get_cookies',
      description: 'Get browser cookies',
      inputSchema: { type: 'object', properties: { urls: { type: 'array', items: { type: 'string' } } } },
      async handler(input) {
        const result = await handlers['get_cookies']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_set_cookie',
      description: 'Set a browser cookie',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
          domain: { type: 'string' },
          path: { type: 'string' },
          secure: { type: 'boolean' },
          httpOnly: { type: 'boolean' },
        },
      },
      async handler(input) {
        const result = await handlers['set_cookie']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_clear_cookies',
      description: 'Clear all browser cookies',
      inputSchema: { type: 'object', properties: {} },
      async handler(input) {
        const result = await handlers['clear_cookies']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_auth_state',
      description: 'Export or restore authentication state',
      inputSchema: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['get', 'set'] }, state: { type: 'string' } },
      },
      async handler(input) {
        const result = await handlers['auth_state']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_network_log',
      description: 'Get buffered network events',
      inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } },
      async handler(input) {
        const result = await handlers['network_log']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
    {
      name: 'browser_console_messages',
      description: 'Get buffered console messages',
      inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } },
      async handler(input) {
        const result = await handlers['console_messages']?.handler(input)
        return result ?? { content: [{ type: 'text', text: 'handler not registered' }] }
      },
    },
  ]

  log.info('Registering browser tools', { count: tools.length })
  for (const tool of tools) {
    handlers[tool.name] = tool
  }
}
