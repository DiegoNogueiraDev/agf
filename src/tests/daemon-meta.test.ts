import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeDaemonMeta, readDaemonMeta } from '../core/daemon/daemon-meta.js'

describe('writeDaemonMeta / readDaemonMeta', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'daemon-meta-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes and reads daemon meta', () => {
    const meta = {
      workspacePath: '/home/user/project',
      pid: 12345,
      startedAt: '2026-01-01T00:00:00.000Z',
    }
    writeDaemonMeta(tmpDir, meta)
    const read = readDaemonMeta(tmpDir)
    expect(read).toBeDefined()
    expect(read!.workspacePath).toBe('/home/user/project')
    expect(read!.pid).toBe(12345)
    expect(read!.startedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns undefined when meta file does not exist', () => {
    const result = readDaemonMeta(tmpDir)
    expect(result).toBeUndefined()
  })

  it('writeDaemonMeta does not throw on invalid stateDir', () => {
    expect(() =>
      writeDaemonMeta('/nonexistent/path', {
        workspacePath: '/proj',
        pid: 1,
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).not.toThrow()
  })

  it('readDaemonMeta returns undefined for corrupted file', () => {
    const metaFile = join(tmpDir, 'daemon.meta.json')
    writeFileSync(metaFile, 'not valid json')
    const result = readDaemonMeta(tmpDir)
    expect(result).toBeUndefined()
  })

  it('validates schema — returns undefined for invalid pid type', () => {
    const metaFile = join(tmpDir, 'daemon.meta.json')
    writeFileSync(
      metaFile,
      JSON.stringify({
        workspacePath: '/proj',
        pid: 'not-a-number',
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    )
    const result = readDaemonMeta(tmpDir)
    expect(result).toBeUndefined()
  })
})
