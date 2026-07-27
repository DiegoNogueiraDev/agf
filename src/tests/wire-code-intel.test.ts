import { describe, it, expect, vi } from 'vitest'
import { delegateTool } from '../../packages/mcp-server/src/tool-delegates.js'

function createMockStore() {
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

describe('A2: Wire CodeIntelTool', () => {
  it('code_intelligence.definition roteado para codeIntel.execute', async () => {
    const store = createMockStore()
    const codeIntel = { execute: vi.fn().mockResolvedValue('definition result') }
    const result = await delegateTool(
      'code_intelligence.definition',
      { file: 'src/a.ts', line: 1, character: 0 },
      store as any,
      undefined,
      undefined,
      codeIntel,
    )
    expect(result).toBe('definition result')
    expect(codeIntel.execute).toHaveBeenCalledWith({ mode: 'definition', file: 'src/a.ts', line: 1, character: 0 })
  })

  it('code_intelligence.references roteado para codeIntel.execute', async () => {
    const store = createMockStore()
    const codeIntel = { execute: vi.fn().mockResolvedValue('references result') }
    const result = await delegateTool(
      'code_intelligence.references',
      { file: 'src/a.ts', line: 2, character: 0 },
      store as any,
      undefined,
      undefined,
      codeIntel,
    )
    expect(result).toBe('references result')
  })

  it('code_intelligence.hover roteado corretamente', async () => {
    const store = createMockStore()
    const codeIntel = { execute: vi.fn().mockResolvedValue('hover result') }
    const result = await delegateTool(
      'code_intelligence.hover',
      { file: 'src/a.ts', line: 1, character: 5 },
      store as any,
      undefined,
      undefined,
      codeIntel,
    )
    expect(result).toBe('hover result')
  })

  it('sem CodeIntelAdapter retorna erro amigavel', async () => {
    const store = createMockStore()
    const result = await delegateTool(
      'code_intelligence.definition',
      { file: 'a.ts', line: 1, character: 0 },
      store as any,
    )
    expect(result).toContain('Code intelligence unavailable')
  })

  it('code_intelligence.document_symbols roteado', async () => {
    const store = createMockStore()
    const codeIntel = { execute: vi.fn().mockResolvedValue('[{"name":"foo"}]') }
    const result = await delegateTool(
      'code_intelligence.document_symbols',
      { file: 'a.ts' },
      store as any,
      undefined,
      undefined,
      codeIntel,
    )
    expect(result).toBe('[{"name":"foo"}]')
  })

  it('9 tools registradas no tools-catalog', async () => {
    const { TOOLS } = await import('../../packages/mcp-server/src/tools-catalog.js')
    const intelTools = TOOLS.filter((t: any) => t.name.startsWith('code_intelligence.'))
    expect(intelTools.length).toBeGreaterThanOrEqual(9)
  })
})
