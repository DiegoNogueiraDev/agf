/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Output contract guard: every `agf` command must emit its result through the
 * JSON envelope (createCliOutput → writeEnvelope). No command may write raw
 * text or chalk colors to STDOUT — that would break the "stdout is pure JSON"
 * contract host LLM CLIs depend on. (Human progress/ANSI on STDERR is fine —
 * that's where the NDJSON logger and interactive prompts already live.)
 *
 * Exempt: interactive surfaces that own the terminal (tui/ui) and are not
 * consumed as machine output.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const COMMANDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../cli/commands')

/** Interactive surfaces render a UI, not JSON output — not part of the contract. */
const EXEMPT = new Set(['tui-cmd.ts', 'ui-cmd.ts'])

const RAW_PATTERNS: Array<[RegExp, string]> = [
  [/console\.log\(/, 'console.log (→ stdout)'],
  [/process\.stdout\.write\(/, 'process.stdout.write'],
  [/from ['"]chalk['"]/, 'chalk import'],
]

describe('output contract — stdout is pure JSON', () => {
  const files = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.ts') && !EXEMPT.has(f))

  it('finds the command files', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('no command writes raw stdout / ANSI / chalk (use createCliOutput)', () => {
    const violations: string[] = []
    for (const f of files) {
      const src = readFileSync(path.join(COMMANDS_DIR, f), 'utf-8')
      for (const [re, label] of RAW_PATTERNS) {
        if (re.test(src)) violations.push(`${f}: ${label}`)
      }
    }
    expect(violations, `raw output found:\n${violations.join('\n')}`).toEqual([])
  })

  it('no command writes {ok:true} then process.exit(1) — the envelope must match the exit code', () => {
    const violations: string[] = []
    for (const f of files) {
      const lines = readFileSync(path.join(COMMANDS_DIR, f), 'utf-8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!/\bout\.ok\(/.test(lines[i])) continue
        // an out.ok() success emit immediately followed (≤3 lines) by an error exit lies.
        const window = lines.slice(i + 1, i + 4).join('\n')
        if (/process\.exit\(1\)/.test(window)) violations.push(`${f}:${i + 1} out.ok → process.exit(1)`)
      }
    }
    expect(violations, `contradictory envelope:\n${violations.join('\n')}`).toEqual([])
  })
})
