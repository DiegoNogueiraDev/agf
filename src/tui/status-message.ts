/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_e8abc2c9efb3 — Context-aware status bar messages.
 *
 * Supports severity-based coloring (ok/green, warn/yellow, error/red),
 * auto-clear via TTL, and view-specific shortcut hints.
 */

import type { ViewName } from './tab-nav.js'

export type Severity = 'ok' | 'warn' | 'error'

export interface StatusMessage {
  text: string
  severity: Severity
  timestamp: number
}

export const VIEW_SHORTCUTS: Record<ViewName, Array<{ key: string; desc: string }>> = {
  dashboard: [
    { key: 'j/k', desc: 'Navegar' },
    { key: '/', desc: 'Buscar' },
    { key: 'd/c/r', desc: 'Ações' },
    { key: '1-5', desc: 'Aba' },
  ],
  kanban: [
    { key: 'j/k', desc: 'Navegar' },
    { key: 'd', desc: 'Deletar' },
    { key: 'r', desc: 'Refresh' },
  ],
  tree: [
    { key: 'j/k', desc: 'Navegar' },
    { key: 'g/G', desc: 'Topo/Fim' },
    { key: '+/-', desc: 'Expandir' },
  ],
  health: [
    { key: 'r', desc: 'Refresh' },
    { key: '1-5', desc: 'Aba' },
  ],
  economy: [{ key: 'r', desc: 'Refresh' }],
}

export const statusMessage = {
  create(text: string, severity: Severity = 'ok', offset = 0): StatusMessage {
    return { text, severity, timestamp: Date.now() + offset }
  },

  color(severity: Severity): string {
    switch (severity) {
      case 'ok':
        return 'green'
      case 'warn':
        return 'yellow'
      case 'error':
        return 'red'
    }
  },

  isExpired(msg: StatusMessage, ttlMs: number): boolean {
    return Date.now() - msg.timestamp > ttlMs
  },

  newest(msgs: StatusMessage[], ttlMs: number): StatusMessage | undefined {
    const valid = msgs.filter((m) => !statusMessage.isExpired(m, ttlMs))
    if (valid.length === 0) return undefined
    return valid.reduce((a, b) => (a.timestamp > b.timestamp ? a : b))
  },
}
