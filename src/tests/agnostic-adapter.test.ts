import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  FileSystemAdapter,
  StoreAdapter,
  type SlashCommandAdapter,
  type CommandPortLike,
  type SkillInfo,
  type SkillContent,
} from '../tui/slash/agnostic-adapter.js'

vi.mock('node:fs', () => {
  const mockFiles = new Map<string, string>()
  const mockDirEntries = new Map<string, Array<{ name: string; isDirectory: () => boolean }>>()
  return {
    existsSync: vi.fn((p: string) => mockFiles.has(p)),
    readFileSync: vi.fn((p: string) => {
      const content = mockFiles.get(p)
      if (content === undefined) throw new Error(`ENOENT: ${p}`)
      return content
    }),
    readdirSync: vi.fn((p: string, _opts?: unknown) => {
      return mockDirEntries.get(p) ?? []
    }),
    _setMockFile: vi.fn((path: string, content: string) => {
      mockFiles.set(path, content)
    }),
    _setMockDir: vi.fn((path: string, entries: Array<{ name: string; isDirectory: () => boolean }>) => {
      mockDirEntries.set(path, entries)
    }),
    _clearMockFiles: vi.fn(() => {
      mockFiles.clear()
      mockDirEntries.clear()
    }),
  }
})

const fs = await import('node:fs')
const mockFs = vi.mocked(fs)

beforeEach(() => {
  vi.clearAllMocks()
  ;(mockFs as unknown as { _clearMockFiles: () => void })._clearMockFiles()
})

function setMockFile(path: string, content: string) {
  ;(mockFs as unknown as { _setMockFile: (p: string, c: string) => void })._setMockFile(path, content)
}

function setMockDir(path: string, entries: Array<{ name: string; isDirectory: () => boolean }>) {
  ;(
    mockFs as unknown as { _setMockDir: (p: string, e: Array<{ name: string; isDirectory: () => boolean }>) => void }
  )._setMockDir(path, entries)
}

const GRAPH_JSON = 'graph.json'

