import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

const mockDbInstance = {
  prepare: vi.fn(),
  close: vi.fn(),
}

// tool-status opens the DB via the runtime factory (createRequire-loaded under
// Node, bun:sqlite under Bun), so mock the factory seam — not better-sqlite3,
// whose static import is bypassed by createRequire.
vi.mock('../../core/store/database-factory.js', () => ({
  createDatabase: vi.fn(() => mockDbInstance),
  isBunRuntime: false,
}))

import { getIntegrationsStatus } from '../../core/integrations/tool-status.js'
import { existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

describe('tool-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.prepare.mockReturnValue({ get: vi.fn().mockReturnValue({ n: 0 }) })
  })

  describe('getIntegrationsStatus', () => {
    it('returns IntegrationsStatus with all required fields', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const status = await getIntegrationsStatus('/test/project')

      expect(status).toHaveProperty('codeGraph')
      expect(status).toHaveProperty('memories')
      expect(status).toHaveProperty('playwright')

      expect(status.codeGraph).toHaveProperty('running')
      expect(status.codeGraph).toHaveProperty('symbolCount')
      expect(typeof status.codeGraph.running).toBe('boolean')
      expect(typeof status.codeGraph.symbolCount).toBe('number')

      expect(status.memories).toHaveProperty('available')
      expect(status.memories).toHaveProperty('count')
      expect(status.memories).toHaveProperty('directory')

      expect(status.playwright).toHaveProperty('installed')
    })

    it('detects code graph when symbol DB has data', async () => {
      vi.mocked(existsSync).mockImplementation((p: string) => {
        return p.includes('graph.db')
      })

      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue({ n: 42 }),
      })

      const status = await getIntegrationsStatus('/test/project')
      expect(status.codeGraph.running).toBe(true)
      expect(status.codeGraph.symbolCount).toBe(42)
    })

    it('detects memories when directory has files', async () => {
      vi.mocked(existsSync).mockImplementation((p: string) => {
        return p.includes('memories')
      })

      vi.mocked(readdirSync).mockReturnValue([
        { name: 'case_node_abc.md', isFile: () => true, isDirectory: () => false },
        { name: 'strategy_tags-tui.md', isFile: () => true, isDirectory: () => false },
      ] as any)

      const status = await getIntegrationsStatus('/test/project')
      expect(status.memories.available).toBe(true)
      expect(status.memories.count).toBe(2)
    })

    it('detects playwright as installed when npx playwright works', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(execSync).mockReturnValue(Buffer.from('Version 1.45.0'))

      const status = await getIntegrationsStatus('/test/project')
      expect(status.playwright.installed).toBe(true)
      expect(status.playwright.version).toBe('Version 1.45.0')
    })

    it('detects playwright as not installed when command fails', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('playwright not found')
      })

      const status = await getIntegrationsStatus('/test/project')
      expect(status.playwright.installed).toBe(false)
    })

    it('returns default state when nothing is available', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const status = await getIntegrationsStatus('/test/project')

      expect(status.codeGraph.running).toBe(false)
      expect(status.codeGraph.symbolCount).toBe(0)
      expect(status.memories.available).toBe(false)
      expect(status.memories.count).toBe(0)
      expect(status.playwright.installed).toBe(false)
    })

    it('returns memories directory path in response', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const status = await getIntegrationsStatus('/test/project')
      expect(status.memories.directory).toContain('memories')
    })
  })
})
