/*!
 * TDD: format-routing policy — intent × consumer × size → format (node_6f8c08b637a5).
 *
 * AC1: Given consumer=agent-next, When routed, Then chooses JSON.
 * AC2: Given consumer=human, When routed, Then chooses rich format; policy is a tested table.
 */

import { describe, it, expect } from 'vitest'
import { routeOutputFormat, type FormatRoutingInput } from '../core/output/format-routing-policy.js'

describe('AC1: agent-next consumer → JSON', () => {
  it('returns json for agent-next consumer regardless of intent', () => {
    const input: FormatRoutingInput = { consumer: 'agent-next', intent: 'query', sizeHint: 'small' }
    expect(routeOutputFormat(input).format).toBe('json')
  })

  it('returns json for agent-next with large size', () => {
    const input: FormatRoutingInput = { consumer: 'agent-next', intent: 'summary', sizeHint: 'large' }
    expect(routeOutputFormat(input).format).toBe('json')
  })
})

describe('AC2: human consumer → rich format; policy is a table', () => {
  it('returns rich for human consumer', () => {
    const input: FormatRoutingInput = { consumer: 'human', intent: 'status', sizeHint: 'medium' }
    expect(routeOutputFormat(input).format).toBe('rich')
  })

  it('returns rich for human even with large output', () => {
    const input: FormatRoutingInput = { consumer: 'human', intent: 'summary', sizeHint: 'large' }
    expect(routeOutputFormat(input).format).toBe('rich')
  })

  it('returns json for agent-code consumer (deterministic policy)', () => {
    const input: FormatRoutingInput = { consumer: 'agent-code', intent: 'patch', sizeHint: 'small' }
    expect(routeOutputFormat(input).format).toBe('json')
  })
})