describe('FileSystemAdapter', () => {
  it('implements SlashCommandAdapter', () => {
    const adapter: SlashCommandAdapter = new FileSystemAdapter('/tmp/test-project')
    expect(adapter.isReadOnly).toBe(true)
  })

  describe('findNext', () => {
    it('returns first non-done node', () => {
      setMockFile(
        `/tmp/test-project/${GRAPH_JSON}`,
        JSON.stringify({
          nodes: [
            { id: 'n1', type: 'task', title: 'Tarefa 1', status: 'done', priority: 1 },
            { id: 'n2', type: 'task', title: 'Tarefa 2', status: 'in_progress', priority: 2 },
            { id: 'n3', type: 'task', title: 'Tarefa 3', status: 'backlog', priority: 3 },
          ],
        }),
      )
      const adapter = new FileSystemAdapter('/tmp/test-project')
      expect(adapter.findNext()).toEqual({ id: 'n2', title: 'Tarefa 2', reason: 'status=in_progress' })
    })

    it('returns null when all nodes are done', () => {
      setMockFile(
        `/tmp/test-project/${GRAPH_JSON}`,
        JSON.stringify({
          nodes: [{ id: 'n1', type: 'task', title: 'Tarefa 1', status: 'done' }],
        }),
      )
      const adapter = new FileSystemAdapter('/tmp/test-project')
      expect(adapter.findNext()).toBeNull()
    })

    it('handles missing graph.json', () => {
      const adapter = new FileSystemAdapter('/tmp/empty-dir')
      expect(adapter.findNext()).toBeNull()
    })
  })

  describe('stats', () => {
    it('counts nodes by status', () => {
      setMockFile(
        `/tmp/test-project/${GRAPH_JSON}`,
        JSON.stringify({
          nodes: [
            { id: 'n1', type: 'task', title: 'T1', status: 'done' },
            { id: 'n2', type: 'task', title: 'T2', status: 'done' },
            { id: 'n3', type: 'task', title: 'T3', status: 'backlog' },
          ],
        }),
      )
      const adapter = new FileSystemAdapter('/tmp/test-project')
      expect(adapter.stats()).toEqual({ totalNodes: 3, byStatus: { done: 2, backlog: 1 } })
    })

    it('returns zero counts for empty graph', () => {
      setMockFile(`/tmp/test-project/${GRAPH_JSON}`, JSON.stringify({ nodes: [] }))
      const adapter = new FileSystemAdapter('/tmp/test-project')
      expect(adapter.stats()).toEqual({ totalNodes: 0, byStatus: {} })
    })
  })

  describe('getPhase', () => {
    it('returns phase from graph.json', () => {
      setMockFile(
        `/tmp/test-project/${GRAPH_JSON}`,
        JSON.stringify({
          phase: 'VALIDATE',
          nodes: [],
        }),
      )
      const adapter = new FileSystemAdapter('/tmp/test-project')
      expect(adapter.getPhase()).toBe('VALIDATE')
    })

    it('defaults to IMPLEMENT when phase is missing', () => {
      setMockFile(`/tmp/test-project/${GRAPH_JSON}`, JSON.stringify({ nodes: [] }))
      const adapter = new FileSystemAdapter('/tmp/test-project')
      expect(adapter.getPhase()).toBe('IMPLEMENT')
    })
  })

  describe('listSkills', () => {
    it('returns empty when skills dir does not exist', () => {
      const adapter = new FileSystemAdapter('/tmp/no-skills')
      expect(adapter.listSkills()).toEqual([])
    })

    it('parses skill info from SKILL.md files', () => {
      const skillsBase = '/tmp/test-project/.agents/skills'
      setMockFile(skillsBase, '')
      setMockDir(skillsBase, [{ name: 'graph-analyze', isDirectory: () => true }])
      setMockFile(`${skillsBase}/graph-analyze/SKILL.md`, 'description: Analyze phase tools\ncategory: lifecycle')
      setMockFile(`/tmp/test-project/${GRAPH_JSON}`, JSON.stringify({ nodes: [] }))

      const adapter = new FileSystemAdapter('/tmp/test-project')
      const results = adapter.listSkills()
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0]).toMatchObject({ name: 'graph-analyze', desc: 'Analyze phase tools', category: 'lifecycle' })
    })

    it('sorts results alphabetically', () => {
      const skillsBase = '/tmp/test-project/.agents/skills'
      setMockFile(skillsBase, '')
      setMockDir(skillsBase, [
        { name: 'graph-validate', isDirectory: () => true },
        { name: 'graph-analyze', isDirectory: () => true },
      ])
      setMockFile(`${skillsBase}/graph-analyze/SKILL.md`, 'description: Analyze phase tools\ncategory: lifecycle')
      setMockFile(`${skillsBase}/graph-validate/SKILL.md`, 'description: Validate phase tools\ncategory: lifecycle')
      setMockFile(`/tmp/test-project/${GRAPH_JSON}`, JSON.stringify({ nodes: [] }))

      const adapter = new FileSystemAdapter('/tmp/test-project')
      const results = adapter.listSkills()
      expect(results.length).toBe(2)
      expect(results[0].name).toBe('graph-analyze')
      expect(results[1].name).toBe('graph-validate')
    })
  })

  describe('getSkill', () => {
    it('returns skill content when SKILL.md exists', () => {
      const skillsBase = '/tmp/test-project/.agents/skills'
      setMockFile(`${skillsBase}/graph-heal/SKILL.md`, '# Heal Skill\nHealing instructions')
      const adapter = new FileSystemAdapter('/tmp/test-project')
      const result = adapter.getSkill('graph-heal')
      expect(result).toEqual({ name: 'graph-heal', body: '# Heal Skill\nHealing instructions' })
    })

    it('returns undefined for unknown skill', () => {
      const adapter = new FileSystemAdapter('/tmp/test-project')
      expect(adapter.getSkill('nonexistent')).toBeUndefined()
    })
  })

  describe('reload', () => {
    it('clears cached graph.json and re-reads on next call', () => {
      setMockFile(
        `/tmp/test-project/${GRAPH_JSON}`,
        JSON.stringify({ nodes: [{ id: 'n1', title: 'T1', status: 'done' }] }),
      )
      const adapter = new FileSystemAdapter('/tmp/test-project')
      expect(adapter.stats().totalNodes).toBe(1)

      setMockFile(
        `/tmp/test-project/${GRAPH_JSON}`,
        JSON.stringify({
          nodes: [
            { id: 'n1', title: 'T1', status: 'done' },
            { id: 'n2', title: 'T2', status: 'backlog' },
          ],
        }),
      )
      adapter.reload()
      expect(adapter.stats().totalNodes).toBe(2)
    })
  })
})

