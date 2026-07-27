/**
 * skill-install-guard.test.ts — what `agf skill install` is allowed to overwrite.
 *
 * This is the only agf write that lands OUTSIDE the project, in the skills folder
 * of the user's CLI, next to skills the person wrote themselves. And the better
 * "always up to date" works, the more often it passes over them. So the guard is
 * provenance-based, not heuristic: we compare each destination file against the
 * hash we recorded when WE wrote it. Anything we cannot vouch for is refused, and
 * refusal is the default for the unrecognized case — never the permissive side.
 *
 * Real directories, real files, real hashes. No fs doubles.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assessInstallTarget, writeProvenance, PROVENANCE_FILE } from '../core/marketplace/marketplace-cli.js'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

/** A destination skill folder containing `files`, optionally with our provenance record. */
function installedSkill(files: Record<string, string>, recordProvenance: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agf-guard-'))
  roots.push(dir)
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, body, 'utf8')
  }
  if (recordProvenance) writeProvenance(dir, Object.keys(files))
  return dir
}

describe('assessInstallTarget', () => {
  it('allows a fresh install into a directory that does not exist yet', () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'agf-guard-'))
    roots.push(parent)
    const r = assessInstallTarget(path.join(parent, 'never-installed'))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.action).toBe('install')
  })

  it('allows an update when every file still matches what we wrote', () => {
    const dir = installedSkill({ 'SKILL.md': '# v1\n', '_shared.md': 'doctrine\n' }, true)
    const r = assessInstallTarget(dir)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.action).toBe('update')
  })

  it('REFUSES when a file we installed was edited by hand', () => {
    const dir = installedSkill({ 'SKILL.md': '# v1\n' }, true)
    writeFileSync(path.join(dir, 'SKILL.md'), '# v1\nmy own notes\n', 'utf8')
    const r = assessInstallTarget(dir)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('MODIFIED_LOCALLY')
    expect(r.error).toContain('SKILL.md')
  })

  it('REFUSES a destination holding files we never recorded', () => {
    // The unrecognized case is the dangerous one: a skill the person wrote by
    // hand, or another tool's output. Defaulting to overwrite here destroys work
    // that has no git history to recover from.
    const dir = installedSkill({ 'SKILL.md': '# hand written\n' }, false)
    const r = assessInstallTarget(dir)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('UNKNOWN_CONTENT')
  })

  it('leaves the refused files untouched — refusal never half-writes', () => {
    const dir = installedSkill({ 'SKILL.md': '# mine\n' }, false)
    const before = readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
    assessInstallTarget(dir)
    expect(readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe(before)
  })

  it('proceeds on explicit consent — the block is a default, not a wall', () => {
    const dir = installedSkill({ 'SKILL.md': '# mine\n' }, false)
    const r = assessInstallTarget(dir, { force: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.action).toBe('overwrite')
  })

  it('records provenance that survives a re-read from disk', () => {
    // The hash must come from file CONTENT, not from any in-process value: the
    // whole point is that a LATER run, in a different process, can still tell
    // our own output apart from a human edit.
    const dir = installedSkill({ 'SKILL.md': '# stable\n' }, true)
    const record = JSON.parse(readFileSync(path.join(dir, PROVENANCE_FILE), 'utf8')) as {
      files: Record<string, string>
    }
    expect(record.files['SKILL.md']).toMatch(/^[a-f0-9]{64}$/)
    expect(assessInstallTarget(dir).ok).toBe(true)
  })

  it('ignores its own provenance file when judging the destination', () => {
    const dir = installedSkill({ 'SKILL.md': '# v1\n' }, true)
    const r = assessInstallTarget(dir)
    expect(r.ok).toBe(true)
  })
})
