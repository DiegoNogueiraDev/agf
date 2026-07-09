/*!
 * marketplace-cli — pure envelope builder for `agf marketplace` actions.
 *
 * WHY: Keeps CLI command thin — all list/install/upgrade logic is testable
 * without a real MarketplaceStore or disk I/O.
 *
 * Composes with: marketplace.ts (MarketplaceStore), marketplace-cmd.ts (CLI).
 */

import type { MarketplaceItem, MarketplaceSource } from './types.js'

export interface MarketplaceListDeps {
  getSources: () => MarketplaceSource[]
  getItems: (sourceId?: string) => MarketplaceItem[]
}

export type MarketplaceEnvelope =
  | { ok: true; data: { sources: MarketplaceSource[]; items: MarketplaceItem[] } }
  | { ok: false; code: string; error: string }

export function buildMarketplaceEnvelope(action: 'list', deps: MarketplaceListDeps): MarketplaceEnvelope {
  if (action === 'list') {
    const sources = deps.getSources()
    const items = sources.flatMap((s) => deps.getItems(s.id))
    return { ok: true, data: { sources, items } }
  }
  return { ok: false, code: 'UNKNOWN_ACTION', error: `Unknown action: ${action}` }
}
