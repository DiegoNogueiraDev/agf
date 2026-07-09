import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySection, MARKER_START, MARKER_END } from '../core/config/ai-memory-generator.js'
import { generateCliContext } from '../core/spec-templates/agent-format.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const CONTRACT_HEADING = '## agf JSON Output Contract'

/**
 * Upper bound for a tracked agent-context file. The lean form is ~29 KB and the
 * full form (contract inside the markers) adds only a few KB. A non-idempotent
 * appender previously ballooned these to ~401 KB by stranding the contract section
 * 17×. This bound is comfortably above any legitimate generated file yet far below
 * the bloat regression, so re-bloat fails CI loudly.
 */
const MAX_CONTEXT_BYTES = 120_000

/** Git-tracked agent-context files that ship in the repo (auto-loaded by agents). */
const TRACKED_CONTEXT_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursor/rules/agent-graph-flow.md',
  '.windsurf/rules/agent-graph-flow.md',
]

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    count++
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return count
}

describe('tracked context files — no bloat regression', () => {
  for (const rel of TRACKED_CONTEXT_FILES) {
    it(`${rel} has at most one contract section and stays under the size bound`, () => {
      const abs = path.join(ROOT, rel)
      expect(existsSync(abs), `${rel} should exist`).toBe(true)
      const content = readFileSync(abs, 'utf-8')

      // The 17× stranded-duplication bug class: never more than one contract section.
      expect(
        countOccurrences(content, CONTRACT_HEADING),
        `${rel} has duplicated "${CONTRACT_HEADING}" sections (bloat regression)`,
      ).toBeLessThanOrEqual(1)

      // Exactly one managed marker pair — no accumulated blocks.
      expect(countOccurrences(content, MARKER_START)).toBe(1)
      expect(countOccurrences(content, MARKER_END)).toBe(1)

      expect(
        Buffer.byteLength(content, 'utf-8'),
        `${rel} exceeds ${MAX_CONTEXT_BYTES} bytes — context bloat`,
      ).toBeLessThanOrEqual(MAX_CONTEXT_BYTES)
    })
  }

  it('the orphaned docs/.windsurf copy stays deleted', () => {
    expect(existsSync(path.join(ROOT, 'docs/.windsurf'))).toBe(false)
  })
})

describe('generateCliContext + applySection — idempotent regen (no re-bloat)', () => {
  const providers = ['claude', 'copilot', 'codex', 'cursor', 'windsurf', 'gemini'] as const

  for (const cli of providers) {
    it(`${cli}: regenerating in full mode is a fixed point with one contract`, () => {
      const section = generateCliContext(cli, 'demo-project', 'full')
      const once = applySection('', section)
      const twice = applySection(once, generateCliContext(cli, 'demo-project', 'full'))
      const thrice = applySection(twice, generateCliContext(cli, 'demo-project', 'full'))

      // Byte-identical across regens — the core idempotency guarantee.
      expect(twice).toBe(once)
      expect(thrice).toBe(once)

      // The contract lives inside the markers exactly once; never accumulates.
      expect(countOccurrences(once, CONTRACT_HEADING)).toBe(1)
      expect(countOccurrences(once, MARKER_START)).toBe(1)
      expect(countOccurrences(once, MARKER_END)).toBe(1)
    })
  }
})
