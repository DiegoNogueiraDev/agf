/*!
 * Task node_cbc57b61bdbb — TreeSitterAnalyzer degradation + parse tests.
 *
 * AC1: Grammar absent → analyzeFile returns empty AnalyzedFile, no throw.
 * AC2: isTreeSitterAvailable()===false → real-parse suite is skipped (describe.skipIf).
 * AC3: isTreeSitterAvailable()===true → at least 1 symbol extracted from a Python fixture.
 * AC4: Suite is deterministic regardless of grammar availability.
 */

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { TreeSitterAnalyzer } from '../core/code/treesitter/treesitter-analyzer.js'
import { isTreeSitterAvailable } from '../core/code/treesitter/treesitter-manager.js'

describe('TreeSitterAnalyzer — degradation (AC1)', () => {
  it('returns empty AnalyzedFile for an unsupported extension without throwing', async () => {
    const analyzer = new TreeSitterAnalyzer()
    await analyzer.initialize()
    const dir = mkdtempSync(join(tmpdir(), 'ts-ana-'))
    try {
      const file = join(dir, 'foo.unknownext')
      writeFileSync(file, 'hello', 'utf-8')
      const result = await analyzer.analyzeFile(file, dir)
      expect(result.symbols).toEqual([])
      expect(result.relations).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns valid AnalyzedFile structure when parser is unavailable', async () => {
    const analyzer = new TreeSitterAnalyzer()
    // Do NOT call initialize() — parser will be null, should degrade silently
    const dir = mkdtempSync(join(tmpdir(), 'ts-ana-'))
    try {
      const file = join(dir, 'test.py')
      writeFileSync(file, 'def hello(): pass\n', 'utf-8')
      const result = await analyzer.analyzeFile(file, dir)
      expect(result).toMatchObject({ symbols: expect.any(Array), relations: expect.any(Array) })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

const tsAvailable = await isTreeSitterAvailable().catch(() => false)

describe.skipIf(!tsAvailable)('TreeSitterAnalyzer — real parse gated on availability (AC2/AC3)', () => {
  it('extracts at least 1 symbol from a Python fixture (AC3)', async () => {
    const analyzer = new TreeSitterAnalyzer()
    await analyzer.initialize()
    const dir = mkdtempSync(join(tmpdir(), 'ts-ana-'))
    try {
      const file = join(dir, 'sample.py')
      writeFileSync(file, 'def greet(name):\n    return name\n', 'utf-8')
      const result = await analyzer.analyzeFile(file, dir)
      expect(result.symbols.length).toBeGreaterThanOrEqual(1)
      expect(result.symbols[0].name).toBe('greet')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('attaches csharp enrichment metadata (modifiers) for a public C# class (node_wire_c3b44c46dffe)', async () => {
    const analyzer = new TreeSitterAnalyzer()
    await analyzer.initialize()
    const dir = mkdtempSync(join(tmpdir(), 'ts-ana-'))
    try {
      const file = join(dir, 'Sample.cs')
      writeFileSync(
        file,
        ['namespace Demo {', '  public class Greeter {', '    public string Greet() => "hi";', '  }', '}', ''].join(
          '\n',
        ),
        'utf-8',
      )
      const result = await analyzer.analyzeFile(file, dir)
      const cls = result.symbols.find((s) => s.name === 'Greeter')
      expect(cls).toBeDefined()
      const metadata = cls?.metadata as { csharp?: { modifiers: string[] } } | undefined
      expect(metadata?.csharp?.modifiers).toContain('public')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
