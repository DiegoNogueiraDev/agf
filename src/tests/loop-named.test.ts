/*!
 * TDD: agf loop save/list/run <name> — named reusable loops (node_15ba41be36e0).
 *
 * AC1: loop save nightly --every 1h → persisted; loop list includes it.
 * AC2: loop run nightly → re-executes with saved interval+rubric.
 * AC3: duplicate name without --force → error, no overwrite.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { saveNamedLoop, listNamedLoops, loadNamedLoop, type NamedLoopDef } from '../core/autonomy/named-loops.js'

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'agf-named-loops-'))
}

describe('saveNamedLoop + listNamedLoops — AC1', () => {
  it('AC1: save a loop def → list returns it by name', () => {
    const dir = makeTmp()
    try {
      saveNamedLoop(dir, 'nightly', { every: '1h', goal: undefined })
      const loops = listNamedLoops(dir)
      expect(loops.some((l) => l.name === 'nightly')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('AC1: saved entry preserves interval and goal', () => {
    const dir = makeTmp()
    try {
      saveNamedLoop(dir, 'hourly', { every: '30m', goal: 'rubric.json' })
      const loops = listNamedLoops(dir)
      const entry = loops.find((l) => l.name === 'hourly')
      expect(entry?.every).toBe('30m')
      expect(entry?.goal).toBe('rubric.json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('loadNamedLoop — AC2', () => {
  it('AC2: loadNamedLoop returns the saved definition for run re-execution', () => {
    const dir = makeTmp()
    try {
      saveNamedLoop(dir, 'nightly', { every: '1h', goal: 'rubric.json' })
      const def = loadNamedLoop(dir, 'nightly')
      expect(def).not.toBeNull()
      expect(def?.every).toBe('1h')
      expect(def?.goal).toBe('rubric.json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('loadNamedLoop returns null for unknown name', () => {
    const dir = makeTmp()
    try {
      const def = loadNamedLoop(dir, 'unknown')
      expect(def).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('saveNamedLoop duplicate guard — AC3', () => {
  it('AC3: saving duplicate name without force throws', () => {
    const dir = makeTmp()
    try {
      saveNamedLoop(dir, 'nightly', { every: '1h' })
      expect(() => saveNamedLoop(dir, 'nightly', { every: '2h' })).toThrow(/already exists/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('AC3: saving duplicate name with force overwrites', () => {
    const dir = makeTmp()
    try {
      saveNamedLoop(dir, 'nightly', { every: '1h' })
      saveNamedLoop(dir, 'nightly', { every: '2h' }, { force: true })
      const def = loadNamedLoop(dir, 'nightly')
      expect(def?.every).toBe('2h')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('listNamedLoops — multiple entries', () => {
  it('lists all saved loops', () => {
    const dir = makeTmp()
    try {
      saveNamedLoop(dir, 'a', { every: '5m' })
      saveNamedLoop(dir, 'b', { every: '1h' })
      const loops = listNamedLoops(dir)
      expect(loops.length).toBe(2)
      expect(loops.map((l) => l.name).sort()).toEqual(['a', 'b'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
