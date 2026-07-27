import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSpawn = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}))

vi.mock('../core/config/command-surface.js', () => ({
  listCommandNames: () => ['next', 'start', 'done', 'loop'],
}))

describe('runAgf tool-routing gate (REQ-LCR-001)', () => {
  beforeEach(() => {
    mockSpawn.mockReset()
  })

  it('rejects an unknown command without spawning a child process', async () => {
    const { runAgf } = await import('../core/compose/agf-runner.js')
    await expect(runAgf('nxt', [])).rejects.toThrow(/nxt/)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('spawns as before for a known command', async () => {
    const { EventEmitter } = await import('node:events')
    const fakeChild = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
    }
    fakeChild.stdout = new EventEmitter()
    fakeChild.stderr = new EventEmitter()
    mockSpawn.mockReturnValue(fakeChild)

    const { runAgf } = await import('../core/compose/agf-runner.js')
    const resultPromise = runAgf('next', [])

    fakeChild.stdout.emit('data', Buffer.from('{"ok":true,"data":{}}'))
    fakeChild.emit('close', 0)

    const result = await resultPromise
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    expect(result.envelope.ok).toBe(true)
  })
})

describe('resolveAgfInvocation — spawn correto em dev vs binário (node_e3972a535bf6)', () => {
  it('argv[1] .ts (npm run dev) => spawna execPath + execArgv + script (nao o .ts direto)', async () => {
    const { resolveAgfInvocation } = await import('../core/compose/agf-runner.js')
    const inv = resolveAgfInvocation('/abs/src/cli/index.ts', '/usr/bin/node', ['--import', 'tsx'])
    expect(inv.bin).toBe('/usr/bin/node')
    expect(inv.prefix).toEqual(['--import', 'tsx', '/abs/src/cli/index.ts'])
  })

  it('argv[1] binario/JS (instalado) => spawna o binario direto, sem prefix', async () => {
    const { resolveAgfInvocation } = await import('../core/compose/agf-runner.js')
    const inv = resolveAgfInvocation('/usr/local/bin/agf', '/usr/bin/node', [])
    expect(inv.bin).toBe('/usr/local/bin/agf')
    expect(inv.prefix).toEqual([])
  })

  it('argv[1] ausente => fallback para "agf"', async () => {
    const { resolveAgfInvocation } = await import('../core/compose/agf-runner.js')
    expect(resolveAgfInvocation(undefined, '/usr/bin/node', []).bin).toBe('agf')
  })
})
