/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_eb9bfa237b45 — agent-generated reusable helpers (auto-extensão persistida)
 *
 * AC1: Given a task that persists a helper, When a future run needs it,
 *      Then discovers and reuses (no re-derivation).
 * AC2: Given the same helper, When persisted again, Then no duplication (idempotent).
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { persistHelper, discoverHelper, HelperMeta } from '../core/memory/helper-registry.js'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agf-helper-test-'))
}

// ── AC1 — discover persisted helper ───────────────────────────────────────────

describe('persistHelper + discoverHelper (AC1 — reuse)', () => {
  it('discovers a helper that was previously persisted', async () => {
    const dir = makeTmpDir()
    try {
      await persistHelper(dir, 'parse-date', '// parse ISO date\nconst d = new Date(str)')
      const result = await discoverHelper(dir, 'parse-date')
      expect(result).not.toBeNull()
      expect(result!.content).toContain('parse ISO date')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null for a key that has never been persisted', async () => {
    const dir = makeTmpDir()
    try {
      const result = await discoverHelper(dir, 'nonexistent-helper')
      expect(result).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returned meta includes key and content', async () => {
    const dir = makeTmpDir()
    try {
      await persistHelper(dir, 'format-json', 'JSON.stringify(x, null, 2)')
      const result = await discoverHelper(dir, 'format-json')
      expect(result).not.toBeNull()
      const meta = result as HelperMeta
      expect(meta.key).toBe('format-json')
      expect(meta.content).toContain('JSON.stringify')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('different keys are stored independently', async () => {
    const dir = makeTmpDir()
    try {
      await persistHelper(dir, 'helper-a', 'content-alpha')
      await persistHelper(dir, 'helper-b', 'content-beta')
      const a = await discoverHelper(dir, 'helper-a')
      const b = await discoverHelper(dir, 'helper-b')
      expect(a!.content).toContain('content-alpha')
      expect(b!.content).toContain('content-beta')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── AC2 — idempotency ─────────────────────────────────────────────────────────

describe('persistHelper idempotency (AC2)', () => {
  it('second call with same content does not throw', async () => {
    const dir = makeTmpDir()
    try {
      const content = 'const x = 42'
      await persistHelper(dir, 'idempotent-key', content)
      await expect(persistHelper(dir, 'idempotent-key', content)).resolves.not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('second call with same content returns persisted=false (skip)', async () => {
    const dir = makeTmpDir()
    try {
      const content = 'const x = 42'
      await persistHelper(dir, 'idempotent-key', content)
      const result = await persistHelper(dir, 'idempotent-key', content)
      expect(result.persisted).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('first call returns persisted=true', async () => {
    const dir = makeTmpDir()
    try {
      const result = await persistHelper(dir, 'new-key', 'new content')
      expect(result.persisted).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('call with different content updates and returns persisted=true', async () => {
    const dir = makeTmpDir()
    try {
      await persistHelper(dir, 'update-key', 'v1 content')
      const result = await persistHelper(dir, 'update-key', 'v2 content')
      expect(result.persisted).toBe(true)
      const discovered = await discoverHelper(dir, 'update-key')
      expect(discovered!.content).toContain('v2 content')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
