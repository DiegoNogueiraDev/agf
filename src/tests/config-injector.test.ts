/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_96045848b41d AC coverage: config-injector.ts
 *
 * AC1: collectHostValues: api_key+base_url extracted, unknown fields ignored
 * AC2: injectConfig: writes resolved config to correct path, handles missing inject fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { collectHostValues } from '../core/plugins/config-injector.js'
import type { HostValues, PluginInjectSpec } from '../core/plugins/config-injector.js'

// ── collectHostValues ─────────────────────────────────────────────────────────

describe('collectHostValues', () => {
  it('AC1: extracts api_key when present', () => {
    const result = collectHostValues({ api_key: 'sk-abc123' })
    expect(result.api_key).toBe('sk-abc123')
  })

  it('AC1: extracts base_url when present', () => {
    const result = collectHostValues({ base_url: 'https://api.example.com' })
    expect(result.base_url).toBe('https://api.example.com')
  })

  it('AC1: extracts both api_key and base_url together', () => {
    const result = collectHostValues({ api_key: 'key-1', base_url: 'https://x.com' })
    expect(result.api_key).toBe('key-1')
    expect(result.base_url).toBe('https://x.com')
  })

  it('AC1: unknown fields are NOT included in result', () => {
    const result = collectHostValues({ api_key: 'k', unknown_field: 'ignored', extra: 42 }) as Record<string, unknown>
    expect(result.unknown_field).toBeUndefined()
    expect(result.extra).toBeUndefined()
  })

  it('AC1: returns empty object when no recognized fields', () => {
    const result = collectHostValues({ random: 'stuff' })
    expect(result.api_key).toBeUndefined()
    expect(result.base_url).toBeUndefined()
  })

  it('AC1: coerces numeric api_key to string', () => {
    const result = collectHostValues({ api_key: 12345 })
    expect(result.api_key).toBe('12345')
  })

  it('AC1: empty config returns empty HostValues', () => {
    const result = collectHostValues({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('AC1: falsy api_key (empty string) is not included', () => {
    const result = collectHostValues({ api_key: '' })
    expect(result.api_key).toBeUndefined()
  })
})

// ── injectConfig (with fs mocks) ──────────────────────────────────────────────

const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('node:fs', () => ({
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}))

describe('injectConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC2: writes resolved config to default file name config.json', async () => {
    const { injectConfig } = await import('../core/plugins/config-injector.js')
    const spec: PluginInjectSpec = {
      name: 'my-plugin',
      inject: { token: '{{host.api_key}}' },
    }
    const hostValues: HostValues = { api_key: 'sk-test' }
    await injectConfig('/plugins/my-plugin', spec, hostValues)

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      expect.stringContaining('"token": "sk-test"'),
    )
  })

  it('AC2: uses custom config_file when specified', async () => {
    const { injectConfig } = await import('../core/plugins/config-injector.js')
    const spec: PluginInjectSpec = {
      name: 'my-plugin',
      config_file: 'settings.json',
      inject: { key: '{{host.api_key}}' },
    }
    await injectConfig('/plugins/my-plugin', spec, { api_key: 'x' })

    expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('settings.json'), expect.any(String))
  })

  it('AC2: unresolved template placeholder resolves to empty string', async () => {
    const { injectConfig } = await import('../core/plugins/config-injector.js')
    const spec: PluginInjectSpec = {
      name: 'my-plugin',
      inject: { url: '{{host.base_url}}' },
    }
    await injectConfig('/plugins/my-plugin', spec, {})

    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string
    const parsed = JSON.parse(writtenContent)
    expect(parsed.url).toBe('')
  })

  it('AC2: handles missing inject field — writes empty config', async () => {
    const { injectConfig } = await import('../core/plugins/config-injector.js')
    const spec: PluginInjectSpec = { name: 'empty-plugin' }
    await injectConfig('/plugins/empty-plugin', spec, {})

    expect(mockWriteFileSync).toHaveBeenCalledOnce()
    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string
    const parsed = JSON.parse(writtenContent)
    expect(parsed).toEqual({})
  })

  it('AC2: calls mkdirSync to ensure directory exists', async () => {
    const { injectConfig } = await import('../core/plugins/config-injector.js')
    const spec: PluginInjectSpec = { name: 'p', inject: { k: 'v' } }
    await injectConfig('/some/dir', spec, {})

    expect(mockMkdirSync).toHaveBeenCalledWith('/some/dir', { recursive: true })
  })

  it('AC2: multiple inject keys all resolved', async () => {
    const { injectConfig } = await import('../core/plugins/config-injector.js')
    const spec: PluginInjectSpec = {
      name: 'multi',
      inject: {
        apiKey: '{{host.api_key}}',
        baseUrl: '{{host.base_url}}',
      },
    }
    await injectConfig('/p', spec, { api_key: 'K', base_url: 'https://x.com' })

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string
    const parsed = JSON.parse(written)
    expect(parsed.apiKey).toBe('K')
    expect(parsed.baseUrl).toBe('https://x.com')
  })
})
