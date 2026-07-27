/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * nav-config — the dashboard ships exactly three tabs: Graph, Colony, Economy.
 */

import { describe, it, expect } from 'vitest'
import { Network } from 'lucide-react'
import * as mod from './nav-config'

describe('nav-config', () => {
  it('module imports without throwing', () => {
    expect(mod).toBeDefined()
  })

  it('NAV_ITEMS contains exactly the colony + economy + certainty + okr tabs', () => {
    const ids = mod.NAV_ITEMS.map((item) => item.id).sort()
    expect(ids).toEqual(['certainty', 'colony', 'economy', 'okr'])
  })

  it("'graph' has no sidebar entry — Colony's Structure sub-tab is the single door (node_5f912ff675bb)", () => {
    // A entrada saiu; o TabId NÃO. URL e localStorage salvos por quem já usa
    // carregam 'graph', e invalidá-lo quebraria links existentes — o que se
    // removeu foi a porta duplicada, não o destino.
    expect(mod.NAV_ITEMS.find((item) => item.id === 'graph')).toBeUndefined()
  })

  it("the colony tab is labeled 'Colony' and carries the graph icon it inherited", () => {
    const colonyTab = mod.NAV_ITEMS.find((item) => item.id === 'colony')
    expect(colonyTab?.label).toBe('Colony')
    // Network porque Colony passou a ser a porta do grafo.
    expect(colonyTab?.icon).toBe(Network)
  })

  it('each nav item has a label and icon', () => {
    for (const item of mod.NAV_ITEMS) {
      expect(item.label).toBeTruthy()
      expect(item.icon).toBeDefined()
    }
  })

  it('groups every item under the visualization group', () => {
    expect(mod.NAV_GROUPS).toHaveLength(1)
    expect(mod.NAV_GROUPS[0].id).toBe('visualization')
    expect(mod.NAV_GROUPS[0].items.map((i) => i.id).sort()).toEqual(['certainty', 'colony', 'economy', 'okr'])
  })
})
