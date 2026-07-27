import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isCommandAvailable, installAllMcpDeps } from '../../core/integrations/mcp-deps-installer.js'
import type { InstallResult } from '../../core/integrations/mcp-deps-installer.js'
import { execFileSync } from 'node:child_process'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

describe('mcp-deps-installer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isCommandAvailable', () => {
    it('returns true when command exists in PATH', async () => {
      vi.mocked(execFileSync).mockReturnValueOnce(Buffer.from('/usr/local/bin/npx\n'))

      const result = await isCommandAvailable('npx')
      expect(result).toBe(true)
      expect(execFileSync).toHaveBeenCalledWith('which', ['npx'], expect.anything())
    })

    it('returns false when command is not found in PATH', async () => {
      vi.mocked(execFileSync).mockImplementationOnce(() => {
        throw new Error('command not found')
      })

      const result = await isCommandAvailable('nonexistent-cmd')
      expect(result).toBe(false)
    })

    it('handles special characters in command name safely (allowlist rejects)', async () => {
      // No execFileSync call should be made — allowlist blocks before exec
      const result = await isCommandAvailable('cmd; rm -rf /')
      expect(result).toBe(false)
      expect(execFileSync).not.toHaveBeenCalled()
    })
  })

  describe('installAllMcpDeps', () => {
    const MCP_DEPS = ['npx', 'uvx', 'docker'] as const

    it('returns results for all MCP dependencies', async () => {
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('/usr/bin/npx'))

      const results = await installAllMcpDeps('/test/project')

      expect(results.length).toBe(MCP_DEPS.length)
      expect(
        results.every((r: InstallResult) => ['installed', 'already_available', 'failed', 'skipped'].includes(r.status)),
      ).toBe(true)
    })

    it('marks available commands as already_available', async () => {
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('/usr/bin/npx'))

      const results = await installAllMcpDeps('/test/project')
      const npxResult = results.find((r: InstallResult) => r.name === 'npx')

      expect(npxResult).toBeDefined()
      expect(npxResult!.status).toBe('already_available')
    })

    it('marks unavailable commands as failed', async () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('command not found')
      })

      const results = await installAllMcpDeps('/test/project')
      results.forEach((r: InstallResult) => {
        expect(r.status).toBe('failed')
      })
    })

    it('includes docker as a dependency', async () => {
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('/usr/local/bin/docker'))

      const results = await installAllMcpDeps('/test/project')
      const dockerResult = results.find((r: InstallResult) => r.name === 'docker')

      expect(dockerResult).toBeDefined()
    })
  })
})
