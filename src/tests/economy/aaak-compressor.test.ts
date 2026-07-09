/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { compressKey, decompressKey, compressIndex, searchCompressedIndex } from '../../core/economy/aaak-compressor.js'
import type { IndexEntry } from '../../core/economy/aaak-compressor.js'

describe('aaak-compressor — compressKey/decompressKey', () => {
  it('compressKey reduz chaves longas', () => {
    const key = 'getUserProfile_very_long_function_name_12345'
    const compressed = compressKey(key)
    expect(compressed.length).toBeLessThan(key.length)
  })

  it('compressKey é determinística', () => {
    const key = 'testFunction'
    expect(compressKey(key)).toBe(compressKey(key))
  })

  it('compressKey mantém chaves curtas', () => {
    const key = 'a'
    const compressed = compressKey(key)
    expect(typeof compressed).toBe('string')
    expect(compressed.length).toBeGreaterThan(0)
  })
})

describe('aaak-compressor — compressIndex', () => {
  it('comprime um array de index entries', () => {
    const entries: IndexEntry[] = [
      { key: 'getUser', content: 'user data' },
      { key: 'setUser', content: 'set user data' },
    ]
    const result = compressIndex(entries)
    expect(result).toHaveProperty('entries')
    expect(result).toHaveProperty('compressionRatio')
    expect(result.entries.length).toBe(2)
  })
})

describe('aaak-compressor — searchCompressedIndex', () => {
  it('retorna resultados que casam com o termo', () => {
    const entries: IndexEntry[] = [
      { key: 'getUserData', content: 'returns user profile' },
      { key: 'setUserName', content: 'updates user name' },
      { key: 'deleteRecord', content: 'deletes a record' },
    ]
    const compressed = compressIndex(entries)
    const results = searchCompressedIndex(compressed, 'User')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('retorna vazio quando não há match', () => {
    const entries: IndexEntry[] = [{ key: 'foo', content: 'bar' }]
    const compressed = compressIndex(entries)
    const results = searchCompressedIndex(compressed, 'nonexistent')
    expect(results.length).toBe(0)
  })
})
