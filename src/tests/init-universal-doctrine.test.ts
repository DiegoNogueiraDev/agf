/**
 * init-universal-doctrine.test.ts — the doctrine reaching DISK, not just memory.
 *
 * A sibling suite already proves every generator emits the universal block. That
 * proves the generator, not the product: between the string and the file sit the
 * marker logic, the idempotency check and the merge with whatever the user
 * already wrote. This exercises the real write path on a real directory, so the
 * claim is about the file a person opens.
 *
 * Real temp dirs, real fs, real store — no doubles. What ships is what is tested.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runUpdate } from '../mcp/init-project.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { UNIVERSAL_RULES_HEADING } from '../core/config/cli-reference-content.js'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})

/** A real project root with a real graph store — runUpdate refuses without one. */
function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-doctrine-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'package.json'), '{"name":"fixture","version":"0.0.0","private":true}\n', 'utf8')
  SqliteStore.open(dir).close()
  return dir
}

const occurrences = (text: string, needle: string): number => text.split(needle).length - 1

describe('agf init writes the universal doctrine to disk', () => {
  it('CLAUDE.md on disk carries the doctrine', async () => {
    const dir = project()
    await runUpdate(dir, { only: ['claude-md'] })
    const file = join(dir, 'CLAUDE.md')
    expect(existsSync(file), 'CLAUDE.md was never written').toBe(true)
    expect(readFileSync(file, 'utf8')).toContain(UNIVERSAL_RULES_HEADING)
  })

  it('AGENTS.md on disk carries it too — the AGENTS.md family is not an afterthought', async () => {
    const dir = project()
    await runUpdate(dir, { only: ['codex-md'] })
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain(UNIVERSAL_RULES_HEADING)
  })

  it('running init TWICE leaves the doctrine exactly once', async () => {
    // The failure this catches is additive, not broken: a non-idempotent writer
    // appends on every regen and the file grows silently until someone notices
    // the context bill.
    const dir = project()
    await runUpdate(dir, { only: ['claude-md'] })
    await runUpdate(dir, { only: ['claude-md'] })
    expect(occurrences(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), UNIVERSAL_RULES_HEADING)).toBe(1)
  })

  it("ERRO/LIMITE: the user's own content OUTSIDE the markers survives untouched", async () => {
    // The one thing a generated file must never do is eat what a person wrote.
    const dir = project()
    const mine = '# My project\n\nNotes I wrote by hand that must survive.\n'
    writeFileSync(join(dir, 'CLAUDE.md'), mine, 'utf8')
    await runUpdate(dir, { only: ['claude-md'] })
    const after = readFileSync(join(dir, 'CLAUDE.md'), 'utf8')
    expect(after).toContain('Notes I wrote by hand that must survive.')
    expect(after).toContain(UNIVERSAL_RULES_HEADING)
  })

  it('a nested .cursor rule file also gets it — the write creates its directory', async () => {
    // Cursor and windsurf write under a subdirectory that does not exist yet; a
    // writer that assumes a flat root silently produces nothing for them.
    const dir = project()
    await runUpdate(dir, { only: ['cursor-md'] })
    const file = join(dir, '.cursor', 'rules', 'agent-graph-flow.md')
    expect(existsSync(file), '.cursor rule was never written').toBe(true)
    expect(readFileSync(file, 'utf8')).toContain(UNIVERSAL_RULES_HEADING)
  })

  it('EVERY context file the twelve CLIs read carries it on disk — the KR, measured', async () => {
    // The set is small because CLIs share files (AGENTS.md serves codex and
    // opencode; CLAUDE.md serves aider, continue and cline). Proving the FILES
    // proves the twelve, and proving them on disk is what the KR asks — a
    // generator assertion would not have caught a step that never writes.
    const dir = project()
    await runUpdate(dir, {
      only: ['claude-md', 'copilot-md', 'codex-md', 'cursor-md', 'windsurf-md', 'gemini-md'],
    })
    const files = [
      'CLAUDE.md',
      'AGENTS.md',
      'GEMINI.md',
      join('.github', 'copilot-instructions.md'),
      join('.cursor', 'rules', 'agent-graph-flow.md'),
      join('.windsurf', 'rules', 'agent-graph-flow.md'),
    ]
    const missing = files.filter((f) => !existsSync(join(dir, f)))
    expect(missing, 'files never written').toEqual([])
    for (const f of files) {
      expect(readFileSync(join(dir, f), 'utf8'), `${f} lacks the doctrine`).toContain(UNIVERSAL_RULES_HEADING)
    }
  })

  it('refuses to run against a directory with no graph — never writes into an unrelated folder', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'agf-nograph-'))
    dirs.push(bare)
    mkdirSync(join(bare, 'src'), { recursive: true })
    await expect(runUpdate(bare, { only: ['claude-md'] })).rejects.toThrow()
    expect(existsSync(join(bare, 'CLAUDE.md'))).toBe(false)
  })
})
