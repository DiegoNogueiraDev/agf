/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * nav-config — the dashboard ships exactly two tabs: Graph and Economy.
 */

import { describe, it, expect } from 'vitest'
import * as mod from './nav-config'

describe('nav-config', () => {
  it('module imports without throwing', () => {
    expect(mod).toBeDefined()
  })

  it('NAV_ITEMS contains exactly the graph + economy tabs', () => {
    const ids = mod.NAV_ITEMS.map((item) => item.id).sort()
    expect(ids).toEqual(['economy', 'graph'])
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
    expect(mod.NAV_GROUPS[0].items.map((i) => i.id).sort()).toEqual(['economy', 'graph'])
  })
})
