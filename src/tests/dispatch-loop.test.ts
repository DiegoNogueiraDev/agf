/*!
 * TDD: /loop and /loop stop wired in dispatch-catalog and dispatch-ports (node_611fbfdefbcf).
 *
 * AC1: '/loop "autopilot" 5m' dispatches to loopStart with payload + every args.
 * AC2: '/loop stop all' dispatches to loopStop with 'all'.
 * AC3: COMMANDS catalog contains '/loop' entry with description.
 */

import { describe, it, expect, vi } from 'vitest'
import { runAsyncCommand } from '../tui/dispatch-ports.js'
import type { AsyncCommandPort } from '../tui/dispatch-ports.js'
import { COMMANDS } from '../tui/dispatch-catalog.js'
import type { ParsedCommand } from '../tui/dispatch-parsing.js'

function makePort(overrides: Partial<AsyncCommandPort> = {}): AsyncCommandPort {
  return {
    check: vi.fn().mockResolvedValue('ok'),
    decompose: vi.fn().mockResolvedValue('ok'),
    importPrd: vi.fn().mockResolvedValue('ok'),
    runDoctor: vi.fn().mockResolvedValue('ok'),
    build: vi.fn().mockResolvedValue('ok'),
    generatePrd: vi.fn().mockResolvedValue('ok'),
    deliver: vi.fn().mockResolvedValue('ok'),
    gaps: vi.fn().mockResolvedValue('ok'),
    savings: vi.fn().mockResolvedValue('ok'),
    preflight: vi.fn().mockResolvedValue('ok'),
    brief: vi.fn().mockResolvedValue('ok'),
    submit: vi.fn().mockResolvedValue('ok'),
    providerConnect: vi.fn().mockResolvedValue('ok'),
    providers: vi.fn().mockReturnValue([]),
    providerCurrent: vi.fn().mockReturnValue(''),
    providerSet: vi.fn().mockReturnValue(''),
    providerSetUrl: vi.fn().mockReturnValue(''),
    loopStart: vi.fn().mockResolvedValue('loop started'),
    loopStop: vi.fn().mockResolvedValue('loop stopped'),
    ...overrides,
  }
}

function cmd(c: string, args: string = ''): ParsedCommand {
  return { cmd: c, args: args || undefined }
}

describe('AC1: /loop dispatches to loopStart', () => {
  it('calls loopStart with payload and every from args', async () => {
    const port = makePort()
    await runAsyncCommand(port, cmd('loop', '"autopilot" 5m'), () => {})
    expect(port.loopStart).toHaveBeenCalledWith('"autopilot"', '5m')
  })

  it('returns usage when no args provided', async () => {
    const port = makePort()
    const result = await runAsyncCommand(port, cmd('loop'), () => {})
    expect(result).toMatch(/loop/)
  })
})

describe('AC2: /loop stop dispatches to loopStop', () => {
  it('calls loopStop with "all" when /loop stop all', async () => {
    const port = makePort()
    await runAsyncCommand(port, cmd('loop', 'stop all'), () => {})
    expect(port.loopStop).toHaveBeenCalledWith('all')
  })

  it('calls loopStop with specific id when /loop stop <id>', async () => {
    const port = makePort()
    await runAsyncCommand(port, cmd('loop', 'stop loop_abc123'), () => {})
    expect(port.loopStop).toHaveBeenCalledWith('loop_abc123')
  })
})

describe('AC3: COMMANDS catalog contains /loop entry', () => {
  it('has an entry named "loop" in the catalog', () => {
    const entry = COMMANDS.find((c) => c.name === 'loop')
    expect(entry).toBeDefined()
    expect(entry?.desc).toBeTruthy()
  })
})
