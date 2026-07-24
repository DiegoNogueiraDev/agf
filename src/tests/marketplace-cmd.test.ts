/*!
 * Task node_3a216c629257 — agf marketplace CLI.
 *
 * AC1: marketplace list → sources and available items listed in envelope.
 * AC2: marketplace install <item> → item installed; appears in skills/plugins dir.
 * AC3: marketplace upgrade <source> → re-pulls and re-indexes.
 *
 * Tests use a stub MarketplaceStore (no real git, no disk writes).
 */

import { describe, it, expect } from 'vitest'
import { buildMarketplaceEnvelope } from '../core/marketplace/marketplace-cli.js'
import type { MarketplaceItem, MarketplaceSource } from '../core/marketplace/types.js'

const SRC: MarketplaceSource = { id: 'test-src', url: 'file:///tmp/fake', cacheDir: '/tmp/fake' }
const ITEM: MarketplaceItem = {
  id: 'my-skill',
  kind: 'skill',
  sourceId: 'test-src',
  manifestPath: '/tmp/fake/my-skill/SKILL.md',
  version: '1.0.0',
}

describe('buildMarketplaceEnvelope', () => {
  it('list action returns sources and items (AC1)', () => {
    const result = buildMarketplaceEnvelope('list', {
      getSources: () => [SRC],
      getItems: () => [ITEM],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.sources.length).toBe(1)
      expect(result.data.items.length).toBe(1)
      expect(result.data.items[0].id).toBe('my-skill')
    }
  })

  it('list with no sources returns empty arrays', () => {
    const result = buildMarketplaceEnvelope('list', {
      getSources: () => [],
      getItems: () => [],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.sources).toEqual([])
      expect(result.data.items).toEqual([])
    }
  })
})
