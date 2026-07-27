/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { TASK_RESOURCE_PREFIX, taskResourceId, taskIdFromResource } from '../core/planner/task-resource-key.js'

// node_9cf396489fd8 — o formato `task:<id>` vivia duplicado em 5 módulos
// (claim/renew/release/insights/claims-cmd); um drift já causou release no-op
// silencioso (consultar o id puro). Fonte única: quem monta e quem parseia a
// chave usam o MESMO módulo — drift vira erro de compilação, não bug de runtime.
describe('task-resource-key — fonte única do formato de chave de lease', () => {
  it('monta a chave com o prefixo canônico', () => {
    expect(taskResourceId('node_abc123')).toBe('task:node_abc123')
    expect(taskResourceId('node_abc123')).toBe(`${TASK_RESOURCE_PREFIX}:node_abc123`)
  })

  it('parseia o id de volta (round-trip)', () => {
    expect(taskIdFromResource(taskResourceId('node_xyz'))).toBe('node_xyz')
  })

  it('resource que não é task ⇒ null (nunca devolve id de outro namespace)', () => {
    expect(taskIdFromResource('file:src/a.ts')).toBeNull()
    expect(taskIdFromResource('node_semprefixo')).toBeNull()
  })
})
