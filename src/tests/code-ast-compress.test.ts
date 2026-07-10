/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { astCompressCode } from '../core/economy/code-ast-compress.js'
import { applyLossyTransform, GateOutcome } from '../core/economy/lossy-gate.js'
import { CcrStore } from '../core/economy/ccr-store.js'

const CCR_MARKER = /⟨ccr:([0-9a-f]{64})⟩/

/**
 * Realistic TS fixture with several exported functions/methods/arrows whose
 * bodies are large enough to make compression worthwhile (>2048-byte code
 * threshold of the lossy gate).
 */
function fixture(): string {
  return `import { createHash } from 'node:crypto'
import type { Database } from 'better-sqlite3'

export interface UserRecord {
  id: string
  name: string
  email: string
}

export type Status = 'active' | 'inactive'

export function hashUser(user: UserRecord): string {
  const h = createHash('sha256')
  h.update(user.id)
  h.update(user.name)
  h.update(user.email)
  // a comment that bulks the body
  const digest = h.digest('hex')
  return digest.slice(0, 16)
}

export async function loadUsers(db: Database, status: Status): Promise<UserRecord[]> {
  const rows = db.prepare('SELECT id, name, email FROM users WHERE status = ?').all(status)
  const out: UserRecord[] = []
  for (const row of rows as UserRecord[]) {
    out.push({ id: row.id, name: row.name, email: row.email })
  }
  return out
}

export const formatUser = (u: UserRecord): string => {
  const parts = [u.id, u.name, u.email]
  const joined = parts.join(' | ')
  return joined.toUpperCase()
}

export class UserService {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async create(record: UserRecord): Promise<string> {
    const id = hashUser(record)
    this.db.prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, record.name, record.email)
    return id
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }
    return row.c
  }
}

function internalHelper(value: number): number {
  const doubled = value * 2
  const offset = doubled + 100
  return offset
}

export function publicWrapper(n: number): number {
  return internalHelper(n) + 1
}

export function summarize(records: UserRecord[]): string {
  const names = records.map((r) => r.name)
  const emails = records.map((r) => r.email)
  const header = 'count=' + records.length
  const body = names.join(',') + ' :: ' + emails.join(',')
  const trailer = 'end-of-report-block-for-padding'
  return header + '\\n' + body + '\\n' + trailer
}

export function validate(record: UserRecord): boolean {
  if (!record.id) return false
  if (!record.name) return false
  if (!record.email) return false
  if (!record.email.includes('@')) return false
  if (record.name.length > 256) return false
  if (record.id.length > 64) return false
  return true
}

export async function migrate(db: Database, batch: UserRecord[]): Promise<number> {
  let inserted = 0
  for (const record of batch) {
    if (!validate(record)) continue
    db.prepare('INSERT OR IGNORE INTO users VALUES (?, ?, ?)').run(record.id, record.name, record.email)
    inserted += 1
  }
  const remaining = batch.length - inserted
  void remaining
  return inserted
}
`
}

describe('astCompressCode (Task A6) — AST-aware code body dropping', () => {
  it('replaces bodies with a placeholder while keeping signatures + exports', () => {
    const code = fixture()
    const out = astCompressCode(code)

    // smaller
    expect(out.length).toBeLessThan(code.length)

    // signatures preserved
    expect(out).toContain('export function hashUser(user: UserRecord): string')
    expect(out).toContain('export async function loadUsers(db: Database, status: Status): Promise<UserRecord[]>')
    expect(out).toContain('export const formatUser')
    expect(out).toContain('async create(record: UserRecord): Promise<string>')
    expect(out).toContain('count(): number')
    expect(out).toContain('export function publicWrapper(n: number): number')

    // bodies dropped — implementation details gone
    expect(out).not.toContain("createHash('sha256')")
    expect(out).not.toContain('INSERT INTO users')
    expect(out).not.toContain('SELECT COUNT(*)')

    // placeholder present
    expect(out).toContain('/* … */')

    // imports / types / interfaces stay intact
    expect(out).toContain("import { createHash } from 'node:crypto'")
    expect(out).toContain('export interface UserRecord')
    expect(out).toContain("export type Status = 'active' | 'inactive'")
  })

  it('is deterministic and pure', () => {
    const code = fixture()
    expect(astCompressCode(code)).toBe(astCompressCode(code))
  })

  it('returns input unchanged when parsing fails (garbage in)', () => {
    const garbage = 'function (((( this is not valid typescript at all ]]]] {{{{'
    expect(astCompressCode(garbage)).toBe(garbage)
  })

  it('returns input unchanged when result would not be smaller', () => {
    const tiny = 'export const x = 1\n'
    expect(astCompressCode(tiny)).toBe(tiny)
  })

  // AC1: accepted through the lossy gate — bodies replaced, exports intact.
  it('AC1: applyLossyTransform accepts the compressor, all exported names preserved', async () => {
    const code = fixture()
    const r = await applyLossyTransform<string>({
      original: code,
      transform: astCompressCode,
      kind: 'code',
    })

    expect(r.outcome).toBe(GateOutcome.accepted)
    expect(r.value).not.toBe(code)
    expect(r.value).toContain('/* … */')
    expect(r.value).not.toContain('INSERT INTO users')
    expect(r.saved).toBeGreaterThan(0)

    // every exported name still present (createCodeVerify passed)
    for (const name of [
      'UserRecord',
      'Status',
      'hashUser',
      'loadUsers',
      'formatUser',
      'UserService',
      'publicWrapper',
      'summarize',
      'validate',
      'migrate',
    ]) {
      expect(r.value).toContain(name)
    }
  })

  // AC2: the gate's verify protects correctness — an over-aggressive transform
  // that drops an exported name is reverted to the original byte-for-byte.
  it('AC2: lossy-gate reverts a transform that drops an exported name', async () => {
    const code = fixture()
    // Deliberately broken: strip the exported `hashUser` declaration entirely.
    const broken = (s: string): string => s.replace(/export function hashUser[\s\S]*?\n}\n/, '')

    const r = await applyLossyTransform<string>({
      original: code,
      transform: broken,
      kind: 'code',
    })

    expect(r.outcome).toBe(GateOutcome.reverted)
    expect(r.value).toBe(code)
    expect(r.saved).toBe(0)
  })

  // AC3: original cached via CCR — ccr_dropped, marker present, retrievable.
  it('AC3: applyLossyTransform with a CcrStore yields ccr_dropped + retrievable original', async () => {
    const ccr = new CcrStore(new Database(':memory:'))
    const code = fixture()

    const r = await applyLossyTransform<string>({
      original: code,
      transform: astCompressCode,
      kind: 'code',
      ccr,
    })

    expect(r.outcome).toBe(GateOutcome.ccr_dropped)
    const match = CCR_MARKER.exec(r.value)
    expect(match).not.toBeNull()
    const hash = match![1]
    expect(hash).toBe(CcrStore.hashOf(code))
    expect(ccr.get(hash)).toBe(code)
  })
})
