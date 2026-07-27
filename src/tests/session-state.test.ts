import { describe, it, expect } from 'vitest'
import { writeFileSync, unlinkSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  SessionStateSchema,
  type SessionState,
  migrateV1toV2,
  loadSession,
  saveSession,
  LATEST_SESSION_VERSION,
} from '../core/session/session-state.js'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'sst-'))
}

describe('SessionState schema', () => {
  it('validates v2 session with all required fields', () => {
    const state: SessionState = {
      version: 2,
      approvalState: { pendingApproval: false, approvedActions: [] },
      planState: { currentPlan: null, planHistory: [] },
      workspaceState: { files: [], lastSave: Date.now() },
    }
    const parsed = SessionStateSchema.parse(state)
    expect(parsed.version).toBe(2)
    expect(parsed.approvalState).toBeDefined()
    expect(parsed.planState).toBeDefined()
    expect(parsed.workspaceState).toBeDefined()
  })

  it('rejects missing version field', () => {
    const invalid = { approvalState: { pendingApproval: false, approvedActions: [] } }
    expect(() => SessionStateSchema.parse(invalid)).toThrow()
  })

  it('rejects unknown version', () => {
    const invalid = { version: 99, approvalState: {}, planState: {}, workspaceState: {} }
    expect(() => SessionStateSchema.parse(invalid)).toThrow()
  })

  it('LATEST_SESSION_VERSION is 2', () => {
    expect(LATEST_SESSION_VERSION).toBe(2)
  })
})

describe('Migration v1→v2', () => {
  it('converts v1 (flat fields) to v2 (nested state)', () => {
    const v1: Record<string, unknown> = {
      version: 1,
      sessionId: 's1',
      model: 'haiku',
      tokensUsed: 5000,
      costUsd: 0.005,
      plan: 'Test plan',
      currentFocus: 'testing',
      workspace: ['file1.ts', 'file2.ts'],
    }
    const v2 = migrateV1toV2(v1)
    expect(v2.version).toBe(2)
    expect(v2.approvalState.pendingApproval).toBe(false)
    expect(v2.planState.currentPlan).toBe('Test plan')
    expect(v2.workspaceState.files).toContain('file1.ts')
    expect(v2.workspaceState.lastSave).toBeGreaterThan(0)
  })

  it('handles minimal v1 input', () => {
    const v1: Record<string, unknown> = { version: 1 }
    const v2 = migrateV1toV2(v1)
    expect(v2.version).toBe(2)
    expect(v2.approvalState.pendingApproval).toBe(false)
    expect(v2.planState.currentPlan).toBeNull()
    expect(v2.workspaceState.files).toEqual([])
  })

  it('preserves approval actions from v1', () => {
    const v1: Record<string, unknown> = {
      version: 1,
      approvedActions: [{ action: 'write_file', path: 'test.ts' }],
    }
    const v2 = migrateV1toV2(v1)
    expect(v2.approvalState.approvedActions).toHaveLength(1)
    expect(v2.approvalState.approvedActions[0]!.path).toBe('test.ts')
  })
})

describe('Session persistence', () => {
  it('saveSession writes to file', () => {
    const dir = makeDir()
    const path = join(dir, 'session.json')
    const state: SessionState = {
      version: 2,
      approvalState: { pendingApproval: false, approvedActions: [] },
      planState: { currentPlan: null, planHistory: [] },
      workspaceState: { files: [], lastSave: Date.now() },
    }
    saveSession(path, state)
    expect(existsSync(path)).toBe(true)
    const loaded = JSON.parse(readFileSync(path, 'utf-8'))
    expect(loaded.version).toBe(2)
    unlinkSync(path)
  })

  it('loadSession reads v2 session', () => {
    const dir = makeDir()
    const path = join(dir, 'session.json')
    writeFileSync(
      path,
      JSON.stringify({
        version: 2,
        approvalState: { pendingApproval: false, approvedActions: [] },
        planState: { currentPlan: 'test', planHistory: [] },
        workspaceState: { files: ['a.ts'], lastSave: 1000 },
      }),
    )
    const loaded = loadSession(path)
    expect(loaded.version).toBe(2)
    expect(loaded!.planState.currentPlan).toBe('test')
    unlinkSync(path)
  })

  it('loadSession auto-migrates v1 to v2', () => {
    const dir = makeDir()
    const path = join(dir, 'session.json')
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        sessionId: 's1',
        plan: 'migrated plan',
        workspace: ['main.ts'],
      }),
    )
    const loaded = loadSession(path)
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(2)
    expect(loaded!.planState.currentPlan).toBe('migrated plan')
    // File should be rewritten with v2
    const fileContent = JSON.parse(readFileSync(path, 'utf-8'))
    expect(fileContent.version).toBe(2)
    unlinkSync(path)
  })

  it('loadSession returns null for missing file', () => {
    expect(loadSession('/nonexistent/path.json')).toBeNull()
  })

  it('loadSession returns default for invalid JSON', () => {
    const dir = makeDir()
    const path = join(dir, 'bad.json')
    writeFileSync(path, 'not-json')
    const loaded = loadSession(path)
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(2)
    unlinkSync(path)
  })

  it('saveSession is atomic (temp file + rename)', () => {
    const dir = makeDir()
    const path = join(dir, 'atomic.json')
    const state: SessionState = {
      version: 2,
      approvalState: { pendingApproval: false, approvedActions: [] },
      planState: { currentPlan: null, planHistory: [] },
      workspaceState: { files: [], lastSave: Date.now() },
    }
    saveSession(path, state)
    const content = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(content)
    expect(parsed.version).toBe(2)
    // Ensure no .tmp file left behind
    expect(existsSync(path + '.tmp')).toBe(false)
    unlinkSync(path)
  })
})
