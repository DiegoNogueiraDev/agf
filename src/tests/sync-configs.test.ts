/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.3 AC coverage: sync-configs.ts
 *
 * AC1: local and global in sync → syncConfigs returns all skipped-* changes
 * AC2: existing settings with custom key → sync merges without clobbering
 * AC3: checkConfigs on fresh dir → inSync=false; on synced dir → inSync=true
 * AC4: dryRun mode → no files written to disk
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { syncConfigs, checkConfigs } from '../core/init/sync-configs.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agf-sync-configs-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function settingsPath(cwd: string): string {
  return join(cwd, '.claude', 'settings.local.json')
}

function claudeMdPath(cwd: string): string {
  return join(cwd, 'CLAUDE.md')
}

// ── AC1: already-synced dir → skipped-* ──────────────────────────────────────

describe('AC1: already-synced project returns only skipped actions', () => {
  it('first sync creates files, second sync skips them', () => {
    syncConfigs(tmpDir) // first run — creates files

    const result = syncConfigs(tmpDir) // second run — should skip
    const nonSkipped = result.changes.filter((c) => c.action !== 'skipped-noop' && c.action !== 'skipped-existing')
    expect(nonSkipped).toHaveLength(0)
  })

  it('result.cwd matches the provided directory', () => {
    const result = syncConfigs(tmpDir)
    expect(result.cwd).toBe(tmpDir)
  })

  it('result.changes is a non-empty array', () => {
    const result = syncConfigs(tmpDir)
    expect(Array.isArray(result.changes)).toBe(true)
    expect(result.changes.length).toBeGreaterThan(0)
  })

  it('result.ides is an array (may be empty for a plain temp dir)', () => {
    const result = syncConfigs(tmpDir)
    expect(Array.isArray(result.ides)).toBe(true)
  })
})

// ── AC2: custom keys preserved after sync ────────────────────────────────────

describe('AC2: existing settings with custom keys — sync merges, does not clobber', () => {
  it('preserves custom top-level keys in settings.local.json', () => {
    // Pre-create settings with a custom key
    mkdirSync(join(tmpDir, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath(tmpDir),
      JSON.stringify(
        {
          customKey: 'custom-value',
          permissions: { allow: ['my-custom-perm'] },
        },
        null,
        2,
      ),
      'utf-8',
    )

    syncConfigs(tmpDir)

    const settings = JSON.parse(readFileSync(settingsPath(tmpDir), 'utf-8'))
    expect(settings.customKey).toBe('custom-value')
  })

  it('merges agf permissions into existing allow list without removing custom perms', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath(tmpDir),
      JSON.stringify(
        {
          permissions: { allow: ['Bash(my-tool:*)'] },
        },
        null,
        2,
      ),
      'utf-8',
    )

    syncConfigs(tmpDir)

    const settings = JSON.parse(readFileSync(settingsPath(tmpDir), 'utf-8'))
    const allow: string[] = settings.permissions?.allow ?? []
    // Custom perm preserved
    expect(allow).toContain('Bash(my-tool:*)')
    // agf perms added
    expect(allow.some((p: string) => p.includes('mcp__mcp-graph__'))).toBe(true)
  })

  it('does not overwrite existing CLAUDE.md', () => {
    const customContent = '# Custom CLAUDE.md\nDo not overwrite this.\n'
    writeFileSync(claudeMdPath(tmpDir), customContent, 'utf-8')

    syncConfigs(tmpDir)

    expect(readFileSync(claudeMdPath(tmpDir), 'utf-8')).toBe(customContent)
  })
})

// ── AC3: checkConfigs — inSync detection ──────────────────────────────────────

describe('AC3: checkConfigs detects drift vs in-sync state', () => {
  it('returns inSync=false for a fresh project with no config files', () => {
    const check = checkConfigs(tmpDir)
    expect(check.inSync).toBe(false)
    expect(check.drift.length).toBeGreaterThan(0)
  })

  it('returns inSync=true after syncConfigs has written all files', () => {
    syncConfigs(tmpDir)
    const check = checkConfigs(tmpDir)
    expect(check.inSync).toBe(true)
    expect(check.drift).toHaveLength(0)
  })

  it('drift contains entries with action "created" for files not yet present', () => {
    const check = checkConfigs(tmpDir)
    const actions = check.drift.map((c) => c.action)
    expect(actions).toContain('created')
  })
})

// ── AC4: dryRun — no files written ────────────────────────────────────────────

describe('AC4: dryRun mode does not write any files', () => {
  it('dryRun:true does not create settings.local.json', () => {
    syncConfigs(tmpDir, { dryRun: true })
    expect(existsSync(settingsPath(tmpDir))).toBe(false)
  })

  it('dryRun:true still returns change descriptors with "created" action', () => {
    const result = syncConfigs(tmpDir, { dryRun: true })
    const created = result.changes.filter((c) => c.action === 'created')
    expect(created.length).toBeGreaterThan(0)
  })

  it('dryRun=true does not create CLAUDE.md (emitClaudeMd is skipped)', () => {
    // dryRun skips emitClaudeMd entirely per the implementation
    syncConfigs(tmpDir, { dryRun: true })
    expect(existsSync(claudeMdPath(tmpDir))).toBe(false)
  })
})