describe('StoreAdapter', () => {
  it('implements SlashCommandAdapter with isReadOnly=false', () => {
    const port: CommandPortLike = {
      findNext: () => null,
      stats: () => ({ totalNodes: 0, byStatus: {} }),
      getPhase: () => 'IMPLEMENT',
      listSkills: () => [],
      getSkill: () => undefined,
    }
    const adapter: SlashCommandAdapter = new StoreAdapter(port)
    expect(adapter.isReadOnly).toBe(false)
  })

  it('delegates findNext to port', () => {
    const port: CommandPortLike = {
      findNext: () => ({ id: 'n1', title: 'Test', reason: 'priority' }),
      stats: () => ({ totalNodes: 0, byStatus: {} }),
      getPhase: () => 'IMPLEMENT',
      listSkills: () => [],
      getSkill: () => undefined,
    }
    const adapter = new StoreAdapter(port)
    expect(adapter.findNext()).toEqual({ id: 'n1', title: 'Test', reason: 'priority' })
  })

  it('delegates stats to port', () => {
    const port: CommandPortLike = {
      findNext: () => null,
      stats: () => ({ totalNodes: 5, byStatus: { done: 3, in_progress: 2 } }),
      getPhase: () => 'IMPLEMENT',
      listSkills: () => [],
      getSkill: () => undefined,
    }
    const adapter = new StoreAdapter(port)
    expect(adapter.stats()).toEqual({ totalNodes: 5, byStatus: { done: 3, in_progress: 2 } })
  })

  it('delegates getPhase to port', () => {
    const port: CommandPortLike = {
      findNext: () => null,
      stats: () => ({ totalNodes: 0, byStatus: {} }),
      getPhase: () => 'ANALYZE',
      listSkills: () => [],
      getSkill: () => undefined,
    }
    const adapter = new StoreAdapter(port)
    expect(adapter.getPhase()).toBe('ANALYZE')
  })

  it('delegates listSkills to port with phase filter', () => {
    const skills: SkillInfo[] = [{ name: 'graph-analyze', desc: 'Analyze', category: 'lifecycle' }]
    const port: CommandPortLike = {
      findNext: () => null,
      stats: () => ({ totalNodes: 0, byStatus: {} }),
      getPhase: () => 'IMPLEMENT',
      listSkills: (phase?: string) => (phase ? skills.filter((s) => s.category === phase) : skills),
      getSkill: () => undefined,
    }
    const adapter = new StoreAdapter(port)
    expect(adapter.listSkills('lifecycle')).toEqual(skills)
    expect(adapter.listSkills()).toEqual(skills)
  })

  it('delegates getSkill to port', () => {
    const skill: SkillContent = { name: 'heal', body: '# Heal' }
    const port: CommandPortLike = {
      findNext: () => null,
      stats: () => ({ totalNodes: 0, byStatus: {} }),
      getPhase: () => 'IMPLEMENT',
      listSkills: () => [],
      getSkill: (name: string) => (name === 'heal' ? skill : undefined),
    }
    const adapter = new StoreAdapter(port)
    expect(adapter.getSkill('heal')).toEqual(skill)
    expect(adapter.getSkill('unknown')).toBeUndefined()
  })
})
