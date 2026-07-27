/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Drift guard: the leaf-cutter / golden-wren skills tell agents to call
 * `agf <cmd> --select data.X`. When a select path does NOT resolve, the output
 * layer silently returns the FULL envelope — the skill believes it got a tiny
 * projection but ships the whole payload every cycle (token waste). This test
 * runs the stable, arg-free commands those skills depend on and asserts every
 * referenced select path actually resolves, so field renames fail CI loudly.
 */
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = 'npx tsx src/cli/index.ts'
const TIMEOUT = 30000

const SKILL_FILES = [
  '.agents/skills/graph-builder-leafcutter/SKILL.md',
  '.agents/skills/graph-backlog-generation/SKILL.md',
]

/** Resolve a dot-path (e.g. "data.totals.saved") against an object; undefined if absent. */
function resolvePath(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

function runJson(cmd: string): { ok: boolean; data?: unknown } {
  // Commands that fail a gate (e.g. `quality`) exit non-zero but still print a
  // valid envelope on stdout; capture it from the thrown error in that case.
  let out: string
  try {
    out = execSync(`${CLI} ${cmd}`, { cwd: ROOT, timeout: TIMEOUT }).toString()
  } catch (err) {
    const e = err as { stdout?: Buffer }
    out = e.stdout?.toString() ?? ''
  }
  // The envelope is the last JSON line on stdout (logs are NDJSON on stderr).
  const line = out.trim().split('\n').filter(Boolean).pop() ?? '{}'
  return JSON.parse(line)
}

/**
 * Stable, argument-free commands the skills drive with --select, each paired with
 * the exact paths the skills reference. These produce deterministic data in any
 * initialized repo (no positional id, no conditional NO_TASKS).
 */
const STABLE_SELECT_CONTRACTS: Array<{ cmd: string; paths: string[] }> = [
  { cmd: 'savings', paths: ['data.totalSaved', 'data.savingsRate'] },
  { cmd: 'insights summary', paths: ['data.wip', 'data.bottlenecks', 'data.flowEfficiency'] },
  { cmd: 'learning stats', paths: ['data.accuracy', 'data.routing', 'data.worstRoutes', 'data.errorRate'] },
  { cmd: 'quality', paths: ['data.hotspots', 'data.debtHours', 'data.grade'] },
  { cmd: 'stats', paths: ['data.totalNodes', 'data.byStatus', 'data.byType'] },
]

describe('skill ↔ core select-contract drift guard', () => {
  it('skills reference --select data.* paths (regex sanity)', () => {
    const found = SKILL_FILES.flatMap((rel) => {
      const text = readFileSync(path.join(ROOT, rel), 'utf-8')
      return [...text.matchAll(/--select\s+(data\.[\w.,[\]*]+)/g)].map((m) => m[1])
    })
    expect(found.length).toBeGreaterThan(0)
  })

  for (const { cmd, paths } of STABLE_SELECT_CONTRACTS) {
    it(`agf ${cmd} --select ${paths.join(',')} resolves every path`, () => {
      const env = runJson(`${cmd} --select ${paths.join(',')}`)
      for (const p of paths) {
        expect(
          resolvePath(env, p),
          `${cmd}: select path "${p}" did not resolve (silent full-envelope fallback)`,
        ).not.toBe(undefined)
      }
    })
  }
})
