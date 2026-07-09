/*!
 * Task node_3e50ca8fb654 — install Bash compression hook into .claude/settings.json.
 *
 * AC1: Fresh agf init → .claude/settings.json has PostToolUse Bash hook → compress script.
 * AC2: Re-running install → hook not duplicated; existing hooks preserved.
 * AC3: agf update re-asserts hook.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installBashCompressHook } from '../core/hooks/bash-compress-hook.js'

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-bash-hook-'))
  mkdirSync(join(dir, '.claude'), { recursive: true })
  return dir
}

describe('installBashCompressHook', () => {
  it('creates settings.json with PostToolUse Bash hook entry (AC1)', () => {
    const dir = makeProjectDir()
    try {
      installBashCompressHook(dir)
      const settingsPath = join(dir, '.claude', 'settings.json')
      expect(existsSync(settingsPath)).toBe(true)
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const hooks: unknown[] = settings?.hooks?.PostToolUse ?? []
      const bashHook = hooks.find(
        (h) => typeof h === 'object' && h !== null && 'matcher' in h && (h as { matcher: string }).matcher === 'Bash',
      )
      expect(bashHook).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is idempotent — re-running does not duplicate the hook (AC2)', () => {
    const dir = makeProjectDir()
    try {
      installBashCompressHook(dir)
      installBashCompressHook(dir)
      const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf-8'))
      const hooks: unknown[] = settings?.hooks?.PostToolUse ?? []
      const bashHooks = hooks.filter(
        (h) => typeof h === 'object' && h !== null && 'matcher' in h && (h as { matcher: string }).matcher === 'Bash',
      )
      expect(bashHooks.length).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('preserves existing hooks in settings.json (AC2)', () => {
    const dir = makeProjectDir()
    try {
      const settingsPath = join(dir, '.claude', 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo hi' }] }] },
        }),
        'utf-8',
      )
      installBashCompressHook(dir)
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const hooks: unknown[] = settings?.hooks?.PostToolUse ?? []
      const writeHook = hooks.find(
        (h) => typeof h === 'object' && h !== null && 'matcher' in h && (h as { matcher: string }).matcher === 'Write',
      )
      expect(writeHook).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
