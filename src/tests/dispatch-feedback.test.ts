/*!
 * TDD: /feedback command wired in TUI dispatch (node_4e4cb36ef71f).
 *
 * AC: Given a /feedback command in TUI, When runAsyncCommand runs,
 *     Then it calls port.feedback and returns a confirmation string.
 */

import { describe, it, expect, vi } from 'vitest'
import { runAsyncCommand } from '../tui/dispatch-ports.js'
import type { AsyncCommandPort } from '../tui/dispatch-ports.js'
import type { ParsedCommand } from '../tui/dispatch-parsing.js'

function makePort(overrides: Partial<AsyncCommandPort> = {}): AsyncCommandPort {
  return {
    check: vi.fn().mockResolvedValue(''),
    decompose: vi.fn().mockResolvedValue(''),
    importPrd: vi.fn().mockResolvedValue(''),
    runDoctor: vi.fn().mockResolvedValue(''),
    build: vi.fn().mockResolvedValue(''),
    generatePrd: vi.fn().mockResolvedValue(''),
    deliver: vi.fn().mockResolvedValue(''),
    gaps: vi.fn().mockResolvedValue(''),
    savings: vi.fn().mockResolvedValue(''),
    preflight: vi.fn().mockResolvedValue(''),
    brief: vi.fn().mockResolvedValue(''),
    submit: vi.fn().mockResolvedValue(''),
    providerConnect: vi.fn().mockResolvedValue(''),
    providers: vi.fn().mockReturnValue([]),
    providerCurrent: vi.fn().mockReturnValue('anthropic'),
    providerSet: vi.fn().mockReturnValue(''),
    providerSetUrl: vi.fn().mockReturnValue(''),
    loopStart: vi.fn().mockResolvedValue(''),
    loopStop: vi.fn().mockResolvedValue(''),
    agfStart: vi.fn().mockResolvedValue(''),
    feedback: vi.fn().mockResolvedValue('Feedback enviado ✓'),
    ...overrides,
  }
}

function parsed(args: string): ParsedCommand {
  return { cmd: 'feedback', args, raw: `/feedback ${args}` }
}

describe('/feedback TUI dispatch', () => {
  it('calls port.feedback with the args and returns confirmation', async () => {
    const port = makePort()
    const result = await runAsyncCommand(port, parsed('bug: the graph is broken'), vi.fn())
    expect(port.feedback).toHaveBeenCalledWith('bug: the graph is broken')
    expect(result).toContain('Feedback')
  })

  it('returns usage hint when no args provided', async () => {
    const port = makePort()
    const result = await runAsyncCommand(port, parsed(''), vi.fn())
    expect(result).toContain('/feedback')
  })
})
