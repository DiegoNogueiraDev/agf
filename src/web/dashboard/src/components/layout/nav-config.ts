/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * nav-config — the dashboard navigation model, pruned to the two surfaces this
 * build ships: Graph (live project graph) and Economy (token/cost ledger).
 *
 * WHY only two: this dashboard is the focused web surface for agent-graph-flow —
 * the graph is the source of truth and the economy is the 3rd pillar. Other tabs
 * from the upstream mcp-graph dashboard are intentionally not wired here. To add
 * a tab: extend TabId + NAV_GROUPS and add the lazy import in app/App.tsx.
 */

import { Network, Coins, LayoutDashboard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type TabId = 'graph' | 'economy' | 'colony'

export type NavGroupId = 'visualization'

export interface NavItem {
  id: TabId
  label: string
  icon: LucideIcon
  beta?: boolean
}

export interface NavGroup {
  id: NavGroupId
  label: string
  icon: LucideIcon
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'visualization',
    label: 'Visualize',
    icon: LayoutDashboard,
    items: [
      // Label 'Colony' (identidade da colônia) sobre o MESMO id 'graph' —
      // renomear o TabId quebraria URL/localStorage/testes (node_d2a19b8c8915).
      { id: 'graph', label: 'Graph', icon: Network },
      { id: 'colony', label: 'Colony', icon: LayoutDashboard },
      { id: 'economy', label: 'Economy', icon: Coins },
    ],
  },
]

/** Flat array derived from NAV_GROUPS — backward compat with existing code */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)
