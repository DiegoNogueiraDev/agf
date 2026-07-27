import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startTaskPipeline, type StartDeps } from '../cli/commands/start-cmd.js'
import { startSessionManifest, closeSessionManifest, recordInManifest } from '../core/hooks/session-manifest.js'

describe('agf start — session manifest validation', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `test-start-manifest-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('warns when previous session manifest is tampered', () => {
    const sessionId = startSessionManifest(tmpDir)
    recordInManifest('agf start', 0, 0, [])
    closeSessionManifest(tmpDir, 10, 20)

    const manifestDir = join(tmpDir, 'workflow-graph', 'session-manifest')
    const manifestFile = join(manifestDir, `${sessionId}.jsonl`)
    const content = readFileSync(manifestFile, 'utf-8')
    writeFileSync(manifestFile, content.replace('agf start', 'agf TAMPERED') + '\n', 'utf-8')

    const warnings: string[] = []
    const deps: StartDeps = {
      wakeUp: () => '## Wake-Up\n0 nodes',
      countInProgress: () => 0,
      findNext: () => null,
      loadContext: () => '',
      markInProgress: (id) => id,
      out: (msg) => warnings.push(msg),
    }

    startTaskPipeline(deps, tmpDir)

    const manifestWarning = warnings.find(
      (w) => w.includes('MANIFEST_TAMPERED') || w.includes('manifest') || w.includes('integrity'),
    )
    expect(manifestWarning).toBeDefined()
  })

  it('does not warn when no previous session exists', () => {
    const warnings: string[] = []
    const deps: StartDeps = {
      wakeUp: () => '## Wake-Up\n0 nodes',
      countInProgress: () => 0,
      findNext: () => null,
      loadContext: () => '',
      markInProgress: (id) => id,
      out: (msg) => warnings.push(msg),
    }

    startTaskPipeline(deps, tmpDir)

    const manifestWarning = warnings.find((w) => w.includes('MANIFEST_TAMPERED') || w.includes('manifest integrity'))
    expect(manifestWarning).toBeUndefined()
  })

  it('does not warn when previous session manifest is valid', () => {
    startSessionManifest(tmpDir)
    recordInManifest('agf start', 0, 0, [])
    closeSessionManifest(tmpDir, 10, 20)

    const warnings: string[] = []
    const deps: StartDeps = {
      wakeUp: () => '## Wake-Up\n0 nodes',
      countInProgress: () => 0,
      findNext: () => null,
      loadContext: () => '',
      markInProgress: (id) => id,
      out: (msg) => warnings.push(msg),
    }

    startTaskPipeline(deps, tmpDir)

    const manifestWarning = warnings.find((w) => w.includes('MANIFEST_TAMPERED') || w.includes('manifest integrity'))
    expect(manifestWarning).toBeUndefined()
  })
})
