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

import { Network, Coins, LayoutDashboard, ShieldCheck, Target } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type TabId = 'graph' | 'economy' | 'colony' | 'certainty' | 'okr'

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
      // 'graph' NÃO tem entrada própria (node_5f912ff675bb): a sidebar oferecia
      // duas portas para a mesma árvore, já que o sub-tab Structure de Colony a
      // renderiza. O TabId segue válido — URL e localStorage salvos por quem já
      // usa carregam esse valor (node_d2a19b8c8915), e invalidá-lo quebraria
      // links existentes. Some a porta duplicada, não o destino.
      { id: 'colony', label: 'Colony', icon: Network },
      { id: 'economy', label: 'Economy', icon: Coins },
      { id: 'certainty', label: 'Certainty', icon: ShieldCheck },
      { id: 'okr', label: 'OKR', icon: Target },
    ],
  },
]

/** Flat array derived from NAV_GROUPS — backward compat with existing code */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)
