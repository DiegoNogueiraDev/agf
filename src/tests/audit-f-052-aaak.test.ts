/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-052 [LOW, LATENT]: AAAK compressKey is non-injective (2-char prefixes
 * collide; last-write-wins in the reverse map loses an original) and joins with
 * a dead `tokens.every(() => …)` callback that ignores its parameter. Fix:
 * longer (3-char) key segments, a simplified separator expression, and
 * collision disambiguation in compressIndex so the reverse map stays bijective.
 */
import { describe, it, expect } from 'vitest'
import { compressKey, compressIndex } from '../core/economy/aaak-compressor.js'

describe('AUDIT-052: AAAK index reverse map is injective (no lost original)', () => {
  it('two keys that collide under compressKey both round-trip through the index', () => {
    // 'config_test' and 'control_testing' abbreviate to the same prefix form.
    const idx = compressIndex([
      { key: 'config_test', content: 'a' },
      { key: 'control_testing', content: 'b' },
    ])
    const recovered = idx.entries.map((e) => idx.decompress(e.compressedKey))
    expect(recovered).toContain('config_test')
    expect(recovered).toContain('control_testing')
    // distinct compressed keys → the reverse map maps each back uniquely
    expect(new Set(idx.entries.map((e) => e.compressedKey)).size).toBe(2)
  })

  it('preserves the separator (callback simplification keeps behavior)', () => {
    expect(compressKey('user_auth_token')).toContain('_')
    expect(compressKey('user-auth-token')).toContain('-')
  })

  it('identical keys are not spuriously disambiguated', () => {
    const idx = compressIndex([
      { key: 'same_key_here', content: '1' },
      { key: 'same_key_here', content: '2' },
    ])
    for (const e of idx.entries) expect(idx.decompress(e.compressedKey)).toBe('same_key_here')
  })
})
