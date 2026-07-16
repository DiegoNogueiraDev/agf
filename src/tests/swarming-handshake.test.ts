/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { swarmingHandshakeSchema } from '../schemas/swarming-handshake.js'

// node_a0810513cbe8 — contrato compartilhado produtor(swarming)↔consumidor(delegation).

describe('swarmingHandshakeSchema', () => {
  it('aceita um handshake válido', () => {
    const parsed = swarmingHandshakeSchema.parse({
      name: 'ant-swarming',
      version: '0.22.3',
      capabilities: ['handshake'],
    })
    expect(parsed.name).toBe('ant-swarming')
    expect(parsed.capabilities).toEqual(['handshake'])
  })

  it('rejeita name errado (não é ant-swarming)', () => {
    expect(() => swarmingHandshakeSchema.parse({ name: 'agf', version: '1', capabilities: [] })).toThrow()
  })

  it('rejeita version ausente', () => {
    expect(() => swarmingHandshakeSchema.parse({ name: 'ant-swarming', capabilities: [] })).toThrow()
  })

  it('rejeita capabilities de tipo errado', () => {
    expect(() => swarmingHandshakeSchema.parse({ name: 'ant-swarming', version: '1', capabilities: 'x' })).toThrow()
  })
})
