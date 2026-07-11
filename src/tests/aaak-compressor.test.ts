/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import {
  compressKey,
  compressIndex,
  decompressKey,
  searchCompressedIndex,
  type IndexEntry,
  type CompressedIndex,
} from '../core/economy/aaak-compressor.js'

describe('compressKey', () => {
  it('shortens a key by keeping first 2 chars of each word', () => {
    const result = compressKey('project_initialization')
    expect(result.length).toBeLessThan('project_initialization'.length)
    expect(result).toContain('pr')
    expect(result).toContain('in')
  })

  it('preserves numeric suffixes', () => {
    const result = compressKey('config_v3')
    expect(result).toContain('v3')
  })

  it('handles short keys without compression', () => {
    expect(compressKey('hi')).toBe('hi')
  })

  it('preserves word separators', () => {
    const result = compressKey('user-auth-token')
    expect(result).toContain('-')
  })

  it('produces deterministic output', () => {
    const a = compressKey('memory_allocation_strategy')
    const b = compressKey('memory_allocation_strategy')
    expect(a).toBe(b)
  })

  it('reduces key length by at least 30% for multi-word keys', () => {
    const original = 'database_connection_pool_configuration'
    const compressed = compressKey(original)
    expect(compressed.length).toBeLessThan(original.length * 0.7)
  })
})

describe('compressIndex', () => {
  const entries: IndexEntry[] = [
    { key: 'user_profile_setup', content: 'user profile setup flow' },
    { key: 'database_connection', content: 'database connection details' },
    { key: 'auth_token_validation', content: 'auth token validation logic' },
    { key: 'cache_warming_strategy', content: 'predictive cache warming' },
    { key: 'error_handling_middleware', content: 'error handling middleware' },
  ]

  it('compresses all keys in the index', () => {
    const result = compressIndex(entries)
    expect(result.entries).toHaveLength(5)
    for (const entry of result.entries) {
      expect(entry.originalKey.length).toBeGreaterThan(entry.compressedKey.length)
    }
  })

  it('preserves original content verbatim', () => {
    const result = compressIndex(entries)
    for (const entry of result.entries) {
      expect(entry.content).toBe(entries.find((e) => e.key === entry.originalKey)!.content)
    }
  })

  it('provides decompression map', () => {
    const result = compressIndex(entries)
    expect(result.decompress).toBeDefined()
    for (const entry of result.entries) {
      expect(result.decompress(entry.compressedKey)).toBe(entry.originalKey)
    }
  })

  it('tracks compression ratio', () => {
    const result = compressIndex(entries)
    expect(result.compressionRatio).toBeGreaterThan(0)
    expect(result.compressionRatio).toBeLessThan(1)
    expect(result.originalSize).toBeGreaterThan(result.compressedSize)
  })
})

describe('decompressKey', () => {
  it('returns original key from compressed', () => {
    const compressed = compressKey('memory_cache_invalidation')
    const original = decompressKey(compressed, new Map([[compressed, 'memory_cache_invalidation']]))
    expect(original).toBe('memory_cache_invalidation')
  })

  it('returns undefined for unknown compressed key', () => {
    expect(decompressKey('unknown', new Map())).toBeUndefined()
  })
})

describe('searchCompressedIndex', () => {
  const entries: IndexEntry[] = [
    { key: 'user_authentication_service', content: 'handles user login and registration' },
    { key: 'database_migration_tool', content: 'schema migration utilities' },
    { key: 'api_rate_limiter', content: 'rate limiting for API endpoints' },
    { key: 'cache_invalidation_strategy', content: 'cache invalidation patterns' },
    { key: 'error_tracking_service', content: 'error monitoring and alerting' },
    { key: 'config_management_system', content: 'configuration loading and validation' },
    { key: 'logging_framework_adapter', content: 'structured logging wrapper' },
  ]

  it('finds exact match in compressed index (R@5≥95% simulation)', () => {
    const compressed = compressIndex(entries)
    const results = searchCompressedIndex(compressed, 'cache_invalidation_strategy')
    expect(results).toHaveLength(1)
    expect(results[0].originalKey).toBe('cache_invalidation_strategy')
  })

  it('finds partial matches', () => {
    const compressed = compressIndex(entries)
    const results = searchCompressedIndex(compressed, 'auth')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.originalKey.includes('auth'))).toBe(true)
  })

  it('returns empty for non-matching query', () => {
    const compressed = compressIndex(entries)
    const results = searchCompressedIndex(compressed, 'zzzzz')
    expect(results).toHaveLength(0)
  })

  it('recall@5 is 1.0 for all exact queries', () => {
    const compressed = compressIndex(entries)
    for (const entry of entries) {
      const results = searchCompressedIndex(compressed, entry.key, 5)
      const found = results.some((r) => r.originalKey === entry.key)
      expect(found).toBe(true)
    }
  })
})
