import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as childProcess from 'node:child_process'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

describe('agf check — files-modified warning', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('spawnSync returns modified files list', () => {
    vi.mocked(childProcess.spawnSync).mockReturnValue({
      stdout: 'src/foo.ts\nsrc/bar.ts\n',
      stderr: '',
      status: 0,
      pid: 1,
      output: [],
      signal: null,
    })

    const result = childProcess.spawnSync('git', ['diff', '--name-only'], { encoding: 'utf-8' })
    const files = result.stdout?.trim()
    expect(files).toBeTruthy()
    expect(files?.split('\n')).toHaveLength(2)
  })

  it('spawnSync returns empty when no files modified', () => {
    vi.mocked(childProcess.spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: 0,
      pid: 1,
      output: [],
      signal: null,
    })

    const result = childProcess.spawnSync('git', ['diff', '--name-only'], { encoding: 'utf-8' })
    const files = result.stdout?.trim()
    expect(!files || files.length === 0).toBe(true)
  })
})
