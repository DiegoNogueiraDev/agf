/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.2 AC coverage: demo-sandbox.ts
 *
 * AC1: clean env → createDemoSandbox returns valid scaffold + path
 * AC2: cleanup() is idempotent and removes all created files
 * AC3: re-init on existing path → scaffold detects existing state, does not overwrite
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ── Redirect homedir() to a temp dir so we don't write to real ~/. mcp-graph ──

const hoistedHome = vi.hoisted(() => {
  let _home = ''
  return {
    get: () => _home,
    set: (v: string) => {
      _home = v
    },
  }
})

vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>()
  return {
    ...orig,
    homedir: () => hoistedHome.get(),
  }
})

import { createDemoSandbox } from '../core/init/demo-sandbox.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpBase: string

beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), 'agf-demo-'))
  hoistedHome.set(tmpBase)
})

afterEach(() => {
  rmSync(tmpBase, { recursive: true, force: true })
})

// ── AC1: clean env → valid scaffold state ─────────────────────────────────────

describe('AC1: createDemoSandbox in a clean environment', () => {
  it('returns an object with path, scaffold, and cleanup', () => {
    const sandbox = createDemoSandbox()
    try {
      expect(typeof sandbox.path).toBe('string')
      expect(sandbox.path.length).toBeGreaterThan(0)
      expect(sandbox.scaffold).toBeDefined()
      expect(typeof sandbox.cleanup).toBe('function')
    } finally {
      sandbox.cleanup()
    }
  })

  it('creates the sandbox directory on disk', () => {
    const sandbox = createDemoSandbox()
    try {
      expect(existsSync(sandbox.path)).toBe(true)
    } finally {
      sandbox.cleanup()
    }
  })

  it('scaffold result contains changes array and valid paths', () => {
    const sandbox = createDemoSandbox()
    try {
      expect(Array.isArray(sandbox.scaffold.changes)).toBe(true)
      expect(sandbox.scaffold.changes.length).toBeGreaterThan(0)
      expect(sandbox.scaffold.workflowGraphDir).toContain(sandbox.path)
      expect(sandbox.scaffold.samplePrdPath).toContain(sandbox.path)
    } finally {
      sandbox.cleanup()
    }
  })

  it('workflow-graph dir is created inside the sandbox', () => {
    const sandbox = createDemoSandbox()
    try {
      expect(existsSync(sandbox.scaffold.workflowGraphDir)).toBe(true)
    } finally {
      sandbox.cleanup()
    }
  })

  it('scaffold changes include action "created" entries', () => {
    const sandbox = createDemoSandbox()
    try {
      const created = sandbox.scaffold.changes.filter((c) => c.action === 'created' || c.action === 'patched')
      expect(created.length).toBeGreaterThan(0)
    } finally {
      sandbox.cleanup()
    }
  })
})

// ── AC2: cleanup() removes the sandbox directory ──────────────────────────────

describe('AC2: cleanup is idempotent and removes files', () => {
  it('cleanup() removes the sandbox directory', () => {
    const sandbox = createDemoSandbox()
    const { path } = sandbox
    expect(existsSync(path)).toBe(true)
    sandbox.cleanup()
    expect(existsSync(path)).toBe(false)
  })

  it('cleanup() is safe to call multiple times (idempotent)', () => {
    const sandbox = createDemoSandbox()
    sandbox.cleanup()
    expect(() => sandbox.cleanup()).not.toThrow()
    expect(() => sandbox.cleanup()).not.toThrow()
  })

  it('each sandbox gets a unique path (no collision between two sandboxes)', () => {
    const a = createDemoSandbox()
    const b = createDemoSandbox()
    try {
      expect(a.path).not.toBe(b.path)
    } finally {
      a.cleanup()
      b.cleanup()
    }
  })
})

// ── AC3: re-init on existing scaffold detects existing state ──────────────────

describe('AC3: re-init on existing path — scaffold detects existing files', () => {
  it('second createDemoSandbox on same base uses a new unique path', () => {
    const a = createDemoSandbox()
    const b = createDemoSandbox()
    try {
      // Different stamp in path ensures no overwrite
      expect(a.path).not.toBe(b.path)
    } finally {
      a.cleanup()
      b.cleanup()
    }
  })

  it('scaffoldProject called on existing dir skips already-created files', async () => {
    const { scaffoldProject } = await import('../core/init/scaffold.js')
    const sandbox = createDemoSandbox()
    try {
      // Re-scaffold the same path — should skip existing entries
      const result2 = scaffoldProject(sandbox.path)
      const skipped = result2.changes.filter((c) => c.action === 'skipped-existing' || c.action === 'skipped-noop')
      expect(skipped.length).toBeGreaterThan(0)
    } finally {
      sandbox.cleanup()
    }
  })
})
