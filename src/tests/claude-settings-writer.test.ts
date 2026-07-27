/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setGear, GEAR_SETTINGS } from '../core/model-hub/claude-settings-writer.js'

let home: string
let settingsPath: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agf-claude-settings-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  settingsPath = join(home, '.claude', 'settings.json')
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('setGear', () => {
  it('writes gear=3 as model=sonnet[1m] + effortLevel=medium, preserving existing hooks and other keys', () => {
    const existing = {
      hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo hi' }] }] },
      someOtherKey: 'untouched',
    }
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8')

    setGear(3, home)

    const written = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(written.model).toBe(GEAR_SETTINGS[3].model)
    expect(written.effortLevel).toBe(GEAR_SETTINGS[3].effortLevel)
    expect(written.hooks).toEqual(existing.hooks)
    expect(written.someOtherKey).toBe('untouched')
  })

  it('gear=3 resolves to model=sonnet[1m] and effortLevel=medium (the AC-given mapping)', () => {
    expect(GEAR_SETTINGS[3]).toEqual({ model: 'sonnet[1m]', effortLevel: 'medium' })
  })

  it('setGear("default") removes model and effortLevel, keeping the rest intact', () => {
    const existing = { model: 'opus', effortLevel: 'high', hooks: { PreToolUse: [] }, keepMe: 42 }
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8')

    setGear('default', home)

    const written = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(written.model).toBeUndefined()
    expect(written.effortLevel).toBeUndefined()
    expect(written.hooks).toEqual(existing.hooks)
    expect(written.keepMe).toBe(42)
  })

  it('creates settings.json when it does not exist yet', () => {
    setGear(1, home)
    const written = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(written.model).toBe(GEAR_SETTINGS[1].model)
  })

  it('is idempotent — calling setGear twice with the same gear produces the same file', () => {
    setGear(4, home)
    const first = readFileSync(settingsPath, 'utf-8')
    setGear(4, home)
    const second = readFileSync(settingsPath, 'utf-8')
    expect(second).toBe(first)
  })

  it('completes a read+merge+write cycle in under 200ms', () => {
    const existing = { hooks: { PreToolUse: [], PostToolUse: [] }, a: 1, b: 2, c: 3 }
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8')

    const start = performance.now()
    setGear(2, home)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(200)
  })

  it('maps every gear (1-4) to a defined {model, effortLevel} pair', () => {
    for (const gear of [1, 2, 3, 4] as const) {
      expect(GEAR_SETTINGS[gear].model).toBeTruthy()
      expect(GEAR_SETTINGS[gear].effortLevel).toBeTruthy()
    }
  })
})
