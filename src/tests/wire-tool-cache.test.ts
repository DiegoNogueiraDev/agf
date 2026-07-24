import { describe, it, expect, vi } from 'vitest'
import { delegateTool } from '../../packages/mcp-server/src/tool-delegates.js'

function createFullMockStore() {
  return {
    addNode: vi.fn(),
    getNode: vi.fn(),
    getNodeById: vi.fn(),
    getChildNodes: vi.fn().mockReturnValue([]),
    findNextTask: vi.fn().mockReturnValue(null),
    countByType: vi.fn().mockReturnValue({}),
    countByStatus: vi.fn().mockReturnValue({}),
    getNodesByStatus: vi.fn().mockReturnValue([]),
    getNodesByType: vi.fn().mockReturnValue([]),
    getNodeCount: vi.fn().mockReturnValue(0),
    listNodes: vi.fn().mockReturnValue([]),
    getAllNodes: vi.fn().mockReturnValue([]),
  }
}

describe('A3: Wire toolCache', () => {
  let mockStore: ReturnType<typeof createFullMockStore>

  beforeEach(() => {
    mockStore = createFullMockStore()
  })

  it('delegateTool verifica toolCache.get() antes de executar para tools read-only', async () => {
    const cache = { get: vi.fn().mockReturnValue(undefined), set: vi.fn() }
    await delegateTool('list_nodes', {}, mockStore as any, undefined, cache)
    expect(cache.get).toHaveBeenCalledWith('list_nodes', {})
  })

  it('se cache hit, retorna resultado sem executar handler', async () => {
    const cache = { get: vi.fn().mockReturnValue('cached result'), set: vi.fn() }
    const result = await delegateTool('list_nodes', {}, mockStore as any, undefined, cache)
    expect(result).toBe('cached result')
    // handler nao foi chamado (mockStore.listNodes nao foi chamado)
    expect(mockStore.listNodes).not.toHaveBeenCalled()
  })

  it('se cache miss, executa + toolCache.set()', async () => {
    const cache = { get: vi.fn().mockReturnValue(undefined), set: vi.fn() }
    await delegateTool('list_nodes', {}, mockStore as any, undefined, cache)
    expect(cache.set).toHaveBeenCalledWith('list_nodes', {}, expect.any(String))
  })

  it('mutating tools (add_node, update_status, start_task, finish_task, update_node) nunca cachedos', async () => {
    const cache = { get: vi.fn(), set: vi.fn() }
    mockStore.addNode.mockReturnValue({ id: 'n1', type: 'task', title: 'Test', status: 'backlog' })
    await delegateTool('add_node', { type: 'task', title: 'Test' }, mockStore as any, undefined, cache)
    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('toolCache opcional — sem cache nao quebra', async () => {
    const result = await delegateTool('list_nodes', {}, mockStore as any)
    expect(typeof result).toBe('string')
  })
})
