import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveDaemonPaths } from '../core/daemon/daemon-paths.js'

describe('resolveDaemonPaths', () => {
  it('returns a DaemonPaths object with all required fields', () => {
    const paths = resolveDaemonPaths('/tmp/test-workspace', '/tmp/home')
    expect(typeof paths.workspaceHash).toBe('string')
    expect(paths.workspaceHash.length).toBeGreaterThan(0)
    expect(typeof paths.stateDir).toBe('string')
    expect(typeof paths.pidFile).toBe('string')
    expect(typeof paths.logFile).toBe('string')
  })

  it('uses provided home instead of os.homedir()', () => {
    const paths = resolveDaemonPaths('/tmp/workspace', '/custom/home')
    expect(paths.stateDir.startsWith('/custom/home')).toBe(true)
  })

  it('produces the same hash for the same workspace path', () => {
    const a = resolveDaemonPaths('/tmp/workspace', '/home/user')
    const b = resolveDaemonPaths('/tmp/workspace', '/home/user')
    expect(a.workspaceHash).toBe(b.workspaceHash)
  })

  it('produces different hashes for different workspace paths', () => {
    const a = resolveDaemonPaths('/tmp/workspace-a', '/home/user')
    const b = resolveDaemonPaths('/tmp/workspace-b', '/home/user')
    expect(a.workspaceHash).not.toBe(b.workspaceHash)
  })

  it('socketPath is defined and non-empty', () => {
    const paths = resolveDaemonPaths('/tmp/ws', '/home')
    expect(typeof paths.socketPath).toBe('string')
    expect(paths.socketPath.length).toBeGreaterThan(0)
  })

  describe('symlink canonicalization (node_wire_0f4ce420dc51)', () => {
    let realDir: string
    let linkDir: string

    afterEach(() => {
      rmSync(linkDir, { force: true })
      rmSync(realDir, { recursive: true, force: true })
    })

    it('produces the SAME workspaceHash for a symlink and its real target (agf daemon consistency)', () => {
      realDir = mkdtempSync(join(tmpdir(), 'agf-daemon-real-'))
      linkDir = join(tmpdir(), `agf-daemon-link-${process.pid}`)
      symlinkSync(realDir, linkDir)

      const viaReal = resolveDaemonPaths(realDir, '/home/user')
      const viaSymlink = resolveDaemonPaths(linkDir, '/home/user')

      expect(viaSymlink.workspaceHash).toBe(viaReal.workspaceHash)
      expect(viaSymlink.stateDir).toBe(viaReal.stateDir)
    })
  })
})
