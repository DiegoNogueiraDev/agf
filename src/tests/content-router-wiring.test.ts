/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Integration: content-router + aaak-compressor cablados no caminho real.
 */
import { describe, it, expect } from 'vitest'
import { routeContent } from '../core/economy/content-router.js'
import { compressIndex, type IndexEntry } from '../core/economy/aaak-compressor.js'
import { ECONOMY_PIPELINE_ORDER } from '../core/economy/economy-pipeline.js'

describe('content-router — roteia tool-output por tipo', () => {
  it('detecta e roteia código', () => {
    const code = 'export function foo() { return 1 }'
    const result = routeContent(code)
    expect(result.contentType).toBe('code')
    expect(typeof result.output).toBe('string')
  })

  it('detecta e roteia texto', () => {
    const text = 'hello world'
    const result = routeContent(text)
    expect(result.contentType).toBe('text')
    expect(typeof result.output).toBe('string')
  })

  it('detecta json e aplica json-summarizer', () => {
    const largeJson = JSON.stringify({ items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` })) })
    const result = routeContent(largeJson)
    expect(result.contentType).toBe('json')
    expect(result.compressor).toBe('json-summarizer')
    expect(result.saved).toBeGreaterThan(0)
  })

  it('detecta log e aplica dedup', () => {
    const logText = '[2024-01-01] INFO: server started\n[2024-01-01] INFO: server started\n[2024-01-01] ERROR: crash'
    const result = routeContent(logText)
    expect(result.contentType).toBe('log')
    expect(result.compressor).toBe('dedup-log')
    expect(result.saved).toBeGreaterThan(0)
  })
})

describe('content-router bypass', () => {
  it('routeContentBypass retorna original sem compressão', async () => {
    const { routeContentBypass } = await import('../core/economy/content-router.js')
    const text = 'some content'
    const result = routeContentBypass(text)
    expect(result.output).toBe(text)
    expect(result.saved).toBe(0)
  })
})

describe('aaak-compressor — comprime índices de memória', () => {
  it('comprime chaves longas', () => {
    const entries: IndexEntry[] = [
      { key: 'very_long_function_name_handler', content: 'fn() {}' },
      { key: 'another_long_key_with_many_tokens', content: 'data' },
    ]
    const result = compressIndex(entries)
    expect(result.entries.length).toBe(2)
    expect(result.compressionRatio).toBeGreaterThan(0)
    for (const entry of result.entries) {
      expect(entry.compressedKey.length).toBeLessThan(entry.originalKey.length)
    }
  })

  it('decompress retorna chave original', () => {
    const entries: IndexEntry[] = [{ key: 'my_long_key_name', content: 'value' }]
    const result = compressIndex(entries)
    const decompressed = result.decompress(result.entries[0].compressedKey)
    expect(decompressed).toBe('my_long_key_name')
  })

  it('chave curta não é comprimida', () => {
    const entries: IndexEntry[] = [{ key: 'ab', content: 'value' }]
    const result = compressIndex(entries)
    expect(result.entries[0].compressedKey).toBe('ab')
    expect(result.compressionRatio).toBe(0)
  })
})

describe('economy pipeline — content-router stage', () => {
  it('content-router está na ordem canônica', () => {
    expect(ECONOMY_PIPELINE_ORDER.includes('content-router')).toBe(true)
    expect(ECONOMY_PIPELINE_ORDER.indexOf('content-router')).toBeGreaterThan(ECONOMY_PIPELINE_ORDER.indexOf('compress'))
    expect(ECONOMY_PIPELINE_ORDER.indexOf('content-router')).toBeLessThan(
      ECONOMY_PIPELINE_ORDER.indexOf('caveman-input'),
    )
  })

  it('economy-orchestrator exporta createEconomyMiddleware com content-router', async () => {
    const { createEconomyMiddleware } = await import('../core/economy/economy-orchestrator.js')
    const middleware = createEconomyMiddleware({})
    expect(typeof middleware).toBe('function')
  })
})
