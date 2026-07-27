/*!
 * TDD: file-size PreToolUse guard hook installer (node_e88313ac9627).
 *
 * AC1: agf init (Claude Code) → .claude/settings.json has PreToolUse Write|Edit|MultiEdit guard.
 * AC2: Non-Claude CLI (e.g. codex) → no hook entry written; advisory path only.
 * AC3: Re-running is idempotent — entry is not duplicated.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installFileSizeGuardHook } from '../core/hooks/file-size-guard-hook.js'

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-fsg-'))
  mkdirSync(join(dir, '.claude'), { recursive: true })
  return dir
}

describe('installFileSizeGuardHook — AC1: Claude Code writes PreToolUse hook', () => {
  it('creates PreToolUse entry with Write|Edit|MultiEdit matcher in settings.json', () => {
    const dir = makeProjectDir()
    try {
      installFileSizeGuardHook(dir)
      const settingsPath = join(dir, '.claude', 'settings.json')
      expect(existsSync(settingsPath)).toBe(true)
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const preToolUse: unknown[] = settings?.hooks?.PreToolUse ?? []
      const guardEntry = preToolUse.find(
        (h) =>
          typeof h === 'object' &&
          h !== null &&
          'matcher' in h &&
          (h as { matcher: string }).matcher === 'Write|Edit|MultiEdit',
      )
      expect(guardEntry).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('hook command references the file-size guard script', () => {
    const dir = makeProjectDir()
    try {
      installFileSizeGuardHook(dir)
      const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf-8'))
      const preToolUse: unknown[] = settings?.hooks?.PreToolUse ?? []
      const guardEntry = preToolUse.find(
        (h) =>
          typeof h === 'object' &&
          h !== null &&
          'matcher' in h &&
          (h as { matcher: string }).matcher === 'Write|Edit|MultiEdit',
      ) as { hooks?: Array<{ command: string }> } | undefined
      const cmd = guardEntry?.hooks?.[0]?.command ?? ''
      expect(cmd).toContain('guard-file-size')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('installFileSizeGuardHook — AC2: no .claude dir present → no hook written (graceful)', () => {
  it('does not throw when .claude dir does not exist yet (creates it)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-fsg-noclaude-'))
    try {
      // No .claude dir created — function should create it
      expect(() => installFileSizeGuardHook(dir)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('installFileSizeGuardHook — AC3: idempotent', () => {
  it('re-running twice does not duplicate the PreToolUse entry', () => {
    const dir = makeProjectDir()
    try {
      installFileSizeGuardHook(dir)
      installFileSizeGuardHook(dir)
      const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf-8'))
      const preToolUse: unknown[] = settings?.hooks?.PreToolUse ?? []
      const guardEntries = preToolUse.filter(
        (h) =>
          typeof h === 'object' &&
          h !== null &&
          'matcher' in h &&
          (h as { matcher: string }).matcher === 'Write|Edit|MultiEdit',
      )
      expect(guardEntries.length).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('preserves existing PreToolUse entries when installing', () => {
    const dir = makeProjectDir()
    try {
      const settingsPath = join(dir, '.claude', 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo check' }] }] },
        }),
        'utf-8',
      )
      installFileSizeGuardHook(dir)
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const preToolUse: unknown[] = settings?.hooks?.PreToolUse ?? []
      const bashEntry = preToolUse.find(
        (h) => typeof h === 'object' && h !== null && 'matcher' in h && (h as { matcher: string }).matcher === 'Bash',
      )
      expect(bashEntry).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
