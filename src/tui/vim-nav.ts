/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_4ddeed723248 — Pure vim-style navigation state machine.
 *
 * Immutable, testable, no React/Ink dependency.
 *
 * Keys:
 *   j — move cursor down
 *   k — move cursor up
 *   g — move to first item
 *   G — move to last item
 */

export interface VimNavState {
  /** Current cursor position (0-based). */
  readonly cursor: number
  /** Total items in the navigable list. */
  readonly count: number
}

export type VimNavKey = 'j' | 'k' | 'g' | 'G'

export const vimNav = {
  init(count: number, initialCursor = 0): VimNavState {
    if (count <= 0) return { cursor: 0, count: 0 }
    const clamped = Math.max(0, Math.min(initialCursor, count - 1))
    return { cursor: clamped, count }
  },

  handleKey(state: VimNavState, key: VimNavKey): VimNavState {
    if (state.count <= 0) return state
    switch (key) {
      case 'j':
        return { ...state, cursor: Math.min(state.cursor + 1, state.count - 1) }
      case 'k':
        return { ...state, cursor: Math.max(state.cursor - 1, 0) }
      case 'g':
        return { ...state, cursor: 0 }
      case 'G':
        return { ...state, cursor: state.count - 1 }
      default:
        return state
    }
  },

  updateCount(state: VimNavState, newCount: number): VimNavState {
    if (newCount <= 0) return { cursor: 0, count: 0 }
    return {
      count: newCount,
      cursor: Math.min(state.cursor, newCount - 1),
    }
  },

  isAtStart(state: VimNavState): boolean {
    return state.cursor <= 0 || state.count <= 0
  },

  isAtEnd(state: VimNavState): boolean {
    return state.count <= 0 || state.cursor >= state.count - 1
  },
}
