/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_c6aa65d3013c — Single-key shortcuts state machine.
 *
 * Keys (when command bar empty):
 *   d → delete selected node (confirm with y/N)
 *   c → consolidate memories (confirm with y/N)
 *   r → refresh dashboard (immediate, no confirm)
 *
 * Pure functions, testable, no React dependency.
 */

export type ShortcutAction = 'delete' | 'consolidate' | 'refresh'

export type ShortcutState =
  { kind: 'idle' } | { kind: 'confirm'; action: ShortcutAction } | { kind: 'executing'; action: ShortcutAction }

const TRIGGERS: Record<string, ShortcutAction | undefined> = {
  d: 'delete',
  c: 'consolidate',
  r: 'refresh',
}

export const shortcutAction = {
  idle(): ShortcutState {
    return { kind: 'idle' }
  },

  press(state: ShortcutState, key: string): ShortcutState {
    if (state.kind === 'confirm') {
      if (key === 'y' || key === 'Y') return { kind: 'executing', action: state.action }
      if (key === 'n' || key === 'N') return { kind: 'idle' }
      return state
    }

    if (state.kind === 'executing') return { kind: 'idle' }

    const action = TRIGGERS[key]
    if (!action) return state
    if (action === 'refresh') return { kind: 'executing', action }
    return { kind: 'confirm', action }
  },

  label(state: ShortcutState): string {
    if (state.kind === 'confirm') {
      const labels: Partial<Record<ShortcutAction, string>> = { delete: 'DELETAR', consolidate: 'CONSOLIDAR' }
      const act = labels[state.action] ?? state.action.toUpperCase()
      return `${act}? (y/N)`
    }
    if (state.kind === 'executing') {
      return `${state.action.toUpperCase()}...`
    }
    return ''
  },
}
