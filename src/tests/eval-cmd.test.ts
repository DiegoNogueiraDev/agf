import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evalCommand } from '../cli/commands/eval-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

describe('evalCommand', () => {
  it('returns a Command instance', () => {
    const cmd = evalCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = evalCommand()
    expect(cmd.name()).toBe('eval')
  })

  it('has a non-empty description', () => {
    const cmd = evalCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf eval --record-run persists eval_run rows via EvalRunStore (node_wire_fa8b766b1c57)', () => {
  it('records every entry from the JSON file and returns the persisted rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-eval-record-run-'))
    try {
      const store = SqliteStore.open(dir)
      store.initProject('eval-record-run-test')
      store
        .getDb()
        .prepare(
          `INSERT INTO eval_golden (id, input, expected, scorer_kind, tool, project_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run('gold_1', 'input', 'expected', 'exact_match', 'analyze', null)
      store.close()

      const runFile = join(dir, 'run.json')
      writeFileSync(
        runFile,
        JSON.stringify([{ runId: 'run_1', goldenId: 'gold_1', score: 0.9, passed: true, costUsd: 0.001 }]),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await evalCommand().parseAsync(['--record-run', runFile, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { recorded: number; entries: Array<{ goldenId: string; passed: boolean }> }
      expect(envelope.ok).toBe(true)
      expect(data.recorded).toBe(1)
      expect(data.entries[0].goldenId).toBe('gold_1')
      expect(data.entries[0].passed).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails with EVAL_RECORD_NO_FILE when the file does not exist', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await evalCommand().parseAsync(['--record-run', '/nonexistent/run.json'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('EVAL_RECORD_NO_FILE')
  })

  it('fails with EVAL_RECORD_INVALID_SHAPE when the file is not a JSON array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-eval-record-run-'))
    try {
      const runFile = join(dir, 'run.json')
      writeFileSync(runFile, JSON.stringify({ not: 'an array' }))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await evalCommand().parseAsync(['--record-run', runFile, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }
      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe('EVAL_RECORD_INVALID_SHAPE')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf eval --golden-add persists eval_golden rows via GoldenStore (node_wire_69ad452ef96d)', () => {
  it('adds every entry from the JSON file and returns the persisted goldens', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-eval-golden-add-'))
    try {
      const store = SqliteStore.open(dir)
      store.initProject('eval-golden-add-test')
      store.close()

      const goldenFile = join(dir, 'golden.json')
      writeFileSync(
        goldenFile,
        JSON.stringify([
          { input: 'what is 2+2', expected: '4', scorerKind: 'exact_match', tool: 'analyze' },
          { input: 'capital of france', expected: 'paris', scorerKind: 'exact_match', tool: 'analyze', tags: ['geo'] },
        ]),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await evalCommand().parseAsync(['--golden-add', goldenFile, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { added: number; entries: Array<{ id: string; input: string; tags: string[] }> }
      expect(envelope.ok).toBe(true)
      expect(data.added).toBe(2)
      expect(data.entries[0].input).toBe('what is 2+2')
      expect(data.entries[1].tags).toEqual(['geo'])
      expect(data.entries[0].id).toMatch(/^gold_/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails with EVAL_GOLDEN_NO_FILE when the file does not exist', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await evalCommand().parseAsync(['--golden-add', '/nonexistent/golden.json'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('EVAL_GOLDEN_NO_FILE')
  })

  it('fails with EVAL_GOLDEN_INVALID_SHAPE when the file is not a JSON array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-eval-golden-add-'))
    try {
      const goldenFile = join(dir, 'golden.json')
      writeFileSync(goldenFile, JSON.stringify({ not: 'an array' }))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await evalCommand().parseAsync(['--golden-add', goldenFile, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }
      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe('EVAL_GOLDEN_INVALID_SHAPE')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
