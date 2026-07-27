/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_5f912ff675bb — uma única entrada de grafo na sidebar.
 *
 * Feedback do usuário: a sidebar oferecia 'Graph' E 'Colony', e o sub-tab
 * 'Structure' de Colony já mostra a mesma árvore — duas portas para a mesma
 * coisa, que o operador lê como "devo estar perdendo alguma diferença".
 *
 * O que se remove é a ENTRADA DE NAVEGAÇÃO, não o TabId: `graph` continua
 * sendo um destino válido porque URL e localStorage já carregam esse valor
 * (node_d2a19b8c8915), e invalidá-lo quebraria links salvos por quem já usa.
 * Remover a porta duplicada é UI; remover o identificador seria uma quebra de
 * contrato com o passado.
 */

import { describe, it, expect } from 'vitest'
import { NAV_GROUPS, NAV_ITEMS } from '../layout/nav-config'

describe('sidebar — one graph entry, not two (AC1)', () => {
  it('does not offer a standalone Graph entry anymore', () => {
    expect(NAV_ITEMS.map((i) => i.id)).not.toContain('graph')
  })

  it('still offers Colony — the surviving door to the graph', () => {
    // A metade que impede "resolver" a duplicidade removendo as duas.
    expect(NAV_ITEMS.map((i) => i.id)).toContain('colony')
  })

  it('keeps every other destination intact (AC3 — protege o não-alvo)', () => {
    const ids = NAV_ITEMS.map((i) => i.id).sort()
    expect(ids).toEqual(['certainty', 'colony', 'economy', 'okr'])
  })

  it('every nav item still carries a label and an icon — nothing half-removed', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.trim().length, `${item.id} sem label`).toBeGreaterThan(0)
      expect(item.icon, `${item.id} sem ícone`).toBeTruthy()
    }
  })

  it('the group listing and the flat listing agree — no orphan left behind', () => {
    const fromGroups = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)).sort()
    expect(fromGroups).toEqual(NAV_ITEMS.map((i) => i.id).sort())
  })
})
