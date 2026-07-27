import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}))

const closeMock = vi.fn()
const openMock = vi.fn().mockReturnValue({
  close: closeMock,
  getAllNodes: vi.fn().mockReturnValue([]),
  getProject: vi.fn().mockReturnValue({ id: 'p1', name: 'test' }),
  initProject: vi.fn(),
})

vi.mock('../core/store/sqlite-store.js', () => ({
  SqliteStore: { open: openMock },
}))

const watchParentDeathMock = vi.fn().mockReturnValue({ stop: vi.fn() })

vi.mock('../core/daemon/parent-watch.js', () => ({
  watchParentDeath: watchParentDeathMock,
}))

describe('mcp/server bootstrap — parent-death watch (node_wire_92b90f32400c)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    closeMock.mockClear()
    openMock.mockClear()
    watchParentDeathMock.mockClear()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  it('starts a parent-death watch when the transport is actually started', async () => {
    const { bootstrap } = await import('../mcp/server.js')
    await bootstrap({ dir: '/fake-project' })

    expect(watchParentDeathMock).toHaveBeenCalledTimes(1)
    expect(watchParentDeathMock.mock.calls[0][0]).toBeInstanceOf(Function)
  })

  it('closes the store and exits when the host process disappears', async () => {
    const { bootstrap } = await import('../mcp/server.js')
    await bootstrap({ dir: '/fake-project' })

    const onDeath = watchParentDeathMock.mock.calls[0][0] as () => void
    onDeath()

    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('does not start a parent-death watch in transport-only (init) mode', async () => {
    const { bootstrap } = await import('../mcp/server.js')
    await bootstrap({ dir: '/fake-project', transportOnly: true })

    expect(watchParentDeathMock).not.toHaveBeenCalled()
  })
})
