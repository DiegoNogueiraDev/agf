/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/harness-cmd.ts — harnessCommand factory wiring.
 */

import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harnessCommand } from '../cli/commands/harness-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

describe('harnessCommand', () => {
  it('builds the "harness" command with a description', () => {
    const cmd = harnessCommand()
    expect(cmd.name()).toBe('harness')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = harnessCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf harness --violations includes remediation advice (node_wire_927688c3b5b3)', () => {
  it('surfaces per-dimension advice when a scanned file has type violations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-advice-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      // No test file for this module (drops the 'tests' dimension score) and an
      // untyped `any` (drops 'types') — both below the 70-advice threshold.
      writeFileSync(join(dir, 'src/core/untyped.ts'), 'export function f(x: any): any { return x }\n')

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--violations', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { advice?: Array<{ dimension: string; files: unknown[] }> }
      expect(data.advice).toBeDefined()
      expect(data.advice!.length).toBeGreaterThan(0)
      expect(data.advice!.some((a) => a.dimension === 'types')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf harness --violations includes Pareto dimension priority (node_wire_e64f4522d25a)', () => {
  it('ranks dimensions by weighted gap and flags the top ~20% as Pareto', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-pareto-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(join(dir, 'src/core/untyped.ts'), 'export function f(x: any): any { return x }\n')

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--violations', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as {
        priority?: Array<{ dimension: string; impact: number; isPareto: boolean }>
      }
      expect(data.priority).toBeDefined()
      expect(data.priority!.length).toBeGreaterThan(0)
      expect(data.priority!.some((p) => p.isPareto)).toBe(true)
      // Sorted by impact descending.
      for (let i = 1; i < data.priority!.length; i++) {
        expect(data.priority![i - 1].impact).toBeGreaterThanOrEqual(data.priority![i].impact)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('omits priority when every dimension is already healthy', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await harnessCommand().parseAsync(['--violations', '-d', process.cwd()], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    const envelope = lastEnvelope(out)
    const data = envelope.data as { priority?: unknown }
    // This real repo scores well above 70 on every dimension today.
    expect(data.priority).toBeUndefined()
  })
})

describe('agf harness --remediate attaches per-violation fix suggestions (node_wire_76b8149dfea4)', () => {
  it('surfaces a suggested fix for an any-typed export, respecting the suppression store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-remediate-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(join(dir, 'src/core/untyped.ts'), 'export function f(x: any): any { return x }\n')

      const store = SqliteStore.open(dir)
      store.initProject('remediate-test')
      store.close()

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--remediate', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as {
        violations?: unknown[]
        remediation?: Array<{ ruleId: string; suggestedFix: string; confidence: number }>
      }
      // --remediate implies --violations even without passing the flag explicitly.
      expect(data.violations).toBeDefined()
      expect(data.remediation).toBeDefined()
      expect(data.remediation!.length).toBeGreaterThan(0)
      expect(data.remediation!.some((r) => r.ruleId === 'R001')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('omits remediation when there are no matched violations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-remediate-clean-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(
        join(dir, 'src/core/util.ts'),
        '/** Trims a string. */\nexport function util(s: string): string { return s.trim() }\n',
      )
      mkdirSync(join(dir, 'src/tests'), { recursive: true })
      writeFileSync(
        join(dir, 'src/tests/util.test.ts'),
        "import { it, expect } from 'vitest'\nimport { util } from '../core/util.js'\nit('trims', () => { expect(util(' a ')).toBe('a') })\n",
      )

      const store = SqliteStore.open(dir)
      store.initProject('remediate-clean-test')
      store.close()

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--remediate', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { remediation?: unknown }
      expect(data.remediation).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf harness --violations groups correlated weak dimensions into root-cause clusters (node_wire_16f8f7752bf4)', () => {
  it('surfaces a code_quality cluster when the types dimension is weak', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-clusters-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(join(dir, 'src/core/untyped.ts'), 'export function f(x: any): any { return x }\n')

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--violations', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as {
        clusters?: Array<{ rootCause: string; affectedDimensions: string[]; combinedImpact: number }>
      }
      expect(data.clusters).toBeDefined()
      expect(data.clusters!.length).toBeGreaterThan(0)
      expect(data.clusters!.some((c) => c.affectedDimensions.includes('types'))).toBe(true)
      // Sorted by combinedImpact descending.
      for (let i = 1; i < data.clusters!.length; i++) {
        expect(data.clusters![i - 1].combinedImpact).toBeGreaterThanOrEqual(data.clusters![i].combinedImpact)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('omits clusters when every dimension is already healthy', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await harnessCommand().parseAsync(['--violations', '-d', process.cwd()], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    const envelope = lastEnvelope(out)
    const data = envelope.data as { clusters?: unknown }
    expect(data.clusters).toBeUndefined()
  })
})

describe('agf harness --evolution attaches earliest-vs-latest score delta (node_wire_fa21480d8f4a)', () => {
  it('omits evolution on the first scan, then attaches it once history has 2+ rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-evolution-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(join(dir, 'src/core/util.ts'), 'export function util(s: string): string { return s.trim() }\n')

      const store = SqliteStore.open(dir)
      store.initProject('harness-evolution-test')
      store.close()

      async function runHarness(): Promise<Record<string, unknown>> {
        const out: string[] = []
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
          out.push(String(chunk))
          return true
        })
        try {
          await harnessCommand().parseAsync(['--evolution', '-d', dir], { from: 'user' })
        } finally {
          spy.mockRestore()
        }
        return lastEnvelope(out)
      }

      const first = await runHarness()
      const firstData = first.data as { evolution?: unknown }
      expect(firstData.evolution).toBeUndefined()

      const second = await runHarness()
      const secondData = second.data as {
        evolution?: { earliest: { score: number }; latest: { score: number }; delta: number; direction: string }
      }
      expect(secondData.evolution).toBeDefined()
      expect(typeof secondData.evolution!.delta).toBe('number')
      expect(['improving', 'declining', 'stable']).toContain(secondData.evolution!.direction)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf harness --contracts wires the contract-engine (node_wire_73705ed2e11f)', () => {
  it('reports violations found by rules compiled from .claude/rules/*.md', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-contracts-'))
    try {
      mkdirSync(join(dir, '.claude/rules'), { recursive: true })
      writeFileSync(join(dir, '.claude/rules/architecture.md'), '- **Core** — core/ must not import from `cli/`\n')
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(
        join(dir, 'src/core/offender.ts'),
        'import { thing } from "../cli/thing.js"\nexport const x = thing\n',
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--contracts', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { violations: Array<{ file: string }>; hasErrors: boolean }
      expect(data.hasErrors).toBe(true)
      expect(data.violations.some((v) => v.file === 'src/core/offender.ts')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf harness --fuzz wires fuzz-sec (node_wire_82163497add6)', () => {
  it('fuzzes exported functions of the given module and reports crashes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-fuzz-'))
    try {
      writeFileSync(
        join(dir, 'boundary.mjs'),
        [
          'export function fragile(input) {',
          "  if (input.includes('`')) throw new Error('shell injection detected')",
          '  return input',
          '}',
        ].join('\n'),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--fuzz', 'boundary.mjs', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { functionsScanned: string[]; findings: Array<{ fn: string }> }
      expect(data.functionsScanned).toContain('fragile')
      expect(data.findings.some((f) => f.fn === 'fragile')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf harness --validate-remediation wires the remediation-validator (node_wire_077325d6c2e0)', () => {
  it('confirms a violation fixed since the given before-snapshot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-validate-remediation-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      // Current tree is clean — represents the "after" state post-fix.
      writeFileSync(
        join(dir, 'src/core/util.ts'),
        '/** Trims a string. */\nexport function util(s: string): string { return s.trim() }\n',
      )

      const beforeFile = join(dir, 'before.json')
      writeFileSync(
        beforeFile,
        JSON.stringify({
          violations: [
            {
              file: 'src/core/util.ts',
              line: 1,
              dimension: 'types',
              violationType: 'any_usage',
              evidence: 'any',
              confidence: 1.0,
            },
          ],
        }),
      )

      const store = SqliteStore.open(dir)
      store.initProject('validate-remediation-test')
      store.close()

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--validate-remediation', beforeFile, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as {
        confirmed: number
        autoSuppressed: number
        total: number
        metaRulesCreated: number
      }
      expect(data.confirmed).toBe(1)
      expect(data.autoSuppressed).toBe(0)
      expect(data.total).toBe(1)
      expect(data.metaRulesCreated).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf harness --self-heal wires the self-healing-planner (node_wire_e9adadc0925e)', () => {
  it('emits quick wins and dry-run micro-PR plans for dimensions scoring below threshold', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-self-heal-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      // No test file for this module (drops 'tests') and an untyped `any` (drops
      // 'types') — both below the self-healing IMPROVEMENT_THRESHOLD (70).
      writeFileSync(join(dir, 'src/core/untyped.ts'), 'export function f(x: any): any { return x }\n')

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--self-heal', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as {
        quickWins: Array<{ dimension: string; potentialImpact: number }>
        plans: Array<{ dimension: string; dryRun: boolean; rejected: boolean }>
      }
      expect(data.quickWins.length).toBeGreaterThan(0)
      expect(data.quickWins.some((w) => w.dimension === 'types')).toBe(true)
      expect(data.plans.length).toBe(data.quickWins.length)
      expect(data.plans.every((p) => p.dryRun === true)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf harness --synth wires synthetic-data-gen (node_wire_a2af6fe7faa4)', () => {
  it('generates minimal + edge-case fixtures for every exported Zod object schema of the given module', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-harness-synth-'))
    try {
      writeFileSync(
        join(dir, 'schemas.mjs'),
        [
          "import { z } from 'zod/v4'",
          'export const UserSchema = z.object({ name: z.string().min(1).max(20), age: z.number().min(0).max(120) })',
        ].join('\n'),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await harnessCommand().parseAsync(['--synth', 'schemas.mjs', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { schemasScanned: string[]; fixtures: Array<{ schema: string }> }
      expect(data.schemasScanned).toContain('UserSchema')
      expect(data.fixtures.some((f) => f.schema === 'UserSchema')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
