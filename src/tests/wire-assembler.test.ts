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

describe('A1: Wire assembleContext', () => {
  let mockStore: ReturnType<typeof createFullMockStore>

  beforeEach(() => {
    mockStore = createFullMockStore()
  })

  it('delegateTool aceita assembler opcional como 4o parametro', () => {
    expect(() => delegateTool('list_nodes', {}, mockStore as any)).not.toThrow()
  })

  it('handleContext action=node com assembler usa assemble()', async () => {
    const assembler = { assemble: (q: string) => `assembled: ${q}` }
    const result = await delegateTool('context', { action: 'node', nodeId: 'node_1' }, mockStore as any, assembler)
    expect(result).toBe('assembled: node_1')
  })

  it('handleContext action=node sem assembler usa fallback', async () => {
    mockStore.getNode.mockReturnValue({ id: 'node_1', title: 'Test', type: 'task', status: 'backlog' })
    const result = await delegateTool('context', { action: 'node', nodeId: 'node_1' }, mockStore as any)
    expect(typeof result).toBe('string')
  })

  it('handleContext action=summary sem assembler retorna formato basico', async () => {
    const result = await delegateTool('context', { action: 'summary' }, mockStore as any)
    expect(typeof result).toBe('string')
  })

  it('handleContext action=summary com assembler usa assemble()', async () => {
    const assembler = { assemble: () => 'rich context' }
    const result = await delegateTool('context', { action: 'summary' }, mockStore as any, assembler)
    expect(result).toContain('rich context')
  })

  it('handleContext action=children retorna lista', async () => {
    mockStore.getChildNodes.mockReturnValue([{ id: 'node_2', type: 'task', status: 'backlog', title: 'Subtask' }])
    const result = await delegateTool('context', { action: 'children', nodeId: 'node_1' }, mockStore as any)
    expect(result).toContain('Children of node_1')
    expect(result).toContain('node_2')
  })

  it('handleContext action=unknown retorna erro', async () => {
    const result = await delegateTool('context', { action: 'invalid' }, mockStore as any)
    expect(result).toContain('Unknown context action')
  })
})
