/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_5bf1f15df13f — `agf autopilot --swarm`: installed ⇒ delega a orquestração
 * ao `ant-swarming run` (subprocess); ausente ⇒ fallback delegado atual, sem
 * mudar o default. A decisão é pura/injetável (detect + runSwarm) → testável sem
 * binário real nem spawn.
 */

import { describe, it, expect, vi } from 'vitest'
import { maybeDelegateToSwarm } from '../cli/shared/swarm-delegation.js'

const RUN_ENVELOPE = { ok: true, data: { mode: 'delegated', colony: { hasQueue: true } } }

describe('maybeDelegateToSwarm', () => {
  it('AC2: binário presente → invoca `ant-swarming run` 1x e repassa o envelope', async () => {
    const runSwarm = vi.fn(() => RUN_ENVELOPE)
    const result = await maybeDelegateToSwarm(
      { dir: '/proj', ants: 3 },
      { detect: async () => ({ installed: true, version: '9.9.9', capabilities: ['run'] }), runSwarm },
    )
    expect(result.delegated).toBe(true)
    expect(runSwarm).toHaveBeenCalledTimes(1)
    // passa run + -d <dir> + --ants
    const args = runSwarm.mock.calls[0][0]
    expect(args).toContain('run')
    expect(args).toContain('/proj')
    expect(args).toContain('3')
    expect(result.envelope).toEqual(RUN_ENVELOPE)
  })

  it('AC1: binário ausente → NÃO delega (delegated=false), runSwarm nunca chamado — fluxo atual intacto', async () => {
    const runSwarm = vi.fn(() => RUN_ENVELOPE)
    const result = await maybeDelegateToSwarm(
      { dir: '/proj' },
      { detect: async () => ({ installed: false }), runSwarm },
    )
    expect(result.delegated).toBe(false)
    expect(result.envelope).toBeUndefined()
    expect(runSwarm).not.toHaveBeenCalled()
  })
})
