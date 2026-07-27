/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installHooks, uninstallHooks, listInstalledHooks, detectConfigDrift } from '../core/hooks/install.js'
import { hooksCommand } from '../cli/commands/hooks-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('core/hooks/install — installHooks/uninstallHooks/listInstalledHooks/detectConfigDrift', () => {
  it('installHooks writes the balanced profile into .claude/settings.local.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hooks-install-'))
    try {
      const change = installHooks(dir, { profile: 'balanced' })
      expect(change.action).toBe('created')

      const path = join(dir, '.claude', 'settings.local.json')
      expect(existsSync(path)).toBe(true)
      const settings = JSON.parse(readFileSync(path, 'utf8'))
      expect(settings.hooks.SessionStart).toBeDefined()
      expect(settings.hooks.Stop).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('installHooks is idempotent — re-install does not duplicate entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hooks-install-'))
    try {
      installHooks(dir, { profile: 'balanced' })
      const second = installHooks(dir, { profile: 'balanced' })
      expect(second.action).toBe('skipped-noop')
      expect(listInstalledHooks(dir).filter((h) => h.event === 'SessionStart')).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('listInstalledHooks reflects only our tagged entries, not pre-existing user hooks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hooks-install-'))
    try {
      installHooks(dir, { profile: 'minimal' })
      const installed = listInstalledHooks(dir)
      expect(installed).toHaveLength(1)
      expect(installed[0]?.event).toBe('SessionStart')
      expect(installed[0]?.profile).toBe('minimal')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uninstallHooks removes our entries and leaves the file a no-op on a fresh dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hooks-install-'))
    try {
      const noop = uninstallHooks(dir)
      expect(noop.action).toBe('skipped-noop')

      installHooks(dir, { profile: 'balanced' })
      const removed = uninstallHooks(dir)
      expect(removed.action).toBe('patched')
      expect(listInstalledHooks(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detectConfigDrift reports uninstalled, ok, and stale states', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hooks-install-'))
    try {
      expect(detectConfigDrift(dir).status).toBe('uninstalled')

      installHooks(dir, { profile: 'balanced' })
      expect(detectConfigDrift(dir).status).toBe('ok')

      const path = join(dir, '.claude', 'settings.local.json')
      const settings = JSON.parse(readFileSync(path, 'utf8'))
      settings.hooks.SessionStart[0].__mg__.version = 'v0'
      writeFileSync(path, JSON.stringify(settings, null, 2))
      const drift = detectConfigDrift(dir)
      expect(drift.status).toBe('stale')
      expect(drift.hint).toContain('mcp-graph hooks install')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks install/uninstall/status — CLI wiring', () => {
  it('agf hooks install writes the settings file and returns the change envelope', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hooks-cli-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['install', '--profile', 'minimal', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { action: string; path: string }
      expect(envelope.ok).toBe(true)
      expect(data.action).toBe('created')
      expect(existsSync(join(dir, '.claude', 'settings.local.json'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('agf hooks install rejects an unknown --profile', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hooks-cli-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['install', '--profile', 'bogus', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe('INVALID_PROFILE')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('agf hooks status reports installed hooks + drift; agf hooks uninstall clears them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-hooks-cli-'))
    try {
      await hooksCommand().parseAsync(['install', '--profile', 'balanced', '-d', dir], { from: 'user' })

      let out: string[] = []
      let spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['status', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }
      const statusEnvelope = lastEnvelope(out)
      const statusData = statusEnvelope.data as { installed: unknown[]; drift: { status: string } }
      expect(statusEnvelope.ok).toBe(true)
      expect(statusData.installed.length).toBeGreaterThan(0)
      expect(statusData.drift.status).toBe('ok')

      out = []
      spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['uninstall', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }
      const uninstallEnvelope = lastEnvelope(out)
      expect(uninstallEnvelope.ok).toBe(true)
      expect(listInstalledHooks(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
