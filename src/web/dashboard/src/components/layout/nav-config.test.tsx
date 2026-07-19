/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * nav-config — the dashboard ships exactly three tabs: Graph, Colony, Economy.
 */

import { describe, it, expect } from 'vitest'
import { Network, LayoutDashboard } from 'lucide-react'
import * as mod from './nav-config'

describe('nav-config', () => {
  it('module imports without throwing', () => {
    expect(mod).toBeDefined()
  })

  it('NAV_ITEMS contains exactly the graph + colony + economy + certainty tabs', () => {
    const ids = mod.NAV_ITEMS.map((item) => item.id).sort()
    expect(ids).toEqual(['certainty', 'colony', 'economy', 'graph'])
  })

  it("the graph tab is labeled 'Graph' with Network icon, keeping id 'graph'", () => {
    const graphTab = mod.NAV_ITEMS.find((item) => item.id === 'graph')
    expect(graphTab?.label).toBe('Graph')
    expect(graphTab?.icon).toBe(Network)
  })

  it("the colony tab is labeled 'Colony' with LayoutDashboard icon", () => {
    const colonyTab = mod.NAV_ITEMS.find((item) => item.id === 'colony')
    expect(colonyTab?.label).toBe('Colony')
    expect(colonyTab?.icon).toBe(LayoutDashboard)
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
    expect(mod.NAV_GROUPS[0].items.map((i) => i.id).sort()).toEqual(['certainty', 'colony', 'economy', 'graph'])
  })
})
