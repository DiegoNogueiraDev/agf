/*!
 * Regression: agf init must MATERIALIZE the hook scripts it references, not just
 * wire the settings.json reference. Before this, installBashCompressHook /
 * installFileSizeGuardHook wrote `.claude/settings.json` pointing at
 * scripts/hooks/*.mjs but never created the files — so every new project got a
 * broken (silent, fail-open) hook. This proves: file materialized, byte-identical
 * to the repo copy, idempotent, fail-open, and zero broken references after init.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installBashCompressHook } from '../core/hooks/bash-compress-hook.js'
import { installFileSizeGuardHook } from '../core/hooks/file-size-guard-hook.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const CASES = [
  { install: installBashCompressHook, rel: 'scripts/hooks/compress-bash-output.mjs' },
  { install: installFileSizeGuardHook, rel: 'scripts/hooks/guard-file-size.mjs' },
] as const

describe('init hook scripts are materialized on disk', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-hook-mat-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  for (const { install, rel } of CASES) {
    it(`writes ${rel} into the project`, () => {
      install(dir)
      expect(existsSync(join(dir, rel))).toBe(true)
    })

    it(`materialized ${rel} is byte-identical to the repo copy`, () => {
      install(dir)
      const written = readFileSync(join(dir, rel), 'utf8')
      const repo = readFileSync(join(REPO_ROOT, rel), 'utf8')
      expect(written).toBe(repo)
    })

    it(`is idempotent for ${rel} — twice, no throw, present once`, () => {
      install(dir)
      expect(() => install(dir)).not.toThrow()
      expect(existsSync(join(dir, rel))).toBe(true)
    })
  }

  it('is fail-open when the script target cannot be written', () => {
    // Make scripts/hooks a FILE so mkdir/write of the .mjs underneath fails.
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts', 'hooks'), 'block', 'utf8')
    expect(() => installBashCompressHook(dir)).not.toThrow()
    expect(() => installFileSizeGuardHook(dir)).not.toThrow()
  })

  it('leaves zero broken hook references — every scripts/hooks/*.mjs command resolves to a file', () => {
    installBashCompressHook(dir)
    installFileSizeGuardHook(dir)
    const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'))
    const commands: string[] = []
    for (const phase of Object.values(settings.hooks ?? {})) {
      for (const entry of phase as Array<{ hooks?: Array<{ command: string }> }>) {
        for (const h of entry.hooks ?? []) commands.push(h.command)
      }
    }
    const scriptRefs = commands
      .map((c) => c.match(/scripts\/hooks\/[\w.-]+\.mjs/)?.[0])
      .filter((x): x is string => Boolean(x))
    expect(scriptRefs.length).toBeGreaterThanOrEqual(2)
    for (const ref of scriptRefs) {
      expect(existsSync(join(dir, ref)), `${ref} referenced but not materialized`).toBe(true)
    }
  })
})
