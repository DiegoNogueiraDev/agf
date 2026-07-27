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

import { AGF_UNIVERSAL_RULES } from '../core/config/cli-reference-content.js'
import {
  generateClaudeMdSection,
  generateCodexAgentsMdSection,
  generateCopilotInstructions,
} from '../core/config/ai-memory-generator.js'

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

// ── Cost of the universal floor (node_6acb8ee3a3a0) ───────────────────
//
// The suite above measures files already in the repo. It cannot see what the
// generator produces TODAY, which is what every downstream project will receive
// — so a block added to the generator could double the context bill of every new
// project while these assertions stayed green.
//
// The tension worth naming: the universal doctrine is a floor, so it survives
// even ultra-lean. That mode exists to be minimal, which means the floor is a
// large share of it by construction. The budget below is that share, made
// explicit and bounded, rather than left to grow unnoticed one rule at a time.
const UNIVERSAL_BLOCK_MAX_BYTES = 4_500
const ULTRA_LEAN_MAX_SHARE = 0.5

const bytes = (s: string): number => Buffer.byteLength(s, 'utf-8')

describe('universal doctrine — what it costs every generated project', () => {
  it('the block itself stays within its own budget', () => {
    const size = bytes(AGF_UNIVERSAL_RULES)
    expect(
      size,
      `universal block is ${size} bytes, over its ${UNIVERSAL_BLOCK_MAX_BYTES} budget by ${size - UNIVERSAL_BLOCK_MAX_BYTES}`,
    ).toBeLessThanOrEqual(UNIVERSAL_BLOCK_MAX_BYTES)
  })

  it('every generated body stays under the same context budget as a shipped file', () => {
    // MAX_CONTEXT_BYTES is deliberately NOT raised: a floor that forces the
    // ceiling up has stopped being a floor.
    for (const mode of ['ultra-lean', 'lean', 'full'] as const) {
      for (const [name, body] of [
        ['claude', generateClaudeMdSection('demo', mode)],
        ['codex', generateCodexAgentsMdSection('demo', mode)],
        ['copilot', generateCopilotInstructions('demo', mode)],
      ] as const) {
        const size = bytes(body)
        expect(size, `${name}/${mode} is ${size} bytes, over ${MAX_CONTEXT_BYTES}`).toBeLessThanOrEqual(
          MAX_CONTEXT_BYTES,
        )
      }
    }
  })

  it('the floor does not dominate the leanest mode', () => {
    // ultra-lean is the mode a cost-sensitive project picks. If the floor grows
    // past half of it, the mode no longer means what its name promises.
    const body = bytes(generateClaudeMdSection('demo', 'ultra-lean'))
    const share = bytes(AGF_UNIVERSAL_RULES) / body
    expect(
      share,
      `universal block is ${(share * 100).toFixed(1)}% of ultra-lean (${bytes(AGF_UNIVERSAL_RULES)} of ${body} bytes)`,
    ).toBeLessThanOrEqual(ULTRA_LEAN_MAX_SHARE)
  })

  it('reports the measured cost so a reviewer sees the number, not a claim', () => {
    // The AC asks for the figure to be explicit. Asserting a plausible range
    // keeps it honest: a block that silently halved would be as suspicious as
    // one that doubled.
    const size = bytes(AGF_UNIVERSAL_RULES)
    expect(size).toBeGreaterThan(2_000)
    expect(size).toBeLessThan(UNIVERSAL_BLOCK_MAX_BYTES)
  })
})
