/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_3354d1ecc90a — Numeric tab navigation state machine.
 *
 * Five views:
 *   1 Dashboard  2 Kanban  3 Árvore  4 Saúde  5 Economia
 *
 * Pure functions, testable, no React dependency.
 */

export const VIEWS = ['dashboard', 'kanban', 'tree', 'health', 'economy'] as const

export type ViewName = (typeof VIEWS)[number]

export type TabKey = number | 'tab' | 'shiftTab'

const LABELS: Record<ViewName, string> = {
  dashboard: '1 Dashboard',
  kanban: '2 Kanban',
  tree: '3 Árvore',
  health: '4 Saúde',
  economy: '5 Economia',
}

export const tabNav = {
  press(current: ViewName, key: TabKey): ViewName {
    const idx = VIEWS.indexOf(current)
    if (idx < 0) return VIEWS[0]
    if (typeof key === 'number') {
      const target = key - 1
      if (target >= 0 && target < VIEWS.length) return VIEWS[target]
      return current
    }
    if (key === 'tab') return VIEWS[(idx + 1) % VIEWS.length]
    if (key === 'shiftTab') return VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length]
    return current
  },

  label(view: ViewName): string {
    return LABELS[view] ?? view
  },

  indexOf(view: string): number {
    return VIEWS.indexOf(view as ViewName)
  },

  fromIndex(idx: number): ViewName {
    if (idx < 0 || idx >= VIEWS.length) return VIEWS[0]
    return VIEWS[idx]
  },
}
